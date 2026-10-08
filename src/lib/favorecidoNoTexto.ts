// ─── lib/favorecidoNoTexto.ts — o favorecido que o TEXTO do extrato cita sem ser nome de pessoa ──────────────
//
// `identificacao.ts` acha nomes de gente ("PIX ENVIADO DES MARCO ANTONIO HERCULA"). Conta de consumo e guia não
// têm nome de gente: "CONTA DE AGUA AGUAS DO RIO 4-4000487182", "CONTA DE LUZ LIGHT-RJ-0100635", "PAGTO ELETRON
// COBRANCA AMIL", "PAGTO ELETRONICO TRIBUTO … DARF". Medido no extrato de setembro/2026: das 40 saídas que o motor
// não resolvia sozinho, 28 tinham fornecedor real nos lançamentos — e nenhuma sugestão de favorecido.
//
// Duas fontes, as duas SÓ quando há UM favorecido possível (na dúvida, não sugere):
//   1. o NOME do favorecido no texto — todas as palavras significativas dele presentes; e, se é EMPRESA (CNPJ),
//      basta a primeira palavra (a marca: "Light Serviços de Eletricidade S.A" aparece como "LIGHT-RJ"), desde que
//      ninguém mais comece com ela;
//   2. a SIGLA do tributo (DARF, GPS/INSS, FGTS, ISS…) → o favorecido oficial que a tesouraria já cadastrou
//      (Receita Federal, FGTS Digital, Prefeitura). É uma regra inicial do código; a tabela de regras da tesouraria
//      a substitui quando existir.
// Sem rede e sem React.

export interface CandidatoFavorecido { id: string; nome: string; /** pessoa jurídica (tem CNPJ) */ pj?: boolean }

export interface FavorecidoAchado { candidato: CandidatoFavorecido; via: "nome" | "marca" | "sigla" | "apelido"; motivo: string }

/**
 * Apelido do fornecedor: a SIGLA escrita em maiúsculas no próprio nome cadastrado ("Companhia Distribuidora de Gás do Rio de
 * Janeiro - CEG" → CEG; "ABC - Associação de Benefícios…" → ABC). O banco escreve "CONTA DE GAS CEG CAPITAL/GDE RIO" e nenhuma outra
 * palavra do nome aparece. Só vale se UM fornecedor tem essa sigla e se ela não é sufixo societário/UF.
 */
const NAO_E_SIGLA = new Set(["LTDA", "EIRELI", "EPP", "SPE", "CIA", "CNPJ", "CPF", "MEI", "SA", "RJ", "SP", "MG", "ES", "BRASIL", "RIO"]);
const siglasDoNome = (nome: string): string[] =>
  nome === nome.toUpperCase() ? [] : [...new Set((nome.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,5}\b/g) ?? []).map(t => semAcento(t).toLowerCase()))].filter(t => !NAO_E_SIGLA.has(t.toUpperCase()));

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(t => t.length >= 3);

/** conectivos e sufixos societários: não identificam ninguém */
const FRACOS = new Set(["das", "dos", "ltda", "eireli", "epp", "cia", "spe", "companhia", "servicos", "servico", "comercio", "industria", "empresa"]);
/** palavras comuns demais para valer sozinhas */
const GENERICOS = new Set([
  "igreja", "batista", "brasil", "brasileira", "nacional", "rio", "janeiro", "banco", "grupo", "associacao", "ministerio", "consultoria",
  "construcoes", "materiais", "material", "tecnologia", "distribuidora", "transportes", "digital", "federal", "municipal", "cidade", "prefeitura",
]);

const significativas = (nome: string) => tokens(nome).filter(t => !FRACOS.has(t));

/** siglas de tributo → palavras do favorecido oficial (a primeira que existir no cadastro). */
const SIGLAS: { re: RegExp; palavras: string[]; rotulo: string }[] = [
  { re: /\bdarf\b|\bgps\b|\binss\b|\birrf\b|\bsimples\s+nacional\b/, palavras: ["receita", "federal"], rotulo: "tributo federal" },
  { re: /\bfgts\b|\bgrf\b/, palavras: ["fgts"], rotulo: "FGTS" },
  // "--P.M RIO": o Bradesco escreve a Prefeitura Municipal do Rio assim nas guias pagas pela internet
  { re: /\biss\b|\bissqn\b|\bp\.?\s?m\.?\s+ri/, palavras: ["prefeitura"], rotulo: "tributo municipal" },
];

/** O ÚNICO favorecido que o texto cita, ou null (nada, ou mais de um). */
export function favorecidoNoTexto(memo: string, candidatos: CandidatoFavorecido[]): FavorecidoAchado | null {
  const texto = semAcento(memo).toLowerCase();
  const doTexto = new Set(tokens(memo));
  if (doTexto.size === 0 || candidatos.length === 0) return null;

  // 1. a sigla do tributo (guia não tem nome de gente)
  for (const s of SIGLAS) {
    if (!s.re.test(texto)) continue;
    const achados = candidatos.filter(c => s.palavras.every(p => significativas(c.nome).includes(p) || tokens(c.nome).includes(p)));
    if (achados.length === 1) return { candidato: achados[0], via: "sigla", motivo: `${s.rotulo} no texto do extrato → ${achados[0].nome}` };
    return null; // há sigla, mas zero ou vários favorecidos oficiais: não adivinha
  }

  // 2. o nome (ou a marca) do favorecido
  const elegiveis = candidatos
    .map(c => ({ c, sig: significativas(c.nome) }))
    .filter(x => x.sig.length > 0 && !x.sig.every(t => GENERICOS.has(t)));

  const marcaCompartilhada = (t: string) => elegiveis.filter(x => x.sig[0] === t).length > 1;
  const achados: { c: CandidatoFavorecido; peso: number; via: "nome" | "marca" }[] = [];
  for (const { c, sig } of elegiveis) {
    const inteiro = sig.every(t => doTexto.has(t));
    if (inteiro && (sig.length >= 2 || (sig[0].length >= 5 && !marcaCompartilhada(sig[0])))) {
      achados.push({ c, peso: sig.reduce((n, t) => n + t.length, 0), via: "nome" });
    } else if (c.pj && sig[0].length >= 4 && !GENERICOS.has(sig[0]) && doTexto.has(sig[0]) && !marcaCompartilhada(sig[0])) {
      achados.push({ c, peso: sig[0].length, via: "marca" });
    }
  }
  if (achados.length === 0) {
  // 3. o apelido (sigla em maiúsculas dentro do nome cadastrado), se for de UM fornecedor só
  const porSigla = new Map<string, CandidatoFavorecido[]>();
  for (const c of candidatos) for (const sg of siglasDoNome(c.nome)) porSigla.set(sg, [...(porSigla.get(sg) ?? []), c]);
  const apelidos = [...porSigla.entries()].filter(([sg, cs]) => cs.length === 1 && doTexto.has(sg));
  if (apelidos.length === 1) {
    const [sg, [c]] = apelidos[0];
    return { candidato: c, via: "apelido", motivo: `a sigla ${sg.toUpperCase()} no texto do extrato → ${c.nome}` };
  }
    return null;
  }
  const topo = Math.max(...achados.map(a => a.peso));
  const melhores = achados.filter(a => a.peso === topo);
  if (melhores.length !== 1) return null; // empate: ambíguo
  const m = melhores[0];
  return { candidato: m.c, via: m.via, motivo: m.via === "nome" ? `"${m.c.nome}" aparece no texto do extrato` : `a marca de "${m.c.nome}" aparece no texto do extrato` };
}
