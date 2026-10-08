// ─── lib/identificacao.ts — o nome (e as dicas) que a DESCRIÇÃO já traz ───────────
//
// Pedido dela (06/10/2026), olhando a lista de correções: "o sistema encontra o
// fornecedor na descrição? corrija". Não encontrava: lançamentos com `Mª José Gregório` na
// descrição e o campo Fornecedor/recebedor em branco. E a mesma carência é o centro da
// importação OFX: "PIX RECEBIDO REM: VANESSA DO NASCIMENTO" traz a pessoa, a forma de
// pagamento e às vezes até a categoria ("… MISSÕES"), e o sistema abria um formulário vazio.
//
// Aqui só há regra de TEXTO, sem rede e sem React: extrair o nome provável e as dicas.
// Casar o nome com o cadastro é `lib/fuzzyNome.ts` (que só aceita candidato único).

export type DicaCategoria = "dizimo" | "oferta" | "missoes";
export type DicaForma = "pix" | "ted" | "doc" | "deposito" | "boleto";

export interface ExtracaoDeNome {
  /** O nome provável, limpo; `null` se a descrição não traz um nome de pessoa/empresa. */
  nome: string | null;
  categoria?: DicaCategoria;
  forma?: DicaForma;
  /** Tem cara de saída/tarifa/anônimo — não vale procurar no cadastro. */
  semNome?: "anonimo" | "tarifa" | "transferencia" | "guia";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// o que o BANCO escreve antes do nome
const RUIDO_DO_BANCO = [
  /\btransf\w*\s+autoriz\w*\s+entre\s+ags?\b/g,   // "TRANSF AUTORIZ ENTRE AGS <nome>": o que sobra é o remetente
  /\bpix\s+qr\s*code\s*(dinamico|estatico)?\b/g,
  /\bpix\s+(recebido|enviado|agendado|transferencia)\b/g,
  /\btransferencia\s+(recebida|enviada|pix)\b/g,
  /\bdeposito\s+(identificado|em\s+conta|em\s+dinheiro|dinheiro)?\b/g,
  /\b(transf|transferencia|ted|doc|pix|deposito|pgto|pagamento|credito|debito|recebimento)\b/g,
  /\b(ref|referente|competencia|comp)\b\.?/g,
];

const ANONIMO = /\b(anonim[oa]s?|nao\s+identificad[oa]s?|sem\s+identificacao|desconhecid[oa]s?|diversos)\b/;
// guia de imposto/contribuição: o "nome" é o tributo, não uma pessoa. NÃO inclui "das": é a
// preposição de "Maria das Dores" (o DAS do Simples escreve-se "Simples Nacional").
const GUIA = /\b(darf|gps|grf|fgts|inss|irrf|iss|simples\s+nacional|guia\s+de\s+recolhimento|documento\s+de\s+arrecadacao)\b/;
const TARIFA = /\b(tarifa|iof|juros|encargos?|saldo\s+anterior|rendimento|aplicacao\s+(automatica|financeira)|resgate)\b/;

/**
 * Extrai o nome da descrição de uma movimentação ou lançamento.
 *
 *   "PIX RECEBIDO REM: VANESSA DO NASCIMENTO"   → VANESSA DO NASCIMENTO  (forma: pix)
 *   "PIX RECEBIDO REM: JOÃO SILVA MISSÕES"      → JOÃO SILVA             (categoria: missões)
 *   "PIX ENVIADO DES MARCO ANTONIO HERCULA 0109"→ MARCO ANTONIO HERCULA  (o 0109 é dia/mês)
 *   "Dízimo - Maria Souza"                      → Maria Souza            (categoria: dízimo)
 *   "Mª José Gregório"                          → Mª José Gregório
 *   "PIX RECEBIDO REM: ANÔNIMO"                 → null                   (semNome: anônimo)
 */
export function extrairNome(descricao: string | null | undefined): ExtracaoDeNome {
  const original = (descricao ?? "").trim();
  if (!original) return { nome: null };
  let t = semAcento(original).toLowerCase();

  const r: ExtracaoDeNome = { nome: null };
  if (/\bpix\b/.test(t)) r.forma = "pix";
  else if (/\bted\b/.test(t)) r.forma = "ted";
  else if (/\bdoc\b/.test(t)) r.forma = "doc";
  else if (/\bdeposito\b/.test(t)) r.forma = "deposito";
  else if (/\bboleto\b/.test(t)) r.forma = "boleto";

  // transferência entre contas da própria igreja ("Transferência: Bradesco → Caixa de Aplicação")
  if (/^\s*transferencia\s*:/.test(t)) return { ...r, semNome: "transferencia" };
  if (TARIFA.test(t)) return { ...r, semNome: "tarifa" };
  if (GUIA.test(t)) return { ...r, semNome: "guia" };

  // o banco marca quem é: "REM: <remetente>", "DES <destinatário>", "FAVORECIDO: <nome>"
  let corte = -1;
  for (const m of t.matchAll(/\b(rem|remetente|des|destinatario|favorecido)\b\s*:?\s*/g)) corte = (m.index ?? 0) + m[0].length;
  if (corte >= 0) t = t.slice(corte);

  // categoria que a pessoa escreveu junto do nome
  if (/\bdizimos?\b/.test(t)) r.categoria = "dizimo";
  else if (/\bmiss(oes|ao|ionari[ao]s?)\b/.test(t)) r.categoria = "missoes";
  else if (/\bofertas?\b/.test(t)) r.categoria = "oferta";
  t = t.replace(/\b(dizimos?|ofertas?|miss(oes|ao|ionari[ao]s?)|campanha|contribuicao|doacao)\b/g, " ");

  for (const re of RUIDO_DO_BANCO) t = t.replace(re, " ");

  if (ANONIMO.test(t)) return { ...r, semNome: "anonimo" };

  // números (CPF, dia+mês colado, nº de documento), pontuação e símbolos
  t = t.replace(/\d+/g, " ").replace(/r\$/g, " ").replace(/[^\p{L}ªº\s'-]/gu, " ")
    .replace(/(^|\s)[-']+(\s|$)/g, " ").replace(/\s+/g, " ").trim();

  const palavras = t.split(" ").filter(Boolean);
  const letras = palavras.join("").length;
  if (letras < 5 || !palavras.some(p => p.length >= 3)) return r;

  // devolve com a grafia original quando dá (maiúsculas, acento): procura a mesma sequência
  // de palavras no texto original; senão devolve o texto limpo
  const alvo = palavras.join(" ");
  const orig = original.split(/\s+/);
  const origSem = orig.map(p => semAcento(p).toLowerCase().replace(/[^\p{L}ªº'-]/gu, ""));
  const ini = origSem.findIndex((p, i) => p === palavras[0] && palavras.every((q, k) => origSem[i + k] === q));
  r.nome = ini >= 0 ? orig.slice(ini, ini + palavras.length).join(" ") : alvo;
  return r;
}
