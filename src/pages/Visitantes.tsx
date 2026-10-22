// ─── Visitantes — a CENTRAL DE ACOLHIMENTO ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): a tela deixa de ser um painel de visitantes e vira uma central que, ao abrir, responde sozinha: quem precisa de cuidado? quem não voltou? quem devo contatar hoje? qual a próxima
// ação? como está o funil? De cima para baixo: a frase do dia · cinco cartões (que também filtram) · o funil · a lista por PRIORIDADE (cada visitante com a próxima ação e a linha do tempo) · e, por último e
// recolhido, o QR Code. O QR e as tarefas, que são operacionais, saíram do primeiro plano; o que pede cuidado subiu.
//
// A regra (prioridade, próxima ação, funil) está em `lib/centralDeAcolhimento.ts`; os dados e as ações, em `services/centralDeAcolhimentoService.ts`.
// `?aba=` continua valendo para os painéis que apontam para cá: acao → "Contatar hoje", nao_voltou, todos.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ListState";
import VisitanteDialog from "@/components/membros/VisitanteDialog";
import ContatoResultadoDialog from "@/components/membros/ContatoResultadoDialog";
import { CartaoDeAcolhimento, type AcoesDoCartao } from "@/components/acolhimento/CartaoDeAcolhimento";
import { EnviarMensagemDialog, type AlvoDaMensagem } from "@/components/acolhimento/EnviarMensagemDialog";
import { FunilDeAcolhimento } from "@/components/acolhimento/FunilDeAcolhimento";
import { IndicadoresDeAcolhimento, fraseDoDia } from "@/components/acolhimento/IndicadoresDeAcolhimento";
import { QrCompacto } from "@/components/acolhimento/QrCompacto";
import { useMensagensVisitante } from "@/hooks/useMensagensVisitante";
import { hojeLocal } from "@/lib/data";
import { classificar, filtrar, filtroDaUrl, funil, indicadores, ROTULO_DO_FILTRO, type FiltroDaCentral, type Prioridade, type VisitanteDaCentral } from "@/lib/centralDeAcolhimento";
import { situacaoPelaEtapa } from "@/lib/mensagemDoVisitante";
import { calcularEtapa, getMensagem } from "@/lib/visitantesFluxo";
import * as real from "@/services/centralDeAcolhimentoService";
import type { DadosDaCentral, Resultado, TarefaAcolhimento, VisitanteMembro } from "@/services/centralDeAcolhimentoService";

/** O que a página usa do serviço — injetável para teste e para a verificação visual sem banco. */
export interface ServicoDaCentral {
  carregar: () => Promise<DadosDaCentral>;
  registrarContato: (v: VisitanteMembro, tipo: string, observacao: string) => Promise<Resultado>;
  registrarRetorno: (v: VisitanteMembro) => Promise<Resultado>;
  marcarRetornoFeito: (checkinIds: readonly string[]) => Promise<Resultado>;
  promover: (v: VisitanteMembro, para: "congregado" | "membro") => Promise<Resultado>;
  alternarTarefa: (id: string, concluida: boolean) => Promise<Resultado>;
}
const SERVICO_REAL: ServicoDaCentral = {
  carregar: real.carregarCentral, registrarContato: real.registrarContato, registrarRetorno: real.registrarRetorno, marcarRetornoFeito: real.marcarRetornoFeito, promover: real.promover,
  alternarTarefa: real.alternarTarefaAcolhimento as ServicoDaCentral["alternarTarefa"],
};

const TOM_DA_FRASE = {
  critico: "border-destructive-line bg-destructive-soft text-destructive-text",
  aviso: "border-warning-line bg-warning-soft text-warning-text",
  ok: "border-success-line bg-success-soft text-success-text",
} as const;
const TITULO_DO_GRUPO: Record<Prioridade, string> = { alta: "Alta prioridade", media: "Média prioridade", baixa: "Em dia" };

const VAZIO: Record<FiltroDaCentral, { message: string; descricao: string }> = {
  hoje: { message: "Ninguém para contatar hoje", descricao: "Todos os visitantes foram procurados nos últimos dias. Quando alguém chegar ou passar do prazo, o nome aparece aqui." },
  cuidado: { message: "Ninguém em alerta", descricao: "Nenhum pedido de oração ou de contato esperando, e ninguém sem o primeiro contato." },
  nao_voltou: { message: "Todos voltaram ou ainda estão no prazo", descricao: "Aparecem aqui os visitantes com uma só visita e mais de 15 dias desde o cadastro." },
  retornaram: { message: "Ninguém retornou ainda", descricao: "Quem voltar uma segunda vez aparece aqui." },
  todos: { message: "Nenhum visitante cadastrado", descricao: "Quem chegar pelo QR Code do cadastro entra aqui, já com a primeira ação sugerida." },
};

export default function Visitantes({ servico = SERVICO_REAL }: { servico?: ServicoDaCentral }) {
  const [params] = useSearchParams();
  const [filtro, setFiltro] = useState<FiltroDaCentral>(() => filtroDaUrl(params.get("aba")));
  const [dados, setDados] = useState<DadosDaCentral | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [tarefaOcupada, setTarefaOcupada] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<VisitanteMembro | null>(null);
  const [contatoAlvo, setContatoAlvo] = useState<VisitanteMembro | null>(null);
  const [mensagemAlvo, setMensagemAlvo] = useState<AlvoDaMensagem | null>(null);
  const pacote = useMensagensVisitante();
  const hoje = hojeLocal();

  const carregar = useCallback(async () => {
    setErro(null);
    try { setDados(await servico.carregar()); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar os visitantes."); }
    finally { setCarregando(false); }
  }, [servico]);
  useEffect(() => { void carregar(); }, [carregar]);

  const membros = useMemo(() => new Map((dados?.visitantes ?? []).map(v => [v.id, v])), [dados]);
  const lista = useMemo<VisitanteDaCentral[]>(
    () => (dados?.visitantes ?? []).map(v => classificar(real.paraBase(v, dados?.pedidos.get(v.id)), hoje)),
    [dados, hoje],
  );
  const ind = useMemo(() => indicadores(lista), [lista]);
  const etapas = useMemo(() => funil(lista, dados?.conversoes ?? 0), [lista, dados]);
  const motorDeTarefas = useMemo(() => {
    const todas = Object.values(dados?.tarefas ?? {}).flat();
    const feitas = todas.filter(t => t.concluida).length;
    return { feitas, total: todas.length, pct: todas.length ? Math.round((feitas / todas.length) * 100) : 0 };
  }, [dados]);
  const visiveis = useMemo(() => filtrar(lista, filtro), [lista, filtro]);
  const grupos = useMemo(() => (["alta", "media", "baixa"] as Prioridade[]).map(p => ({ p, itens: visiveis.filter(v => v.prioridade === p) })).filter(g => g.itens.length > 0), [visiveis]);
  const chegaramHoje = useMemo(() => lista.filter(v => v.diasDesdeCadastro === 0).length, [lista]);
  const frase = fraseDoDia(ind);

  // ── ações ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Executa uma ação que grava, mostra o resultado e recarrega. */
  async function agir(v: { id: string }, tarefa: () => Promise<Resultado>, sucesso: string) {
    setOcupado(v.id);
    const r = await tarefa();
    setOcupado(null);
    if (!r.ok) { toast.error(r.erro); return false; }
    toast.success(sucesso);
    await carregar();
    return true;
  }
  function abrirMensagem(v: VisitanteDaCentral) {
    const m = membros.get(v.id);
    if (!m) return;
    const etapa = calcularEtapa(m.numero_visitas ?? 1, m.created_at);
    setMensagemAlvo({ id: m.id, nome: m.nome_completo, telefone: m.telefone_celular ?? null, situacaoInicial: situacaoPelaEtapa(etapa, m.data_nascimento ?? null, hoje), textoAntigo: getMensagem(etapa, m.nome_completo) });
  }

  const acoes: AcoesDoCartao = {
    onAcao: (v, botao) => {
      const m = membros.get(v.id);
      if (!m) return;
      if (botao === "whatsapp") abrirMensagem(v);
      else if (botao === "abrir_ficha") setSelecionado(m);
      else if (botao === "promover" && v.sugestaoDePromocao) void agir(v, () => servico.promover(m, v.sugestaoDePromocao!), `${v.nome.split(" ")[0]} deu o próximo passo! 🎉`);
    },
    onMensagem: abrirMensagem,
    onContato: v => { const m = membros.get(v.id); if (m) setContatoAlvo(m); },
    onRetorno: v => { const m = membros.get(v.id); if (m) void agir(v, () => servico.registrarRetorno(m), "Retorno registrado!"); },
    onRetornoFeito: v => { if (v.pedido && "checkinIds" in v.pedido) void agir(v, () => servico.marcarRetornoFeito((v.pedido as unknown as { checkinIds: string[] }).checkinIds), `${v.nome.split(" ")[0]} saiu da fila de cuidado`); },
    onToggleTarefa: async (t: TarefaAcolhimento) => {
      setTarefaOcupada(t.id);
      const r = await servico.alternarTarefa(t.id, !t.concluida);
      setTarefaOcupada(null);
      if (!r.ok) { toast.error(r.erro); return; }
      setDados(d => d ? { ...d, tarefas: { ...d.tarefas, [t.visitante_id]: (d.tarefas[t.visitante_id] ?? []).map(x => (x.id === t.id ? { ...x, concluida: !t.concluida } : x)) } } : d);
    },
  };

  return (
    <div>
      <PageHeader
        title="Central de Acolhimento"
        description="Quem precisa de cuidado, quem não voltou e o que fazer hoje"
        actions={<Button asChild variant="outline" className="gap-2"><Link to="/membros"><ArrowRight className="h-4 w-4" /><span translate="no">Ver em Pessoas</span></Link></Button>}
      />
      <div className="space-y-4 p-4 md:p-8">
        {carregando ? <ListSkeleton count={4} /> : erro ? <ErrorState onRetry={carregar} /> : (
          <>
            <p role="status" data-frase-do-dia className={`rounded-lg border px-4 py-3 text-sm font-semibold ${TOM_DA_FRASE[frase.tom]}`} translate="no">{frase.texto}</p>
            <IndicadoresDeAcolhimento ind={ind} filtro={filtro} onFiltro={setFiltro} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="lg:col-start-2 lg:row-start-1"><FunilDeAcolhimento etapas={etapas} tarefas={motorDeTarefas} /></div>

              <section aria-label="Visitantes por prioridade" className="min-w-0 space-y-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold" translate="no">{ROTULO_DO_FILTRO[filtro]} <span className="font-normal text-muted-foreground">· {visiveis.length}</span></h2>
                  {filtro !== "todos" && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFiltro("todos")}>Ver todos ({lista.length})</Button>}
                </div>
                {visiveis.length === 0
                  ? <EmptyState message={(lista.length === 0 ? VAZIO.todos : VAZIO[filtro]).message} descricao={(lista.length === 0 ? VAZIO.todos : VAZIO[filtro]).descricao} />
                  : grupos.map(g => (
                    <div key={g.p} className="space-y-3" data-grupo={g.p}>
                      {(grupos.length > 1 || g.p !== "alta") && <h3 className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{TITULO_DO_GRUPO[g.p]} · {g.itens.length}</h3>}
                      {g.itens.map(v => <CartaoDeAcolhimento key={v.id} v={v} ocupado={ocupado === v.id} tarefas={dados?.tarefas[v.id] ?? []} tarefaOcupada={tarefaOcupada} acoes={acoes} />)}
                    </div>
                  ))}
              </section>

              <div className="lg:col-start-2 lg:row-start-2"><QrCompacto chegaramHoje={chegaramHoje} /></div>
            </div>
          </>
        )}
      </div>

      <VisitanteDialog open={!!selecionado} onOpenChange={o => { if (!o) setSelecionado(null); }} pessoa={selecionado} onSaved={carregar} />
      <EnviarMensagemDialog alvo={mensagemAlvo} pacote={pacote} onFechar={() => setMensagemAlvo(null)}
        onAberto={alvo => { setMensagemAlvo(null); const m = membros.get(alvo.id); if (m) setContatoAlvo(m); }} />
      <ContatoResultadoDialog open={!!contatoAlvo} onOpenChange={o => { if (!o) setContatoAlvo(null); }} nomeVisitante={contatoAlvo?.nome_completo ?? ""} saving={ocupado === contatoAlvo?.id}
        onConfirm={async (tipo, obs) => { const m = contatoAlvo; if (!m) return; await agir(m, () => servico.registrarContato(m, tipo, obs), `Contato registrado para ${m.nome_completo.split(" ")[0]}! ✅`); setContatoAlvo(null); }} />
    </div>
  );
}
