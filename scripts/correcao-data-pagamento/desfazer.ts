// ROLLBACK — devolve a data_pagamento antiga das correções automáticas, a partir da trilha em log_auditoria.
//   npm run correcao-data:desfazer -- [--lote AAAA-MM-DD] [--lancamento <id>]            → só mostra o que seria desfeito
//   npm run correcao-data:desfazer -- [--lote AAAA-MM-DD] [--lancamento <id>] --aplicar  → desfaz
// Sem filtro, considera TODAS as correções ainda não desfeitas. Só desfaz quando a data no banco ainda é a que a correção gravou
// (se alguém mudou à mão depois, não toca). Cada desfeita também deixa uma linha na trilha (evento DESFAZ_CORRECAO_DATA_PAGAMENTO).
import { AUTOR_DA_CORRECAO, EVENTO_CORRECAO, EVENTO_DESFEITA } from "@/lib/correcaoDataPagamento";
import { conectar } from "./comum";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const valor = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const lote = valor("--lote"), lancamento = valor("--lancamento");

const sb = conectar();
const { data: linhas, error } = await sb.from("log_auditoria").select("id, registro_id, valor_antes, campos_alt, created_at")
  .eq("tabela", "fin_lancamentos").eq("usuario_email", AUTOR_DA_CORRECAO).order("created_at", { ascending: true });
if (error) throw new Error(error.message);

// a última palavra de cada lançamento: se a correção mais recente já foi desfeita, não há o que desfazer
const ultima = new Map<string, any>();
for (const l of linhas ?? []) ultima.set(l.registro_id, l);
const alvos = [...ultima.values()].filter(l => l.campos_alt?.evento === EVENTO_CORRECAO)
  .filter(l => !lote || String(l.campos_alt?.corrigido_em ?? "").startsWith(lote))
  .filter(l => !lancamento || l.registro_id.startsWith(lancamento));   // aceita o id inteiro ou o prefixo que a listagem mostra

console.log(`== A DESFAZER (${alvos.length})`);
for (const a of alvos) console.log(`  ${a.registro_id.slice(0, 8)}  ${a.campos_alt.data_pagamento} → ${a.valor_antes?.data_pagamento ?? "(vazia)"}  (corrigido em ${String(a.campos_alt.corrigido_em).slice(0, 10)})`);
// sem process.exit: no Windows ele derruba o Node com a conexão ainda fechando ("Assertion failed … UV_HANDLE_CLOSING")
if (!APLICAR) console.log("\nNada foi alterado. Para desfazer de fato, acrescente --aplicar.");

let feitos = 0; const falhas: string[] = [];
for (const a of APLICAR ? alvos : []) {
  const antes = a.valor_antes?.data_pagamento ?? null, depois = a.campos_alt.data_pagamento;
  const { data, error: e } = await sb.from("fin_lancamentos").update({ data_pagamento: antes }).eq("id", a.registro_id).eq("data_pagamento", depois).select("id");
  if (e || !data?.length) { falhas.push(`${a.registro_id.slice(0, 8)}: ${e?.message ?? "a data não é mais a da correção (alguém mudou depois): não alterado"}`); continue; }
  const log = await sb.from("log_auditoria").insert({
    tabela: "fin_lancamentos", registro_id: a.registro_id, acao: "UPDATE", usuario_email: AUTOR_DA_CORRECAO,
    valor_antes: { data_pagamento: depois },
    campos_alt: { evento: EVENTO_DESFEITA, data_pagamento: antes, desfeito_em: new Date().toISOString(), correcao: a.id },
  }).select("id");
  if (log.error) falhas.push(`${a.registro_id.slice(0, 8)}: desfeito, mas a trilha do rollback não gravou (${log.error.message})`);
  feitos++;
}
if (APLICAR) {
  console.log(`\nDESFEITO: ${feitos}; falhas: ${falhas.length}`);
  for (const f of falhas) console.log("  " + f);
}
