import fs from "node:fs";
const [,, arq, saida] = process.argv;
const linhas = fs.readFileSync(arq, "utf8").split("\n");
const num = s => Number(s.replace(/\./g, "").replace(",", "."));
let data = null; const out = [];
let secao = "periodo";
for (const l0 of linhas) {
  const l = l0.trim();
  if (/^Últimos Lançamentos/.test(l)) secao = "ultimos";
  if (/^Saldos Invest/.test(l)) secao = "saldos";
  const mData = l.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
  let resto = l;
  if (mData) { data = mData[1]; resto = mData[2]; }
  if (secao === "saldos") continue;
  if (/SALDO ANTERIOR/.test(resto)) continue;
  const m = resto.match(/^(APLIC\.INVEST FACIL|RESGATE INVEST FACIL|RENTAB\.INVEST FACILCRED\*|RESG\.AUTOM\.INVEST FACIL\*|APLIC\.AUTOM\.INVEST FACIL\*?)\s+(\d+)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/);
  if (m) out.push({ secao, data, tipo: m[1], doc: m[2], valor: num(m[3]), saldoCC: num(m[4]) });
}
// saldos diarios do Invest Facil
const saldos = []; let em = false;
for (const l0 of linhas) { const l = l0.trim(); if (/^Saldos Invest/.test(l)) em = true; if (!em) continue;
  const m = l.match(/^(\d{2}\/\d{2}\/\d{4})\s+SALDO INVEST F[ÁA]CIL\s+([\d.]+,\d{2})$/); if (m) saldos.push({ data: m[1], saldo: num(m[2]) }); }
fs.writeFileSync(saida, JSON.stringify({ tx: out, saldos }, null, 1));
console.log(out.length, "transacoes;", saldos.length, "saldos");
