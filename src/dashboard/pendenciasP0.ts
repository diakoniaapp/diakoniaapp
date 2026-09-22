// ─── pendenciasP0.ts ────────────────────────────────────────────────────
//
// Épico 7 do roadmap "90 Dias de Diakonia" (17/09/2026) — "um indicador de
// pendência P0 no ícone de cada painel — quem acumula mais de um papel não
// precisa mais abrir cada painel só para checar se há algo urgente". Único
// item de construção nova do plano inteiro; os outros seis são ajuste do
// que já existe.
//
// O registry (`widgetRegistry.tsx`) já sabe QUAIS widgets são prioridade 0
// por painel — o que faltava, como o próprio roadmap apontou, era "expor a
// CONTAGEM": os widgets só decidem se aparecem depois de MONTAR e buscar o
// próprio dado (`useReportarVazio`, um canal que avisa a seção enquanto o
// widget está na tela). Um badge na sidebar precisa do número ANTES de
// qualquer painel abrir — sem montar nada.
//
// Em vez de inventar uma segunda fonte de verdade, cada função abaixo
// chama exatamente a mesma função de serviço (ou a mesma regra pura) que o
// widget correspondente já usa — só sem passar pelo componente React. Se o
// widget mudar a régua do que conta como "pendente", o contador aqui muda
// junto, porque é a MESMA chamada.
import { supabase } from "@/integrations/supabase/client";
import {
  familiasSemResponsavel, pessoasSemFamiliaSugerida, proximosDias,
} from "@/services/agendaPastoralService";
import { felicitacoesDeHoje, chaveDaEfemeride } from "@/services/efemerideFeita";
import { buscarUrgentesIgreja } from "@/services/assuntosService";
import { carregarResumoFiscal } from "@/services/fiscalService";
import { precisaAcao } from "@/lib/visitantesFluxo";
import type { PainelDoWidget } from "./widgetRegistry";

// Mesma regra de `AcoesHoje.tsx` (widget "Acolhimento"): visitante cujo
// último contato (ou a ausência dele) já passou do prazo de `precisaAcao`.
// Só busca a coluna que a regra usa — o widget busca `select("*")` porque
// também RENDERIZA a pessoa; aqui só se conta.
async function contarAcolhimento(): Promise<number> {
  const { data } = await supabase
    .from("membros").select("ultimo_contato_em")
    .eq("tipo_pessoa", "visitante");
  return (data ?? []).filter(m => precisaAcao((m as any).ultimo_contato_em ?? null)).length;
}

// Mesma regra de `AcoesDoDia.tsx`: efemérides DE HOJE (dias_ate_evento===0)
// que ainda não foram cumprimentadas. Não conta `adiante` (os próximos 30
// dias) de propósito — aquilo é aviso prévio, não pendência de hoje; somar
// os dois infla o número com o que ainda não precisa de ação nenhuma.
async function contarAcoesDoDia(): Promise<number> {
  const [eventos, feitas] = await Promise.all([proximosDias(30), felicitacoesDeHoje()]);
  return eventos.filter(ev => ev.dias_ate_evento === 0 && !feitas.has(chaveDaEfemeride(ev))).length;
}

// Mesma soma de `AlertasInteligentes.tsx`: famílias sem responsável +
// pessoas com sobrenome sugerindo vínculo + alunos fora da faixa da classe.
async function contarAlertasInteligentes(): Promise<number> {
  const [fs, ps, vw] = await Promise.all([
    familiasSemResponsavel().catch(() => []),
    pessoasSemFamiliaSugerida().catch(() => []),
    supabase.from("vw_ebd_alertas_idade").select("pessoa_id").limit(50)
      .then(r => r.data ?? [], () => [] as unknown[]),
  ]);
  return fs.length + ps.length + vw.length;
}

// Mesma função de `AssuntosUrgentes.tsx` — atrasados + vencendo essa
// semana, já somados pelo próprio serviço.
async function contarAssuntosUrgentes(): Promise<number> {
  const r = await buscarUrgentesIgreja();
  return r.lista.length;
}

// Mesma soma de `AgendaFiscalUrgente.tsx`, SEM chamar `marcarAtrasados()`
// antes — aquela chamada é uma ESCRITA (promove pendência antiga pra
// "atrasado"), e o contador da sidebar roda em toda carga de página;️
// escrever no banco só porque a pessoa está navegando, não olhando o
// painel fiscal, seria efeito colateral demais para um número.
async function contarAgendaFiscal(): Promise<number> {
  const r = await carregarResumoFiscal();
  return r.total_atrasados + r.total_urgentes + r.total_proximos;
}

/** Conta as pendências prioridade-0 de um painel — soma dos mesmos widgets
 *  que `widgetRegistry.tsx` já declara `prioridade: 0` para aquele painel.
 *  `estrategico` não tem nenhum (medido no registry) e não aparece aqui.
 *  Qualquer falha de uma consulta individual vira 0 pra ela, não derruba o
 *  badge inteiro — mesma prudência de `.catch(() => [])` que os próprios
 *  widgets já usam. */
export async function contarPendenciasP0(painel: PainelDoWidget): Promise<number> {
  const tarefas: Promise<number>[] =
    painel === "pastoral"
      ? [contarAcolhimento(), contarAcoesDoDia(), contarAlertasInteligentes(), contarAssuntosUrgentes()]
    : painel === "secretaria"
      ? [contarAssuntosUrgentes()]
    : painel === "financas"
      ? [contarAgendaFiscal()]
    : [];
  const resultados = await Promise.all(tarefas.map(p => p.catch(() => 0)));
  return resultados.reduce((soma, n) => soma + n, 0);
}

/** Rota do atalho fixo (`ATALHOS_TOPO`) → painel correspondente no
 *  registry, pra quem for pedir a contagem sem precisar repetir o mapa. */
export const PAINEL_POR_ROTA: Record<string, PainelDoWidget> = {
  "/painel-pastoral": "pastoral",
  "/painel-secretaria": "secretaria",
  "/painel-tesouraria": "financas",
};
