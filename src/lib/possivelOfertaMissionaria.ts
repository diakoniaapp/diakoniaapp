// ─── lib/possivelOfertaMissionaria.ts — "⚠ Possível oferta missionária" ─────────
//
// A tesouraria identifica oferta missionária por Pix somando R$ 0,10 ao valor (500,10 · 600,10 ·
// 2.000,10), de propósito (informação dela, 06/10/2026 — antes era só um indício estatístico:
// 13–38% das entradas do fundo terminam em ",10", contra 0,5% dos Dízimos). Esta regra transforma a
// convenção em auditoria: um Pix recebido que termina em ",10" e NÃO está em "Ofertas para Missões"
// merece uma olhada.
//
// SÓ SINALIZA. Nunca reclassifica, nunca bloqueia o fechamento: um doador pode ter dado um dízimo que
// termina em ",10" sem querer, e o texto do próprio Pix pode dizer outra coisa ("REFORMA CANTINA").
// Quem decide é a pessoa, abrindo o lançamento.
//
// MEDIDO em produção (desde jan/2024): 13 Pix ",10" fora do fundo; 12 depois das exclusões abaixo
// (≈ 0,6 alerta por mês — dá para olhar cada um, não vira ruído). Pura e sem rede.

export interface LancamentoParaOferta {
  tipo: "entrada" | "saida";
  valor: number;
  origem?: string | null;
  categoriaNome?: string | null;
  /** Descrição + observações: é onde o banco escreve "TRANSFERENCIA PIX REM …". */
  texto?: string | null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** `Math.round(valor × 100) % 100 === 10` — sem comparar centavos em ponto flutuante. */
export function terminaEmDezCentavos(valor: number): boolean {
  return Math.round(Math.abs(valor) * 100) % 100 === 10;
}

const EH_PIX = /\bpix\b/i;
// Cielo e afins repassam a SOMA das vendas da maquininha: o ",10" ali é coincidência de soma,
// não escolha de doador (ex.: bazar de R$ 97,10 em 06/08/2025).
// ("stone" e "rede" ficaram de fora de propósito: são sobrenome e palavra comum em nome de doador.)
const EH_MAQUININHA = /\b(cielo|getnet|pagseguro)\b|instituicao de pagamento/i;

/** Valor mínimo: abaixo disso é centavo de rendimento, não oferta. */
const VALOR_MINIMO = 1.1;

export function possivelOfertaMissionaria(l: LancamentoParaOferta): boolean {
  if (l.tipo !== "entrada" || l.origem === "transferencia") return false;
  if (l.valor <= VALOR_MINIMO || !terminaEmDezCentavos(l.valor)) return false;

  const texto = semAcento(l.texto ?? "");
  if (!EH_PIX.test(texto) || EH_MAQUININHA.test(texto)) return false;

  const categoria = semAcento(l.categoriaNome ?? "");
  if (categoria.includes("missoes") || categoria.includes("repasse")) return false;   // já está no lugar
  if (categoria.includes("rendimento")) return false;
  return true;
}

export const AVISO_POSSIVEL_OFERTA_MISSIONARIA =
  "Pix com valor terminado em ,10 — a tesouraria usa essa marca para ofertas de missões, e este não está em Ofertas para Missões. " +
  "Confira (o comprovante tem a mensagem do pagador); nada foi alterado.";
