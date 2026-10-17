import type { EventoOcorrencia, EventoRow } from "./types";
import { diaEMesDeNascimento } from "@/lib/idade";

export const ANIV_COLOR = "#f59e0b"; // âmbar / dourado
export const CASAMENTO_COLOR = "#ec4899"; // rosa

export interface PessoaAniv {
  id: string;
  nome_completo: string;
  data_nascimento: string | null;
  /** Dia e mês de quem não teve o ano registrado. Ver lib/idade.ts. */
  nascimento_dia_mes?: string | null;
  data_casamento: string | null;
  tipo_pessoa: "membro" | "congregado" | "visitante";
  /** O cônjuge pelo vínculo de FAMÍLIA (a função `agenda_aniversarios_casamentos` entrega; a leitura direta de `membros` não). */
  conjuge_id?: string | null;
  conjuge_nome?: string | null;
  /** É o responsável da família — quando os cônjuges discordam da data, a dele vale (a mesma regra da tela de Famílias). */
  responsavel_familia?: boolean | null;
}

const mesEDia = (ymdStr: string) => ymdStr.slice(5);

export interface CasalDeBodas { ids: string[]; nomes: string[]; data: string }

/**
 * Os casais da igreja: uma linha por CASAL, com os dois nomes juntos (16/10/2026).
 *
 * Antes o casal só se formava quando os dois tinham a MESMA `data_casamento`. Bastava um deles estar sem a data, ou com o ano digitado diferente (medido em produção: Vitorino,
 * março contra maio, e Bittencourt, 2018 contra 2020; e 3 famílias em que só o cônjuge tem a data), para a agenda mostrar o casamento duas vezes, um nome em cada.
 *
 * Agora o par também vem do vínculo de família (`conjuge_id`), com uma trava: só se juntam duas pessoas se o outro lado não tem data OU tem o mesmo dia e mês — nunca se funde o
 * casamento de gente com datas realmente diferentes. Quando o cônjuge nem aparece na lista (sem data nenhuma, ou visitante), o nome dele entra mesmo assim (`conjuge_nome`).
 * Se os dois têm a data e ela difere, vale a do responsável da família (como na tela de Famílias); sem responsável, a mais antiga.
 */
export function casaisDeBodas(elegiveis: PessoaAniv[]): CasalDeBodas[] {
  const comData = elegiveis.filter((p) => p.data_casamento);
  const porId = new Map(comData.map((p) => [p.id, p]));
  const raiz = new Map<string, string>(comData.map((p) => [p.id, p.id]));
  const achar = (id: string): string => { let r = id; while (raiz.get(r) !== r) r = raiz.get(r)!; return r; };
  const unir = (a: string, b: string) => { const ra = achar(a), rb = achar(b); if (ra !== rb) raiz.set(rb, ra); };

  // 1) a mesma data de casamento: é o casal (medido: toda data repetida na tabela era um par)
  const primeiroDaData = new Map<string, string>();
  for (const p of comData) {
    const antes = primeiroDaData.get(p.data_casamento!);
    if (antes) unir(antes, p.id); else primeiroDaData.set(p.data_casamento!, p.id);
  }
  // 2) o vínculo de família: o cônjuge que tem outra data (mesmo dia e mês) ou que veio sem ela
  for (const p of comData) {
    const c = p.conjuge_id ? porId.get(p.conjuge_id) : undefined;
    if (c && mesEDia(c.data_casamento!) === mesEDia(p.data_casamento!)) unir(p.id, c.id);
  }

  const grupos = new Map<string, PessoaAniv[]>();
  for (const p of comData) { const r = achar(p.id); grupos.set(r, [...(grupos.get(r) ?? []), p]); }

  const casais: CasalDeBodas[] = [];
  for (const membros of grupos.values()) {
    const ordenados = [...membros].sort((a, b) => Number(!!b.responsavel_familia) - Number(!!a.responsavel_familia) || a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));
    const idsNoGrupo = new Set(ordenados.map((p) => p.id));
    const nomes = ordenados.map((p) => p.nome_completo);
    // o cônjuge que não está na lista com data (sem data nenhuma, ou fora de membro/congregado): o nome dele completa o casal
    if (ordenados.length === 1) {
      const p = ordenados[0];
      if (p.conjuge_id && !idsNoGrupo.has(p.conjuge_id) && !porId.has(p.conjuge_id) && p.conjuge_nome) nomes.push(p.conjuge_nome);
    }
    const dataValida = (ordenados.find((p) => p.responsavel_familia) ?? ordenados.slice().sort((a, b) => a.data_casamento!.localeCompare(b.data_casamento!))[0]).data_casamento!;
    casais.push({ ids: [...ordenados.map((p) => p.id), ...(ordenados.length === 1 && ordenados[0].conjuge_id && nomes.length > 1 ? [ordenados[0].conjuge_id] : [])], nomes, data: dataValida });
  }
  return casais;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildVirtual(opts: {
  id: string;
  titulo: string;
  data: string;
  descricao: string;
  categoria: "aniversario" | "casamento";
  color: string;
}): EventoOcorrencia {
  const evento: EventoRow = {
    id: opts.id,
    titulo: opts.titulo,
    tipo: "outro",
    data: opts.data,
    hora_inicio: null,
    hora_fim: null,
    local: null,
    local_id: null,
    descricao: opts.descricao,
    status: "agendado",
    cor: opts.color,
    ministerio_principal_id: null,
    recorrencia_id: null,
    recorrencia_regra: null,
    is_excecao: false,
    ocorrencia_original_data: null,
    serie_origem_id: null,
  };
  return {
    key: opts.id,
    baseId: opts.id,
    serieId: null,
    isExcecao: false,
    isOcorrenciaVirtual: true,
    data: opts.data,
    ocorrencia_original_data: null,
    evento,
    categoria: opts.categoria,
    externalReadOnly: true,
  };
}

const tipoLabel = (t: PessoaAniv["tipo_pessoa"]) =>
  t === "membro" ? "Membro" : t === "congregado" ? "Congregado" : "Visitante";

/**
 * Gera ocorrências virtuais (somente leitura) de aniversários de nascimento
 * e de casamento das pessoas no intervalo informado.
 * Considera apenas membros e congregados.
 */
export function aniversariosNoIntervalo(
  pessoas: PessoaAniv[],
  from: Date,
  to: Date,
): EventoOcorrencia[] {
  const elegiveis = pessoas.filter((p) => p.tipo_pessoa === "membro" || p.tipo_pessoa === "congregado");
  const out: EventoOcorrencia[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  // Casal junto numa linha só (pedido dela, 30/09 e 16/10/2026) — ver `casaisDeBodas`: mesma data OU vínculo de família, nomes dos dois juntos.
  const casais = casaisDeBodas(elegiveis);

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const dataStr = ymd(d);

    for (const p of elegiveis) {
      // ── Nascimento ────────────────────────────────────────────────────
      //
      // O par dia/mês vem do ajudante, porque pode estar em duas colunas:
      // `data_nascimento` quando se sabe tudo, `nascimento_dia_mes` quando
      // só se sabe o dia e o mês. Medido em 27/08/2026: eram 53 pessoas sem
      // data nenhuma, invisíveis aqui por falta de um ano que não muda nada
      // no que a igreja faz no dia.
      //
      // A IDADE continua saindo só da data completa. Sem ela o rótulo perde
      // o "· 56 anos" e fica "Aniversário · Membro" — que é a verdade, e é
      // o mesmo que a view do banco já faz com `anos_vai_completar` nulo.
      const nasc = diaEMesDeNascimento(p);
      if (nasc) {
        const { dia: dd, mes: mm } = nasc;
        if (mm === month && dd === day) {
          const anoDeNascimento = p.data_nascimento ? Number(p.data_nascimento.split("-")[0]) : null;
          const idade = anoDeNascimento === null ? 0 : d.getFullYear() - anoDeNascimento;
          out.push(
            buildVirtual({
              id: `aniv-${p.id}-${dataStr}`,
              titulo: `🎂 ${p.nome_completo}`,
              data: dataStr,
              descricao: `Aniversário · ${tipoLabel(p.tipo_pessoa)}${idade > 0 ? ` · ${idade} anos` : ""}`,
              categoria: "aniversario",
              color: ANIV_COLOR,
            }),
          );
        }
      }
    }

    // ── Casamento — um evento por CASAL, não por pessoa ──────────────────
    for (const casal of casais) {
      const [yy, mm, dd] = casal.data.split("-").map(Number);
      if (mm !== month || dd !== day) continue;
      const anos = d.getFullYear() - yy;
      const nomes = casal.nomes.join(" & ");
      const idsOrdenados = [...casal.ids].sort().join("-");
      out.push(
        buildVirtual({
          id: `cas-${idsOrdenados}-${dataStr}`,
          titulo: `💍 ${nomes}`,
          data: dataStr,
          descricao: `Aniversário de casamento${anos > 0 ? ` · ${anos} anos` : ""}`,
          categoria: "casamento",
          color: CASAMENTO_COLOR,
        }),
      );
    }
  }
  return out;
}

export const CATEGORIA_PESSOAS = [
  { id: "aniversario" as const, label: "Aniversariantes", color: ANIV_COLOR },
  { id: "casamento" as const, label: "Aniv. de Casamento", color: CASAMENTO_COLOR },
];