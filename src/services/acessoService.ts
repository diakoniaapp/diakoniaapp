// ─── acessoService.ts — Gestão de acesso ao sistema vinculado à Pessoa ────────
//
// Modelo de domínio:
//   Pessoa (membros) → PODE ter → Acesso (profiles + auth.users)
//
// Regras:
//   • Uma Pessoa existe sem acesso (normal)
//   • Acesso é criado a partir da ficha da Pessoa
//   • O telefone da Pessoa vira o login (email: {tel}@app.diakonia)
//   • Toda ação sensível é registrada em audit_logs via RPC

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { gerarSenha, enviarWhatsApp } from "@/services/userService";

// ─── Cliente isolado para signUp (não afeta sessão do admin) ─────────────────

const supabaseSignup = createClient(
  import.meta.env.VITE_SUPABASE_URL      as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false, storageKey: "diakonia_acesso_tmp" } }
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StatusAcesso = "sem_acesso" | "aguardando" | "ativo";

export interface AcessoPessoa {
  userId:        string;         // auth.users.id = profiles.id
  pessoaId:      string;         // membros.id
  telefone:      string;
  role:          string;
  primeiroAcesso: boolean;
  status:        StatusAcesso;
}

export interface ResultadoAcesso {
  ok:    boolean;
  erro?: string;
  senha?: string;
  tel?:   string;
}

// ─── Consultas ────────────────────────────────────────────────────────────────

/**
 * Verifica se uma pessoa já tem acesso criado.
 * Retorna null se não tiver.
 */
export async function buscarAcessoPorPessoa(
  pessoaId: string
): Promise<AcessoPessoa | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, pessoa_id, telefone, role, primeiro_acesso")
    .eq("pessoa_id", pessoaId)
    .maybeSingle();

  if (!data) return null;

  return {
    userId:        data.id,
    pessoaId:      data.pessoa_id!,
    telefone:      data.telefone ?? "",
    role:          data.role ?? "voluntario",
    primeiroAcesso: data.primeiro_acesso ?? true,
    status:        data.primeiro_acesso ? "aguardando" : "ativo",
  };
}

/**
 * Verifica se um telefone já tem acesso criado (evita duplicidade).
 */
export async function telefoneJaPossuiAcesso(telefone: string): Promise<boolean> {
  const tel = telefone.replace(/\D/g, "");
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("telefone", tel)
    .maybeSingle();
  return !!data;
}

/**
 * Lista todos os acessos com vínculo à pessoa — para o painel admin.
 */
export async function listarTodosAcessos(): Promise<
  (AcessoPessoa & { nomeCompleto: string })[]
> {
  const { data } = await supabase
    .from("profiles")
    .select(`
      id, pessoa_id, telefone, role, primeiro_acesso,
      membros:pessoa_id ( nome_completo )
    `)
    .order("id");

  return (data ?? []).map((p: any) => ({
    userId:        p.id,
    pessoaId:      p.pessoa_id ?? "",
    telefone:      p.telefone ?? "",
    role:          p.role ?? "voluntario",
    primeiroAcesso: p.primeiro_acesso ?? true,
    status:        (p.primeiro_acesso ? "aguardando" : "ativo") as StatusAcesso,
    nomeCompleto:  p.membros?.nome_completo ?? "—",
  }));
}

// ─── Dashboard: resumo de acessos ────────────────────────────────────────────

export interface ResumoAcessos {
  total:       number;
  ativos:      number;   // primeiro_acesso = false
  aguardando:  number;   // primeiro_acesso = true
  semVinculo:  number;   // pessoa_id IS NULL (acesso sem pessoa cadastrada)
  comVinculo:  number;   // pessoa_id IS NOT NULL
}

export async function getResumoAcessos(): Promise<ResumoAcessos> {
  const { data } = await supabase
    .from("profiles")
    .select("id, primeiro_acesso, pessoa_id");

  const lista = data ?? [];
  return {
    total:      lista.length,
    ativos:     lista.filter(p => !p.primeiro_acesso).length,
    aguardando: lista.filter(p => !!p.primeiro_acesso).length,
    semVinculo: lista.filter(p => !p.pessoa_id).length,
    comVinculo: lista.filter(p => !!p.pessoa_id).length,
  };
}

// ─── Criação de acesso ────────────────────────────────────────────────────────

/**
 * Cria acesso para uma pessoa já cadastrada.
 *
 * Fluxo:
 *   1. Valida telefone único
 *   2. signUp isolado (não afeta sessão do admin)
 *   3. Upsert em profiles com pessoa_id
 *   4. Log de auditoria
 *   5. Retorna senha para envio via WhatsApp
 */
export async function criarAcessoPessoa(params: {
  pessoaId:     string;
  nomeCompleto: string;
  telefone:     string;
  role:         string;
}): Promise<ResultadoAcesso> {
  const tel   = params.telefone.replace(/\D/g, "");
  const email = `${tel}@app.diakonia`;
  const senha = gerarSenha();

  // Verificar duplicidade
  if (await telefoneJaPossuiAcesso(tel)) {
    return {
      ok:   false,
      erro: "Este telefone já possui acesso ao sistema. Use 'Reenviar acesso' se necessário.",
    };
  }

  try {
    // 1. Criar no Auth (cliente isolado)
    const { data: authData, error: authError } = await supabaseSignup.auth.signUp({
      email,
      password: senha,
      options: {
        data: { must_change_password: true, nome: params.nomeCompleto },
      },
    });

    if (authError) {
      return {
        ok:   false,
        erro: authError.message.includes("already registered")
          ? "Este telefone já possui acesso ao sistema."
          : `Erro ao criar acesso: ${authError.message}`,
      };
    }

    const uid = authData.user?.id;
    if (!uid) return { ok: false, erro: "Falha ao obter ID do usuário. Tente novamente." };

    // 2. Salvar profile vinculado à pessoa
    const { error: profileError } = await supabaseSignup
      .from("profiles")
      .upsert(
        {
          id:              uid,
          pessoa_id:       params.pessoaId,
          nome:            params.nomeCompleto,
          telefone:        tel,
          role:            params.role,
          primeiro_acesso: true,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      return {
        ok:   false,
        erro: `Acesso criado no Auth, mas falha ao salvar perfil: ${profileError.message}`,
        senha,
        tel,
      };
    }

    // 3. Registrar log
    // .maybeSingle() em RPC void trava o cliente — usar promise simples com catch.
    supabase.rpc("registrar_audit_log", {
      p_tipo_evento: "acesso_criado",
      p_pessoa_id:   params.pessoaId,
      p_user_id:     uid,
      p_detalhes:    { role: params.role, telefone: tel },
    }).then(() => {}).catch((e) => console.warn("[audit_log]", e));

    return { ok: true, senha, tel };
  } catch (e: unknown) {
    return { ok: false, erro: "Erro inesperado ao criar acesso." };
  }
}

// ─── Reenviar / Resetar ───────────────────────────────────────────────────────

/**
 * Redefine a senha via RPC Postgres e retorna a nova senha.
 * Pré-requisito: sql/funcoes_admin.sql executado.
 */
export async function resetarSenhaAcesso(
  userId:    string,
  pessoaId?: string
): Promise<ResultadoAcesso> {
  const senha = gerarSenha();

  const { error } = await supabase.rpc("reset_user_password", {
    target_user_id: userId,
    new_password:   senha,
  });

  if (error) {
    const msgAmigavel = error.message.includes("does not exist")
      ? "Execute sql/funcoes_admin.sql no Supabase Dashboard primeiro."
      : error.message;
    return { ok: false, erro: msgAmigavel };
  }

  // Marca como primeiro_acesso = true (forçar troca)
  await supabase.from("profiles").update({ primeiro_acesso: true }).eq("id", userId);

  // Log de auditoria
  if (pessoaId) {
    supabase.rpc("registrar_audit_log", {
      p_tipo_evento: "senha_resetada",
      p_pessoa_id:   pessoaId,
      p_user_id:     userId,
      p_detalhes:    {},
    }).then(() => {}).catch((e) => console.warn("[audit_log]", e));
  }

  return { ok: true, senha };
}

/**
 * Recupera o telefone de um usuário para envio de WhatsApp.
 * Tenta do profile, depois do email no Auth via RPC.
 */
export async function recuperarTelefoneAcesso(
  userId:   string,
  telefone: string | null
): Promise<string | null> {
  if (telefone) return telefone.replace(/\D/g, "");

  const { data } = await supabase
    .rpc("get_user_email", { target_user_id: userId })
    .maybeSingle() as any;

  const email = data as string | null;
  if (!email?.endsWith("@app.diakonia")) return null;

  const tel = email.split("@")[0].replace(/\D/g, "");
  if (!tel || tel.length < 10) return null;

  // Persiste no profile para não buscar sempre
  await supabase.from("profiles").update({ telefone: tel }).eq("id", userId);
  return tel;
}

/**
 * Ação combinada: gerar nova senha + buscar telefone + abrir WhatsApp.
 */
export async function reenviarAcessoPessoa(params: {
  userId:       string;
  pessoaId?:    string;
  nomeCompleto: string;
  telefone:     string | null;
}): Promise<ResultadoAcesso> {
  const [tel, resultado] = await Promise.all([
    recuperarTelefoneAcesso(params.userId, params.telefone),
    resetarSenhaAcesso(params.userId, params.pessoaId),
  ]);

  if (!resultado.ok) return resultado;

  return { ...resultado, tel: tel ?? undefined };
}
