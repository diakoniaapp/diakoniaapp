// ─── lib/documentos/casamento.ts — documento × lançamento ────────────────────
//
// Motor de casamento da Central de Documentos (Fase 1). PURO: recebe o que
// `leitura.ts` extraiu e a lista de lançamentos candidatos, devolve, por
// documento, a BANDA (pronto / revisar / sem destino / duplicata), os melhores
// candidatos com CONFIANÇA e o MOTIVO por extenso.
//
// Regras e pesos vêm de medições em documentos reais (03/10/2026, ver
// docs/CENTRAL_DOCUMENTOS_CONTABEIS.md):
//   · CNPJ do emitente = CNPJ do fornecedor ......... 40
//     (sem CNPJ cadastrado: nome parecido ............ 25)
//   · valor igual ao impresso ...................... 35 | valor LÍQUIDO ....... 32
//   · data igual ................................... 20 | ±3 dias ............. 10 | ≤ 30 dias 4
//   · candidato claramente à frente do 2º ........... +5 | 2º colocado a < 10 pts  −15
// A confiança ORDENA e define a banda; NÃO é uma probabilidade calibrada.
//
// Quatro decisões de produto embutidas (pedidas por ela, 03/10/2026):
//   1. nada é "pronto" quando o valor DIVERGE (mesmo fornecedor e dia, valor
//      diferente — caso Agrottha, R$ 5.400 × R$ 5.940): sempre revisar;
//   2. no CARTÃO a data do documento é a da compra, não a da fatura: com CNPJ +
//      valor batendo, a data não derruba a confiança;
//   3. COMPRA PARCELADA: 1 documento → N lançamentos (o mesmo documento aparece
//      em TODAS as parcelas);
//   4. DUPLICATA (hash igual ao de um anexo existente) nunca liga de novo.

import type { DocumentoLido } from "./leitura";

export interface LancamentoPool {
  id: string;
  /** `AAAA-MM-DD` — data do pagamento (ou `data` quando vazia). */
  dia: string;
  valor: number;
  fornecedorNome: string;
  /** Só dígitos; `null` se o fornecedor não tem CNPJ cadastrado. */
  fornecedorCnpj: string | null;
  contaNome: string;
  contaTipo: string;
  status: string;
  temAnexo: boolean;
  descricao?: string | null;
  /** `fin_lancamentos.documento_numero` — a Central o preenche quando está vazio. */
  documentoNumero?: string | null;
}

export interface EntradaCasamento {
  /** Identificação livre do arquivo (nome, caminho no storage…). */
  id: string;
  leitura: DocumentoLido;
  /** SHA-256 (ou prefixo) do conteúdo — pra detectar documento já anexado. */
  hash?: string;
  /** Campos lidos do NOME do arquivo (padrão da tesouraria), quando existirem. */
  nome?: { data?: string | null; valor?: number | null; fornecedor?: string | null };
}

export type Banda = "pronto" | "revisar" | "sem_destino" | "duplicata";

export interface Candidato {
  lancamento: LancamentoPool;
  confianca: number;
  motivos: string[];
  /** Algo que exige olho humano mesmo com confiança alta. */
  alerta?: string;
}

export interface Parcelamento {
  /** Número de parcelas da compra, deduzido de total ≈ n × parcela. */
  n: number;
  valorParcela: number;
  total: number;
  lancamentos: LancamentoPool[];
  /** Parcelas encontradas em lançamentos (um lançamento pode quitar várias). */
  encontradas: number;
  faltam: number;
}

export interface ResultadoCasamento {
  id: string;
  banda: Banda;
  confianca: number;
  candidatos: Candidato[];
  parcelamento?: Parcelamento;
  /** Frase curta que explica a banda (mostrada no cartão). */
  resumo: string;
  /** Duplicata: onde o mesmo arquivo já está. */
  jaAnexadoEm?: string;
}

export interface OpcoesCasamento {
  /** hash → id do lançamento que já tem esse arquivo. */
  hashesExistentes?: Map<string, string>;
  hoje?: string;
}

// ── utilidades ──────────────────────────────────────────────────────────────

const STOP = new Set(["LTDA", "SA", "S", "A", "ME", "EPP", "EIRELI", "DE", "DA", "DO", "DAS", "DOS", "E", "COM", "PROD", "COMERCIO", "INDUSTRIA", "CIA", "SERVICOS", "SERV"]);

function tokens(s: string): Set<string> {
  return new Set(
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t)).map(t => t.slice(0, 5)),
  );
}

/** Semelhança de nome: fração das palavras (raiz de 5 letras) do MENOR nome que
 *  aparece no outro — "SUPERMERCADO MUNDIAL" × "Supermercados Mundial LTDA" = 1. */
export function semelhanca(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach(t => B.has(t) && (n += 1));
  return n / Math.min(A.size, B.size);
}

const iguais = (a: number, b: number, tol = 0.005) => Math.abs(a - b) < tol;
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const brData = (iso: string) => iso.split("-").reverse().join("/");
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

function diasEntre(a: string, b: string): number {
  return Math.round(Math.abs(new Date(`${a}T00:00`).getTime() - new Date(`${b}T00:00`).getTime()) / 864e5);
}

// ── pontuação de um candidato ───────────────────────────────────────────────

function pontuar(e: EntradaCasamento, l: LancamentoPool): Candidato | null {
  const d = e.leitura;
  let s = 0;
  const motivos: string[] = [];
  let alerta: string | undefined;

  // fornecedor
  const porCnpj = !!d.cnpj && !!l.fornecedorCnpj && d.cnpj === l.fornecedorCnpj;
  if (porCnpj) { s += 40; motivos.push(`CNPJ ${cnpjFmt(d.cnpj!)} é o do fornecedor "${l.fornecedorNome}"`); }
  else {
    const nome = d.emitente ?? e.nome?.fornecedor ?? null;
    if (nome && semelhanca(nome, l.fornecedorNome) >= 0.5) { s += 25; motivos.push(`nome "${nome}" parecido com "${l.fornecedorNome}"`); }
  }

  // valor (do documento; ou do nome do arquivo quando o conteúdo não deu nada)
  const valores = d.valores.length ? d.valores : (e.nome?.valor ? [{ valor: e.nome.valor, origem: "valor no nome do arquivo", bruto: true }] : []);
  const acerto = valores.find(v => iguais(v.valor, l.valor));
  if (acerto) {
    // varredura ("algum R$ no documento") vale menos que valor lido por rótulo
    s += acerto.aproximado ? 28 : acerto.bruto ? 35 : 32;
    motivos.push(acerto.aproximado ? `valor ${brl(l.valor)} igual (leitura aproximada)` : acerto.bruto ? `valor ${brl(l.valor)} igual` : `valor ${brl(l.valor)} = ${acerto.origem}`);
  }

  // data — boleto/fatura não têm emissão útil: vale o vencimento (onde o
  // pagamento costuma cair)
  const emissao = d.emissao ?? d.vencimento ?? e.nome?.data ?? null;
  const rotuloData = d.emissao ? "data" : d.vencimento ? "vencimento" : "data";
  if (emissao) {
    const dias = diasEntre(emissao, l.dia);
    const cartao = l.contaTipo === "cartao";
    if (dias === 0) { s += 20; motivos.push(`${rotuloData} ${brData(l.dia)} igual`); }
    else if (cartao && acerto && (porCnpj || semelhanca(d.emitente ?? "", l.fornecedorNome) >= 0.5) && emissao <= l.dia && dias <= 120) {
      // cartão: o documento é da COMPRA, o lançamento é da FATURA (data posterior)
      s += 20; motivos.push(`cartão: compra em ${brData(emissao)}, lançada na fatura de ${brData(l.dia)}`);
    }
    else if (dias <= 3) { s += 10; motivos.push(`${rotuloData} a ${dias} dia(s)`); }
    else if (dias <= 30) { s += 4; motivos.push(`${rotuloData} a ${dias} dias`); }
  }

  if (s <= 0) return null;

  // valor diverge com fornecedor+dia iguais → nunca automático (caso Agrottha)
  if (!acerto && (porCnpj || semelhanca(d.emitente ?? "", l.fornecedorNome) >= 0.5) && emissao && diasEntre(emissao, l.dia) <= 1 && valores.length) {
    alerta = `mesmo fornecedor e dia, mas o valor diverge (documento ${valores.map(v => brl(v.valor)).join(" ou ")} × lançamento ${brl(l.valor)})`;
  }
  return { lancamento: l, confianca: s, motivos, alerta };
}

// ── compra parcelada: 1 documento → N lançamentos ───────────────────────────

/** Procura n (2..12) e uma parcela v tais que n × v ≈ total, entre os lançamentos
 *  do mesmo fornecedor posteriores à emissão. Um lançamento pode quitar várias
 *  parcelas de uma vez (R$ 259,90 = 5 × 51,98). */
export function acharParcelamento(e: EntradaCasamento, pool: LancamentoPool[]): Parcelamento | null {
  const d = e.leitura;
  if (!d.cnpj || !d.emissao) return null;
  const totais = d.valores.filter(v => v.bruto).map(v => v.valor);
  if (!totais.length) totais.push(...d.valores.map(v => v.valor));
  const doFornecedor = pool
    .filter(l => l.fornecedorCnpj === d.cnpj && l.dia >= d.emissao!)
    .sort((a, b) => a.dia.localeCompare(b.dia));
  if (doFornecedor.length < 2) return null;

  let melhor: Parcelamento | null = null;
  for (const total of totais) {
    for (const base of new Set(doFornecedor.map(l => l.valor))) {
      for (let n = 2; n <= 12; n++) {
        if (Math.abs(n * base - total) > 0.12) continue;
        // lançamentos cujo valor é k parcelas (k ≥ 1), na ordem do tempo, até completar n
        const usados: LancamentoPool[] = [];
        let achadas = 0;
        for (const l of doFornecedor) {
          const k = Math.round(l.valor / base);
          if (k < 1 || Math.abs(l.valor - k * base) > 0.06 * k) continue;
          if (achadas + k > n) continue;
          usados.push(l); achadas += k;
          if (achadas === n) break;
        }
        // tem que haver pelo menos 2 parcelas encontradas pra chamar de parcelamento
        if (achadas < 2) continue;
        const cand: Parcelamento = { n, valorParcela: base, total, lancamentos: usados, encontradas: achadas, faltam: n - achadas };
        if (!melhor || cand.encontradas > melhor.encontradas) melhor = cand;
      }
    }
  }
  return melhor;
}

// ── um documento ────────────────────────────────────────────────────────────

export function casar(e: EntradaCasamento, pool: LancamentoPool[], op: OpcoesCasamento = {}): ResultadoCasamento {
  // 1) duplicata — mesmo conteúdo de um anexo que já existe
  const jaEm = e.hash ? op.hashesExistentes?.get(e.hash) : undefined;
  if (jaEm) {
    return { id: e.id, banda: "duplicata", confianca: 100, candidatos: [], jaAnexadoEm: jaEm,
      resumo: "Este arquivo já está anexado a um lançamento — não será ligado de novo." };
  }

  // 2) candidatos por lançamento
  const bruta = pool.map(l => pontuar(e, l)).filter((c): c is Candidato => !!c).sort((a, b) => b.confianca - a.confianca);

  // 3) penalidade/bônus de unicidade, calculados sobre um RETRATO das notas
  //    originais (não sobre valores já ajustados)
  let lista = bruta;
  if (bruta.length) {
    const melhor = bruta[0].confianca;
    const empatados = bruta.filter(x => melhor - x.confianca < 10);
    if (empatados.length > 1) {
      // Empate (2º colocado a menos de 10 pontos): −15 E teto de 84, em TODOS os
      // empatados. Só −15 deixava dois lançamentos IDÊNTICOS em 85% ("pronto"); e
      // penalizar só o 1º fazia o 2º (sem penalidade) passar à frente na reordenação.
      lista = bruta.map(x => {
        if (!empatados.includes(x)) return x;
        const outro = empatados.find(o => o !== x)!;
        return {
          ...x,
          confianca: Math.min(84, Math.max(0, x.confianca - 15)),
          motivos: [...x.motivos, `outro lançamento quase igual (${brl(outro.lancamento.valor)}, ${brData(outro.lancamento.dia)})`],
        };
      });
    } else if (melhor - (bruta[1]?.confianca ?? 0) >= 25) {
      lista = bruta.map((x, i) => (i === 0 ? { ...x, confianca: Math.min(100, x.confianca + 5) } : x));
    }
    lista = [...lista].sort((a, b) => b.confianca - a.confianca);
  }
  const top = lista.slice(0, 5).map(c => ({ ...c, confianca: Math.min(100, Math.round(c.confianca)) }));

  // 4) compra parcelada — quando nenhum lançamento isolado tem o valor do documento
  const temValorIgual = top.some(c => c.motivos.some(m => m.startsWith("valor ")));
  const parc = temValorIgual ? null : acharParcelamento(e, pool);
  if (parc) {
    const conf = 40 + 35 + 20;
    return {
      id: e.id, banda: parc.faltam === 0 ? "pronto" : "revisar", confianca: conf, candidatos: top, parcelamento: parc,
      resumo: `Compra parcelada em ${parc.n}× de ${brl(parc.valorParcela)}: o mesmo documento vai para ${parc.lancamentos.length} lançamento(s)`
        + (parc.faltam ? ` — faltam ${parc.faltam} parcela(s) ainda não lançada(s)` : ""),
    };
  }

  // 5) banda
  if (!top.length) return { id: e.id, banda: "sem_destino", confianca: 0, candidatos: [], resumo: "Nenhum lançamento combina com este documento." };
  const c0 = top[0];
  if (c0.alerta) return { id: e.id, banda: "revisar", confianca: c0.confianca, candidatos: top, resumo: `Revisar: ${c0.alerta}.` };
  if (c0.confianca >= 85) return { id: e.id, banda: "pronto", confianca: c0.confianca, candidatos: top, resumo: "Pronto para vincular." };
  if (c0.confianca >= 60) return { id: e.id, banda: "revisar", confianca: c0.confianca, candidatos: top, resumo: "Revisar a sugestão." };
  return { id: e.id, banda: "sem_destino", confianca: c0.confianca, candidatos: top, resumo: "Sem lançamento claro — escolha manualmente ou deixe de fora." };
}

/** Um lote inteiro: aplica `casar` em cada documento. (A "eliminação" entre
 *  documentos fica pra Fase 2 — dois documentos podem, legitimamente, ser do
 *  MESMO lançamento: nota + comprovante.) */
export function casarLote(entradas: EntradaCasamento[], pool: LancamentoPool[], op: OpcoesCasamento = {}): ResultadoCasamento[] {
  return entradas.map(e => casar(e, pool, op));
}
