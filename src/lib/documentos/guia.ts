// ─── lib/documentos/guia.ts — reconhecer uma GUIA DE RECOLHIMENTO pelo texto ─────
//
// Tipo documental novo (pedido dela, 06/10/2026): GUIA — "Guia de Recolhimento" — para ISS, DARF,
// INSS/GPS, FGTS, IRRF, Simples Nacional e taxas municipais/estaduais. Não é boleto, nem fatura,
// nem "outro": é o documento que a Prefeitura/Receita/Caixa emite para a igreja RECOLHER um valor,
// e que sustenta a saída junto com o comprovante.
//
// CUIDADO — o falso positivo clássico: uma folha de pagamento (DPS), uma NFS-e ou um contrato
// citam "FGTS", "INSS", "ISS" de passagem. Por isso o reconhecimento exige a FRASE que só a guia
// tem ("Documento de Arrecadação", "Guia de Recolhimento", "GRF", "DARF"…), nunca a sigla solta de
// imposto.

export type SubtipoDeGuia = "darf" | "gps" | "fgts" | "irrf" | "iss" | "iptu" | "das" | "taxa" | "outra";

export const ROTULO_DA_GUIA: Record<SubtipoDeGuia, string> = {
  darf: "DARF",
  gps: "GPS (INSS)",
  fgts: "Guia do FGTS",
  irrf: "DARF · IRRF",
  iss: "Guia de ISS",
  iptu: "Guia de IPTU",
  das: "DAS · Simples Nacional",
  taxa: "Taxa / guia de arrecadação",
  outra: "Guia de recolhimento",
};

/** Códigos de receita de DARF que são Imposto de Renda Retido na Fonte. */
const RECEITAS_DE_IRRF = new Set(["0561", "0588", "1708", "3208", "3426", "8045", "0422", "5952"]);

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O código da receita impresso numa DARF ("Código da receita 1708"). */
export function codigoDaReceita(texto: string): string | null {
  const m = sem(texto).match(/codigo (?:da )?receita[^\d]{0,12}(\d{4})/);
  return m ? m[1] : null;
}

/** `null` = não é guia. */
export function identificarGuia(texto: string): SubtipoDeGuia | null {
  const t = sem(texto);

  if (/\bdarf\b|documento de arrecadacao de receitas federais/.test(t)) {
    const r = codigoDaReceita(texto);
    return r && RECEITAS_DE_IRRF.has(r) ? "irrf" : "darf";
  }
  if (/guia da previdencia social|\bgps\b/.test(t)) return "gps";
  if (/guia de recolhimento do fgts|guia do fgts|fgts digital|\bgrf\b|\bgfd\b|documento de arrecadacao do fgts/.test(t)) return "fgts";
  if (/documento de arrecadacao do simples nacional|\bpgdas\b|\bdas\b.*simples/.test(t)) return "das";
  // ISS: só com a frase de guia/arrecadação municipal — "ISS retido" numa NFS-e NÃO é guia
  if (/(guia|documento de arrecadacao|dam\b|darm\b).{0,80}(iss\b|issqn|imposto sobre servicos)|(iss\b|issqn|imposto sobre servicos).{0,80}(guia de recolhimento|documento de arrecadacao)/.test(t)) return "iss";
  // DARM da Prefeitura do Rio (medido nos anexos da igreja): o ISS e o IPTU têm o MESMO layout "01.RECEITA";
  // o que os distingue é o código da receita (101-5 = ISS, 310-7 = IPTU) e o texto ("exclusivamente para
  // pagamento de ISS"; "inscrição imobiliária"). Exige a frase de guia municipal — "ISS retido" numa NFS-e NÃO é guia.
  const municipal = /\bdarm\b|documento de arrecadacao de receitas municipais/.test(t);
  if (municipal) {
    if (/\biss\b|issqn|imposto sobre servicos/.test(t) || /01\.?\s*receita\s*101-5/.test(t)) return "iss";
    if (/\biptu\b|imposto predial|inscricao imobiliaria|01\.?\s*receita\s*310-7/.test(t)) return "iptu";
  }
  if (/documento de arrecadacao de receitas estaduais|\bdare\b|\bdae\b|funesbom|taxa de (incendio|licenca|fiscalizacao|coleta|vigilancia)/.test(t)) return "taxa";
  if (/guia de recolhimento|guia de arrecadacao|documento de arrecadacao|\bdarm\b|\bdam\b/.test(t)) return "outra";
  return null;
}

/** Quem recebe, quando o próprio documento não diz (a guia federal é sempre da Receita). */
export function beneficiarioPadraoDaGuia(sub: SubtipoDeGuia): string | null {
  switch (sub) {
    case "darf": case "irrf": return "Receita Federal do Brasil";
    case "gps": return "INSS / Receita Federal do Brasil";
    case "fgts": return "Caixa Econômica Federal (FGTS)";
    case "das": return "Receita Federal do Brasil (Simples Nacional)";
    default: return null;
  }
}
