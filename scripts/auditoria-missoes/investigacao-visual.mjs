// Investigação visual do Fundo Missionário em torno de 12/07/2024 — auditoria de 06/10/2026.
//
//   node scripts/auditoria-missoes/investigacao-visual.mjs
//
// Gera docs/auditoria-missoes/investigacao-12-07-2024.html (arquivo único, sem rede, abre no navegador)
// e imprime o resumo das simulações em JSON.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entradas, remessas, bazar, candidatas } from "./dados.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const r2 = n => Math.round(n * 100) / 100;
const brl = n => (n < 0 ? "−" : "") + "R$ " + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ms = d => Date.parse(d + "T00:00:00Z");
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ── campanha sugerida (ciclo das remessas ≥ R$ 20.000), igual à tela ──
const fechadoras = remessas.filter(r => r.valor >= 20000 && (r.camp === "mundiais" || r.camp === "nacionais")).sort((a, b) => a.dia.localeCompare(b.dia));
const oposta = c => (c === "mundiais" ? "nacionais" : "mundiais");
const campanhaDoDia = dia => (fechadoras.find(x => x.dia >= dia) ?? { camp: oposta(fechadoras.at(-1).camp) }).camp;
const ROT = { mundiais: "Missões Mundiais", nacionais: "Missões Nacionais", especial: "Campanha avulsa" };

// ── linha do tempo de um cenário: base + movimentos extras ──
function linhaDoTempo(extras = []) {
  const todos = [...entradas, ...remessas, ...extras].sort((a, b) => a.dia.localeCompare(b.dia) || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1));
  let saldo = 0;
  return todos.map(m => { const antes = saldo; saldo = r2(saldo + (m.tipo === "entrada" ? m.valor : -m.valor)); return { ...m, antes, saldo }; });
}
function metricas(linhas) {
  const fim = []; for (const l of linhas) { const u = fim.at(-1); if (u && u.dia === l.dia) u.saldo = l.saldo; else fim.push({ dia: l.dia, saldo: l.saldo }); }
  let diasNeg = 0, episodios = 0, neg = false;
  for (let i = 0; i < fim.length; i++) {
    const proximo = fim[i + 1] ? ms(fim[i + 1].dia) : ms("2026-10-06");
    if (fim[i].saldo < 0) { diasNeg += Math.round((proximo - ms(fim[i].dia)) / 86400000); if (!neg) episodios++; neg = true; } else neg = false;
  }
  const min = linhas.reduce((m, l) => (l.saldo < m.saldo ? l : m), linhas[0]);
  const primeiroNeg = linhas.find(l => l.saldo < 0);
  return { final: linhas.at(-1).saldo, minimo: min.saldo, diaMinimo: min.dia, primeiroNegativo: primeiroNeg?.dia ?? null, diasNegativos: diasNeg, episodios };
}
const C = candidatas;
const x = k => ({ ...C[k], id: k });
const passos = [
  ["Cenário atual", []],
  ["Após C1 + C2", [x("C1"), x("C2")]],
  ["Após C1 + C2 + C3", [x("C1"), x("C2"), x("C3")]],
  ["Após C1 + C2 + C3 + C4 (bazar)", [x("C1"), x("C2"), x("C3"), ...bazar]],
  ["Após C1 a C5", [x("C1"), x("C2"), x("C3"), ...bazar, x("C5")]],
  ["Após C1 a C6", [x("C1"), x("C2"), x("C3"), ...bazar, x("C5"), x("C6")]],
  ["Após C1 a C7", [x("C1"), x("C2"), x("C3"), ...bazar, x("C5"), x("C6"), x("C7")]],
];
const alternativo = [
  ["Alternativa: sem o bazar (C1 a C7 menos C4)", [x("C1"), x("C2"), x("C3"), x("C5"), x("C6"), x("C7")]],
];
const calc = ([nome, ex]) => ({ nome, ...metricas(linhaDoTempo(ex)) });
const sim = passos.map(calc).map((s, i, a) => ({ ...s, delta: i === 0 ? 0 : r2(s.final - a[i - 1].final) }));
const simAlt = alternativo.map(calc).map(s => ({ ...s, delta: r2(s.final - sim[0].final) }));

// ── janela crítica: 30 movimentos antes e 30 depois de 12/07/2024 (cenário atual) + C1/C2 como linhas "a aplicar" ──
const atual = linhaDoTempo();
const comC = linhaDoTempo([x("C1"), x("C2")]);
const saldoComC = new Map();
comC.forEach(l => saldoComC.set(l.tipo + l.id + l.dia + l.valor, l.saldo));
const i0 = atual.findIndex(l => l.dia === "2024-07-12");
const i1 = atual.map(l => l.dia).lastIndexOf("2024-07-12");
const antes = atual.slice(i0 - 30, i0), centro = atual.slice(i0, i1 + 1), depois = atual.slice(i1 + 1, i1 + 31);
const janela = [...antes, ...centro, ...depois];
const de = janela[0].dia, ate = janela.at(-1).dia;
const ghosts = ["C1", "C2"].map(k => C[k]).filter(c => c.dia >= de && c.dia <= ate).map(c => ({ ...c, fantasma: true }));

// marcas de comportamento
const GRANDE_ENTRADA = 1000, GRANDE_REMESSA = 20000, BRUSCA = 10000;
const linhasJanela = [...janela, ...ghosts].sort((a, b) => a.dia.localeCompare(b.dia) || (a.fantasma ? -1 : 0));
const tabela = linhasJanela.map(l => {
  const marcas = [];
  if (!l.fantasma) {
    if (l.antes >= 0 && l.saldo < 0) marcas.push(["neg", "fica negativo"]);
    if (l.antes < 0 && l.saldo >= 0) marcas.push(["pos", "volta a positivo"]);
    if (l.tipo === "entrada" && l.valor >= GRANDE_ENTRADA) marcas.push(["ent", "entrada grande"]);
    if (l.tipo === "saida" && l.valor >= GRANDE_REMESSA) marcas.push(["rem", "remessa grande"]);
    else if (l.tipo === "saida") marcas.push(["rem2", "remessa"]);
    if (Math.abs(l.saldo - l.antes) >= BRUSCA && l.tipo === "saida") marcas.push(["bru", "queda brusca"]);
    if (Math.abs(l.saldo - l.antes) >= BRUSCA && l.tipo === "entrada") marcas.push(["bru", "salto brusco"]);
  } else marcas.push(["fant", `${l.id} — aprovada, ainda não aplicada`]);
  const r = l.tipo === "saida" ? remessas.find(z => z.id === l.id) : null;
  return {
    ...l, marcas,
    desc: l.fantasma ? (l.id === "C1" ? "Oferta — saldo da campanha Nacionais 2023 (hoje em “Ofertas”)" : "Oferta — alvo missões (hoje em “Dízimos”)")
      : l.tipo === "saida" ? `Remessa — ${r.junta === "JMM" ? "Junta Mundial" : "Junta Nacional"}` : "Oferta missionária",
    cat: l.fantasma ? (l.id === "C1" ? "Ofertas → Ofertas para Missões" : "Dízimos → Ofertas para Missões") : l.tipo === "saida" ? "Repasses Missionários" : "Ofertas para Missões",
    camp: l.fantasma ? (l.id === "C1" ? "Nacionais (2023)" : "— (sugerida: Nacionais)") : l.tipo === "saida" ? ROT[r.camp] : ROT[campanhaDoDia(l.dia)] + " (sug.)",
    saldoC: l.fantasma ? saldoComC.get("entrada" + l.id + l.dia + l.valor) : saldoComC.get(l.tipo + l.id + l.dia + l.valor),
  };
});

// ── gráfico: saldo diário (degraus) ──
function grafico(linhas, { w = 920, h = 300, de, ate, rotulos = true }) {
  const t0 = ms(de), t1 = ms(ate), pad = { l: 64, r: 18, t: 16, b: 34 };
  const vs = linhas.map(l => l.saldo);
  const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), folga = (hi - lo) * 0.08;
  const X = d => pad.l + ((ms(d) - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - (lo - folga)) / (hi - lo + folga * 2)) * (h - pad.t - pad.b);
  let d = `M${X(linhas[0].dia).toFixed(1)},${Y(0).toFixed(1)}`, ult = 0;
  for (const l of linhas) { d += ` L${X(l.dia).toFixed(1)},${Y(ult).toFixed(1)} L${X(l.dia).toFixed(1)},${Y(l.saldo).toFixed(1)}`; ult = l.saldo; }
  d += ` L${X(ate).toFixed(1)},${Y(ult).toFixed(1)}`;
  const area = d + ` L${X(ate).toFixed(1)},${Y(0).toFixed(1)} Z`;
  const y0 = Y(0);
  const eixoY = [lo, lo / 2, 0, hi / 2, hi].filter((v, i, a) => a.indexOf(v) === i).map(v => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grade"/><text x="${pad.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="eixo">${(v / 1000).toFixed(0)} mil</text>`).join("");
  const meses = []; for (let t = new Date(de + "T00:00:00Z"); t <= new Date(ate + "T00:00:00Z"); t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))) meses.push(t.toISOString().slice(0, 10));
  const passo = Math.ceil(meses.length / 9);
  const eixoX = meses.filter((_, i) => i % passo === 0).map(m => `<text x="${X(m).toFixed(1)}" y="${h - 10}" text-anchor="middle" class="eixo">${m.slice(5, 7)}/${m.slice(2, 4)}</text>`).join("");
  const marcasRem = linhas.filter(l => l.tipo === "saida").map(l => {
    const r = remessas.find(z => z.id === l.id), grande = l.valor >= GRANDE_REMESSA;
    const cx = X(l.dia), cy = Y(l.saldo);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${grande ? 5.5 : 3.5}" class="${grande ? "pt-grande" : "pt-rem"}"><title>${dataBr(l.dia)} — ${r.junta} — ${brl(l.valor)} → saldo ${brl(l.saldo)}</title></circle>` +
      (rotulos && grande ? `<text x="${cx.toFixed(1)}" y="${(cy + (l.saldo < 0 ? 18 : -10)).toFixed(1)}" text-anchor="middle" class="rot">${dataBr(l.dia).slice(0, 5)} · ${(l.valor / 1000).toFixed(1).replace(".", ",")} mil</text>` : "");
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" class="graf"><defs>
    <clipPath id="acima${w}"><rect x="0" y="0" width="${w}" height="${y0.toFixed(1)}"/></clipPath>
    <clipPath id="abaixo${w}"><rect x="0" y="${y0.toFixed(1)}" width="${w}" height="${h}"/></clipPath></defs>
    ${eixoY}${eixoX}
    <path d="${area}" class="area-pos" clip-path="url(#acima${w})"/><path d="${area}" class="area-neg" clip-path="url(#abaixo${w})"/>
    <path d="${d}" class="linha"/><line x1="${pad.l}" x2="${w - pad.r}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" class="zero"/>${marcasRem}</svg>`;
}

const g1 = grafico(atual, { de: "2024-01-01", ate: "2026-10-06" });
const g2 = grafico(atual.filter(l => l.dia >= de && l.dia <= ate), { de, ate, h: 280 });

const trSim = s => `<tr><td>${esc(s.nome)}</td><td class="n ${s.final < 0 ? "neg" : "pos"}">${brl(s.final)}</td><td class="n">${s.delta ? (s.delta > 0 ? "+" : "−") + brl(Math.abs(s.delta)).replace("R$ ", "R$ ") : "—"}</td><td class="n">${brl(s.minimo)}<small> · ${dataBr(s.diaMinimo)}</small></td><td class="n">${s.diasNegativos}</td><td class="n">${s.episodios}</td></tr>`;
const linhaHtml = t => `<tr class="${t.fantasma ? "fant" : ""} ${t.tipo === "saida" ? "saida" : ""} ${t.saldo < 0 && !t.fantasma ? "negativo" : ""} ${t.dia === "2024-07-12" ? "centro" : ""}">
<td>${dataBr(t.dia)}</td><td>${esc(t.desc)}</td><td class="c">${esc(t.cat)}</td><td class="c">${esc(t.camp)}</td>
<td class="n ${t.tipo === "saida" ? "neg" : ""}">${t.fantasma ? "+" : t.tipo === "saida" ? "−" : "+"}${brl(t.valor).replace("R$ ", "")}</td>
<td class="n">${t.fantasma ? "—" : brl(t.saldo)}</td><td class="n sub">${t.saldoC !== undefined ? brl(t.saldoC) : ""}</td>
<td>${t.marcas.map(([c, m]) => `<span class="chip ${c}">${esc(m)}</span>`).join(" ")}</td></tr>`;

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fundo Missionário — investigação de 12/07/2024</title>
<style>
:root{--fundo:#f6f4f1;--cartao:#fff;--texto:#221d1a;--suave:#6d645d;--linha:#e3ddd6;--acento:#6b3fa0;--pos:#2b7a4b;--neg:#b3302a;--negfundo:#fbe9e6;--posfundo:#e6f3ea;--amarelo:#fff4d6;--grade:#ebe6e0}
@media (prefers-color-scheme:dark){:root{--fundo:#16130f;--cartao:#1f1b17;--texto:#efe9e3;--suave:#a39a91;--linha:#352f29;--acento:#b891e6;--pos:#62c488;--neg:#ee7f76;--negfundo:#3a1f1c;--posfundo:#1c3326;--amarelo:#3a3217;--grade:#2b2621}}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1060px;margin:0 auto;padding:24px 16px 56px}h1{font:600 26px/1.2 Georgia,"Times New Roman",serif;margin:0 0 4px}h2{font:600 18px/1.3 Georgia,serif;margin:32px 0 6px}
p.sub{color:var(--suave);margin:0 0 16px;max-width:70ch}.cartao{background:var(--cartao);border:1px solid var(--linha);border-radius:8px;padding:14px;margin:10px 0;overflow-x:auto}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:14px 0}.kpi{background:var(--cartao);border:1px solid var(--linha);border-radius:8px;padding:10px 12px}
.kpi b{display:block;font-size:20px}.kpi span{font-size:12px;color:var(--suave);text-transform:uppercase;letter-spacing:.04em}
.neg{color:var(--neg)}.pos{color:var(--pos)}svg.graf{width:100%;height:auto;display:block}.grade{stroke:var(--grade)}.zero{stroke:var(--suave);stroke-width:1.2}
.eixo{fill:var(--suave);font-size:11px}.rot{fill:var(--texto);font-size:10.5px}.linha{fill:none;stroke:var(--texto);stroke-width:1.5}.area-pos{fill:var(--pos);opacity:.18}.area-neg{fill:var(--neg);opacity:.28}
.pt-grande{fill:var(--neg);stroke:var(--cartao);stroke-width:1.5}.pt-rem{fill:var(--acento);stroke:var(--cartao);stroke-width:1}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--suave);border-bottom:2px solid var(--linha);padding:6px 8px;position:sticky;top:0;background:var(--cartao)}
td{padding:5px 8px;border-bottom:1px solid var(--linha);vertical-align:top}td.n{text-align:right;white-space:nowrap}td.c{color:var(--suave)}td.sub,small{color:var(--suave)}
tr.negativo td{background:var(--negfundo)}tr.saida td{font-weight:600}tr.centro td:first-child{box-shadow:inset 4px 0 0 var(--acento)}tr.fant td{background:var(--amarelo);font-style:italic}
.chip{display:inline-block;border-radius:10px;padding:0 7px;font-size:11px;line-height:18px;white-space:nowrap;border:1px solid var(--linha)}.chip.neg{background:var(--neg);color:#fff;border-color:var(--neg)}.chip.pos{background:var(--pos);color:#fff;border-color:var(--pos)}
.chip.ent{background:var(--posfundo);color:var(--pos)}.chip.rem{background:var(--negfundo);color:var(--neg);font-weight:600}.chip.rem2{color:var(--suave)}.chip.bru{background:var(--acento);color:#fff;border-color:var(--acento)}.chip.fant{background:var(--amarelo);color:var(--texto)}
.legenda{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--suave);margin:6px 0}.nota{font-size:13px;color:var(--suave);max-width:80ch}
@media print{body{background:#fff;color:#000}.cartao{break-inside:avoid}}
</style></head><body><main>
<h1>Fundo Missionário — investigação em torno de 12/07/2024</h1>
<p class="sub">Linha do tempo do fundo (ofertas para missões − Envio Oficial), gerada do banco em 06/10/2026. Nada foi alterado. “Cenário atual” = como o banco está hoje; C1 e C2 estão aprovadas, mas a migration ainda não foi aplicada.</p>
<div class="kpis">
<div class="kpi"><span>Saldo registrado hoje</span><b class="neg">${brl(sim[0].final)}</b></div>
<div class="kpi"><span>Primeira vez negativo</span><b>${dataBr(sim[0].primeiroNegativo)}</b></div>
<div class="kpi"><span>Ponto mais baixo</span><b class="neg">${brl(sim[0].minimo)}</b><small>${dataBr(sim[0].diaMinimo)}</small></div>
<div class="kpi"><span>Dias com saldo negativo</span><b>${sim[0].diasNegativos}</b><small>${sim[0].episodios} períodos negativos</small></div></div>

<h2>1. Todo o histórico</h2>
<p class="sub">Verde = fundo positivo; vermelho = negativo. Círculos grandes são as remessas de R$ 20.000 ou mais; os pequenos, os complementos.</p>
<div class="cartao">${g1}</div>

<h2>2. Janela crítica: 30 lançamentos antes e 30 depois de 12/07/2024</h2>
<p class="sub">De ${dataBr(de)} a ${dataBr(ate)}. A faixa roxa na esquerda marca o dia 12/07/2024 (duas remessas: Junta Nacional e Junta Mundial).</p>
<div class="cartao">${g2}</div>
<div class="legenda"><span class="chip neg">fica negativo</span><span class="chip pos">volta a positivo</span><span class="chip ent">entrada grande (≥ R$ 1.000)</span><span class="chip rem">remessa grande (≥ R$ 20.000)</span><span class="chip bru">mudança brusca (≥ R$ 10.000 em um lançamento)</span><span class="chip fant">C1/C2 aprovadas, a aplicar</span></div>
<div class="cartao"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Campanha</th><th>Valor</th><th>Saldo atual</th><th>Saldo após C1+C2</th><th>Marcas</th></tr></thead><tbody>
${tabela.map(linhaHtml).join("\n")}</tbody></table></div>
<p class="nota">A campanha das ofertas é <em>sugerida</em> pelo ciclo (remessas ≥ R$ 20.000); nada foi gravado. Linhas vermelhas = saldo negativo.</p>

<h2>3. Simulações — o que cada correção faz com o saldo</h2>
<p class="sub">Cumulativas, na ordem do relatório. Mede o saldo final, o ponto mais baixo e por quantos dias o fundo ficou negativo (até 06/10/2026).</p>
<div class="cartao"><table><thead><tr><th>Cenário</th><th>Saldo registrado</th><th>Variação</th><th>Ponto mais baixo</th><th>Dias negativos</th><th>Períodos negativos</th></tr></thead><tbody>
${sim.map(trSim).join("\n")}${simAlt.map(trSim).join("\n")}</tbody></table></div>
<p class="nota">C1 +R$ 70 · C2 +R$ 250 · C3 +R$ 206,20 · C4 (bazar de missões, 42 lançamentos) +R$ 2.251,74 · C5 +R$ 700 · C6 +R$ 10 · C7 −R$ 200. A linha “sem o bazar” mostra o resultado se o bazar <strong>não</strong> for para o fundo (ver a evidência no relatório).</p>
</main></body></html>`;
fs.writeFileSync(path.join(raiz, "docs/auditoria-missoes/investigacao-12-07-2024.html"), html);
console.log(JSON.stringify({ sim, simAlt, janela: { de, ate, antes: antes.length, centro: centro.length, depois: depois.length, linhas: tabela.length } }, null, 1));
