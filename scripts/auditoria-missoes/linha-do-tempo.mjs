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
const r2 = n => Math.round(n * 100) / 100;

const entradas = fs.readFileSync(path.join(aqui, "entradas-fundo-2026-10-06.txt"), "utf8").trim().split(";").map(l => {
  const [dia, valor, centro, id] = l.split("|");
  return { dia, valor: Number(valor), centro, id, tipo: "entrada" };
});

// Envio Oficial (categoria "Repasses Missionários") depois das reclassificações de 06/10 (R$ 337 já fora).
const remessas = [
  { id: "0cbe1da1", dia: "2024-07-12", valor: 10327.58, junta: "JMN", camp: "nacionais", obs: "Paga à Junta NACIONAL; sem arrecadação de 2024 que a sustente (hipótese: saldo da campanha de 2023, anterior ao Omie). Descrição gravada dizia 'Mundiais'." },
  { id: "7f39009c", dia: "2024-07-12", valor: 1551.32, junta: "JMM", camp: "mundiais", obs: "Confirmada pelo histórico da Junta Mundial." },
  { id: "fa5a0467", dia: "2024-08-27", valor: 25955.20, junta: "JMM", camp: "mundiais", obs: "Remessa principal de Mundiais 2024; confirmada pela Junta. Quase igual ao arrecadado do ciclo (25.801,41)." },
  { id: "6e8decd5", dia: "2024-12-19", valor: 4050.00, junta: "JMN", camp: "nacionais", obs: "" },
  { id: "e65db633", dia: "2024-12-30", valor: 20000.00, junta: "JMN", camp: "nacionais", obs: "Remessa principal de Nacionais 2024 (fecha o ciclo)." },
  { id: "9f172950", dia: "2025-02-27", valor: 5000.00, junta: "JMN", camp: "nacionais", obs: "Boleto de oferta voluntária à JMN; campanha Nacionais (decisão dela). Descrição gravada dizia 'Mundiais'. Sem ofertas de Nacionais em 2025 que a sustentem: usa o excedente de 2024." },
  { id: "e96d4253", dia: "2025-05-27", valor: 4493.56, junta: "JMN", camp: "nacionais", obs: "'REPASSE CAMPANHA JMN'. Descrição gravada dizia 'Mundiais'. Mesma situação do envio de 27/02/2025." },
  { id: "2641f689", dia: "2025-07-22", valor: 34216.42, junta: "JMM", camp: "mundiais", obs: "Remessa principal de Mundiais 2025; confirmada pela Junta (que a lança em 23/07). Maior que o arrecadado do ciclo." },
  { id: "623c289f", dia: "2025-09-19", valor: 783.58, junta: "JMM", camp: "mundiais", obs: "Complemento de Mundiais 2025 (34.216,42 + 783,58 = 35.000,00 exatos); confirmada pela Junta. O centro gravado dizia 'Nacionais'." },
  { id: "5ecb5c32", dia: "2025-12-10", valor: 1000.00, junta: "JMN", camp: "especial", obs: "Oferta à JMN (panetones da Cristolândia): campanha avulsa." },
  { id: "77b88b7f", dia: "2025-12-29", valor: 28180.00, junta: "JMN", camp: "nacionais", obs: "Remessa principal de Nacionais 2025 (fecha o ciclo). Quase igual ao arrecadado do ciclo (28.235,97)." },
  { id: "98abdceb", dia: "2026-07-07", valor: 26660.23, junta: "JMM", camp: "mundiais", obs: "Remessa principal de Mundiais 2026. A Junta ainda não validou (o histórico dela vai até set/2025)." },
].map(r => ({ ...r, tipo: "saida" }));

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
