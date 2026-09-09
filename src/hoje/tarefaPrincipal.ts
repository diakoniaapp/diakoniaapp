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
import { hojeMaisDias } from "@/lib/data";
import { resumoMaloteFiscal } from "@/services/fiscalService";
import type { LucideIcon } from "lucide-react";
import {
  GraduationCap, Users, DollarSign, ShoppingCart, FileText, Receipt,
  Scale, Paperclip, UserPlus,
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

/**
 * Hoje, no fuso de quem está olhando — nunca `.toISOString()`.
 *
 * Achado ao auditar o app inteiro atrás do mesmo bug já corrigido em
 * `EbdChamada.tsx`/`domingoMaisRecente()`: `.toISOString()` converte pra
 * UTC antes de cortar a data, e das 21h à meia-noite em Brasília
 * (UTC-3) isso já é depois da meia-noite em UTC. Aqui o efeito era uma
 * conta que vence HOJE aparecer rotulada "está atrasada" a partir das
 * 21h — a primeira e mais urgente das tarefas da tela HOJE.
 */
function hojeLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Contas: o que vence hoje, ou já venceu ───────────────────────────────
//
// Primeiro de todos, e por um motivo que os outros não têm: prazo de
// pagamento não espera. Um caixa aberto continua aberto amanhã e uma chamada
// atrasada ainda pode ser feita; uma obrigação vencida vira multa.
//
// Devolve null quando não há nada vencendo, que é o caso normal — e é o que
// faz a faixa cair para a próxima tarefa do perfil.
const contaVencendo: Resolvedor = async (ctx) => {
  const podeVer =
    ctx.permissoes.has("ver_fiscal") ||
    ctx.permissoes.has("ver_financeiro") ||
    ctx.permissoes.has("ver_painel_tesouraria");
  if (!podeVer) return null;

  const hoje = hojeLocalIso();
  const { data, error } = await supabase
    .from("fiscal_agenda")
    .select("id, codigo_obrigacao, vencimento")
    .in("status", ["pendente", "atrasado"])
    .lte("vencimento", hoje)
    .order("vencimento", { ascending: true });

  if (error || !data || data.length === 0) return null;

  const atrasadas = data.filter(o => o.vencimento < hoje);
  const primeira  = data[0];

  // Uma só: diz qual é. Várias: diz quantas, porque listar nomes de
  // obrigação fiscal numa linha só não ajuda ninguém a decidir.
  const titulo = data.length === 1
    ? `${primeira.codigo_obrigacao} ${primeira.vencimento < hoje ? "está atrasada" : "vence hoje"}`
    : `${data.length} obrigações a pagar`;

  const subtitulo = atrasadas.length > 0
    ? `${atrasadas.length} em atraso${data.length > atrasadas.length ? ` · ${data.length - atrasadas.length} vencendo hoje` : ""}`
    : "Vence hoje";

  return {
    id: "conta-vencendo",
    titulo,
    subtitulo,
    acao: "Ver agenda fiscal",
    abaLabel: "Contas",
    to: "/financas/fiscal",
    icon: Receipt,
  };
};

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

// ─── Conciliação: lançamento realizado, extrato ainda não conferido ──────
//
// Sprint 3 do plano "Bancada da Tesouraria" (09/09/2026). Não gera multa
// como a conta vencendo — mas acumula: quanto mais tempo um lançamento fica
// "realizado" sem virar "conciliado", mais caro fica reconstruir o que
// aconteceu quando alguém finalmente for conferir contra o extrato. Por
// isso entra logo depois do caixa aberto, e não junto dos atalhos
// permanentes do fim da lista.
const DIAS_CONCILIACAO_PENDENTE = 7;

const conciliacaoPendente: Resolvedor = async (ctx) => {
  const podeVer = ctx.permissoes.has("ver_financeiro") || ctx.permissoes.has("ver_painel_tesouraria");
  if (!podeVer) return null;

  const { error, count } = await supabase
    .from("fin_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("status", "realizado")
    .lte("data", hojeMaisDias(-DIAS_CONCILIACAO_PENDENTE));

  if (error || !count) return null;

  return {
    id: "conciliacao-pendente",
    titulo: count === 1
      ? "1 lançamento aguardando conciliação"
      : `${count} lançamentos aguardando conciliação`,
    subtitulo: `Sem conferir contra o extrato há mais de ${DIAS_CONCILIACAO_PENDENTE} dias`,
    acao: "Conferir",
    abaLabel: "Conciliar",
    to: "/financas",
    icon: Scale,
  };
};

// ─── Reunião financeira: pauta ou decisão em aberto ───────────────────────
//
// Duas perguntas, uma resolvida de cada vez: primeiro se há uma reunião
// AGENDADA sem pauta ainda (trabalho de preparo, olhando pra frente).
// Só se essa não pegar nada, a reunião REALIZADA mais recente sem nenhuma
// decisão registrada (trabalho de fechamento, olhando pra trás) — pauta
// gerada e decisão pendente são coisas diferentes, e misturá-las numa
// consulta só esconderia qual das duas travar a governança financeira.
const prestacaoContasPendente: Resolvedor = async (ctx) => {
  const podeVer = ctx.permissoes.has("ver_financeiro") || ctx.permissoes.has("ver_painel_tesouraria");
  if (!podeVer) return null;

  const { data: agendada } = await supabase
    .from("fin_reunioes_financeiras")
    .select("id, titulo, pauta_jsonb")
    .eq("status", "agendada")
    .order("data_reuniao", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (agendada && !agendada.pauta_jsonb) {
    return {
      id: "reuniao-sem-pauta",
      titulo: `Pauta da reunião — ${agendada.titulo}`,
      subtitulo: "Ainda não gerada",
      acao: "Gerar pauta",
      abaLabel: "Pauta",
      to: "/financas/reunioes",
      icon: FileText,
    };
  }

  const { data: realizada } = await supabase
    .from("fin_reunioes_financeiras")
    .select("id, titulo")
    .eq("status", "realizada")
    .order("data_reuniao", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!realizada) return null;

  const { count } = await supabase
    .from("fin_decisoes_reuniao")
    .select("id", { count: "exact", head: true })
    .eq("reuniao_id", realizada.id);
  if (count && count > 0) return null;

  return {
    id: "reuniao-sem-decisao",
    titulo: `Decisões da reunião — ${realizada.titulo}`,
    subtitulo: "Nenhuma decisão registrada ainda",
    acao: "Registrar",
    abaLabel: "Decisões",
    to: "/financas/reunioes",
    icon: FileText,
  };
};

// ─── Documento fiscal: baixa dada, comprovante ainda não anexado ─────────
//
// O mais adiável dos cinco resolvedores financeiros — a obrigação já foi
// paga, só falta arquivar. Reaproveita `resumoMaloteFiscal()`, a mesma RPC
// que já monta o malote do mês para exportação: cada obrigação paga vem com
// `qtd_documentos`, e zero documentos numa obrigação já quitada é
// exatamente o buraco que este resolvedor aponta.
const documentoFiscalFaltando: Resolvedor = async (ctx) => {
  const podeVer =
    ctx.permissoes.has("ver_fiscal") ||
    ctx.permissoes.has("ver_financeiro") ||
    ctx.permissoes.has("ver_painel_tesouraria");
  if (!podeVer) return null;

  const agora = new Date();
  const resumo = await resumoMaloteFiscal(agora.getFullYear(), agora.getMonth() + 1);
  const faltando = resumo.por_obrigacao.filter(o => o.status === "pago" && o.qtd_documentos === 0);
  if (faltando.length === 0) return null;

  return {
    id: "documento-fiscal-faltando",
    titulo: faltando.length === 1
      ? `Documento faltando — ${faltando[0].nome}`
      : `${faltando.length} obrigações sem documento no malote`,
    subtitulo: "Paga, mas sem comprovante anexado",
    acao: "Abrir malote",
    abaLabel: "Malote",
    to: "/financas/fiscal",
    icon: Paperclip,
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

  // ── UM TOQUE A MENOS QUANDO O ENCONTRO DE HOJE JÁ EXISTE ────────────────
  //
  // Achado na auditoria de navegação (Fase 2 da Bússola do Diakonia,
  // 09/09/2026): esta tarefa sempre levava à página do GRUPO, e de lá o
  // líder ainda precisava achar e clicar "Iniciar encontro de hoje" — um
  // toque a mais que a Chamada da EBD não pede, porque aquela já abre
  // direto na chamada.
  //
  // A diferença fica só em ENCONTRAR, nunca em CRIAR: "Iniciar encontro" é
  // ação deliberada do líder (grava uma linha nova em `pgm_reunioes`), e um
  // toque na aba adaptativa não deveria ter esse efeito colateral — criaria
  // encontros fantasma para quem só espiou a aba sem intenção de começar
  // agora. Quando o encontro de hoje JÁ existe (o líder já apertou o botão,
  // de outro aparelho ou mais cedo), a tarefa leva direto pra ele; quando
  // não existe ainda, continua levando ao grupo, onde o botão está.
  const hoje = hojeLocalIso();
  const { data: reuniaoHoje } = await supabase
    .from("pgm_reunioes")
    .select("id")
    .eq("grupo_id", data.id)
    .eq("data", hoje)
    .limit(1)
    .maybeSingle();

  if (reuniaoHoje) {
    return {
      id: "reuniao-pgm",
      titulo: `Encontro de hoje — ${data.nome}`,
      subtitulo: "Continuar registrando presença",
      acao: "Abrir encontro",
      abaLabel: "Encontro",
      to: `/pgm/${data.id}/reuniao/${reuniaoHoje.id}`,
      icon: Users,
    };
  }

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

// ─── Cadastro rápido: nova pessoa ──────────────────────────────────────────
//
// 09/09/2026, pedido dela ao reavaliar a barra inferior: quem acumula os
// três papéis (pastoral, secretaria, tesouraria) tem "cadastrar quem
// chegou" como o gesto mais repetido do dia — não é uma pendência com
// prazo, como as cinco financeiras acima, mas é o atalho permanente mais
// útil pra esse perfil quando nenhuma delas tem nada a dizer. Fica ANTES
// de `lancamento` na lista: quem tem as duas permissões vê "Cadastro"
// primeiro, não "Lançar".
//
// `/membros?novo=1` é lido de verdade por `Membros.tsx` (abre o diálogo
// direto, sem exigir achar o botão) — conferido antes de usar, depois do
// "Criar Ministério" do menu da conta ter apontado pra um parâmetro que
// `Ministerios.tsx` nunca lia.
const novaPessoa: Resolvedor = async (ctx) => {
  if (!ctx.permissoes.has("editar_pessoa")) return null;
  return {
    id: "nova-pessoa",
    titulo: "Nova pessoa",
    subtitulo: "Cadastrar quem chegou",
    acao: "Cadastrar",
    abaLabel: "Cadastro",
    to: "/membros?novo=1",
    icon: UserPlus,
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
 * Ordem = prioridade, e a régua é o custo de deixar para depois.
 *
 * Conta vencendo vem primeiro: é a única cujo atraso vira multa. Caixa aberto
 * vem em seguida, por representar algo em curso com consequência contábil.
 *
 * ── O CLUSTER FINANCEIRO, SPRINT 3 (09/09/2026) ────────────────────────────
 *
 * Três resolvedores novos ficam junto dos dois primeiros, não espalhados
 * pela lista — todos os cinco respondem à mesma pergunta ("o que custa mais
 * caro adiar, no dinheiro da igreja?") e a resposta muda com o tempo de
 * espera, não com o tipo de tela:
 *
 *   1. conta vencendo             multa por dia de atraso
 *   2. caixa aberto                dinheiro em espécie sem responsável
 *   3. conciliação pendente        fica mais caro reconstruir quanto mais espera
 *   4. reunião sem pauta/decisão   trava a governança financeira, mas só 1x por reunião
 *   5. documento fiscal faltando   o mais adiável: a obrigação já foi paga
 *
 * Os demais seguem a frequência de uso do perfil — e os três últimos são
 * atalhos permanentes, não pendências: aparecem sempre que ninguém acima tem
 * algo a dizer. `novaPessoa` vem antes de `lancamento` porque quem acumula
 * cadastro e financeiro — o caso dela — cadastra gente mais vezes por dia do
 * que lança uma entrada avulsa; ver o comentário do resolvedor.
 */
const RESOLVEDORES: Resolvedor[] = [
  contaVencendo,
  caixaAberto,
  conciliacaoPendente,
  prestacaoContasPendente,
  documentoFiscalFaltando,
  chamadaEbd,
  reuniaoPgm,
  novaPessoa,
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
