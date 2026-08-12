// ─── tarefaPrincipal.ts ──────────────────────────────────────────────────
// A faixa "Sua tarefa" da tela HOJE.
//
// É a única peça do HOJE sem equivalente na arquitetura atual. O
// widgetRegistry resolve BLOCOS informativos por permissão; aqui o que se
// resolve é UMA AÇÃO, e ela depende de contexto que só o banco sabe:
// qual classe a pessoa leciona, qual grupo ela lidera, se há caixa aberto.
//
// Contrato: cada resolvedor devolve uma tarefa ou null. O primeiro que
// devolver algo vence — a ordem do array é a ordem de prioridade. Devolver
// null é o caminho normal, não erro: quem não é professor não tem chamada.
//
// Nenhum resolvedor pode lançar. Falha de rede vira null e a faixa some,
// conforme a regra de que bloco vazio não existe.

import { supabase } from "@/integrations/supabase/client";
import type { LucideIcon } from "lucide-react";
import {
  GraduationCap, Users, DollarSign, ShoppingCart, FileText,
} from "lucide-react";

export interface TarefaPrincipal {
  /** Identificador estável — usado como key e na aba adaptativa. */
  id: string;
  /** O que a pessoa vai fazer. Frase curta, com o objeto concreto. */
  titulo: string;
  /** Contexto opcional: horário, quantidade, local. */
  subtitulo?: string;
  /** Texto do botão. Verbo no infinitivo. */
  acao: string;
  /** Rótulo curto para a aba adaptativa da barra inferior (máx ~9 chars). */
  abaLabel: string;
  to: string;
  icon: LucideIcon;
}

export interface ContextoTarefa {
  /** ID em `membros` da pessoa logada (profiles.pessoa_id). */
  pessoaId: string | null;
  permissoes: Set<string>;
}

type Resolvedor = (ctx: ContextoTarefa) => Promise<TarefaPrincipal | null>;

// ─── Operação: caixa aberto é o que mais trava alguém ─────────────────────
const caixaAberto: Resolvedor = async (ctx) => {
  if (!ctx.permissoes.has("operar_caixa") && !ctx.permissoes.has("ver_arrecadacao")) return null;
  const { data, error } = await supabase
    .from("arr_caixas")
    .select("id, estado, aberto_em")
    .eq("estado", "aberto")
    .is("arquivado_em", null)
    .order("aberto_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: "caixa-aberto",
    titulo: "Caixa aberto",
    subtitulo: "Continuar vendas ou fechar o caixa",
    acao: "Abrir caixa",
    abaLabel: "Caixa",
    to: `/arrecadacao/caixa/${data.id}`,
    icon: ShoppingCart,
  };
};

// ─── Professor de EBD: a chamada da classe dele ───────────────────────────
const chamadaEbd: Resolvedor = async (ctx) => {
  if (!ctx.pessoaId || !ctx.permissoes.has("ver_ebd")) return null;
  const { data, error } = await supabase
    .from("ebd_professores")
    .select("classe_id")
    .eq("pessoa_id", ctx.pessoaId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  if (error || !data?.classe_id) return null;

  const { data: classe } = await supabase
    .from("ebd_classes")
    .select("nome")
    .eq("id", data.classe_id)
    .maybeSingle();

  return {
    id: "chamada-ebd",
    titulo: `Chamada — ${classe?.nome ?? "sua classe"}`,
    subtitulo: "Registrar presença de hoje",
    acao: "Abrir chamada",
    abaLabel: "Chamada",
    to: `/ebd/${data.classe_id}/chamada`,
    icon: GraduationCap,
  };
};

// ─── Líder de PGM: o grupo que ele conduz ─────────────────────────────────
const DIAS = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

const reuniaoPgm: Resolvedor = async (ctx) => {
  if (!ctx.pessoaId || !ctx.permissoes.has("ver_pgm")) return null;
  const { data, error } = await supabase
    .from("pgm_grupos")
    .select("id, nome, dia_semana, horario")
    .or(`lider_id.eq.${ctx.pessoaId},co_lider_id.eq.${ctx.pessoaId}`)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const dia = typeof data.dia_semana === "number" ? DIAS[data.dia_semana] : null;
  const quando = [dia, data.horario?.slice(0, 5)].filter(Boolean).join(" · ");

  return {
    id: "reuniao-pgm",
    titulo: data.nome,
    subtitulo: quando ? `Encontro ${quando}` : "Registrar encontro",
    acao: "Abrir grupo",
    abaLabel: "Grupo",
    to: `/pgm/${data.id}`,
    icon: Users,
  };
};

// ─── Tesouraria: lançar é o gesto mais repetido ───────────────────────────
const lancamento: Resolvedor = async (ctx) => {
  if (!ctx.permissoes.has("lancar_financeiro")) return null;
  return {
    id: "novo-lancamento",
    titulo: "Lançamento financeiro",
    subtitulo: "Registrar entrada ou saída",
    acao: "Lançar",
    abaLabel: "Lançar",
    to: "/financas?lancar=true",
    icon: DollarSign,
  };
};

// ─── Secretaria: solicitações de membresia ────────────────────────────────
const membresia: Resolvedor = async (ctx) => {
  if (!ctx.permissoes.has("ver_membresia")) return null;
  return {
    id: "membresia",
    titulo: "Solicitações de membresia",
    subtitulo: "Registrar ou dar andamento",
    acao: "Abrir",
    abaLabel: "Membresia",
    to: "/membresia",
    icon: FileText,
  };
};

/**
 * Ordem = prioridade. Caixa aberto vem primeiro porque é o único que
 * representa algo em curso: deixar um caixa aberto tem consequência
 * contábil. Os demais seguem a frequência de uso do perfil.
 */
const RESOLVEDORES: Resolvedor[] = [
  caixaAberto,
  chamadaEbd,
  reuniaoPgm,
  lancamento,
  membresia,
];

/**
 * Devolve a tarefa principal do perfil, ou null se não houver — caso em que
 * a faixa inteira não é renderizada.
 */
export async function resolverTarefaPrincipal(
  ctx: ContextoTarefa,
): Promise<TarefaPrincipal | null> {
  for (const resolver of RESOLVEDORES) {
    try {
      const t = await resolver(ctx);
      if (t) return t;
    } catch {
      // Resolvedor que falha é tratado como "sem tarefa": a tela HOJE nunca
      // deve quebrar por causa de uma consulta opcional.
    }
  }
  return null;
}
