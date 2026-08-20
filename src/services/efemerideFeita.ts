// ─── efemerideFeita.ts — o painel HOJE como lista de tarefas ────────────────
//
// O bloco "Ações de hoje" mostrava o aniversário do dia e continuava
// mostrando depois de a pessoa já ter sido cumprimentada. Quem olhava não
// tinha como distinguir "ainda falta" de "já foi" — e o custo disso não é
// só espaço na tela: no domingo seguinte ninguém lembra quem já recebeu
// mensagem, então ou alguém manda duas vezes ou ninguém manda.
//
// ── ONDE ISSO É GRAVADO, E POR QUÊ ─────────────────────────────────────────
//
// Em `visita_historico`, a tabela de contatos pastorais que já tem 283
// registros e que a linha do tempo da ficha já sabe traduzir. Um "parabéns
// pelos 12 anos" é um contato pastoral; não precisava de tabela nova.
//
// A escolha entre ela e `historico_membro` foi decidida pelas políticas de
// RLS, não pelo gosto: `historico_membro` aceita escrita apenas de admin,
// secretaria e diakonia, e dos 6 usuários reais 4 são `lideranca` — não
// gravariam, e sequer leriam o que os outros gravaram. `visita_historico`
// aceita qualquer usuário autenticado, que é o que um mural compartilhado
// exige: se cada um enxergasse a própria lista, o mural não serviria para
// dividir trabalho.
//
// ── NÃO HÁ COMO DESFAZER ───────────────────────────────────────────────────
//
// `visita_historico` não tem política de DELETE — nem para admin. Uma marca
// gravada por engano fica. É por isso que a marca é deliberadamente barata de
// entender e cara de errar: ela nasce do mesmo clique que abre o WhatsApp,
// que é o gesto de cumprimentar, e não de um botão solto que se aperta sem
// querer ao rolar a tela.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";
import type { EventoPastoral, TipoEfemeride } from "./agendaPastoralService";

/**
 * Um `tipo` por efeméride, e não um `felicitacao` genérico.
 *
 * Duas razões. Na ficha da pessoa, "Parabéns de aniversário" e "Parabéns de
 * membresia" são acontecimentos diferentes na vida dela. E no painel, é o que
 * permite saber QUAL efeméride já foi cumprida quando a mesma pessoa faz
 * aniversário e completa anos de casa no mesmo dia — caso raro, mas que existe
 * e que um tipo único trataria como um só.
 *
 * Os quatro valores foram acrescentados ao CHECK da coluna na migration
 * 20260820120000. Qualquer outro é recusado pelo banco.
 */
export const TIPO_FELICITACAO: Record<TipoEfemeride, string> = {
  aniversario: "felicitacao_aniversario",
  casamento:   "felicitacao_casamento",
  membresia:   "felicitacao_membresia",
  pastorado:   "felicitacao_pastorado",
};

const DE_VOLTA: Record<string, TipoEfemeride> = Object.fromEntries(
  (Object.keys(TIPO_FELICITACAO) as TipoEfemeride[]).map(k => [TIPO_FELICITACAO[k], k]),
) as Record<string, TipoEfemeride>;

/**
 * A quem a efeméride pertence.
 *
 * `pessoa_id` e não `ref_id`: a coluna `visitante_id` tem chave estrangeira
 * para `membros`, e um evento de casamento pode trazer no `ref_id` o id da
 * família. Gravar isso quebraria a chave — e é justamente o caso em que a
 * marca é mais fácil de deixar passar despercebida, porque bodas são raras.
 */
export function donoDaEfemeride(ev: Pick<EventoPastoral, "pessoa_id" | "ref_id">): string | null {
  return ev.pessoa_id ?? ev.ref_id ?? null;
}

/** Identidade de uma efeméride do dia: pessoa + que tipo de data é. */
export function chaveDaEfemeride(ev: Pick<EventoPastoral, "pessoa_id" | "ref_id" | "tipo">): string {
  return `${donoDaEfemeride(ev) ?? "?"}::${ev.tipo}`;
}

// Meia-noite local, não UTC. No fuso de Brasília o dia vira três horas depois
// do UTC: usar `toISOString()` de um `new Date()` cru faria a lista limpar
// sozinha às 21h, e o que foi cumprimentado à noite reapareceria como
// pendente.
function inicioDeHoje(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * O que já foi cumprimentado hoje, por qualquer pessoa da equipe.
 *
 * Devolve conjunto vazio se a consulta falhar: numa falha de rede é melhor
 * mostrar de novo alguém que já foi cumprimentado do que esconder alguém que
 * ainda espera. O erro dessa direção custa uma mensagem repetida; o da outra
 * custa uma pessoa esquecida.
 */
export async function felicitacoesDeHoje(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("visita_historico")
    .select("visitante_id, tipo")
    .in("tipo", Object.values(TIPO_FELICITACAO))
    .gte("created_at", inicioDeHoje());

  if (error) return new Set();

  const feitas = new Set<string>();
  for (const r of (data ?? []) as { visitante_id: string; tipo: string }[]) {
    const qual = DE_VOLTA[r.tipo];
    if (qual) feitas.add(`${r.visitante_id}::${qual}`);
  }
  return feitas;
}

/**
 * Registra que a efeméride foi cumprimentada.
 *
 * @param observacao o que aparece na ficha da pessoa, em português corrido —
 *                   "12 anos de vida". Fica guardado; escreva para ser lido.
 */
export async function marcarFelicitada(
  ev: EventoPastoral,
  observacao: string | null,
): Promise<ResultadoEscrita> {
  const pessoaId = donoDaEfemeride(ev);
  if (!pessoaId) {
    return { ok: false, erro: "Esta data não está ligada a uma pessoa do cadastro." };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // `.select("id")` não é enfeite: sem ele o PostgREST não devolve as linhas
  // afetadas, e uma política de RLS que barrasse a escrita voltaria como
  // sucesso. Ver o comentário longo em lib/escritaConferida.ts.
  return conferir(
    await supabase
      .from("visita_historico")
      .insert({
        visitante_id: pessoaId,
        tipo: TIPO_FELICITACAO[ev.tipo],
        observacao,
        registrado_por: user?.id ?? null,
      })
      .select("id"),
    "O cumprimento",
  );
}
