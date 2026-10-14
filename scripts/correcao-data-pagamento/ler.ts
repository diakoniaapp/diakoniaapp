// PASSO 1 — SÓ LEITURA. Baixa cada comprovante (anexo tipo "comprovante") de cada pagamento feito, lê com o MESMO leitor do
// aplicativo (src/lib/documentos/comprovante.ts) e grava a leitura em saida/leituras-<data-hora>.json. Não altera nada.
//   npm run correcao-data:ler
import fs from "node:fs";
import path from "node:path";
import { lerComprovante } from "@/lib/documentos/comprovante";
import { contarComprovantes, type LeituraDoAnexo, type PagamentoComComprovante } from "@/lib/correcaoDataPagamento";
import { agruparEmLinhas } from "@/services/ocrService";
import { carimbo, conectar, garantirSaida, hojeBrasilia, SAIDA } from "./comum";

const sb = conectar();
const hoje = hojeBrasilia();

/** PDF → texto exato (pdf.js, como o aplicativo). PDF escaneado não tem texto: volta vazio (OCR fica de fora — ver a documentação). */
async function textoDoPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    const itens = (c.items as any[]).filter(it => typeof it.str === "string" && it.str.length > 0).map(it => ({ texto: it.str, x: it.transform[4], y: it.transform[5] }));
    paginas.push(agruparEmLinhas(itens).join("\n"));
  }
  return paginas.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

const { data: anexos, error } = await sb.from("fin_lancamento_anexos").select("id, lancamento_id, nome, url").eq("tipo", "comprovante");
if (error) throw new Error(error.message);
const ids = [...new Set((anexos ?? []).map(a => a.lancamento_id as string))];
const lancs: any[] = [];
for (let i = 0; i < ids.length; i += 200) {
  const { data, error: e } = await sb.from("fin_lancamentos").select("id, tipo, status, data_pagamento, valor").in("id", ids.slice(i, i + 200));
  if (e) throw new Error(e.message);
  lancs.push(...(data ?? []));
}

const pagamentos = new Map<string, PagamentoComComprovante>();
for (const l of lancs) pagamentos.set(l.id, { lancamentoId: l.id, tipo: l.tipo, status: l.status, dataPagamento: l.data_pagamento, valor: Number(l.valor), anexos: [] });

let n = 0;
for (const a of anexos ?? []) {
  const p = pagamentos.get(a.lancamento_id as string);
  if (!p) continue;
  const item: LeituraDoAnexo = { anexoId: a.id as string, arquivo: (a.nome as string) ?? null, erro: null, quantidadeDeComprovantes: 1, leitura: null };
  try {
    if (!/\.pdf$/i.test(String(a.nome ?? a.url))) throw new Error("não é PDF (imagem precisaria de OCR)");
    const blob = (await sb.storage.from("fin-comprovantes").download(String(a.url))).data;   // o bucket de adicionarAnexo
    if (!blob) throw new Error("o arquivo não baixou");
    const texto = await textoDoPdf(await blob.arrayBuffer());
    if (texto.length < 30) throw new Error("PDF sem texto (escaneado) — precisaria de OCR");
    const r = lerComprovante(texto, { hoje, valorEsperado: p.valor, fonte: "pdf_texto" });
    item.quantidadeDeComprovantes = contarComprovantes(texto);
    item.leitura = { data: r.data, hora: r.hora, valor: r.valor, banco: r.banco, tipo: r.tipo, confianca: r.confianca, e2e: r.e2e, candidatas: r.candidatas };
  } catch (e) { item.erro = e instanceof Error ? e.message : String(e); }
  p.anexos.push(item);
  process.stdout.write(`\r  lidos ${++n}/${anexos!.length}`);
}

garantirSaida();
const arq = path.join(SAIDA, `leituras-${carimbo()}.json`);
fs.writeFileSync(arq, JSON.stringify({ lidoEm: new Date().toISOString(), hoje, pagamentos: [...pagamentos.values()] }, null, 1));
console.log(`\n${pagamentos.size} pagamentos com comprovante; ${n} arquivos. Leitura gravada em ${path.relative(process.cwd(), arq)}`);
console.log("Próximo passo (só mostra o plano, não grava): npm run correcao-data:plano");
