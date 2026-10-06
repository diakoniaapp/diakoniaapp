// Linha do tempo do Fundo Missionário — auditoria de 06/10/2026.
//
// Entrada: scripts/auditoria-missoes/entradas-fundo-2026-10-06.txt (as 648 ofertas da categoria "Ofertas
// para Missões", lidas do banco em 06/10/2026: dia|valor|centro|id8; sem nomes de ofertantes) e a lista
// das 12 remessas do Envio Oficial (abaixo, com a Junta de destino e a campanha já gravada).
// Saída: docs/auditoria-missoes/linha-do-tempo-fundo-missionario.csv e um resumo em JSON no stdout.
//
//   node scripts/auditoria-missoes/linha-do-tempo.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
import { entradas, remessas } from "./dados.mjs";
const r2 = n => Math.round(n * 100) / 100;

// Envio Oficial (categoria "Repasses Missionários") depois das reclassificações de 06/10 (R$ 337 já fora).
const LIMITE = 20000;
const fechadoras = remessas.filter(r => r.valor >= LIMITE && (r.camp === "mundiais" || r.camp === "nacionais")).sort((a, b) => a.dia.localeCompare(b.dia));
const oposta = c => (c === "mundiais" ? "nacionais" : "mundiais");
const campanhaSugerida = dia => {
  const f = fechadoras.find(x => x.dia >= dia);
  return f ? f.camp : oposta(fechadoras[fechadoras.length - 1].camp);
};
const rotuloCamp = { mundiais: "Missões Mundiais", nacionais: "Missões Nacionais", especial: "Campanha avulsa" };
const centroEntrada = { M: "Missões Mundiais (centro antigo)", O: "Ofertas Missionárias (centro antigo)", A: "Min. Administração", "-": "(sem centro)" };

// ── timeline: no mesmo dia, as entradas vêm antes das saídas (saldo ao fim do movimento) ──
const todos = [...entradas, ...remessas].sort((a, b) => a.dia.localeCompare(b.dia) || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1));
let saldo = 0;
const linhas = todos.map(m => {
  saldo = r2(saldo + (m.tipo === "entrada" ? m.valor : -m.valor));
  return { ...m, saldo };
});

// ── ciclos (fechados pelas remessas ≥ R$ 20.000) ──
const ciclos = [];
let ini = "0000-00-00";
for (const f of fechadoras) {
  const coletado = r2(entradas.filter(e => e.dia > ini && e.dia <= f.dia).reduce((s, e) => s + e.valor, 0));
  ciclos.push({ campanha: f.camp, de: ini === "0000-00-00" ? entradas[0].dia : ini, ate: f.dia, coletado, principal: f.valor });
  ini = f.dia;
}
const abertas = entradas.filter(e => e.dia > ini);
ciclos.push({ campanha: oposta(fechadoras[fechadoras.length - 1].camp), de: abertas[0].dia, ate: null, coletado: r2(abertas.reduce((s, e) => s + e.valor, 0)), principal: 0 });

// campanha da remessa → ciclo ao qual pertence (a edição): a do próprio ciclo, se bate; senão a mais recente da mesma campanha
const edicaoDe = r => {
  const naJanela = ciclos.find(c => c.ate && r.dia > (c.de === entradas[0].dia ? "0000" : c.de) && r.dia <= c.ate) ?? ciclos[ciclos.length - 1];
  if (r.camp === "especial") return "avulsa";
  if (naJanela.campanha === r.camp) return naJanela.ate ?? "aberta";
  const anteriores = ciclos.filter(c => c.ate && c.campanha === r.camp && c.ate < r.dia);
  return anteriores.length ? anteriores[anteriores.length - 1].ate : "pré-Omie";
};
const razao = {};
for (const c of ciclos) razao[c.ate ?? "aberta"] = { campanha: c.campanha, coletado: c.coletado, enviado: 0 };
razao["pré-Omie"] = { campanha: "nacionais (2023?)", coletado: 0, enviado: 0 };
razao.avulsa = { campanha: "especial", coletado: 0, enviado: 0 };
for (const r of remessas) razao[edicaoDe(r)].enviado = r2(razao[edicaoDe(r)].enviado + r.valor);
for (const k of Object.keys(razao)) razao[k].diferenca = r2(razao[k].coletado - razao[k].enviado);

// ── pontos de virada ──
const fimDoDia = [];
for (const l of linhas) { const u = fimDoDia[fimDoDia.length - 1]; if (u && u.dia === l.dia) u.saldo = l.saldo; else fimDoDia.push({ dia: l.dia, saldo: l.saldo }); }
const viradas = [];
for (let i = 1; i < fimDoDia.length; i++) {
  const a = fimDoDia[i - 1].saldo, b = fimDoDia[i].saldo;
  if (a >= 0 && b < 0) viradas.push({ dia: fimDoDia[i].dia, de: a, para: b, tipo: "fica negativo" });
  if (a < 0 && b >= 0) viradas.push({ dia: fimDoDia[i].dia, de: a, para: b, tipo: "volta a positivo" });
}
const quedas = remessas.map(r => {
  const antes = linhas.filter(l => l.dia < r.dia || (l.dia === r.dia && l.id !== r.id && l.tipo === "entrada")).pop()?.saldo ?? 0;
  const L = linhas.find(l => l.id === r.id && l.tipo === "saida");
  return { dia: r.dia, valor: r.valor, junta: r.junta, camp: r.camp, saldoAntes: L ? r2(L.saldo + r.valor) : antes, saldoDepois: L?.saldo };
});
const minimo = linhas.reduce((m, l) => (l.saldo < m.saldo ? l : m), linhas[0]);
const maximo = linhas.reduce((m, l) => (l.saldo > m.saldo ? l : m), linhas[0]);

// ── CSV ──
const brn = n => String(n.toFixed(2)).replace(".", ",");
const dataBr = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const cab = ["Data", "Descrição", "Tipo", "Receita ou Despesa", "Campanha", "Valor", "Centro", "Subcentro", "Saldo acumulado", "Observação"];
const esc = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const csv = [cab.map(esc).join(";")];
for (const l of linhas) {
  if (l.tipo === "entrada") {
    const nota = [];
    if (l.centro === "-") nota.push("sem centro de custo");
    if (l.centro === "A") nota.push("categoria de missões com centro Administração: conferir");
    csv.push([dataBr(l.dia), "Oferta missionária", "Oferta para Missões", "Receita", `${rotuloCamp[campanhaSugerida(l.dia)]} (sugerida pelo ciclo)`, brn(l.valor), centroEntrada[l.centro], "", brn(l.saldo), nota.join("; ")].map(esc).join(";"));
  } else {
    const nota = [`${l.junta === "JMM" ? "Junta Mundial" : "Junta Nacional"}.`, l.obs];
    csv.push([dataBr(l.dia), `Remessa — ${l.junta === "JMM" ? "Junta de Missões Mundiais" : "Junta de Missões Nacionais"}`, "Envio Missionário", "Despesa", rotuloCamp[l.camp], brn(l.valor), "Min. Evangelismo e Missões", "Envios Missionários", brn(l.saldo), nota.join(" ").trim()].map(esc).join(";"));
  }
}
fs.writeFileSync(path.join(raiz, "docs/auditoria-missoes/linha-do-tempo-fundo-missionario.csv"), "﻿" + csv.join("\r\n"));

console.log(JSON.stringify({
  movimentos: linhas.length, saldoFinal: saldo, ciclos, razao, viradas, quedas, minimo: { dia: minimo.dia, saldo: minimo.saldo }, maximo: { dia: maximo.dia, saldo: maximo.saldo },
  saldoAposCadaRemessa: remessas.map(r => ({ dia: r.dia, valor: r.valor, camp: r.camp, saldo: linhas.find(l => l.id === r.id && l.tipo === "saida").saldo })),
}, null, 1));
