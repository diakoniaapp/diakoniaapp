// Ciclos de Missões Mundiais 2024 e 2025 — lançamento a lançamento (auditoria de 07/10/2026).
//
//   node scripts/auditoria-missoes/mundiais-ciclos.mjs
//
// Gera docs/auditoria-missoes/mundiais-2024-2025-lancamentos.csv e imprime o resumo. Usa o mesmo snapshot
// das 648 ofertas (sem nomes de ofertantes) e as remessas da Junta Mundial.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entradas, remessas } from "./dados.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const r2 = n => Math.round(n * 100) / 100;
const dataBr = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const brn = n => String(n.toFixed(2)).replace(".", ",");

// Ofertas que as migrations aprovadas tiram do fundo ainda dentro destas janelas.
const SAI_DO_FUNDO = new Map([["e97c17d6", "bazar — sai do fundo (migration 20261006230000)"]]);

const ciclos = [
  { nome: "Mundiais 2024", de: "2024-01-01", ate: "2024-08-27", jmm: ["7f39009c", "fa5a0467"] },
  { nome: "Mundiais 2025", de: "2024-12-31", ate: "2025-07-22", jmm: ["2641f689", "623c289f"] },
];
const cab = ["Ciclo", "Data", "Tipo", "Valor", "Saldo do ciclo", "Id", "Nota"];
const esc = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const csv = [cab.map(esc).join(";")];
const resumo = {};

for (const c of ciclos) {
  const es = entradas.filter(e => e.dia >= c.de && e.dia <= c.ate && !SAI_DO_FUNDO.has(e.id));
  const rs = remessas.filter(r => c.jmm.includes(r.id));
  const linhas = [...es, ...rs].sort((a, b) => a.dia.localeCompare(b.dia) || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1));
  let saldo = 0;
  for (const l of linhas) {
    saldo = r2(saldo + (l.tipo === "entrada" ? l.valor : -l.valor));
    csv.push([c.nome, dataBr(l.dia), l.tipo === "entrada" ? "Oferta" : "Remessa JMM", (l.tipo === "saida" ? "-" : "") + brn(l.valor), brn(saldo), l.id,
      l.tipo === "saida" ? (l.obs || "") : (l.centro === "M" ? "centro antigo Missões Mundiais" : l.centro === "-" ? "sem centro" : "")].map(esc).join(";"));
  }
  const entrou = r2(es.reduce((s, e) => s + e.valor, 0)), saiu = r2(rs.reduce((s, r) => s + r.valor, 0));
  resumo[c.nome] = { ofertas: es.length, entrou, remessas: rs.map(r => `${r.dia} ${r.valor}`), saiu, diferenca: r2(entrou - saiu) };
}
fs.writeFileSync(path.join(raiz, "docs/auditoria-missoes/mundiais-2024-2025-lancamentos.csv"), "﻿" + csv.join("\r\n"));
console.log(JSON.stringify(resumo, null, 1));
