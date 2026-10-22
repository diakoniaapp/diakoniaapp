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
  papel: "pastoral" | "secretaria" | "tesouraria" | "administracao";
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
  pastoral: "Pastoral", secretaria: "Secretaria", tesouraria: "Tesouraria", administracao: "Administração",
};

// ─── Conteúdo do resumo semanal (22/10/2026) — quem recebe, o que recebe e em que ordem ──────────────────────────────────────────────────────────
// As escolhas moram em `resumo_semanal_perfis` / `resumo_semanal_blocos` (migration 20261022200000); o que o código sabe montar, em `lib/resumoSemanalCatalogo` (o MESMO arquivo que a Edge
// Function usa). Visualizar e testar chamam a função `resumo-semanal-previa` — outra função, não a que dispara o envio geral: chamá-la por engano ou antes de implantada nunca manda e-mail a todos.
import { mesclarConfig, paraSalvar, type BlocoConfigurado, type Perfil, type PerfilConfigurado } from "@/lib/resumoSemanalCatalogo";

export interface PessoaDoResumo { perfil: Perfil; nome: string; email: string | null }

/** A configuração com o padrão do catálogo onde nada foi salvo. Sem a migration: erro explicando. */
export async function carregarConfigDoResumo(): Promise<PerfilConfigurado[]> {
  const [p, b] = await Promise.all([
    supabase.from("resumo_semanal_perfis" as never).select("perfil, ativo"),
    supabase.from("resumo_semanal_blocos" as never).select("perfil, bloco, ativo, ordem"),
  ]);
  const erro = p.error ?? b.error;
  if (erro) {
    if (/relation .* does not exist|42P01|PGRST205/.test(`${erro.message} ${(erro as { code?: string }).code ?? ""}`)) {
      throw new Error("A configuração do resumo ainda não foi criada no banco — aplique a migration 20261022200000.");
    }
    throw erro;
  }
  return mesclarConfig({ perfis: (p.data ?? []) as never, blocos: (b.data ?? []) as never });
}

export async function salvarConfigDoResumo(config: PerfilConfigurado[]): Promise<void> {
  const { error } = await supabase.rpc("sistema_resumo_semanal_salvar_config" as never, { p_perfis: paraSalvar(config) } as never);
  if (error) throw error;
}

/** Todas as pessoas de cada perfil, inclusive quem está sem e-mail (para a tela explicar por que não recebe). */
export async function carregarPessoasDoResumo(): Promise<PessoaDoResumo[]> {
  const { data, error } = await supabase.rpc("sistema_resumo_semanal_pessoas" as never);
  if (error) throw error;
  return (data ?? []) as unknown as PessoaDoResumo[];
}

async function chamarPrevia(acao: "previa" | "teste", perfil: Perfil, blocos: BlocoConfigurado[]) {
  const { data, error } = await supabase.functions.invoke("resumo-semanal-previa", { body: { acao, perfil, blocos } });
  if (error) {
    let msg = error.message;
    try { const j = await (error as unknown as { context?: Response }).context?.json?.(); if (j?.erro) msg = j.erro; } catch { /* fica a mensagem genérica */ }
    if (/Failed to send a request|Function not found|NOT_FOUND|404/i.test(msg)) {
      msg = "A função do e-mail ainda não foi implantada no Supabase (resumo-semanal-previa) — veja docs/RESUMO_SEMANAL_CONFIGURAVEL_IMPLANTACAO.md.";
    }
    throw new Error(msg);
  }
  return data as { ok: boolean; assunto?: string; html?: string; blocos?: string[]; enviadoPara?: string; erro?: string };
}

/** O e-mail do perfil como ficaria AGORA, com os números de hoje e a configuração que a tela está editando. Nada é enviado. */
export async function previaDoResumo(perfil: Perfil, blocos: BlocoConfigurado[]): Promise<{ assunto: string; html: string; blocos: string[] }> {
  const r = await chamarPrevia("previa", perfil, blocos);
  return { assunto: r.assunto ?? "", html: r.html ?? "", blocos: r.blocos ?? [] };
}

/** Manda esse e-mail, marcado como teste, SÓ para o e-mail cadastrado de quem está logado. */
export async function enviarTesteDoResumo(perfil: Perfil, blocos: BlocoConfigurado[]): Promise<{ enviadoPara: string }> {
  const r = await chamarPrevia("teste", perfil, blocos);
  return { enviadoPara: r.enviadoPara ?? "" };
}
