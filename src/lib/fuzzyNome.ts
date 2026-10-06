// ─── fuzzyNome.ts — casar nome escrito diferente com a mesma pessoa ──────
//
// Extraído em 15/09/2026 do script ad-hoc que rodou ao vivo (via console,
// não commitado) pra vincular retroativamente 783+11+3 contribuições a
// membros só pelo nome ("vincule as contribuições aos nomes", mesma
// sessão). Formalizado aqui porque o mesmo problema apareceu nas duas
// frentes: linkar lançamento antigo a membro E, agora, decidir se um CPF
// sem correspondência na importação do Omie é gente NOVA ou é alguém que
// já está cadastrado com o nome grafado diferente (ou sem CPF salvo) —
// pedido direto da Telma, pra não duplicar pessoa.
//
// Três níveis de confiança, do mais rígido ao mais solto — cada um só
// aceita quando há EXATAMENTE UM candidato; mais de um candidato no mesmo
// nível é ambíguo e não sugere nada (melhor deixar pra decisão manual do
// que adivinhar errado e duplicar, ou pior, vincular à pessoa errada):
//
//   1. Nome normalizado (sem acento/maiúscula) idêntico.
//   2. Subsequência de tokens: primeiro e último token batem exatos, os
//      do meio aparecem na mesma ordem (permitindo inicial de um nome do
//      meio — "Maria S. Silva" casa com "Maria Silva").
//   3. Distância de Levenshtein do nome inteiro (sem espaços), com
//      tolerância proporcional ao tamanho — pega erro de digitação real
//      ("Cardozo"/"Cardoso", "Teixeixa"/"Teixeira") sem virar bagunça em
//      nomes curtos.
export interface CandidatoNome {
  id: string;
  nome: string;
}

export function normalizarNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // "Mª José" / "M.ª José" é Maria José — o "ª" não decompõe no NFD e o token virava "mª",
    // que nunca bate com "maria" (achado em 06/10/2026: "Mª José Gregório" no caixa de
    // envelopes não achava a "Maria José Gregório" do cadastro).
    .replace(/\bm\.?\s?ª\.?(?=\s|$)/g, "maria")
    // pontuação fora — "A." de abreviação de nome do meio não pode ficar
    // grudada na letra (senão "a.".length é 2, não 1, e a checagem de
    // inicial no nível 2 nunca bate).
    .replace(/[.,;:'"()-]/g, " ")
    .trim().replace(/\s+/g, " ");
}

function semEspacos(s: string): string {
  return s.replace(/\s+/g, "");
}

export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual.push(Math.min(
        anterior[j] + 1,      // remoção
        atual[j - 1] + 1,     // inserção
        anterior[j - 1] + custo, // substituição
      ));
    }
    anterior = atual;
  }
  return anterior[n];
}

/** Primeiro/último token exatos, tokens do meio como subsequência ordenada
 *  (permitindo abreviação de uma letra). */
function tokensBatem(alvoTokens: string[], candidatoTokens: string[]): boolean {
  if (alvoTokens.length === 0 || candidatoTokens.length === 0) return false;
  if (alvoTokens[0] !== candidatoTokens[0]) return false;
  if (alvoTokens[alvoTokens.length - 1] !== candidatoTokens[candidatoTokens.length - 1]) return false;

  let i = 1;
  for (let j = 1; j < candidatoTokens.length - 1 && i < alvoTokens.length - 1; j++) {
    const a = alvoTokens[i];
    const c = candidatoTokens[j];
    const bateExato = a === c;
    const bateInicial = (a.length === 1 && c.startsWith(a)) || (c.length === 1 && a.startsWith(c));
    if (bateExato || bateInicial) i++;
  }
  return i >= alvoTokens.length - 1;
}

/** Quão seguro foi o casamento. `parecido` (um nome contido no outro) NUNCA deve ligar nada
 *  sozinho: serve de sugestão para a pessoa confirmar. */
export type NivelDoCasamento = "exato" | "tokens" | "truncado" | "digitacao" | "parecido";

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);
const significativos = (nome: string) => normalizarNome(nome).split(" ").filter(t => t && !CONECTIVOS.has(t));

/** Os nomes do banco/da planilha costumam ter sobrenome a mais ou a menos: "Maria Jose
 *  Gregorio" × "Maria José Gregório da Silva". Casa quando o nome MENOR (2+ palavras
 *  significativas) está inteiro dentro do maior E o primeiro nome é o mesmo — e só se for UM
 *  candidato. */
function candidatosPorSubconjunto(alvo: string, candidatos: CandidatoNome[]): CandidatoNome[] {
  const a = significativos(alvo);
  if (a.length < 2) return [];
  return candidatos.filter(c => {
    const b = significativos(c.nome);
    if (b.length < 2 || a[0] !== b[0]) return false;
    const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
    return menor.every(t => maior.includes(t));
  });
}

/** Acha UM candidato não-ambíguo pra `nomeBruto` dentro de `candidatos`,
 *  ou `null` se não achar nenhum ou achar mais de um (ambíguo — não
 *  adivinha). Cada nível só é tentado se o anterior não resolveu. */
export function encontrarCandidatoPorNome(nomeBruto: string, candidatos: CandidatoNome[]): CandidatoNome | null {
  const r = encontrarDetalhado(nomeBruto, candidatos, false);
  return r ? r.candidato : null;
}

/** Igual, mas diz com que segurança casou — e, se `permitirParecido`, tenta por último o
 *  casamento por nomes contidos um no outro (nível `parecido`). */
export function encontrarDetalhado(
  nomeBruto: string, candidatos: CandidatoNome[], permitirParecido = true,
): { candidato: CandidatoNome; nivel: NivelDoCasamento } | null {
  const c = casarEstrito(nomeBruto, candidatos);
  if (c) return c;
  if (!permitirParecido || !nomeBruto?.trim()) return null;
  const sub = candidatosPorSubconjunto(nomeBruto, candidatos);
  return sub.length === 1 ? { candidato: sub[0], nivel: "parecido" } : null;
}

function casarEstrito(nomeBruto: string, candidatos: CandidatoNome[]): { candidato: CandidatoNome; nivel: NivelDoCasamento } | null {
  if (!nomeBruto?.trim() || candidatos.length === 0) return null;
  const alvo = normalizarNome(nomeBruto);

  // Nível 1 — idêntico
  const exatos = candidatos.filter(c => normalizarNome(c.nome) === alvo);
  if (exatos.length === 1) return { candidato: exatos[0], nivel: "exato" };
  if (exatos.length > 1) return null;

  // Nível 2 — subsequência de tokens
  const alvoTokens = alvo.split(" ").filter(Boolean);
  if (alvoTokens.length >= 2) {
    const porToken = candidatos.filter(c => tokensBatem(alvoTokens, normalizarNome(c.nome).split(" ").filter(Boolean)));
    if (porToken.length === 1) return { candidato: porToken[0], nivel: "tokens" };
    if (porToken.length > 1) return null;
  }

  // Nível 2b — nome TRUNCADO pelo banco. O extrato corta o nome em ~20 letras
  // ("MARCO ANTONIO HERCULA" é "Marco Antonio Herculano"): o alvo, sem espaços, é o começo
  // de UM só candidato. Exige 14+ letras para "Maria Jose" não casar com todas as Marias.
  const alvoJunto = semEspacos(alvo);
  if (alvoJunto.length >= 14) {
    const porPrefixo = candidatos.filter(c => {
      const junto = semEspacos(normalizarNome(c.nome));
      return junto.length > alvoJunto.length && junto.startsWith(alvoJunto);
    });
    if (porPrefixo.length === 1) return { candidato: porPrefixo[0], nivel: "truncado" };
    if (porPrefixo.length > 1) return null;
  }

  // Nível 3 — Levenshtein com tolerância proporcional (sem espaços)
  const alvoSemEspaco = semEspacos(alvo);
  if (alvoSemEspaco.length < 6) return null; // nome curto demais pra arriscar
  const tolerancia = Math.max(1, Math.min(3, Math.round(alvoSemEspaco.length * 0.12)));
  // `d === 0` É válido aqui, de propósito: o nível 1 compara MANTENDO
  // espaço, então "SUNAMY TA FERNANDES..." (espaço a mais quebrando um
  // token em dois — achado real, ver comentário do topo) nunca bate lá,
  // mas sem espaço vira a mesma string exata da pessoa certa. Excluir
  // d===0 aqui reabriria esse caso real como "sem candidato".
  const distancias = candidatos
    .map(c => ({ c, d: distanciaLevenshtein(alvoSemEspaco, semEspacos(normalizarNome(c.nome))) }))
    .filter(({ d }) => d <= tolerancia)
    .sort((a, b) => a.d - b.d);
  if (distancias.length === 1) return { candidato: distancias[0].c, nivel: "digitacao" };
  if (distancias.length > 1 && distancias[0].d < distancias[1].d) return { candidato: distancias[0].c, nivel: "digitacao" };
  return null;
}
