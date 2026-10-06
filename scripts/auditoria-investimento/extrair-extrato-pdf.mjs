import fs from "node:fs";
import { getDocument } from "../../node_modules/pdfjs-dist/legacy/build/pdf.mjs";
const [,, entrada, saida] = process.argv;
const data = new Uint8Array(fs.readFileSync(entrada));
const pdf = await getDocument({ data, useSystemFonts: true }).promise;
let out = "";
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  // agrupa por linha (y) e ordena por x
  const linhas = new Map();
  for (const it of tc.items) {
    const y = Math.round(it.transform[5] / 2) * 2;
    if (!linhas.has(y)) linhas.set(y, []);
    linhas.get(y).push({ x: it.transform[4], s: it.str });
  }
  out += `\n===== PAGINA ${p} =====\n`;
  for (const y of [...linhas.keys()].sort((a, b) => b - a)) {
    out += linhas.get(y).sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim() + "\n";
  }
}
fs.writeFileSync(saida, out);
console.log(pdf.numPages + " paginas, " + out.length + " chars");
