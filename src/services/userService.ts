// ─── userService.ts — Toda lógica de negócio do módulo de Usuários ───────────
// Sem dependências de React. Pode ser testado de forma isolada.

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Usuario, NovoUsuarioDados, UserServiceResult } from "@/types/usuario";

// ─── Cliente isolado para signUp ──────────────────────────────────────────────
// persistSession: false → não sobrescreve a sessão do admin logado.

const supabaseSignup = createClient(
  import.meta.env.VITE_SUPABASE_URL      as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:  false,
      storageKey:      "diakonia_signup_tmp",
    },
  }
);

// ─── Utilitários puros ────────────────────────────────────────────────────────

// Importa para uso interno + reexporta para compat com imports externos antigos.
// A fonte de verdade está em src/lib/telefone.ts.
import {
  limparTelefone,
  formatarTelefone,
  normalizarTelefone,
  validarTelefone,
  telefoneValido,
} from "@/lib/telefone";

export {
  limparTelefone,
  formatarTelefone,
  normalizarTelefone,
  validarTelefone,
  telefoneValido,
};

/**
 * Retorna true se o nome é um nome humano válido:
 * - não nulo, ao menos 2 chars
 * - não é só números (ex: telefone salvo no campo errado)
 * - não contém "@" (ex: email salvo no campo errado)
 */
export function nomeValido(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const s = nome.trim();
  return s.length >= 2 && !/^\d+$/.test(s) && !s.includes("@");
}

/** Retorna nome seguro para exibição — "Sem nome" se inválido. */
export function nomeExibido(nome: string | null): string {
  return nomeValido(nome) ? nome!.trim() : "Sem nome";
}

/** Gera senha aleatória de 8 caracteres (sem caracteres ambíguos). */
export function gerarSenha(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#!";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

/**
 * Gera a URL do WhatsApp com mensagem de credenciais formatada
 * e tenta abrir em nova aba. Browsers bloqueiam window.open chamado
 * após await — por isso retornamos a URL para o componente decidir
 * (toast clicável é o fallback seguro).
 */
export interface ResultadoWhatsApp {
  ok: boolean;          // tem telefone válido e mensagem montada
  url?: string;         // URL pronta para window.open ou copy-paste
  abertaAutomaticamente?: boolean;  // janela conseguiu abrir (pop-up não bloqueado)
  senha?: string;       // senha gerada (eco)
  telefone?: string;    // telefone limpo
  mensagem?: string;    // mensagem montada (copy-paste fallback)
}

/**
 * Monta a URL do WhatsApp + mensagem (sem efeito colateral).
 * Útil quando o componente precisa controlar a abertura via janela já aberta.
 */
export function montarMensagemWhatsApp(
  telefone: string,
  nome:     string,
  senha:    string,
  reenvio = false
): { ok: boolean; url?: string; mensagem?: string; telefone?: string } {
  const tel = limparTelefone(telefone);
  if (!tel || tel.length < 10) return { ok: false };

  const sistemaUrl = window.location.origin;
  const acao       = reenvio ? "reenviado" : "criado";
  const nomeUso    = nomeValido(nome) ? nome.trim() : "membro";

  const mensagem = [
    `✝️ *DiakoniaApp — Acesso ${acao}*`,
    ``,
    `Olá, ${nomeUso}! Seu acesso ao sistema da igreja foi ${acao}.`,
    ``,
    `🔐 *Dados de acesso:*`,
    `👤 Login (telefone): ${tel}`,
    `🔑 Senha: ${senha}`,
    `🌐 Acesse: ${sistemaUrl}/auth?t=${tel.replace(/^55/, "")}&p=${encodeURIComponent(senha)}`,
    ``,
    `⚠️ No primeiro acesso você precisará trocar sua senha.`,
    ``,
    `_"Conectando pessoas, organizando o propósito."_`,
  ].join("\n");

  const url = `https://wa.me/${normalizarTelefone(tel)}?text=${encodeURIComponent(mensagem)}`;
  return { ok: true, url, mensagem, telefone: tel };
}

export function enviarWhatsApp(
  telefone: string,
  nome:     string,
  senha:    string,
  reenvio = false
): ResultadoWhatsApp {
  const tel = limparTelefone(telefone);
  if (!tel || tel.length < 10) return { ok: false };

  const sistemaUrl = window.location.origin;
  const acao       = reenvio ? "reenviado" : "criado";
  const nomeUso    = nomeValido(nome) ? nome.trim() : "membro";

  const mensagem = [
    `✝️ *DiakoniaApp — Acesso ${acao}*`,
    ``,
    `Olá, ${nomeUso}! Seu acesso ao sistema da igreja foi ${acao}.`,
    ``,
    `🔐 *Dados de acesso:*`,
    `👤 Login (telefone): ${tel}`,
    `🔑 Senha: ${senha}`,
    `🌐 Acesse: ${sistemaUrl}/auth?t=${tel.replace(/^55/, "")}&p=${encodeURIComponent(senha)}`,
    ``,
    `⚠️ No primeiro acesso você precisará trocar sua senha.`,
    ``,
    `_"Conectando pessoas, organizando o propósito."_`,
  ].join("\n");

  const url = `https://wa.me/${normalizarTelefone(tel)}?text=${encodeURIComponent(mensagem)}`;

  // Tenta abrir; browsers bloqueiam silenciosamente se não for gesto do user.
  // window.open retorna a janela ou null se bloqueada.
  const janela = window.open(url, "_blank", "noopener,noreferrer");
  const abertaAutomaticamente = janela !== null && !janela.closed;

  // Garantia adicional: copia a mensagem pro clipboard para o user enviar manualmente.
  if (!abertaAutomaticamente && typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(mensagem).catch(() => {});
  }

  return {
    ok: true,
    url,
    senha,
    telefone: tel,
    mensagem,
    abertaAutomaticamente,
  };
}

// ─── Operações de banco ───────────────────────────────────────────────────────

/** Busca todos os profiles ordenados por nome. */
export async function listarUsuarios(): Promise<{
  usuarios: Usuario[];
  erro: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, telefone, role, primeiro_acesso")
      .order("nome", { ascending: true });

    if (error) return { usuarios: [], erro: error.message };
    return { usuarios: (data ?? []) as Usuario[], erro: null };
  } catch (e: unknown) {
    return { usuarios: [], erro: e instanceof Error ? e.message : "Erro inesperado." };
  }
}

/**
 * Cria um novo usuário via signUp isolado + upsert em profiles.
 * Retorna a senha gerada para uso no WhatsApp.
 */
export async function criarUsuario(
  dados: NovoUsuarioDados
): Promise<UserServiceResult> {
  const tel   = limparTelefone(dados.telefone);
  const senha = gerarSenha();
  const email = `${tel}@app.diakonia`;

  try {
    // 1. Criar no Auth com cliente isolado (não afeta sessão do admin)
    const { data: authData, error: authError } = await supabaseSignup.auth.signUp({
      email,
      password: senha,
      options: { data: { must_change_password: true, nome: dados.nome } },
    });

    if (authError) {
      const mensagemAmigavel = authError.message.includes("already registered")
        ? "Esse telefone já possui acesso. Use 'Reenviar' para enviar nova senha."
        : `Erro ao criar acesso: ${authError.message}`;
      return { ok: false, erro: mensagemAmigavel };
    }

    const uid = authData.user?.id;
    if (!uid) return { ok: false, erro: "Falha ao obter ID do usuário. Tente novamente." };

    // 2. Salvar profile com sessão do novo usuário (supabaseSignup tem a sessão)
    const { error: profileError } = await supabaseSignup
      .from("profiles")
      .upsert(
        { id: uid, nome: dados.nome, telefone: tel, role: dados.role, primeiro_acesso: true },
        { onConflict: "id" }
      );

    if (profileError) {
      // Auth criado mas profile falhou — retorna senha para não perder
      return {
        ok:   false,
        erro: `Acesso criado, mas falha ao salvar perfil: ${profileError.message}`,
        senha,
        tel,
      };
    }

    return { ok: true, senha, tel };
  } catch (e: unknown) {
    return { ok: false, erro: "Erro inesperado ao criar usuário." };
  }
}

// ─── Operações RPC Admin ──────────────────────────────────────────────────────
// Usam funções Postgres (SECURITY DEFINER) — sem service role key no browser.
// Pré-requisito: sql/funcoes_admin.sql executado no Supabase Dashboard.

/** Reseta a senha de um usuário via RPC. Retorna mensagem de erro ou null. */
export async function resetarSenhaRpc(
  userId: string,
  senha:  string
): Promise<string | null> {
  const { error } = await supabase.rpc("reset_user_password", {
    target_user_id: userId,
    new_password:   senha,
  });

  if (!error) return null;

  // Mensagem amigável se a função RPC não foi criada ainda
  if (error.message.includes("does not exist")) {
    return "Execute o arquivo sql/funcoes_admin.sql no Supabase Dashboard primeiro.";
  }
  return error.message;
}

/** Busca o email de um usuário via RPC para recuperar o telefone. */
export async function getEmailRpc(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_user_email", {
    target_user_id: userId,
  });
  if (error || !data) return null;
  return data as string;
}

/**
 * Tenta recuperar o telefone:
 * 1. Do campo profiles.telefone (já salvo)
 * 2. Do email no Auth via RPC (padrão {tel}@app.diakonia)
 * Se recuperado via RPC, atualiza profiles automaticamente.
 */
export async function recuperarTelefone(u: Usuario): Promise<string | null> {
  if (u.telefone) return limparTelefone(u.telefone);

  try {
    const email = await getEmailRpc(u.id);
    if (!email?.endsWith("@app.diakonia")) return null;

    const tel = limparTelefone(email.split("@")[0]);
    if (!tel || tel.length < 10) return null;

    // Persiste para não buscar novamente na próxima vez
    await supabase.from("profiles").update({ telefone: tel }).eq("id", u.id);
    return tel;
  } catch {
    return null;
  }
}

/**
 * Reenviar acesso: nova senha + atualiza primeiro_acesso + retorna dados para WhatsApp.
 */
export async function reenviarAcesso(u: Usuario): Promise<UserServiceResult> {
  const senha = gerarSenha();
  const tel   = await recuperarTelefone(u);
  const erro  = await resetarSenhaRpc(u.id, senha);

  if (erro) return { ok: false, erro };

  await supabase.from("profiles").update({ primeiro_acesso: true }).eq("id", u.id);
  return { ok: true, senha, tel: tel ?? undefined };
}

/**
 * Resetar senha: nova senha + atualiza primeiro_acesso + retorna dados para WhatsApp.
 */
export async function resetarSenha(u: Usuario): Promise<UserServiceResult> {
  const senha = gerarSenha();
  const tel   = await recuperarTelefone(u);
  const erro  = await resetarSenhaRpc(u.id, senha);

  if (erro) return { ok: false, erro };

  await supabase.from("profiles").update({ primeiro_acesso: true }).eq("id", u.id);
  return { ok: true, senha, tel: tel ?? undefined };
}
