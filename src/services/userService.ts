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

/** Remove qualquer caractere não-numérico. */
export function limparTelefone(tel: string): string {
  return tel.replace(/\D/g, "");
}

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
 * Abre o WhatsApp com mensagem de credenciais formatada.
 * Não faz nada se o telefone for inválido — retorna false.
 */
export function enviarWhatsApp(
  telefone: string,
  nome:     string,
  senha:    string,
  reenvio = false
): boolean {
  const tel = limparTelefone(telefone);
  if (!tel || tel.length < 10) return false;

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
    `🌐 Sistema: ${sistemaUrl}`,
    ``,
    `⚠️ No primeiro acesso você precisará trocar sua senha.`,
    ``,
    `_"Conectando pessoas, organizando o propósito."_`,
  ].join("\n");

  window.open(
    `https://wa.me/55${tel}?text=${encodeURIComponent(mensagem)}`,
    "_blank",
    "noopener,noreferrer"
  );
  return true;
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
