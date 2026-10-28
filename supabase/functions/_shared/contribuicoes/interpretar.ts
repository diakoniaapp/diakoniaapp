// ─── interpretar — "Como interpretar este relatório": as definições dos perfis, GERADAS conforme o período (27/10/2026) ──────────────────────────────────────────────────────────────────────
// Pedido dela (27/10/2026): o e-mail para o pastor e a liderança NÃO leva mais esse bloco — ele ocupava espaço demais. As definições continuam disponíveis na tela do sistema (Doadores), que usa esta função.
// Puro (sem rede): as frases batem com o que o cálculo faz (`analisarContribuicoes`/`resumirPessoas`).
import { PISO_DE_IDENTIFICACAO, ROTULO_DA_BASE, mesesCompletos, type AnaliseDoPeriodo, type BaseAnalisada } from "./analise.ts";

const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

const MESES_POR_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesPorExtenso = (m: string) => `${MESES_POR_EXTENSO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/**
 * O texto de "Como interpretar este relatório": as definições dos perfis, GERADAS conforme o período analisado — quantos meses completos tem, quais são, e se há histórico para dizer quem é novo.
 * Determinístico (sem IA): os mesmos números dão sempre o mesmo texto. As frases batem com o que o cálculo faz (`analisarContribuicoes`/`resumirPessoas`).
 */
export function textosParaInterpretar(a: AnaliseDoPeriodo, base: BaseAnalisada, oque = "contribuições"): { titulo: string; texto: string }[] {
  const { ini, fim } = a.periodo;
  const p = `${ddmmaaaa(ini)} a ${ddmmaaaa(fim)}`;
  const entre = `entre ${ddmmaaaa(ini)} e ${ddmmaaaa(fim)}`;   // SEMPRE as datas do filtro escolhido: nunca uma data fixa (decisão dela, 27/10/2026)
  const completos = mesesCompletos(ini, fim);
  const meses = completos.length === 0 ? "" : completos.length === 1 ? mesPorExtenso(completos[0]) : `${mesPorExtenso(completos[0])} a ${mesPorExtenso(completos[completos.length - 1])}`;
  const recorrente = completos.length === 0
    ? `Pessoa que contribuiu em todos os meses do período analisado. O período ${entre} não tem nenhum mês completo; por isso ninguém é classificado como recorrente.`
    : `Pessoa que contribuiu em todos os meses do período analisado: ${completos.length === 1 ? "o único mês completo" : `os ${completos.length} meses completos`} ${entre} (${meses}). O primeiro e o último mês, quando incompletos, não entram nessa conta.`;
  const novo = ini <= PISO_DE_IDENTIFICACAO
    ? `Pessoa cujo primeiro dízimo identificado ocorreu dentro do período analisado. Como o período começa em ${ddmmaaaa(ini)}, ainda não há histórico anterior confiável; por isso ninguém é classificado como novo dizimista neste relatório.`
    : `Pessoa cujo primeiro dízimo identificado ocorreu dentro do período analisado (${p}), sem nenhum dízimo identificado antes de ${ddmmaaaa(ini)}. Pode já ter dado ofertas ou missões antes.`;
  return [
    { titulo: "Recorrente", texto: recorrente },
    { titulo: "Parcial", texto: completos.length === 0 ? `Pessoa que contribuiu ${entre}. Sem mês completo no período, não há como separar recorrente de parcial; por isso aparece como "Contribuiu no período".` : `Pessoa que deu dízimo em alguns, mas não em todos, dos meses completos do período analisado. A coluna "Meses com dízimo" mostra quantos (por exemplo, 2/${completos.length}); a quantidade de contribuições não muda o perfil.` },
    { titulo: "Novo dizimista", texto: novo },
    { titulo: "Só ofertas", texto: `Pessoa que contribuiu ${entre}, mas nunca com dízimo; por isso não entra na conta de meses com dízimo.` },
    { titulo: `Sem ${oque} no período analisado`, texto: `Pessoa da base analisada (${ROTULO_DA_BASE[base].toLowerCase()}, ativos) sem ${oque} ${entre}${oque === "contribuições" ? "" : `. Pode ter contribuído de outra forma (as categorias escolhidas foram só estas)`}. O complemento diz se também não há registro anterior ao período ou há quanto tempo foi a última contribuição (mais de 90 ou de 180 dias).` },
  ];
}
