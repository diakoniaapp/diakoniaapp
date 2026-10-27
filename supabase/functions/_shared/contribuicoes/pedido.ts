// ─── pedido — validar o que a tela manda para `contribuicoes-enviar` (puro: sem rede, sem Deno) ─────────────────────────────────────────────────────────────────────────────────────────────
// A função NÃO confia no que vem da chamada: o período é conferido (datas reais, não no futuro, ajustado ao piso de 01/01/2026) e os destinatários são limpos (e-mail válido, sem repetição, no máximo
// `MAXIMO_DE_DESTINATARIOS`). Os NÚMEROS nunca vêm da chamada: a função os calcula sozinha a partir do banco.
import { ajustarAoPiso } from "./analise.ts";
import { validarBlocos, type IdDoBloco } from "./blocos.ts";
import { emailDeRespostaValido } from "../email/remetente.ts";

export const MAXIMO_DE_DESTINATARIOS = 10;

const dataReal = (s: unknown): string | null => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export interface PedidoValidado { periodo: { ini: string; fim: string; ajustado: boolean }; destinatarios: string[]; blocos: IdDoBloco[] }
export type ResultadoDoPedido = { ok: true; pedido: PedidoValidado } | { ok: false; erro: string };

/** Só as datas e a lista de destinatários; quem chama decide se a ação exige destinatário. */
export function validarPedido(corpo: { periodo?: { ini?: unknown; fim?: unknown }; destinatarios?: unknown; blocos?: unknown }, hoje: string, exigeDestinatario: boolean): ResultadoDoPedido {
  const ini = dataReal(corpo.periodo?.ini), fimPedido = dataReal(corpo.periodo?.fim);
  if (!ini || !fimPedido) return { ok: false, erro: "Informe o período com datas válidas (AAAA-MM-DD)." };
  const fim = fimPedido > hoje ? hoje : fimPedido;   // não há contribuição no futuro
  if (ini > fim) return { ok: false, erro: "O início do período vem depois do fim." };
  const p = ajustarAoPiso(ini, fim);
  if (p.vazio) return { ok: false, erro: "Este período termina antes de 01/01/2026, início da análise. Escolha um período a partir dessa data." };

  const b = validarBlocos(corpo.blocos);
  if (!b.ok) return { ok: false, erro: b.erro };

  const brutos = Array.isArray(corpo.destinatarios) ? corpo.destinatarios : [];
  const destinatarios: string[] = [];
  for (const x of brutos) {
    const e = emailDeRespostaValido(x);
    if (!e) return { ok: false, erro: `E-mail inválido: ${String(x).slice(0, 80)}` };
    if (!destinatarios.includes(e.toLowerCase())) destinatarios.push(e.toLowerCase());
  }
  if (destinatarios.length > MAXIMO_DE_DESTINATARIOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_DESTINATARIOS} destinatários por envio.` };
  if (exigeDestinatario && destinatarios.length === 0) return { ok: false, erro: "Informe ao menos um destinatário." };
  return { ok: true, pedido: { periodo: { ini: p.ini, fim: p.fim, ajustado: p.ajustado }, destinatarios, blocos: b.blocos! } };
}

/** A chave que identifica "o mesmo envio" (período + destinatários), para recusar o clique duplo. */
export const chaveDoEnvio = (p: PedidoValidado) => `${p.periodo.ini}|${p.periodo.fim}|${[...p.destinatarios].sort().join(",")}|${p.blocos.join("+")}`;
