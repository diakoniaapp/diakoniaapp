// PASSO 2 — o plano e a correção. Usa a leitura mais recente de saida/ (ou a passada como argumento).
//   npm run correcao-data:plano     → só mostra o que seria feito (não grava)
//   npm run correcao-data:aplicar   → grava: UPDATE condicional da data_pagamento + uma linha de trilha em log_auditoria por correção
// A regra (o que corrige, o que exclui e por quê) é src/lib/correcaoDataPagamento.ts — testada.
import fs from "node:fs";
import path from "node:path";
import { AUTOR_DA_CORRECAO, decidir, EVENTO_CORRECAO, MOTIVO_DA_CORRECAO, type PagamentoComComprovante } from "@/lib/correcaoDataPagamento";
import { arquivoDeLeitura, carimbo, conectar, SAIDA } from "./comum";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const arq = arquivoDeLeitura(args.find(a => !a.startsWith("--")));
const { lidoEm, pagamentos } = JSON.parse(fs.readFileSync(arq, "utf8")) as { lidoEm: string; pagamentos: PagamentoComComprovante[] };
console.log(`Leitura: ${path.relative(process.cwd(), arq)} (lida em ${lidoEm})\n`);

const corrigir: { p: PagamentoComComprovante; de: string | null; para: string; anexo: any }[] = [];
const excluidos: { p: PagamentoComComprovante; motivos: string[] }[] = [];
const semComprovante: { p: PagamentoComComprovante; motivo: string }[] = [];
let jaCertas = 0;
for (const p of pagamentos) {
  const d = decidir(p);
  if (d.tipo === "corrigir") corrigir.push({ p, de: d.de, para: d.para, anexo: d.anexo });
  else if (d.tipo === "excluir") excluidos.push({ p, motivos: d.motivos });
  else if (d.tipo === "sem_comprovante") semComprovante.push({ p, motivo: d.motivo });
  else jaCertas++;
}
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const curto = (id: string) => id.slice(0, 8);
console.log(`== A CORRIGIR (${corrigir.length})`);
for (const c of corrigir) console.log(`  ${curto(c.p.lancamentoId)}  ${brl(c.p.valor).padStart(12)}  ${c.de ?? "(vazia)"} → ${c.para}  ${c.anexo.leitura.tipo}`);
console.log(`== NÃO CORRIGIDOS — caso dúbio (${excluidos.length})`);
for (const x of excluidos) console.log(`  ${curto(x.p.lancamentoId)}  ${brl(x.p.valor).padStart(12)}  ${x.motivos.join("; ")}`);
console.log(`== SEM COMPROVANTE APROPRIADO (${semComprovante.length})`);
for (const x of semComprovante) console.log(`  ${curto(x.p.lancamentoId)}  ${brl(x.p.valor).padStart(12)}  ${x.motivo}`);
console.log(`== JÁ CERTAS (data do sistema = data do comprovante): ${jaCertas}`);

if (!APLICAR) { console.log("\nNada foi gravado. Para aplicar: npm run correcao-data:aplicar"); process.exit(0); }

const sb = conectar();
const feitos: any[] = [], falhas: any[] = [];
for (const c of corrigir) {
  const agora = new Date().toISOString();
  // condicional: só muda se a data no banco ainda for a lida (se alguém mexeu desde a leitura, não toca)
  let q = sb.from("fin_lancamentos").update({ data_pagamento: c.para }).eq("id", c.p.lancamentoId);
  q = c.de === null ? q.is("data_pagamento", null) : q.eq("data_pagamento", c.de);
  const { data, error } = await q.select("id");
  if (error || !data?.length) { falhas.push({ id: c.p.lancamentoId, erro: error?.message ?? "a data mudou desde a leitura: não alterado" }); continue; }
  const l = c.anexo.leitura;
  // log_auditoria só aceita SELECT/INSERT/UPDATE/DELETE/EXPORT em `acao`: o tipo da correção vai em campos_alt.evento
  const log = await sb.from("log_auditoria").insert({
    tabela: "fin_lancamentos", registro_id: c.p.lancamentoId, acao: "UPDATE", usuario_email: AUTOR_DA_CORRECAO,
    valor_antes: { data_pagamento: c.de },
    campos_alt: { evento: EVENTO_CORRECAO, data_pagamento: c.para, corrigido_em: agora, motivo: MOTIVO_DA_CORRECAO,
      comprovante: c.anexo.arquivo, anexo_id: c.anexo.anexoId, banco: l.banco, hora: l.hora, valor_comprovante: l.valor, tipo: l.tipo, e2e: l.e2e },
  }).select("id");
  if (log.error || !log.data?.length) {
    // sem trilha, a correção não fica
    await sb.from("fin_lancamentos").update({ data_pagamento: c.de }).eq("id", c.p.lancamentoId).eq("data_pagamento", c.para).select("id");
    falhas.push({ id: c.p.lancamentoId, erro: `a trilha não gravou (${log.error?.message ?? "0 linhas"}): alteração desfeita` });
    continue;
  }
  feitos.push({ id: c.p.lancamentoId, de: c.de, para: c.para });
}
const res = path.join(SAIDA, `resultado-${carimbo()}.json`);
fs.writeFileSync(res, JSON.stringify({ leitura: path.basename(arq), feitos, falhas, excluidos: excluidos.length, semComprovante: semComprovante.length, jaCertas }, null, 1));
console.log(`\nAPLICADO: ${feitos.length} corrigidos; ${falhas.length} falharam. Resultado em ${path.relative(process.cwd(), res)}`);
for (const f of falhas) console.log(`  FALHA ${curto(f.id)}  ${f.erro}`);
