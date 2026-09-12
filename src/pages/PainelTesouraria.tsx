// ─── PainelTesouraria.tsx — o trabalho da tesouraria em um lugar ──────────
//
// ── POR QUE ESTE PAINEL EXISTE ─────────────────────────────────────────────
//
// A auditoria de navegação de 08/09/2026 (Raio-X do Diakonia) encontrou o
// maior problema estrutural do sistema: o Painel Pastoral existe, o Painel
// da Secretaria existe, e quem tem o papel `tesouraria` cai na Home genérica
// ao entrar — obrigada a descobrir sozinha o que fazer primeiro em meio a
// nove sub-rotas de `/financas`, o módulo fiscal, a folha e o bazar.
//
// A pista mais direta de que isto já devia existir: `MeusPaineis.tsx` (o
// menu de conta) já tinha um cartão "Tesouraria" com um comentário dizendo
// que ele "leva a uma bancada" — e apontava para `/financas`, que é rico mas
// não é bancada nenhuma: sem frase-resumo, sem prioridade, sem chegada
// automática no login. Este painel cumpre o que aquele comentário prometia.
//
// ── SPRINT 1: FISCAL E CAIXA ────────────────────────────────────────────────
//
// Os dois blocos que respondem pelos dois riscos que custam dinheiro de
// verdade quando alguém deixa passar: Fiscal (multa) e Caixa (dinheiro em
// espécie sem responsável claro).
//
// ── SPRINT 2: PENDÊNCIAS, PRÓXIMOS VENCIMENTOS E ORÇAMENTO ─────────────────
//
// Nenhum dos três precisou de tabela nova — todo o dado já existia em
// `finService.ts`, só nunca priorizado. "Pendências" mistura dois motivos
// (aprovação parada, comprovante faltando) porque os dois competem pela
// mesma atenção mas travam coisas diferentes — o `motivo` de cada linha diz
// qual. Conciliação e o cruzamento com a Diaconia continuam para depois.
//
// ── POR QUE O BLOCO FISCAL EMBUTE O WIDGET, EM VEZ DE RECALCULAR ───────────
//
// `AgendaFiscalUrgente` já existe, já é usado (hoje só dentro de
// `WidgetsDoPainel painel="financas"`, em `/financas`), e já tem o botão de
// avisar a tesouraria por WhatsApp. Reescrever a mesma consulta aqui
// produziria duas fontes da mesma verdade — o defeito que este projeto vem
// evitando a semana toda. `useReportarVazio`, que o widget chama, é inerte
// sem `VazioCtx` (não há esse provider aqui), e é exatamente esse o
// comportamento certo: a seção fica visível dizendo "em ordem" quando não há
// nada — mesma regra do Painel da Secretaria, porque esta também é bancada
// de UMA pessoa, não uma tela pessoal que deve encolher ao mínimo.
//
// ── AS SEÇÕES NÃO SOMEM QUANDO ZERAM ───────────────────────────────────────
//
// Como no Painel da Secretaria, e pelo mesmo motivo: bancada que muda de
// forma toda manhã obriga a reprocurar tudo.
//
// ── SPRINT 4: ALERTAS E O CRUZAMENTO COM A DIACONIA (09/09/2026) ───────────
//
// Fecha o backlog do painel. "Alertas" junta duas fontes que já existiam
// em `finService.ts` sem nunca terem sido priorizadas juntas — anomalias
// do mês e alertas financeiros gerais. O cruzamento com a Diaconia (cestas
// compradas × pessoas atendidas) foi pedido explícito da liderança em
// 03/09/2026 e é a única peça do painel sem par pronto no banco: ver
// `carregarCruzamentoDiaconia()` em `painelTesourariaService.ts` para a
// decisão de como as duas metades (financeiro e Diaconia) se encontram.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign, Receipt, Wallet, ChevronRight, RefreshCw, Sparkles, Package,
  Clock, CalendarClock, Target, ShoppingCart, HandCoins, Scale, Lightbulb,
  HeartHandshake, Users, ScrollText, Layers, Handshake,
  TrendingDown, TrendingUp, RotateCw, Briefcase, LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { carregarResumoFiscal, type ResumoFiscalDashboard } from "@/services/fiscalService";
import {
  brl, resumoFinanceiroMes, type FinVencimento, type FinAlertaCentro, type FinResumoMes,
} from "@/services/finService";
import {
  listarCaixasAbertos, formatarTempoAberto, caixaEhUrgente, type CaixaAberto,
  listarPendencias, type ItemPendencia, type PendenciaLancamento, type PendenciaFechamento, DIAS_JANELA_COMPROVANTE,
  listarVencimentosDaSemana, listarAlertasOrcamento, DIAS_JANELA_VENCIMENTOS,
  listarAlertasTesouraria, type AlertaTesouraria,
  carregarCruzamentoDiaconia, type CruzamentoDiaconia,
} from "@/services/painelTesourariaService";
import { AgendaFiscalUrgente } from "@/components/dashboard/AgendaFiscalUrgente";
import { useAuth } from "@/hooks/useAuth";
import { ROLES_DOADORES, ROLES_PASTORAL_SEM_TITULAR } from "@/components/layout/navConfig";

export default function PainelTesouraria() {
  const { hasRole } = useAuth();
  const [fiscal, setFiscal] = useState<ResumoFiscalDashboard | null>(null);
  // A pergunta que faltava responder: "o painel reflete o módulo
  // financeiro?" — não, ele só mostrava contagem de PROBLEMA (fiscal,
  // caixa, pendência, alerta). Zero número de dinheiro. Achado em
  // 12/09/2026: `resumoFinanceiroMes()` já existe, já alimenta os cards
  // de `/financas` — só nunca tinha sido chamado aqui.
  const [resumo, setResumo] = useState<FinResumoMes | null>(null);
  const [caixas, setCaixas] = useState<CaixaAberto[]>([]);
  const [pendencias, setPendencias] = useState<ItemPendencia[]>([]);
  const [vencimentos, setVencimentos] = useState<FinVencimento[]>([]);
  const [alertasOrc, setAlertasOrc] = useState<FinAlertaCentro[]>([]);
  const [alertas, setAlertas] = useState<AlertaTesouraria[]>([]);
  const [diaconia, setDiaconia] = useState<CruzamentoDiaconia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [f, r, c, p, v, a, al, d] = await Promise.all([
        carregarResumoFiscal(),
        resumoFinanceiroMes(),
        listarCaixasAbertos(),
        listarPendencias(),
        listarVencimentosDaSemana(),
        listarAlertasOrcamento(),
        listarAlertasTesouraria(),
        // A única peça sem par pronto no banco — isolada com o próprio
        // catch, para que uma falha aqui (ministério de Diaconia ainda sem
        // `modulo`, RLS de outra área) não derrube o painel inteiro.
        carregarCruzamentoDiaconia().catch(() => null),
      ]);
      setFiscal(f);
      setResumo(r);
      setCaixas(c);
      setPendencias(p);
      setVencimentos(v);
      setAlertasOrc(a);
      setAlertas(al);
      setDiaconia(d);
      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const totalFiscal = fiscal ? fiscal.total_atrasados + fiscal.total_urgentes + fiscal.total_proximos : 0;
  const caixasUrgentes = caixas.filter(caixaEhUrgente);
  const aprovacoesPendentes = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "aprovacao");
  const semComprovante = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "comprovante");
  const aguardandoConciliacao = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "conciliacao");
  const fechamentosPendentes = pendencias.filter((p): p is PendenciaFechamento => p.motivo === "fechamento");
  const orcamentoCriticos = alertasOrc.filter(a => a.severidade === "critico");
  const alertasCriticos = alertas.filter(a => a.severidade === "critico");

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* Mesma largura e mesmo cabeçalho fixo do Painel Pastoral e do Painel
          da Secretaria — ver os comentários de largura naqueles dois
          arquivos, resolvidos em 27/08/2026. A faixa de indicadores é o
          índice da tela. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-gold shrink-0" />
              Painel da Tesouraria
            </h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={carregar} disabled={carregando}
            className="gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ── Resumo em linguagem natural ──────────────────────────────── */}
        {fiscal && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <span className="min-w-0">
              {resumoNatural(fiscal, caixas, caixasUrgentes, aprovacoesPendentes, semComprovante, aguardandoConciliacao, fechamentosPendentes, vencimentos, orcamentoCriticos, alertasOrc, alertasCriticos, alertas)}
              {atualizadoEm && (
                <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                  · {formatarAtualizadoHa(atualizadoEm)}
                </span>
              )}
            </span>
          </p>
        )}

        {/* ── A faixa de indicadores — índice, não painel de números ──────
            Mesma regra dos outros dois painéis, decidida em 27/08/2026: sem
            `valor`, cada bloco vira atalho de ícone + rótulo + seta. */}
        {fiscal && (
          <FaixaDeIndicadores colunas={6}>
            <Indicador
              rotulo="Fiscal" tom="warning" icone={Receipt}
              onClick={() => irParaSecao("fiscal")} descricao="Ir para Fiscal"
            />
            <Indicador
              rotulo="Caixa" tom="info" icone={Wallet}
              onClick={() => irParaSecao("caixa")} descricao="Ir para Caixa"
            />
            <Indicador
              rotulo="Pendências" tom="warning" icone={Clock}
              onClick={() => irParaSecao("pendencias")} descricao="Ir para Pendências"
            />
            <Indicador
              rotulo="Vencimentos" tom="info" icone={CalendarClock}
              onClick={() => irParaSecao("vencimentos")} descricao="Ir para Próximos vencimentos"
            />
            <Indicador
              rotulo="Orçamento" tom="violeta" icone={Target}
              onClick={() => irParaSecao("orcamento")} descricao="Ir para Orçamento"
            />
            <Indicador
              rotulo="Alertas" tom="gold" icone={Lightbulb}
              onClick={() => irParaSecao("alertas")} descricao="Ir para Alertas"
            />
          </FaixaDeIndicadores>
        )}
      </div>

      {erro && (
        <p className="text-sm text-destructive-text border border-destructive-line rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      {carregando && !fiscal && (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      )}

      {fiscal && (
        <>
          {/* ── Saldo e movimento ─────────────────────────────────────────
              A primeira coisa que faltava: nenhum número de dinheiro no
              painel inteiro, só contagem de problema. `resumoFinanceiroMes()`
              já existia e já alimentava os cards de `/financas` — reaproveitado
              aqui, não recalculado. */}
          {resumo && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-md border border-gold/40 bg-gold/5 p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-gold" /> Saldo total
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-xl text-gold">{brl(resumo.saldo_total)}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-success-text" /> Entradas do mês
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg">{brl(resumo.entradas_mes)}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-destructive-text" /> Saídas do mês
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg">{brl(resumo.saidas_mes)}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-warning-text" /> Previstas (mês)
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg">{brl(resumo.previstas_mes)}</p>
              </div>
            </section>
          )}

          {/* ── Ações rápidas ──────────────────────────────────────────────
              Sprint 3. Não vêm de `quickActionsRegistry.tsx` — medido ao
              construir este bloco: o único consumidor daquele registry é
              `Dashboard.tsx`, e `Dashboard.tsx` não está em nenhuma rota de
              `App.tsx` desde que a Home virou tela pessoal. O registry ficou
              como dado morto, sem ninguém lendo. Corrigir isso é trabalho à
              parte (dar ao registry um campo `paineis`, como o
              `widgetRegistry` já tem, ou apagar o que não serve mais) — aqui
              o objetivo era a tesoureira ter os botões HOJE, não destravar
              o registry inteiro. */}
          <section className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Link to="/financas?lancar=true"><DollarSign className="w-3.5 h-3.5" /> Novo lançamento</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/financas?lancar=true&tipo=entrada"><HandCoins className="w-3.5 h-3.5" /> Registrar oferta</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/arrecadacao"><ShoppingCart className="w-3.5 h-3.5" /> Abrir caixa</Link>
            </Button>
            {/* "Fechar caixa" rola até a seção Caixa desta mesma tela, em vez
                de navegar — ela já lista cada caixa aberto com o link direto
                de fechamento, então sair da página seria um passo a mais. */}
            <Button
              type="button" size="sm" variant="outline" className="gap-1.5"
              onClick={() => irParaSecao("caixa")}
            >
              <Wallet className="w-3.5 h-3.5" /> Fechar caixa
            </Button>
            {/* Conciliação (manual + extrato OFX) ficou pronta em 12/09/2026 —
                mas é sempre de UMA conta por vez (`/financas/conta/:id`), sem
                tela "conciliar tudo" no sistema. Com pendência real na lista
                (a seção Pendências agora conta isso — motivo "conciliacao"),
                o botão pula direto pra conta da primeira pendência, em vez de
                mandar escolher no hub; sem pendência, cai no hub de contas
                mesmo, mais honesto que fingir que sabe onde ir. */}
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to={aguardandoConciliacao.length > 0 ? `/financas/conta/${aguardandoConciliacao[0].conta_id}` : "/financas"}>
                <Scale className="w-3.5 h-3.5" /> Conciliar{aguardandoConciliacao.length > 0 ? ` (${aguardandoConciliacao.length})` : ""}
              </Link>
            </Button>
          </section>

          {/* ── Fiscal ─────────────────────────────────────────────────── */}
          <section id="fiscal" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Receipt} tom="warning" contagem={totalFiscal}>
              Fiscal
            </TituloDaSecao>
            <div className="rounded-md border bg-card p-3">
              <AgendaFiscalUrgente />
            </div>
          </section>

          {/* ── Caixa ──────────────────────────────────────────────────── */}
          <section id="caixa" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Wallet} tom="info" contagem={caixas.length}>
              Caixa
            </TituloDaSecao>
            {caixas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhum caixa aberto no momento.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {caixas.map(c => (
                  <li key={c.id}>
                    {/* A linha inteira é o link, como nas outras listas de
                        painel — chega direto na tela de fechamento, sem
                        passar pelo catálogo de reservas. */}
                    <Link
                      to={`/arrecadacao/caixa/${c.id}`}
                      className="flex items-center gap-2 px-3 py-2.5 min-h-11 group"
                    >
                      <span className="text-sm min-w-0 flex-1">
                        <span className={caixaEhUrgente(c) ? "font-medium text-warning-text" : "font-medium"}>
                          {c.espaco_nome ?? c.finalidade ?? "Caixa"}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}— aberto {formatarTempoAberto(c.aberto_em)}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Pendências ─────────────────────────────────────────────── */}
          <section id="pendencias" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={Clock} tom="warning" contagem={pendencias.length}
              // Vai para a Agenda financeira, não para o hub genérico: é lá
              // que "aguardando aprovação" agora tem os botões Aprovar/
              // Rejeitar (12/09/2026) — o hub só listava sem decidir nada.
              acao={<Link to="/financas/agenda" className="text-sm text-primary hover:underline">Abrir agenda financeira</Link>}
            >
              Pendências
            </TituloDaSecao>
            {pendencias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma aprovação parada, nenhum comprovante faltando, nenhuma conciliação pendente nos últimos {DIAS_JANELA_COMPROVANTE} dias e nenhum mês anterior ficou sem fechar.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {/* Cada linha leva pro lugar exato onde ela se resolve —
                    aprovação/comprovante na agenda, conciliação na conta,
                    fechamento na Prestação de Contas — em vez de só listar
                    sem dar o próximo passo. */}
                {pendencias.slice(0, 8).map(p => (
                  <li key={p.motivo === "fechamento" ? p.id : `${p.motivo}-${p.id}`}>
                    {p.motivo === "fechamento" ? (
                      <Link
                        to={`/financas/prestacao-de-contas?ano=${p.ano}&mes=${p.mes}&qtd=1`}
                        className="flex items-center gap-2 px-3 py-2.5 min-h-11 group"
                      >
                        <span className="text-sm min-w-0 flex-1">
                          <span className="font-medium">{p.rotuloMes}</span>
                          <span className="text-muted-foreground"> · período não fechado</span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                    ) : (
                      <Link
                        to={p.motivo === "conciliacao" ? `/financas/conta/${p.conta_id}` : "/financas/agenda"}
                        className="flex items-center gap-2 px-3 py-2.5 min-h-11 group"
                      >
                        <span className="text-sm min-w-0 flex-1">
                          <span className="font-medium">{p.descricao ?? p.categoria_nome ?? "Lançamento"}</span>
                          <span className="text-muted-foreground"> — {brl(p.valor)}</span>
                          <span className={p.motivo === "aprovacao" ? "text-warning-text" : p.motivo === "conciliacao" ? "text-info-text" : "text-muted-foreground"}>
                            {" "}· {p.motivo === "aprovacao" ? "aguardando aprovação" : p.motivo === "conciliacao" ? "aguardando conciliação" : "sem comprovante"}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                    )}
                  </li>
                ))}
                {pendencias.length > 8 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    + {pendencias.length - 8} outras — veja todas na agenda financeira.
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* ── Próximos vencimentos ──────────────────────────────────── */}
          <section id="vencimentos" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={CalendarClock} tom="info" contagem={vencimentos.length}
              acao={<Link to="/financas/agenda" className="text-sm text-primary hover:underline">Abrir agenda</Link>}
            >
              Próximos vencimentos
            </TituloDaSecao>
            {vencimentos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nada vencendo nos próximos {DIAS_JANELA_VENCIMENTOS} dias.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {vencimentos.slice(0, 8).map(v => (
                  <li key={v.id} className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                    <span className="text-sm min-w-0 flex-1">
                      <span className={v.urgencia === "vencido" ? "font-medium text-destructive-text" : "font-medium"}>
                        {v.descricao ?? v.categoria_nome ?? v.fornecedor_nome ?? "Vencimento"}
                      </span>
                      <span className="text-muted-foreground"> — {brl(v.valor)} · {rotuloVencimento(v)}</span>
                    </span>
                  </li>
                ))}
                {vencimentos.length > 8 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    + {vencimentos.length - 8} outros nos próximos {DIAS_JANELA_VENCIMENTOS} dias.
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* ── Orçamento ──────────────────────────────────────────────── */}
          <section id="orcamento" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={Target} tom="violeta" contagem={alertasOrc.length}
              acao={<Link to="/financas/orcamento" className="text-sm text-primary hover:underline">Abrir Orçamento</Link>}
            >
              Orçamento
            </TituloDaSecao>
            {alertasOrc.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhum centro de custo fora do orçamento.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {alertasOrc.map(a => (
                  <li key={a.centro_id} className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                    <span className="text-sm min-w-0 flex-1">
                      <span className={a.severidade === "critico" ? "font-medium text-destructive-text" : "font-medium text-warning-text"}>
                        {a.titulo}
                      </span>
                      <span className="text-muted-foreground"> — {a.descricao}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Alertas ────────────────────────────────────────────────── */}
          <section id="alertas" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Lightbulb} tom="gold" contagem={alertas.length}>
              Alertas
            </TituloDaSecao>

            {/* O cruzamento com a Diaconia mora aqui dentro, não numa seção
                própria — é um alerta específico, não um bloco do mesmo porte
                que Fiscal ou Caixa. Três estados possíveis: sem ministério
                de Diaconia cadastrado (não renderiza nada), com ministério
                mas sem centro de custo vinculado (mostra o que dá, é
                honesto sobre o que falta) e com os dois (mostra a conta
                inteira). */}
            {diaconia && (
              <div className="rounded-md border bg-card p-3 mb-2 flex items-start gap-2">
                <HeartHandshake className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                <p className="text-sm min-w-0 flex-1">
                  <span className="font-medium">
                    {diaconia.atendimentosMes} {diaconia.atendimentosMes === 1 ? "pessoa atendida" : "pessoas atendidas"} este mês
                  </span>
                  {diaconia.temCentroCusto ? (
                    <span className="text-muted-foreground"> · {brl(diaconia.gastoMes)} gastos com cestas</span>
                  ) : (
                    <span className="text-muted-foreground"> · nenhum centro de custo vinculado à Diaconia ainda, sem como somar o valor gasto</span>
                  )}
                </p>
              </div>
            )}

            {alertas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhum alerta — nada fora do padrão dos últimos 6 meses.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {alertas.map(a => {
                  const linha = (
                    <span className="text-sm min-w-0 flex-1">
                      <span className={a.severidade === "critico" ? "font-medium text-destructive-text" : "font-medium text-warning-text"}>
                        {a.titulo}
                      </span>
                      <span className="text-muted-foreground"> — {a.descricao}</span>
                    </span>
                  );
                  return (
                    <li key={a.id}>
                      {a.to ? (
                        <Link to={a.to} className="flex items-center gap-2 px-3 py-2.5 min-h-11 group">
                          {linha}
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2.5 min-h-11">{linha}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Atalhos ────────────────────────────────────────────────────
              Unificação de 12/09/2026: `/financas` deixou de ter uma grade
              de atalhos (era hub + extrato ao mesmo tempo, duplicava este
              menu inteiro, e foi essa duplicação que quebrou em silêncio
              sem ninguém notar). Esta lista virou o único "menu grande" do
              módulo — mas 17 botões soltos no mesmo peso visual era o
              mesmo erro de novo, só que mudado de endereço: uma bancada de
              trabalho prioriza o que se usa todo dia, não lista tudo junto.
              Duas filas, não uma: o que o tesoureiro mexe toda semana
              primeiro, relatório/config depois — a pessoa não precisa
              escanear 17 botões pra achar "Contas a pagar". */}
          <section className="pt-1 space-y-2.5">
            <TituloDaSecao icone={DollarSign} tom="neutro">Ir para</TituloDaSecao>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Dia a dia</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas"><DollarSign className="w-3.5 h-3.5" /> Contas correntes</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/agenda?tipo=saida"><TrendingDown className="w-3.5 h-3.5" /> Contas a pagar</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/agenda?tipo=entrada"><TrendingUp className="w-3.5 h-3.5" /> Contas a receber</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/doacoes"><HandCoins className="w-3.5 h-3.5" /> Doações</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/recorrencias"><RotateCw className="w-3.5 h-3.5" /> Recorrências</Link>
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Relatórios e módulos</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/relatorio"><Receipt className="w-3.5 h-3.5" /> Malote contábil</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/centros"><Layers className="w-3.5 h-3.5" /> Centros de custo</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/orcamento"><Target className="w-3.5 h-3.5" /> Orçamento</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/estoque"><Package className="w-3.5 h-3.5" /> Estoque</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/folha"><Briefcase className="w-3.5 h-3.5" /> Folha</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/fiscal"><Receipt className="w-3.5 h-3.5" /> Módulo Fiscal</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/reunioes"><Handshake className="w-3.5 h-3.5" /> Reuniões financeiras</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/prestacao-de-contas"><ScrollText className="w-3.5 h-3.5" /> Prestação de Contas</Link>
                </Button>
                {hasRole(ROLES_DOADORES) && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to="/financas/doadores"><Users className="w-3.5 h-3.5" /> Doadores</Link>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/financas/insights"><Sparkles className="w-3.5 h-3.5" /> Insights</Link>
                </Button>
                {hasRole(ROLES_PASTORAL_SEM_TITULAR) && (
                  <>
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to="/financas/executivo"><LineChart className="w-3.5 h-3.5" /> Visão Executiva</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to="/financas/dre"><ScrollText className="w-3.5 h-3.5" /> DRE Eclesiástica</Link>
                    </Button>
                  </>
                )}
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/arrecadacao"><ShoppingCart className="w-3.5 h-3.5" /> Bazar e Cantina</Link>
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * "vencido há 3d" · "vence hoje" · "vence em 4d" — a partir de `dias_para_vencer`,
 * que a view `vw_fin_proximos_vencimentos` já calcula.
 */
function rotuloVencimento(v: FinVencimento): string {
  if (v.dias_para_vencer < 0) return `vencido há ${Math.abs(v.dias_para_vencer)}d`;
  if (v.dias_para_vencer === 0) return "vence hoje";
  return `vence em ${v.dias_para_vencer}d`;
}

/**
 * A frase que abre o painel — mesma régua dos outros dois: urgência primeiro
 * (o que gera multa, deixa dinheiro sem responsável ou trava uma decisão),
 * fila depois.
 */
function resumoNatural(
  fiscal: ResumoFiscalDashboard,
  caixas: CaixaAberto[],
  caixasUrgentes: CaixaAberto[],
  aprovacoesPendentes: PendenciaLancamento[],
  semComprovante: PendenciaLancamento[],
  aguardandoConciliacao: PendenciaLancamento[],
  fechamentosPendentes: PendenciaFechamento[],
  vencimentos: FinVencimento[],
  orcamentoCriticos: FinAlertaCentro[],
  alertasOrc: FinAlertaCentro[],
  alertasCriticos: AlertaTesouraria[],
  alertas: AlertaTesouraria[],
): string {
  const partes: string[] = [];

  if (fiscal.total_atrasados > 0) {
    partes.push(`${fiscal.total_atrasados} ${fiscal.total_atrasados === 1
      ? "obrigação fiscal atrasada" : "obrigações fiscais atrasadas"}`);
  }
  if (caixasUrgentes.length > 0) {
    partes.push(`${caixasUrgentes.length} ${caixasUrgentes.length === 1
      ? "caixa aberto há mais de um dia" : "caixas abertos há mais de um dia"}`);
  }
  // Aprovação parada é decisão que trava outra pessoa — mesmo peso do que
  // gera multa, porque também não se resolve sozinha.
  if (aprovacoesPendentes.length > 0) {
    partes.push(`${aprovacoesPendentes.length} ${aprovacoesPendentes.length === 1
      ? "aprovação pendente" : "aprovações pendentes"}`);
  }
  if (orcamentoCriticos.length > 0) {
    partes.push(`${orcamentoCriticos.length} ${orcamentoCriticos.length === 1
      ? "centro de custo acima do orçamento" : "centros de custo acima do orçamento"}`);
  }
  if (alertasCriticos.length > 0) {
    partes.push(`${alertasCriticos.length} ${alertasCriticos.length === 1
      ? "alerta crítico" : "alertas críticos"}`);
  }
  if (partes.length > 0) return `Atenção: ${partes.join(", ")}.`;

  // ── A FILA NÃO ENTRA NA FRASE QUANDO HÁ URGÊNCIA ─────────────────────
  // Mesma regra do Painel da Secretaria: o total só aparece quando não há
  // nada gritando, senão compete com o que a seção logo abaixo já diz.
  const fila: string[] = [];
  if (fiscal.total_urgentes > 0) {
    fila.push(`${fiscal.total_urgentes} ${fiscal.total_urgentes === 1
      ? "obrigação vencendo em breve" : "obrigações vencendo em breve"}`);
  }
  if (caixas.length > 0) {
    fila.push(`${caixas.length} ${caixas.length === 1 ? "caixa aberto" : "caixas abertos"}`);
  }
  if (semComprovante.length > 0) {
    fila.push(`${semComprovante.length} ${semComprovante.length === 1
      ? "lançamento sem comprovante" : "lançamentos sem comprovante"}`);
  }
  if (aguardandoConciliacao.length > 0) {
    fila.push(`${aguardandoConciliacao.length} ${aguardandoConciliacao.length === 1
      ? "lançamento aguardando conciliação" : "lançamentos aguardando conciliação"}`);
  }
  if (fechamentosPendentes.length > 0) {
    fila.push(`${fechamentosPendentes[0].rotuloMes} sem fechar`);
  }
  if (vencimentos.length > 0) {
    fila.push(`${vencimentos.length} ${vencimentos.length === 1
      ? "vencimento nos próximos dias" : "vencimentos nos próximos dias"}`);
  }
  if (alertasOrc.length > 0) {
    fila.push(`${alertasOrc.length} ${alertasOrc.length === 1
      ? "centro de custo em atenção" : "centros de custo em atenção"}`);
  }
  // `alertasCriticos` já entrou na urgência acima — aqui só o restante
  // (severidade "atenção"), senão o mesmo alerta apareceria duas vezes.
  const alertasEmAtencao = alertas.length - alertasCriticos.length;
  if (alertasEmAtencao > 0) {
    fila.push(`${alertasEmAtencao} ${alertasEmAtencao === 1 ? "alerta" : "alertas"} em atenção`);
  }
  if (fila.length === 0) return "Fiscal em dia, nenhum caixa aberto e nada pendente — tudo em ordem! 🙏";
  return `Nada urgente. Na fila: ${fila.join(", ")}.`;
}
