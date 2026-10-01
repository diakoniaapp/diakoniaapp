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

  // Casal junto numa linha só (pedido da Telma, 30/09/2026, vendo "Elizabeth
  // Batista" e "Alexandre Lourenço Silva" — o mesmo casamento — aparecerem
  // como dois itens separados). `membros_detalhes.conjuge_nome` existiria
  // pra isso, mas medido em produção: vazio em todo mundo, ninguém preenche.
  // Casar pela MESMA `data_casamento` funciona sem precisar dele — medido
  // também: toda data de casamento compartilhada por duas pessoas na tabela
  // é exatamente um casal (nenhum trio, nenhuma coincidência entre gente
  // sem relação, só pares). Agrupa ANTES do loop de dias — uma pessoa sem
  // par (cônjuge não é membro/congregado, ou sem a data cadastrada) continua
  // aparecendo sozinha, do jeito que já era.
  const porDataCasamento = new Map<string, PessoaAniv[]>();
  for (const p of elegiveis) {
    if (!p.data_casamento) continue;
    const lista = porDataCasamento.get(p.data_casamento) ?? [];
    lista.push(p);
    porDataCasamento.set(p.data_casamento, lista);
  }

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
    for (const [dataCasamento, casal] of porDataCasamento) {
      const [yy, mm, dd] = dataCasamento.split("-").map(Number);
      if (mm !== month || dd !== day) continue;
      const anos = d.getFullYear() - yy;
      const nomes = casal.map((p) => p.nome_completo).join(" & ");
      const idsOrdenados = casal.map((p) => p.id).sort().join("-");
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