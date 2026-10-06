// Dados da auditoria do Fundo Missionário (06/10/2026) — compartilhados pelos scripts desta pasta.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const aqui = path.dirname(fileURLToPath(import.meta.url));

export const entradas = fs.readFileSync(path.join(aqui, "entradas-fundo-2026-10-06.txt"), "utf8").trim().split(";").map(l => {
  const [dia, valor, centro, id] = l.split("|");
  return { dia, valor: Number(valor), centro, id, tipo: "entrada" };
});


// Envio Oficial (categoria "Repasses Missionários") depois das reclassificações de 06/10 (R$ 337 já fora).
export const remessas = [
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


// Entradas do "bazar de missões" hoje em "Ofertas" (sem centro): candidatas da correção C4 (42 lançamentos).
const B = (dia, ...vs) => vs.map(valor => ({ dia, valor, tipo: "entrada", id: "bazar", centro: "-" }));
export const bazar = [
  ...B("2025-02-20", 5, 3), ...B("2025-02-21", 33.52), ...B("2025-02-24", 38.26, 7.88, 32.52), ...B("2025-02-25", 14.35, 226.47),
  ...B("2025-02-26", 97.54), ...B("2025-02-28", 49.22),
  ...B("2025-08-06", 138.71, 49.54, 4.95, 99.08, 64.4, 97.1, 34.68, 24.77, 29.72),
  ...B("2025-08-07", 8.92, 142.75, 59.07, 34.68, 19.82, 14.86, 34, 14.86, 29.72, 14.86),
  ...B("2025-08-08", 9.91, 59.07, 19.69, 117.7, 19.47, 24.77, 59.45, 29.72),
  ...B("2025-08-11", 22.39, 47.26, 18.83, 305.07), ...B("2025-08-12", 94.16),
];
// As demais correções candidatas (uma entrada cada).
export const candidatas = {
  C1: { dia: "2024-03-10", valor: 70, tipo: "entrada", rotulo: "R$ 70 — saldo da campanha Nacionais 2023" },
  C2: { dia: "2024-12-09", valor: 250, tipo: "entrada", rotulo: "R$ 250 — alvo missões (Dízimos)" },
  C3: { dia: "2025-02-07", valor: 206.2, tipo: "entrada", rotulo: "R$ 206,20 — alvo de missões" },
  C5: { dia: "2026-04-06", valor: 700, tipo: "entrada", rotulo: "R$ 700 — alvo (Dízimos)" },
  C6: { dia: "2024-05-19", valor: 10, tipo: "entrada", rotulo: "R$ 10 — designada ao ministério" },
  C7: { dia: "2024-11-11", valor: 200, tipo: "saida", rotulo: "R$ 200 — União Feminina → Repasses" },
};
