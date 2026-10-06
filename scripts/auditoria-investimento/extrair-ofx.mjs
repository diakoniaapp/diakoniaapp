import fs from "node:fs";
const [,, arq, saida] = process.argv;
const t = new TextDecoder("latin1").decode(fs.readFileSync(arq));
const blocos = t.split("<STMTTRN>").slice(1);
const tx = blocos.map(b => {
  const g = k => (b.match(new RegExp("<" + k + ">([^<\r\n]*)")) || [])[1]?.trim();
  const d = g("DTPOSTED") || ""; const v = Number((g("TRNAMT") || "0").replace(",", "."));
  return { data: `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`, valor: v, memo: g("MEMO"), fitid: g("FITID"), tipo: g("TRNTYPE") };
});
fs.writeFileSync(saida, JSON.stringify(tx));
const datas = tx.map(x => x.data).sort();
console.log(arq.split("/").pop(), tx.length, "tx", datas[0], "->", datas[datas.length-1]);
const inv = tx.filter(x => /INVEST/i.test(x.memo || ""));
console.log("invest lines:", inv.length);
