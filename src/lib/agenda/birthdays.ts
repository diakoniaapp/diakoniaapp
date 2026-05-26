import type { EventoOcorrencia, EventoRow } from "./types";

export const ANIV_COLOR = "#f59e0b"; // âmbar / dourado
export const CASAMENTO_COLOR = "#ec4899"; // rosa

export interface PessoaAniv {
  id: string;
  nome_completo: string;
  data_nascimento: string | null;
  data_casamento: string | null;
  tipo_pessoa: "membro" | "congregado" | "visitante" | "ex_membro";
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
  t === "membro" ? "Membro" : t === "congregado" ? "Congregado" : t === "visitante" ? "Visitante" : "Ex-membro";

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

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const dataStr = ymd(d);

    for (const p of elegiveis) {
      // Nascimento
      if (p.data_nascimento) {
        const [yy, mm, dd] = p.data_nascimento.split("-").map(Number);
        if (mm === month && dd === day) {
          const idade = d.getFullYear() - yy;
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
      // Casamento
      if (p.data_casamento) {
        const [yy, mm, dd] = p.data_casamento.split("-").map(Number);
        if (mm === month && dd === day) {
          const anos = d.getFullYear() - yy;
          out.push(
            buildVirtual({
              id: `cas-${p.id}-${dataStr}`,
              titulo: `💍 ${p.nome_completo}`,
              data: dataStr,
              descricao: `Aniversário de casamento${anos > 0 ? ` · ${anos} anos` : ""}`,
              categoria: "casamento",
              color: CASAMENTO_COLOR,
            }),
          );
        }
      }
    }
  }
  return out;
}

export const CATEGORIA_PESSOAS = [
  { id: "aniversario" as const, label: "Aniversariantes", color: ANIV_COLOR },
  { id: "casamento" as const, label: "Aniv. de Casamento", color: CASAMENTO_COLOR },
];