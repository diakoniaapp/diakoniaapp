// ─── lib/classificacaoOfx.ts — o que o extrato já permite saber de cada linha ──────
//
// Pedido dela (06/10/2026): "hoje o sistema só importa a movimentação e pede que eu complete
// os dados manualmente… quero importar o OFX e, em vez de abrir centenas de formulários,
// apenas revisar exceções". Medido no OFX real de setembro: 353 linhas — 147 "PIX RECEBIDO
// REM: <nome>", 56 PIX por QR code, 37 PIX enviados, 48 tarifas, 24 pagamentos eletrônicos,
// 16 rendimentos. No histórico: 4.927 entradas em 24 meses (2.269 Dizimos, 1.743 Ofertas,
// 514 Ofertas para Missões) e 78 pessoas com mais de 3 dízimos.
//
// Para cada linha este módulo sugere: pessoa/fornecedor, categoria, centro de custo, forma
// de pagamento — com CONFIANÇA e os MOTIVOS por extenso, e a faixa em que cai:
//   identificada (≥ 85)  ·  precisa de revisão (60–84)  ·  não identificada (< 60)
//
// O APRENDIZADO é o próprio histórico: cada lançamento que ela salva (inclusive quando
// corrige Oferta → Dízimo) entra no histórico e pesa na próxima sugestão, sem tabela nova.
// As correções recentes pesam mais (ver `PESO_RECENTE`).
//
// Regra dela, literal: pessoa cadastrada + mais de 3 dízimos + mesma faixa de valor +
// periodicidade mensal → Dízimo automático (ver `regraDoDizimo`).
//
// Sem rede e sem React. Quem carrega o histórico é `services/importacaoOfxService.ts`.

import { extrairNome, type DicaCategoria } from "./identificacao";
import { encontrarDetalhado, type CandidatoNome, type NivelDoCasamento } from "./fuzzyNome";
import { favorecidoNoTexto, type CandidatoFavorecido } from "./favorecidoNoTexto";

export type Tipo = "entrada" | "saida";
export type Banda = "identificada" | "revisar" | "nao_identificada";

export interface Linha { fitid: string; tipo: Tipo; data: string; valor: number; memo: string }

export interface CategoriaRef { id: string; nome: string; tipo: Tipo }

/** Um lançamento que já existe (a memória do sistema). */
export interface Historico {
  tipo: Tipo;
  dia: string;
  valor: number;
  pessoaId: string | null;
  fornecedorId: string | null;
  categoriaId: string | null;
  centroId: string | null;
  /** O texto do extrato que gerou o lançamento, normalizado por `chaveDoMemo`. */
  chave: string;
}

export interface Cadastro { pessoas: CandidatoNome[]; fornecedores: CandidatoFavorecido[] }

/**
 * Uma recorrência ativa como REGRA de classificação de despesa (aprovado em 08/10/2026): quem a tesouraria já cadastrou como
 * "todo mês, este favorecido, esta categoria e este centro" não precisa ser reaprendido pelo histórico — e cobre quem nunca foi
 * pago pelo PIX antes (pastor, funcionário, plano de saúde).
 */
export interface RecorrenciaRegra {
  id: string;
  /** a descrição da recorrência (em geral, o nome do favorecido) */
  nome: string;
  tipo: Tipo;
  valor: number;
  valorVariavel: boolean;
  diaDoVencimento: number | null;
  categoriaId: string | null;
  centroId: string | null;
  fornecedorId: string | null;
  pessoaId: string | null;
  /** o nome do favorecido cadastrado (para mostrar) */
  favorecidoNome: string | null;
}

export interface Sugestao {
  pessoa?: { id: string; nome: string };
  fornecedor?: { id: string; nome: string };
  categoriaId?: string;
  centroId?: string;
  forma?: "pix" | "ted" | "doc" | "deposito" | "boleto";
  /** 0–100 */
  confianca: number;
  banda: Banda;
  /** Em português, para a tela mostrar "por quê". */
  motivos: string[];
  /** Parece movimento entre contas da própria igreja: não vira receita nem despesa. */
  transferencia?: boolean;
  /** PIX terminado em ",10": a marca da tesouraria para oferta missionária. Sugere Missões, NUNCA grava sozinho (sempre "revisar"). */
  possivelMissoes?: boolean;
  /** O texto do banco serve a vários favorecidos (boleto genérico): não vale como pista de categoria. */
  generico?: boolean;
  /** A categoria/centro vieram de uma recorrência cadastrada (despesa fixa), não do histórico do extrato. */
  viaRecorrencia?: { nome: string; valor: number };
  /** Dízimo × Oferta decidido só pelo VALOR (sem histórico da pessoa): é uma sugestão fraca, sempre para revisar. */
  porValor?: boolean;
  /** Os últimos lançamentos da pessoa/favorecido identificado — o contexto para decidir com um olhar. */
  historico?: EvidenciaDoHistorico[];
  /** Outras categorias plausíveis (ids), para trocar com um clique. */
  alternativas?: string[];
}

export interface EvidenciaDoHistorico { dia: string; valor: number; categoriaId: string | null }

// ── normalização ────────────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** O texto do extrato sem números nem acento: serve de CHAVE de aprendizado para o que
 *  não cita pessoa (tarifa, rendimento, "PAGTO ELETRON COBRANCA …"). */
export function chaveDoMemo(memo: string): string {
  return semAcento(memo).toLowerCase().replace(/\d+/g, " ").replace(/[^a-z\s.*-]/g, " ").replace(/\s+/g, " ").trim();
}

const norm = (s: string) => semAcento(s).toLowerCase().trim();

// ── categorias por papel ────────────────────────────────────────────────────

export interface Categorias { dizimo?: string; oferta?: string; missoes?: string; rendimento?: string; tarifa?: string }

export function papelDasCategorias(cats: CategoriaRef[]): Categorias {
  const entrada = cats.filter(c => c.tipo === "entrada");
  const saida = cats.filter(c => c.tipo === "saida");
  return {
    dizimo: entrada.find(c => /^dizimos?$/.test(norm(c.nome)))?.id,
    oferta: entrada.find(c => norm(c.nome) === "ofertas")?.id,
    missoes: entrada.find(c => /missoes/.test(norm(c.nome)))?.id,
    rendimento: entrada.find(c => /rendimento/.test(norm(c.nome)))?.id,
    tarifa: saida.find(c => /tarifa/.test(norm(c.nome)))?.id,
  };
}

// ── o contexto ──────────────────────────────────────────────────────────────

export interface Contexto {
  cadastro: Cadastro;
  categorias: Categorias;
  porPessoa: Map<string, Historico[]>;
  porFornecedor: Map<string, Historico[]>;
  porChave: Map<string, Historico[]>;
  /** Quantas entradas ",10" (PIX, R$ 1 ou mais, fora rendimento) viraram Missões — a prova de que a regra ainda vale. */
  marca10: { missoes: number; total: number };
  /** Os lançamentos de cada categoria (para sugerir o centro junto da categoria). */
  porCategoria: Map<string, Historico[]>;
  /** Recorrências ativas: regra de classificação das despesas fixas. */
  recorrencias: RecorrenciaRegra[];
}

export function montarContexto(cadastro: Cadastro, cats: CategoriaRef[], historico: Historico[], recorrencias: RecorrenciaRegra[] = []): Contexto {
  const porPessoa = new Map<string, Historico[]>();
  const porFornecedor = new Map<string, Historico[]>();
  const porChave = new Map<string, Historico[]>();
  const juntar = (m: Map<string, Historico[]>, k: string | null, h: Historico) => {
    if (!k) return;
    const l = m.get(k); if (l) l.push(h); else m.set(k, [h]);
  };
  for (const h of [...historico].sort((a, b) => a.dia.localeCompare(b.dia))) {
    juntar(porPessoa, h.pessoaId, h);
    juntar(porFornecedor, h.fornecedorId, h);
    juntar(porChave, h.chave || null, h);
  }
  const categorias = papelDasCategorias(cats);
  const porCategoria = new Map<string, Historico[]>();
  const marca10 = { missoes: 0, total: 0 };
  for (const h of [...historico].sort((a, b) => a.dia.localeCompare(b.dia))) {
    juntar(porCategoria, h.categoriaId, h);
    if (h.tipo === "entrada" && terminaEm10(h.valor) && !/rentab|rendimento/.test(h.chave)) {
      marca10.total += 1;
      if (categorias.missoes && h.categoriaId === categorias.missoes) marca10.missoes += 1;
    }
  }
  return { cadastro, categorias, porPessoa, porFornecedor, porChave, marca10, porCategoria, recorrencias };
}

/** Termina em ,10 e vale pelo menos R$ 1 (R$ 0,10 é rendimento de aplicação, não oferta). */
export const terminaEm10 = (valor: number) => valor >= 1 && Math.round((valor % 1) * 100) === 10;

// ── votação do histórico ────────────────────────────────────────────────────

/** Os últimos N lançamentos contam, e os 3 mais recentes pesam 5, 4 e 3 (os demais, 1): a
 *  correção que ela fez ontem tem de vencer o hábito antigo. Medido nos testes: duas
 *  correções consistentes viram a sugestão; uma só, não (pode ser exceção). */
const JANELA = 12;
const PESO_DOS_RECENTES = [3, 4, 5]; // do 3º mais recente ao mais recente

export interface Voto { id: string; parcela: number; usos: number; total: number }

/** A categoria (ou centro) mais votada, com a fatia dela e o nº de lançamentos que votaram. */
export function maisVotado(hist: Historico[], campo: "categoriaId" | "centroId"): Voto | null {
  const ultimos = hist.filter(h => h[campo]).slice(-JANELA);
  if (ultimos.length === 0) return null;
  const pesos = new Map<string, number>();
  const ultimaVez = new Map<string, number>(); // desempate: vence quem foi usado por último
  let soma = 0;
  ultimos.forEach((h, i) => {
    const deTras = ultimos.length - 1 - i; // 0 = o mais recente
    const w = deTras < PESO_DOS_RECENTES.length ? PESO_DOS_RECENTES[PESO_DOS_RECENTES.length - 1 - deTras] : 1;
    pesos.set(h[campo]!, (pesos.get(h[campo]!) ?? 0) + w);
    ultimaVez.set(h[campo]!, i);
    soma += w;
  });
  const [id, peso] = [...pesos.entries()].sort((a, b) => b[1] - a[1] || (ultimaVez.get(b[0]) ?? 0) - (ultimaVez.get(a[0]) ?? 0))[0];
  return { id, parcela: peso / soma, usos: ultimos.filter(h => h[campo] === id).length, total: ultimos.length };
}

/** Confiança de "essa categoria costuma ser a certa": mais lançamentos e mais unanimidade → mais confiança. */
function confiancaDoVoto(v: Voto): number {
  const base = 50 + 45 * v.parcela * Math.min(1, v.total / 5);
  return Math.round(Math.min(97, base));
}

// ── a regra do dízimo ───────────────────────────────────────────────────────

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const MS_DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / MS_DIA);

export interface ResultadoDizimo { aplica: boolean; parcial: boolean; motivos: string[] }

/**
 * "Pessoa cadastrada + mais de 3 dízimos + mesma faixa de valor + periodicidade mensal →
 * Dízimo." (a regra dela, 06/10/2026).
 *  · mais de 3: pelo menos 4 dízimos no histórico;
 *  · mesma faixa: o valor de agora fica dentro de ±30% da mediana dos dízimos dela;
 *  · mensal: a mediana do intervalo entre um dízimo e o seguinte fica entre 20 e 45 dias.
 * `parcial`: tem 4+ dízimos mas falta faixa ou periodicidade — sugere Dízimo, sem automático.
 */
export function regraDoDizimo(hist: Historico[], dizimoId: string | undefined, valor: number, dia: string): ResultadoDizimo {
  if (!dizimoId) return { aplica: false, parcial: false, motivos: [] };
  const dizimos = hist.filter(h => h.categoriaId === dizimoId && h.tipo === "entrada");
  if (dizimos.length <= 3) {
    return { aplica: false, parcial: false, motivos: dizimos.length > 0 ? [`${dizimos.length} dízimo(s) no histórico — a regra pede mais de 3`] : [] };
  }
  const med = mediana(dizimos.map(d => d.valor));
  const naFaixa = valor >= med * 0.7 && valor <= med * 1.3;
  const datas = [...new Set(dizimos.map(d => d.dia))].sort();
  const intervalos = datas.slice(1).map((d, i) => diasEntre(datas[i], d)).filter(n => n > 0);
  const mensal = intervalos.length >= 2 && mediana(intervalos) >= 20 && mediana(intervalos) <= 45;
  const motivos = [
    `${dizimos.length} dízimos no histórico`,
    naFaixa ? `valor dentro da faixa habitual (mediana ${med.toFixed(2).replace(".", ",")})` : `valor fora da faixa habitual (mediana ${med.toFixed(2).replace(".", ",")})`,
    mensal ? "periodicidade mensal" : "sem periodicidade mensal clara",
  ];
  void dia;
  return { aplica: naFaixa && mensal, parcial: !(naFaixa && mensal), motivos };
}

// ── transferência entre contas da própria igreja ─────────────────────────────

const TRANSFERENCIA_PROPRIA = /\b(transf\s+autoriz\s+entre|baixa\s+automat\s+poupanca|aplic\w*\s+invest|resgate|transf\s+cp\s+autoat|deposit\s+transfer)/;

/**
 * "TRANSF" no texto do banco NÃO basta para dizer que o dinheiro é da própria igreja (pedido dela, 08/10/2026: "TRANSF AUTORIZ
 * ENTRE AGS CLAUDIA VILELA DE ALMEIDA" é um membro depositando, não transferência interna). Se, tirando as palavras do banco,
 * sobra um nome de pessoa — ou há um CPF —, a hipótese principal é contribuição de pessoa. Devolve o que foi visto, ou null.
 */
const PALAVRAS_DO_BANCO = new Set([
  "transf", "transfer", "transferencia", "autoriz", "autorizada", "autorizado", "entre", "ags", "ag", "agencia", "agencias", "baixa", "automat", "automatica",
  "poupanca", "aplic", "aplicacao", "invest", "facil", "resgate", "cdb", "rdb", "cp", "autoat", "deposit", "saldo", "conta", "corrente", "banco", "fundo", "cota",
  "ted", "doc", "pix", "mesma", "titularidade", "recebida", "recebido", "enviada", "enviado", "credito", "debito", "pgto",
  // o nome da própria igreja não é "pessoa": a transferência entre agências dela continua sendo interna
  "quarta", "igreja", "batista", "qibrj", "rio", "janeiro",
]);
export function evidenciaDePessoa(memo: string): string | null {
  const t = semAcento(memo).toLowerCase();
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(t)) return "um CPF";
  const palavras = (t.replace(/[^a-z\s]/g, " ").match(/[a-z]{3,}/g) ?? []).filter(w => !PALAVRAS_DO_BANCO.has(w) && !["das", "dos", "com", "para"].includes(w));
  return palavras.length >= 2 ? "um nome de pessoa" : null;
}

// ── a sugestão ──────────────────────────────────────────────────────────────

export const faixaDe = (confianca: number): Banda => (confianca >= 85 ? "identificada" : confianca >= 60 ? "revisar" : "nao_identificada");

const FORMA: Record<string, Sugestao["forma"]> = { pix: "pix", ted: "ted", doc: "doc", deposito: "deposito", boleto: "boleto" };

function sugerirBase(linha: Linha, ctx: Contexto): Sugestao {
  const ex = extrairNome(linha.memo);
  const chave = chaveDoMemo(linha.memo);
  const motivos: string[] = [];
  const forma = ex.forma ? FORMA[ex.forma] : undefined;
  // Nomes só PARECIDOS (um contido no outro) sugerem, não decidem: ligar o dízimo à pessoa errada
  // mexe no recibo dela. Teto de 80% = sempre cai em "revisar".
  const TETO_PARECIDO = 80;
  let nivel: NivelDoCasamento | null = null;
  const pronta = (s: Omit<Sugestao, "banda" | "forma" | "motivos"> & { motivos?: string[] }): Sugestao => {
    const parecido = nivel === "parecido" && (s.pessoa || s.fornecedor);
    if (parecido) motivos.push(`nome parecido (${ex.nome}) — confirme que é a mesma pessoa`);
    const confianca = parecido ? Math.min(s.confianca, TETO_PARECIDO) : s.confianca;
    return { forma, ...s, confianca, motivos: s.motivos ?? motivos, banda: faixaDe(confianca) };
  };

  // 1. movimento entre contas — só quando o texto NÃO traz uma pessoa (nome/CPF); do contrário a hipótese é contribuição de pessoa
  if (TRANSFERENCIA_PROPRIA.test(semAcento(linha.memo).toLowerCase())) {
    const gente = evidenciaDePessoa(linha.memo);
    if (!gente) {
      return pronta({ confianca: 70, transferencia: true, motivos: ["só o texto do banco indica movimento entre contas — sem perna correspondente confirmada; confira antes de registrar como Transferência"] });
    }
    motivos.push(`o banco escreveu TRANSF, mas o texto traz ${gente}: tratado como contribuição de pessoa, não como transferência interna`);
  }

  const hChave = ctx.porChave.get(chave) ?? [];

  // 2. quem tem pessoa/fornecedor no texto
  let pessoa: CandidatoNome | null = null;
  let fornecedor: CandidatoNome | null = null;
  if (ex.nome) {
    const p = encontrarDetalhado(ex.nome, ctx.cadastro.pessoas);
    const f = encontrarDetalhado(ex.nome, ctx.cadastro.fornecedores);
    if (p && f) motivos.push("o nome casa com uma pessoa E com um fornecedor — ambíguo");
    else { pessoa = p?.candidato ?? null; fornecedor = f?.candidato ?? null; nivel = (p ?? f)?.nivel ?? null; }
  }
  // sem nome de gente (conta de consumo, guia): o favorecido que o TEXTO cita — o nome da empresa, a marca ou a sigla do tributo
  if (!pessoa && !fornecedor) {
    const achado = favorecidoNoTexto(linha.memo, ctx.cadastro.fornecedores);
    if (achado) { fornecedor = achado.candidato; motivos.push(achado.motivo); }
  }

  // ── ENTRADA ──
  if (linha.tipo === "entrada") {
    const cat = ctx.categorias;
    const dicaId = ex.categoria === "dizimo" ? cat.dizimo : ex.categoria === "missoes" ? cat.missoes : ex.categoria === "oferta" ? cat.oferta : undefined;

    if (pessoa) {
      motivos.push(`${pessoa.nome} está no cadastro`);
      // só as ENTRADAS dela: quem também é paga (saída) não herda a categoria das saídas numa entrada
      const hist = (ctx.porPessoa.get(pessoa.id) ?? []).filter(h => h.tipo === "entrada");
      const regra = regraDoDizimo(hist, cat.dizimo, linha.valor, linha.data);
      if (regra.aplica && cat.dizimo) {
        motivos.push(...regra.motivos, "regra do dízimo: mais de 3, mesma faixa, mensal");
        return pronta({ pessoa: { id: pessoa.id, nome: pessoa.nome }, categoriaId: cat.dizimo, centroId: maisVotado(hist.filter(h => h.categoriaId === cat.dizimo), "centroId")?.id, confianca: 96 });
      }
      if (dicaId) {
        motivos.push(`o texto do extrato diz "${ex.categoria}"`);
        return pronta({ pessoa: { id: pessoa.id, nome: pessoa.nome }, categoriaId: dicaId, centroId: maisVotado(hist.filter(h => h.categoriaId === dicaId), "centroId")?.id, confianca: 92 });
      }
      const voto = maisVotado(hist, "categoriaId");
      if (voto) {
        const nome = voto.id === cat.dizimo ? "dízimo" : voto.id === cat.missoes ? "missões" : voto.id === cat.oferta ? "oferta" : "essa categoria";
        motivos.push(`${voto.usos} de ${voto.total} lançamentos dela foram ${nome}`);
        if (regra.parcial) motivos.push(...regra.motivos);
        return pronta({
          pessoa: { id: pessoa.id, nome: pessoa.nome }, categoriaId: voto.id,
          centroId: maisVotado(hist.filter(h => h.categoriaId === voto.id), "centroId")?.id, confianca: confiancaDoVoto(voto),
        });
      }
      // cadastrada, sem histórico de contribuição: o VALOR sugere (apenas sugestão, sempre para revisar)
      const porValor = categoriaPorValor(linha.valor, cat);
      motivos.push(porValor.motivo);
      return pronta({ pessoa: { id: pessoa.id, nome: pessoa.nome }, categoriaId: porValor.id, confianca: 62, porValor: true });
    }

    if (fornecedor) {
      motivos.push(`${fornecedor.nome} é fornecedor cadastrado`);
      // uma ENTRADA de fornecedor nunca herda a categoria das SAÍDAS dele (Manutenção, Prestação de Serviços…): só entradas anteriores
      const hEntradas = (ctx.porFornecedor.get(fornecedor.id) ?? []).filter(h => h.tipo === "entrada");
      const voto = maisVotado(hEntradas, "categoriaId");
      if (voto) return pronta({ fornecedor: { id: fornecedor.id, nome: fornecedor.nome }, categoriaId: voto.id, centroId: maisVotado(hEntradas, "centroId")?.id, confianca: confiancaDoVoto(voto) });
      const porValor = categoriaPorValor(linha.valor, cat);
      motivos.push("sem entrada anterior deste favorecido — " + porValor.motivo);
      return pronta({ fornecedor: { id: fornecedor.id, nome: fornecedor.nome }, categoriaId: porValor.id, confianca: 60, porValor: true });
    }

    // texto que se repete (rendimento, depósito em ATM…): o histórico daquele texto decide
    const votoChave = maisVotado(hChave, "categoriaId");
    if (ehGenerico(hChave)) {
      return pronta({ confianca: 35, generico: true, motivos: [...motivos, "o texto do banco serve a vários favorecidos: não indica categoria"] });
    }
    if (votoChave && hChave.length >= 2) {
      motivos.push(`já lançado ${hChave.length}× com este mesmo texto do extrato`);
      return pronta({ categoriaId: votoChave.id, centroId: maisVotado(hChave, "centroId")?.id, confianca: confiancaDoVoto(votoChave) });
    }
    if (/rentab/.test(chave) && cat.rendimento) return pronta({ categoriaId: cat.rendimento, confianca: 90, motivos: ["rendimento de aplicação (texto do banco)"] });

    if (ex.semNome === "anonimo") {
      motivos.push("anônimo — sem como achar a pessoa");
      return pronta({ categoriaId: dicaId ?? cat.oferta, confianca: 60, motivos: [...motivos, "confira"] });
    }
    if (ex.nome) {
      motivos.push(`${ex.nome} não está no cadastro de pessoas nem de fornecedores — fica sem vínculo (ou cadastre antes)`);
      if (dicaId) return pronta({ categoriaId: dicaId, confianca: 72 });
      const porValor = categoriaPorValor(linha.valor, cat);
      motivos.push(porValor.motivo);
      return pronta({ categoriaId: porValor.id, confianca: 62, porValor: true });
    }
    return pronta({ categoriaId: dicaId, confianca: 40, motivos: ["o texto do extrato não traz nome nem padrão conhecido"] });
  }

  // ── SAÍDA ──
  // 0. uma recorrência ativa que bate com este pagamento: categoria e centro vêm dela (despesa fixa)
  const viaRec = classificarPorRecorrencia(linha, ex.nome, fornecedor, pessoa, ctx);
  if (viaRec) return pronta(viaRec);
  const idPessoaOuForn = fornecedor?.id ?? pessoa?.id;
  const histEnt = fornecedor ? ctx.porFornecedor.get(fornecedor.id) : pessoa ? ctx.porPessoa.get(pessoa.id) : undefined;
  if (fornecedor || pessoa) {
    const alvo = (fornecedor ?? pessoa)!;
    motivos.push(`${alvo.nome} ${fornecedor ? "é fornecedor cadastrado" : "está no cadastro"}`);
    const voto = maisVotado((histEnt ?? []).filter(h => h.tipo === "saida"), "categoriaId");
    const ref = fornecedor ? { fornecedor: { id: fornecedor.id, nome: fornecedor.nome } } : { pessoa: { id: pessoa!.id, nome: pessoa!.nome } };
    if (voto) {
      motivos.push(`${voto.usos} de ${voto.total} pagamentos anteriores usaram esta categoria`);
      return pronta({ ...ref, categoriaId: voto.id, centroId: maisVotado((histEnt ?? []).filter(h => h.categoriaId === voto.id), "centroId")?.id, confianca: confiancaDoVoto(voto) });
    }
    void idPessoaOuForn;
    return pronta({ ...ref, confianca: 45, motivos: [...motivos, "sem pagamento anterior para sugerir a categoria"] });
  }
  if (ehGenerico(hChave.filter(h => h.tipo === "saida")) || TEXTO_DE_COBRANCA.test(chave)) {
    // ex.: "PAGTO ELETRON COBRANCA PAG COBRANCA NET EMPR" — 14 boletos de favorecidos diferentes num mês: a pista certa é o
    // DOCUMENTO a pagar (valor + vencimento), não o histórico do texto.
    return pronta({ confianca: 35, generico: true, motivos: [...motivos, "texto genérico do banco (boleto de vários favorecidos): identifique pelo documento a pagar"] });
  }
  const votoChave = maisVotado(hChave.filter(h => h.tipo === "saida"), "categoriaId");
  if (votoChave) {
    motivos.push(`já lançado ${hChave.length}× com este mesmo texto do extrato`);
    return pronta({ categoriaId: votoChave.id, centroId: maisVotado(hChave, "centroId")?.id, confianca: confiancaDoVoto(votoChave) });
  }
  if (ex.semNome === "tarifa" && ctx.categorias.tarifa) {
    return pronta({ categoriaId: ctx.categorias.tarifa, confianca: 92, motivos: ["tarifa bancária (texto do banco)"] });
  }
  return pronta({ confianca: 30, motivos: [ex.nome ? `${ex.nome}: sem cadastro nem pagamento anterior` : "sem nome nem padrão conhecido"] });
}

/** "PAGTO ELETRON COBRANCA …", "PAG COBRANCA …": descreve a OPERAÇÃO bancária (boleto), nunca o favorecido. */
const TEXTO_DE_COBRANCA = /\b(pagto\s+eletron\s+cobranca|pag\s+cobranca|pagamento\s+de\s+cobranca)\b/;

/** O mesmo texto de banco já pagou 3 ou mais favorecidos diferentes: não é pista de ninguém. */
function ehGenerico(h: Historico[]): boolean {
  const quem = new Set<string>();
  for (const x of h) { const id = x.fornecedorId ?? x.pessoaId; if (id) quem.add(id); }
  return quem.size >= 3;
}

const ULTIMOS = 4;

/** A partir deste valor, sem outra evidência, uma contribuição costuma ser dízimo; abaixo, oferta (medido em 08/10/2026: 59 dízimos × 15 ofertas a partir de R$ 100; 7 × 47 abaixo). */
export const LIMITE_DO_DIZIMO = 100;
function categoriaPorValor(valor: number, cat: Categorias): { id: string | undefined; motivo: string } {
  const dizimo = valor >= LIMITE_DO_DIZIMO && !!cat.dizimo;
  return {
    id: dizimo ? cat.dizimo : cat.oferta,
    motivo: `sem histórico de contribuição — sugestão pelo VALOR (a partir de R$ 100 costuma ser dízimo; abaixo, oferta). Só sugestão: confira`,
  };
}

const valorBate = (valor: number, r: RecorrenciaRegra) => r.valorVariavel || Math.abs(valor - r.valor) <= Math.max(1, 0.05 * r.valor);

/**
 * Despesa fixa: acha a recorrência ativa deste pagamento — pelo favorecido já identificado, pelo nome (inclusive truncado ou
 * com letra perdida), pela marca/sigla no texto, ou — para boleto genérico — pelo VALOR exato e dia próximo do vencimento. Só
 * quando é UMA recorrência (duas = ambíguo, não sugere). A categoria e o centro são os que a tesouraria cadastrou.
 */
function classificarPorRecorrencia(
  linha: Linha, nome: string | null | undefined, fornecedor: CandidatoNome | null, pessoa: CandidatoNome | null, ctx: Contexto,
): Omit<Sugestao, "banda" | "forma" | "motivos"> & { motivos?: string[] } | null {
  const recs = (ctx.recorrencias ?? []).filter(r => r.tipo === linha.tipo && r.categoriaId);
  if (recs.length === 0) return null;
  const chave = chaveDoMemo(linha.memo);
  let achadas: RecorrenciaRegra[] = [];
  let como = "";
  const byId = recs.filter(r => (fornecedor && r.fornecedorId === fornecedor.id) || (pessoa && r.pessoaId === pessoa.id));
  if (byId.length > 0) { achadas = byId; como = "o favorecido tem recorrência ativa"; }
  if (achadas.length === 0 && nome) {
    const n = encontrarDetalhado(nome, recs.map(r => ({ id: r.id, nome: r.nome })));
    if (n) { achadas = recs.filter(r => r.id === n.candidato.id); como = `o nome casa com a recorrência «${n.candidato.nome}»`; }
  }
  if (achadas.length === 0) {
    const t = favorecidoNoTexto(linha.memo, recs.map(r => ({ id: r.id, nome: r.nome, pj: true })));
    if (t) { achadas = recs.filter(r => r.id === t.candidato.id); como = `o texto cita a recorrência «${t.candidato.nome}»`; }
  }
  // boleto genérico: nenhum nome — vale o valor exato + o dia do vencimento
  if (achadas.length === 0 && TEXTO_DE_COBRANCA.test(chave)) {
    const dia = Number(linha.data.slice(8, 10));
    const porValorEDia = recs.filter(r => !r.valorVariavel && Math.abs(linha.valor - r.valor) < 0.01 && r.diaDoVencimento != null && Math.abs(dia - r.diaDoVencimento) <= 5);
    if (porValorEDia.length === 1) { achadas = porValorEDia; como = "o valor exato e o dia batem com a recorrência"; }
  }
  if (achadas.length > 1) {
    const exatas = achadas.filter(r => valorBate(linha.valor, r) && !r.valorVariavel);
    achadas = exatas.length === 1 ? exatas : [];
  }
  if (achadas.length !== 1) return null;
  const r = achadas[0];
  const favorito = fornecedor ?? pessoa;
  const ref = favorito
    ? (fornecedor ? { fornecedor: { id: favorito.id, nome: favorito.nome } } : { pessoa: { id: favorito.id, nome: favorito.nome } })
    : r.fornecedorId ? { fornecedor: { id: r.fornecedorId, nome: r.favorecidoNome ?? r.nome } }
    : r.pessoaId ? { pessoa: { id: r.pessoaId, nome: r.favorecidoNome ?? r.nome } } : {};
  const bate = valorBate(linha.valor, r);
  const confianca = bate ? (r.valorVariavel ? 88 : 90) : 72;
  const aviso = bate ? (r.valorVariavel ? "valor variável" : `valor igual ao da recorrência (R$ ${r.valor.toFixed(2).replace(".", ",")})`) : `valor diferente do da recorrência (R$ ${r.valor.toFixed(2).replace(".", ",")}) — confira`;
  return {
    ...ref, categoriaId: r.categoriaId!, centroId: r.centroId ?? undefined, confianca,
    viaRecorrencia: { nome: r.nome, valor: r.valor },
    motivos: [`recorrência ativa «${r.nome}»: ${como}`, `categoria e centro vêm da recorrência cadastrada; ${aviso}`],
  };
}

/** Acrescenta o que a tela precisa para decidir rápido: histórico, alternativas e a marca ",10". */
export function sugerir(linha: Linha, ctx: Contexto): Sugestao {
  let s = sugerirBase(linha, ctx);
  const cat = ctx.categorias;
  const histAlvo = s.fornecedor ? ctx.porFornecedor.get(s.fornecedor.id) : s.pessoa ? ctx.porPessoa.get(s.pessoa.id) : undefined;
  const hChave = ctx.porChave.get(chaveDoMemo(linha.memo)) ?? [];

  // a marca ",10" — PIX terminado em ,10 é oferta missionária por convenção da tesouraria (a pergunta é sempre feita, nunca respondida sozinha)
  const rendimento = /rentab|rendimento/.test(chaveDoMemo(linha.memo)) || s.categoriaId === cat.rendimento;
  const valeAMarca = ctx.marca10.total < 10 || ctx.marca10.missoes / ctx.marca10.total >= 0.5;
  if (linha.tipo === "entrada" && !s.transferencia && terminaEm10(linha.valor) && /\bpix\b/i.test(linha.memo) && !rendimento
      && cat.missoes && s.categoriaId !== cat.missoes && valeAMarca) {
    const confianca = Math.min(78, Math.max(65, s.confianca));
    s = {
      ...s, categoriaId: cat.missoes, centroId: maisVotado(ctx.porCategoria.get(cat.missoes) ?? [], "centroId")?.id ?? s.centroId,
      confianca, banda: faixaDe(confianca), possivelMissoes: true,
      motivos: [...s.motivos, `PIX terminado em ,10: marca da tesouraria para oferta missionária (${ctx.marca10.missoes} de ${ctx.marca10.total} entradas assim já foram Missões) — confirme`],
    };
  }

  // o contexto: os últimos lançamentos do favorecido
  const historico = (histAlvo ?? []).filter(h => h.tipo === linha.tipo).slice(-ULTIMOS).reverse().map(h => ({ dia: h.dia, valor: h.valor, categoriaId: h.categoriaId }));
  // as alternativas: entrada = Dízimo/Oferta/Missões; saída = o que esse favorecido (ou texto) já recebeu
  let alternativas: string[];
  if (s.generico) alternativas = [];   // texto genérico (boleto/cobrança): nenhuma categoria é sugerida, nem como alternativa
  else if (linha.tipo === "entrada") alternativas = [cat.dizimo, cat.oferta, cat.missoes].filter((x): x is string => !!x && x !== s.categoriaId);
  else {
    const contagem = new Map<string, number>();
    for (const h of (histAlvo ?? hChave).filter(x => x.tipo === "saida")) if (h.categoriaId) contagem.set(h.categoriaId, (contagem.get(h.categoriaId) ?? 0) + 1);
    alternativas = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter(id => id !== s.categoriaId).slice(0, 3);
  }
  return { ...s, ...(historico.length ? { historico } : {}), alternativas };
}

// ── o painel ────────────────────────────────────────────────────────────────

export interface Painel { total: number; identificadas: number; revisar: number; naoIdentificadas: number; transferencias: number }

export function resumirPainel(sugestoes: Sugestao[]): Painel {
  const p: Painel = { total: sugestoes.length, identificadas: 0, revisar: 0, naoIdentificadas: 0, transferencias: 0 };
  for (const s of sugestoes) {
    if (s.transferencia) p.transferencias += 1;
    if (s.banda === "identificada") p.identificadas += 1;
    else if (s.banda === "revisar") p.revisar += 1;
    else p.naoIdentificadas += 1;
  }
  return p;
}

export type { DicaCategoria };
