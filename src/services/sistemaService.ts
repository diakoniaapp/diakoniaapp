// ─── sistemaService.ts — configurações de sistema, admin + dono ─────────
//
// Pedido da Telma (22/09/2026): tela de configuração do resumo semanal
// por e-mail, restrita a admin/diakonia. As três RPCs vivem em
// `20260922090000_admin_resumo_semanal_config.sql` — cada uma já checa a
// permissão por dentro (SECURITY DEFINER com guarda própria, porque
// `is_admin()` só cobre 'admin', não 'diakonia'), então um usuário sem
// esses papéis recebe erro do Postgres, não dado.
import { supabase } from "@/integrations/supabase/client";

export interface ResumoSemanalDestinatario {
  papel: "pastoral" | "secretaria" | "tesouraria";
  nome: string;
  email: string;
}

export interface ResumoSemanalExecucao {
  inicio: string;
  status: string;
  mensagem: string | null;
}

export interface ResumoSemanalStatus {
  ativo: boolean;
  dia_semana: number | null;
  hora: number | null;
  minuto: number | null;
  destinatarios: ResumoSemanalDestinatario[];
  execucoes: ResumoSemanalExecucao[];
}

export async function carregarStatusResumoSemanal(): Promise<ResumoSemanalStatus> {
  const { data, error } = await supabase.rpc("sistema_resumo_semanal_status");
  if (error) throw error;
  return data as unknown as ResumoSemanalStatus;
}

export async function definirHorarioResumoSemanal(diaSemana: number, hora: number, minuto: number): Promise<void> {
  const { error } = await supabase.rpc("sistema_resumo_semanal_definir_horario", {
    p_dia_semana: diaSemana, p_hora: hora, p_minuto: minuto,
  });
  if (error) throw error;
}

export async function pausarResumoSemanal(ativo: boolean): Promise<void> {
  const { error } = await supabase.rpc("sistema_resumo_semanal_pausar", { p_ativo: ativo });
  if (error) throw error;
}

// Chama a Edge Function direto (mesma URL que o pg_cron chama) — ela é
// implantada com `--no-verify-jwt` de propósito (ver o cabeçalho de
// `supabase/functions/resumo-semanal/index.ts`: o próprio pg_cron não
// carrega token). Isso não é uma porta sem guarda nova: qualquer um com a
// URL já podia acionar antes desta tela existir; a guarda de verdade
// desta AÇÃO é só o botão estar numa tela restrita a admin/diakonia — o
// mesmo raciocínio de AD-1 (CLAUDE.md): o React decide o que oferece, o
// backend decide o que permite, e aqui o backend só permite "enviou ou
// não", nunca vazando o conteúdo do resumo pra quem chama sem sessão.
export async function dispararResumoSemanalAgora(): Promise<{ ok: boolean; enviados?: number; falharam?: number; erro?: string }> {
  const resp = await fetch("https://prjoftmlkusbjoeptabp.supabase.co/functions/v1/resumo-semanal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, erro: corpo?.erro ?? `Erro ${resp.status}` };
  return { ok: true, enviados: corpo.enviados, falharam: corpo.falharam };
}

export const DIA_SEMANA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const PAPEL_LABEL: Record<ResumoSemanalDestinatario["papel"], string> = {
  pastoral: "Pastoral", secretaria: "Secretaria", tesouraria: "Tesouraria",
};
