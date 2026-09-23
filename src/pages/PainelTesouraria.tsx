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
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  DollarSign, Receipt, Wallet, ChevronRight, RefreshCw, Sparkles, Package,
  Clock, CalendarClock, Target, HandCoins, Scale, Lightbulb,
  HeartHandshake, Users, ScrollText, Layers, Handshake, MoreHorizontal,
  TrendingDown, TrendingUp, RotateCw, Briefcase, LineChart, Building2, FolderKanban,
  Globe2, Archive, BookOpenCheck, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { CampoData } from "@/components/CampoData";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { carregarResumoFiscal, type ResumoFiscalDashboard } from "@/services/fiscalService";
import {
  brl, resumoFinanceiroMes, listarProjetos, listarCategorias, listarLancamentosSemTeto,
  type FinVencimento, type FinAlertaCentro, type FinResumoMes,
  type FinProjeto, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  listarPendencias, type ItemPendencia, type PendenciaLancamento, type PendenciaFechamento, DIAS_JANELA_COMPROVANTE,
  listarVencimentosDaSemana, listarAlertasOrcamento, DIAS_JANELA_VENCIMENTOS,
  listarAlertasTesouraria, type AlertaTesouraria,
  carregarMesaTesoureiro, type MesaTesoureiro,
  carregarCruzamentoDiaconia, type CruzamentoDiaconia,
} from "@/services/painelTesourariaService";
import { AgendaFiscalUrgente } from "@/components/dashboard/AgendaFiscalUrgente";
import { useAuth } from "@/hooks/useAuth";
import { hojeLocal } from "@/lib/data";
import { ROLES_DOADORES, ROLES_PASTORAL_SEM_TITULAR } from "@/components/layout/navConfig";

export default function PainelTesouraria() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [fiscal, setFiscal] = useState<ResumoFiscalDashboard | null>(null);
  // A pergunta que faltava responder: "o painel reflete o módulo
  // financeiro?" — não, ele só mostrava contagem de PROBLEMA (fiscal,
  // caixa, pendência, alerta). Zero número de dinheiro. Achado em
  // 12/09/2026: `resumoFinanceiroMes()` já existe, já alimenta os cards
  // de `/financas` — só nunca tinha sido chamado aqui.
  const [resumo, setResumo] = useState<FinResumoMes | null>(null);
  const [pendencias, setPendencias] = useState<ItemPendencia[]>([]);
  const [vencimentos, setVencimentos] = useState<FinVencimento[]>([]);
  const [alertasOrc, setAlertasOrc] = useState<FinAlertaCentro[]>([]);
  const [alertas, setAlertas] = useState<AlertaTesouraria[]>([]);
  const [mesa, setMesa] = useState<MesaTesoureiro | null>(null);
  const [diaconia, setDiaconia] = useState<CruzamentoDiaconia | null>(null);
  // Pedido dela (22/09/2026): "o que foi construído no módulo financeiro é
  // robusto demais para ficar lá embaixo do painel" — projetos em
  // andamento passam de link solto em "Ir para" a seção viva, com
  // progresso calculado (mesma conta de `FinancasProjetoDetalhe.tsx`:
  // soma de entradas por projeto, não um campo "arrecadado" guardado —
  // não existe, e duplicar em uma coluna nova divergiria da tela de
  // detalhe assim que alguém lançasse algo sem passar por aqui).
  const [projetos, setProjetos] = useState<{ projeto: FinProjeto; arrecadado: number }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [f, r, proj, p, v, a, al, m, d] = await Promise.all([
        carregarResumoFiscal(),
        resumoFinanceiroMes(),
        listarProjetos().then(ativos => Promise.all(ativos.map(async projeto => {
          const entradas = await listarLancamentosSemTeto({ projetoId: projeto.id, tipo: "entrada" });
          return { projeto, arrecadado: entradas.reduce((s, l) => s + Number(l.valor), 0) };
        }))),
        listarPendencias(),
        listarVencimentosDaSemana(),
        listarAlertasOrcamento(),
        listarAlertasTesouraria(),
        carregarMesaTesoureiro(),
        // A única peça sem par pronto no banco — isolada com o próprio
        // catch, para que uma falha aqui (ministério de Diaconia ainda sem
        // `modulo`, RLS de outra área) não derrube o painel inteiro.
        carregarCruzamentoDiaconia().catch(() => null),
      ]);
      setFiscal(f);
      setResumo(r);
      setProjetos(proj);
      setPendencias(p);
      setVencimentos(v);
      setAlertasOrc(a);
      setAlertas(al);
      setMesa(m);
      setDiaconia(d);
      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ofertas para Missões, filtrável por período ──────────────────────────
  //
  // Pedido dela (22/09/2026): "ver de forma rápida... as ofertas para
  // missões, filtrando por calendário entre datas". Categoria já existe no
  // Plano de Contas Oficial (migration 20260912190000) — "Ofertas para
  // Missões", tipo entrada. Resolve o id UMA vez (a categoria não muda em
  // tempo de execução), separado da busca por período, que roda de novo a
  // cada troca de data sem precisar reconsultar a categoria.
  const [categoriaMissoesId, setCategoriaMissoesId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    listarCategorias("entrada")
      .then(cats => setCategoriaMissoesId(cats.find(c => c.nome === "Ofertas para Missões")?.id ?? null))
      .catch(() => setCategoriaMissoesId(null));
  }, []);

  const hoje = hojeLocal();
  const [missoesInicio, setMissoesInicio] = useState(() => hoje.slice(0, 7) + "-01");
  const [missoesFim, setMissoesFim] = useState(hoje);
  const [missoesLancamentos, setMissoesLancamentos] = useState<FinLancamentoExtenso[] | null>(null);
  const [carregandoMissoes, setCarregandoMissoes] = useState(true);

  const carregarMissoes = useCallback(async () => {
    if (categoriaMissoesId === undefined) return;
    if (categoriaMissoesId === null) { setMissoesLancamentos([]); setCarregandoMissoes(false); return; }
    setCarregandoMissoes(true);
    try {
      const lancs = await listarLancamentosSemTeto({
        tipo: "entrada", categoriaId: categoriaMissoesId,
        dataInicio: missoesInicio, dataFim: missoesFim,
      });
      setMissoesLancamentos(lancs);
    } catch {
      setMissoesLancamentos([]);
    } finally {
      setCarregandoMissoes(false);
    }
  }, [categoriaMissoesId, missoesInicio, missoesFim]);

  useEffect(() => { carregarMissoes(); }, [carregarMissoes]);
  const totalMissoes = (missoesLancamentos ?? []).reduce((s, l) => s + Number(l.valor), 0);

  // Destino do "Ver tudo" que N1 acrescentou ao menu lateral do
  // Financeiro (`navConfig.ts`) — `irParaSecao` já existia, mas só era
  // chamada de DENTRO desta página (pelos `Indicador` da faixa); vindo de
  // outra tela via `/painel-tesouraria#ir-para`, o React Router troca de
  // rota sem rolar pra hash nenhum sozinho (isso é comportamento nativo
  // do navegador numa âncora `<a>`, não algo que o client-side routing
  // faça de graça).
  //
  // Precisa esperar `carregando` virar `false`: achado ao vivo — rolar no
  // primeiro render (com `carregando` ainda `true`) calcula a posição de
  // "Ir para" com a página ainda curta (seções em skeleton/vazias antes
  // do `carregar()` terminar); quando o dado chega e a página cresce, a
  // posição calculada já ficou velha e a rolagem visualmente não bate em
  // lugar nenhum. Disparar só depois do carregamento acabar garante medir
  // a altura final da página.
  const location = useLocation();
  useEffect(() => {
    if (location.hash === "#ir-para" && !carregando) irParaSecao("ir-para");
  }, [location.hash, carregando]);

  const totalFiscal = fiscal ? fiscal.total_atrasados + fiscal.total_urgentes + fiscal.total_proximos : 0;
  const aprovacoesPendentes = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "aprovacao");
  const semComprovante = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "comprovante");
  const aguardandoConciliacao = pendencias.filter((p): p is PendenciaLancamento => p.motivo === "conciliacao");
  const fechamentosPendentes = pendencias.filter((p): p is PendenciaFechamento => p.motivo === "fechamento");
  const orcamentoCriticos = alertasOrc.filter(a => a.severidade === "critico");
  const alertasCriticos = alertas.filter(a => a.severidade === "critico");

  // ── Mesa do Tesoureiro (Fase 9, 22/09/2026) ─────────────────────────────
  // Quatro dos seis números nascem de `vencimentos`, já carregado acima —
  // sem consulta nova. Só olham SAÍDA: a mesa é o relógio de PAGAR, não de
  // receber (a seção "Próximos vencimentos" logo abaixo continua com os
  // dois tipos, para quem precisa da visão completa).
  const vencimentosSaida = vencimentos.filter(v => v.tipo === "saida");
  const venceHoje = vencimentosSaida.filter(v => v.urgencia === "vence_hoje");
  const venceAmanha = vencimentosSaida.filter(v => v.dias_para_vencer === 1);
  const atrasadosPagar = vencimentosSaida.filter(v => v.urgencia === "vencido");
  const valorSemanaPagar = vencimentosSaida
    .filter(v => v.dias_para_vencer >= 0 && v.dias_para_vencer <= DIAS_JANELA_VENCIMENTOS)
    .reduce((s, v) => s + Number(v.valor), 0);

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
              {resumoNatural(fiscal, aprovacoesPendentes, semComprovante, aguardandoConciliacao, fechamentosPendentes, vencimentos, orcamentoCriticos, alertasOrc, alertasCriticos, alertas)}
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
          <FaixaDeIndicadores colunas={8}>
            <Indicador
              rotulo="Mesa" tom="gold" icone={Wallet}
              onClick={() => irParaSecao("mesa")} descricao="Ir para a Mesa do Tesoureiro"
            />
            <Indicador
              rotulo="Fiscal" tom="warning" icone={Receipt}
              onClick={() => irParaSecao("fiscal")} descricao="Ir para Fiscal"
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
              rotulo="Projetos" tom="violeta" icone={FolderKanban}
              onClick={() => irParaSecao("projetos")} descricao="Ir para Projetos em andamento"
            />
            <Indicador
              rotulo="Missões" tom="info" icone={Globe2}
              onClick={() => irParaSecao("missoes")} descricao="Ir para Ofertas para Missões"
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
                <p className="font-semibold tabular-nums mt-0.5 text-lg text-success-text">{brl(resumo.entradas_mes)}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-destructive-text" /> Saídas do mês
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg text-destructive-text">{brl(resumo.saidas_mes)}</p>
              </div>
              {/* U5/U6 do roadmap "90 Dias" (22/09/2026): "previsto" tinha a
                  MESMA cor de "realizado" (Entradas/Saídas acima) — os três
                  valores eram texto simples, só o ícone pequeno diferia.
                  Cor própria (warning, igual ao ícone) + borda tracejada:
                  "previsto" precisa parecer diferente de "já aconteceu" à
                  distância, não só de perto. */}
              <div className="rounded-md border border-dashed p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-warning-text" /> Previstas (mês)
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg text-warning-text">{brl(resumo.previstas_mes)}</p>
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
          {/* PA1 do roadmap "90 Dias" (22/09/2026): eram 5 botões do mesmo
              peso visual (só "Novo lançamento" tinha cor própria) —
              disputando atenção logo abaixo dos cartões de saldo. 1 botão
              primário + "Mais ações" num menu: a ação mais comum continua
              visível de cara, o resto está a um clique, não a zero. */}
          <section className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Link to="/financas?lancar=true"><DollarSign className="w-3.5 h-3.5" /> Novo lançamento</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="gap-1.5">
                  <MoreHorizontal className="w-3.5 h-3.5" /> Mais ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link to="/financas?lancar=true&tipo=entrada">
                    <HandCoins className="w-4 h-4 mr-2 text-muted-foreground" /> Registrar oferta
                  </Link>
                </DropdownMenuItem>
                {/* "Abrir caixa"/"Fechar caixa" SAÍRAM daqui em 22/09/2026,
                    pedido dela: caixa é Bazar e Cantina, gerido pelo
                    ministério de Administração — não é gesto de tesouraria,
                    é gesto de quem opera o bazar. Mora no painel daquele
                    ministério (`SecaoArrecadacao.tsx`, já existia). */}
                {/* Conciliação (manual + extrato OFX) ficou pronta em
                    12/09/2026 — mas é sempre de UMA conta por vez
                    (`/financas/conta/:id`), sem tela "conciliar tudo" no
                    sistema. Com pendência real na lista (a seção Pendências
                    já conta isso — motivo "conciliacao"), o item pula
                    direto pra conta da primeira pendência, em vez de mandar
                    escolher no hub; sem pendência, cai no hub de contas
                    mesmo, mais honesto que fingir que sabe onde ir. */}
                <DropdownMenuItem asChild>
                  <Link to={aguardandoConciliacao.length > 0 ? `/financas/conta/${aguardandoConciliacao[0].conta_id}` : "/financas"}>
                    <Scale className="w-4 h-4 mr-2 text-muted-foreground" />
                    Conciliar{aguardandoConciliacao.length > 0 ? ` (${aguardandoConciliacao.length})` : ""}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </section>

          {/* ── Mesa do Tesoureiro ───────────────────────────────────────
              Fase 9 do roadmap Financeiro ERP (22/09/2026), pedido dela ao
              validar a Central de Pagamentos (Fase 8): os seis números que
              respondem "o que preciso decidir hoje, sem entrar em nenhuma
              seção?". Mesmo componente `Indicador`/`FaixaDeIndicadores` já
              usado com `valor` no Painel Pastoral (seção "Entrando", faixa
              de visitantes) — aqui não é a faixa-índice do topo (aquela
              perdeu os números em 27/08/2026, pedido dela: "competiam com
              o conteúdo"), é uma SEÇÃO com número de verdade, como aquela.
              "Anexos faltando" não tem clique — a tela de gerenciar anexos
              de um lançamento ainda não existe (schema e serviço prontos
              desde a Fase 7; a tela é a próxima peça pendente). */}
          <section id="mesa" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Wallet} tom="gold">Mesa do Tesoureiro</TituloDaSecao>
            <FaixaDeIndicadores colunas={6}>
              <Indicador
                rotulo="Vence hoje/amanhã" valor={venceHoje.length + venceAmanha.length}
                tom={venceHoje.length > 0 ? "warning" : "info"}
                onClick={() => irParaSecao("vencimentos")}
                descricao={`${venceHoje.length} hoje, ${venceAmanha.length} amanhã — ir para Próximos vencimentos`}
              />
              <Indicador
                rotulo="Atrasados" valor={atrasadosPagar.length} tom="warning"
                onClick={() => irParaSecao("vencimentos")} descricao="Ir para Próximos vencimentos"
              />
              <Indicador
                rotulo="Valor da semana" valor={brl(valorSemanaPagar)} tom="gold"
                onClick={() => irParaSecao("vencimentos")}
                descricao={`A pagar nos próximos ${DIAS_JANELA_VENCIMENTOS} dias — ir para Próximos vencimentos`}
              />
              <Indicador
                rotulo="Pix pendentes" valor={mesa ? mesa.pixPendentes : "—"} tom="info"
                onClick={() => navigate("/financas/agenda?tipo=saida")}
                descricao="Compromissos com chave Pix pronta — ir para a Central de Pagamentos"
              />
              <Indicador
                rotulo="Conciliações" valor={aguardandoConciliacao.length} tom="warning"
                onClick={() => navigate(aguardandoConciliacao.length > 0
                  ? `/financas/conta/${aguardandoConciliacao[0].conta_id}` : "/financas")}
                descricao="Ir para conciliar"
              />
              <Indicador
                rotulo="Anexos faltando" valor={mesa ? mesa.anexosFaltando : "—"} tom="warning"
              />
            </FaixaDeIndicadores>
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

          {/* Caixa SAIU daqui em 22/09/2026 — era 100% dado de Bazar e
              Cantina (`arr_caixas`), nunca de tesouraria/financeiro de
              verdade. Já mora no painel certo: `SecaoArrecadacao.tsx`,
              dentro do painel do ministério de Administração. */}

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

          {/* ── Projetos em andamento ─────────────────────────────────────
              Pedido dela (22/09/2026): "precisamos ver de forma rápida o
              que é um projeto em andamento" — antes só existia como link
              solto em "Ir para", sem número nenhum. Progresso = mesma
              conta de `FinancasProjetoDetalhe.tsx` (soma de entradas do
              projeto ÷ meta), calculada em `carregar()` acima — não uma
              segunda fonte de verdade, e por isso também não existe uma
              coluna "arrecadado" gravada em `fin_projetos`. */}
          <section id="projetos" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={FolderKanban} tom="violeta" contagem={projetos.length}
              acao={<Link to="/financas/projetos" className="text-sm text-primary hover:underline">Abrir Projetos</Link>}
            >
              Projetos em andamento
            </TituloDaSecao>
            {projetos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhum projeto ativo no momento.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {projetos.map(({ projeto, arrecadado }) => {
                  const pct = projeto.meta_valor ? Math.min(100, (arrecadado / projeto.meta_valor) * 100) : null;
                  return (
                    <li key={projeto.id}>
                      <Link to={`/financas/projeto/${projeto.id}`} className="flex flex-col gap-1.5 px-3 py-2.5 group">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium min-w-0 flex-1 truncate">{projeto.nome}</span>
                          <span className="text-sm text-muted-foreground shrink-0">
                            {brl(arrecadado)}{projeto.meta_valor ? ` de ${brl(projeto.meta_valor)}` : ""}
                          </span>
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        {pct != null && <Progress value={pct} className="h-1.5" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Ofertas para Missões ──────────────────────────────────────
              Pedido dela (22/09/2026): "as ofertas para missões, filtrando
              por calendário entre datas". Categoria oficial "Ofertas para
              Missões" (Plano de Contas, migration 20260912190000) — id
              resolvido uma vez em `categoriaMissoesId`, ver useEffect
              acima. Filtro de período é livre, não preso ao mês — ela
              pediu "entre datas", não "este mês". */}
          <section id="missoes" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Globe2} tom="info" contagem={missoesLancamentos?.length ?? 0}>
              Ofertas para Missões
            </TituloDaSecao>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div>
                <label className="text-xs text-muted-foreground">De</label>
                <CampoData value={missoesInicio} onChange={setMissoesInicio} className="h-8 text-sm w-32" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Até</label>
                <CampoData value={missoesFim} onChange={setMissoesFim} className="h-8 text-sm w-32" />
              </div>
            </div>
            {carregandoMissoes ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">Carregando…</p>
            ) : categoriaMissoesId === null ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Categoria "Ofertas para Missões" não encontrada no plano de contas.
              </p>
            ) : (missoesLancamentos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma oferta para missões no período.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium mb-1.5">
                  Total no período: <span className="text-gold">{brl(totalMissoes)}</span>
                </p>
                <ul className="divide-y rounded-md border bg-card">
                  {(missoesLancamentos ?? []).slice(0, 8).map(l => (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                      <span className="text-sm min-w-0 flex-1">
                        <span className="font-medium">{l.descricao ?? l.pessoa_nome ?? "Oferta para missões"}</span>
                        <span className="text-muted-foreground">
                          {" "}— {brl(l.valor)} · {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {(missoesLancamentos ?? []).length > 8 && (
                  <p className="text-xs text-muted-foreground px-0.5 mt-1.5">
                    + {(missoesLancamentos ?? []).length - 8} outras no período.
                  </p>
                )}
              </>
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

          {/* ── Atalhos, por assunto de gestão diária ────────────────────────
              Refeito em 22/09/2026, pedido dela: "o que foi construído no
              módulo financeiro é robusto e bom demais para ficar lá embaixo
              do painel... refaça com janelas por assunto" — e "tem que
              fazer sentido para o trabalho de gestão diária financeira",
              não por taxonomia abstrata. Quatro janelas, cada uma
              respondendo a UMA pergunta do dia a dia da tesouraria:
                Dia a dia                o que se mexe toda semana
                Cadastros                referência que muda pouco
                Compliance & Fechamento  obrigação com prazo
                Leitura estratégica      análise, não operação
              Projetos e Bazar/Cantina SAÍRAM daqui: o primeiro virou seção
              viva (ver `#projetos` acima); o segundo é do ministério de
              Administração, não da tesouraria. */}
          {/* `id="ir-para"` — destino do link "Ver tudo" que N1 (plano "90
              Dias de Diakonia") acrescentou ao fim do grupo Financeiro do
              menu lateral: sem ele, "Ver tudo" e "Tesouraria" apontariam
              pro mesmo `/financas` sem hash, e o `NavLink key={item.to}`
              em AppLayout.tsx colidiria (duas entradas com a mesma key). */}
          <section id="ir-para" className="pt-1 space-y-2.5 scroll-mt-[220px]">
            <TituloDaSecao icone={DollarSign} tom="neutro">Ir para</TituloDaSecao>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <JanelaAssunto
                icone={Wallet} titulo="Dia a dia"
                descricao="O que se mexe toda semana."
                links={[
                  { to: "/financas", label: "Contas correntes", icone: DollarSign },
                  { to: "/financas/agenda?tipo=saida", label: "Contas a pagar", icone: TrendingDown },
                  { to: "/financas/agenda?tipo=entrada", label: "Contas a receber", icone: TrendingUp },
                  { to: "/financas/doacoes", label: "Doações", icone: HandCoins },
                  { to: "/financas/recorrencias", label: "Recorrências", icone: RotateCw },
                ]}
              />
              <JanelaAssunto
                icone={Archive} titulo="Cadastros"
                descricao="Referência que muda pouco — configure uma vez."
                links={[
                  { to: "/financas/centros", label: "Centros de Custo", icone: Layers },
                  { to: "/financas/fornecedores", label: "Fornecedores", icone: Building2 },
                  { to: "/financas/estoque", label: "Estoque", icone: Package },
                  { to: "/financas/orcamento", label: "Planejar Orçamento", icone: Target },
                ]}
              />
              <JanelaAssunto
                icone={BookOpenCheck} titulo="Compliance & Fechamento"
                descricao="Obrigação com prazo — o motivo de existir é o mesmo."
                links={[
                  { to: "/financas/fiscal", label: "Módulo Fiscal", icone: Receipt },
                  { to: "/financas/relatorio", label: "Malote Contábil", icone: Receipt },
                  { to: "/financas/folha", label: "Folha", icone: Briefcase },
                  { to: "/financas/reunioes", label: "Reuniões Financeiras", icone: Handshake },
                  { to: "/financas/prestacao-de-contas", label: "Prestação de Contas", icone: ScrollText },
                ]}
              />
              <JanelaAssunto
                icone={LineChart} titulo="Leitura estratégica"
                descricao="Análise, não operação do dia a dia."
                links={[
                  ...(hasRole(ROLES_DOADORES) ? [{ to: "/financas/doadores", label: "Doadores", icone: Users }] : []),
                  { to: "/financas/insights", label: "Insights", icone: Sparkles },
                  ...(hasRole(ROLES_PASTORAL_SEM_TITULAR) ? [
                    { to: "/financas/executivo", label: "Visão Executiva", icone: LineChart },
                    { to: "/financas/dre", label: "DRE Eclesiástica", icone: ScrollText },
                  ] : []),
                ]}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Uma janela por assunto — ícone, título, uma frase dizendo o porquê do
 * agrupamento, e os links dentro. Substitui, em 22/09/2026, o bloco único
 * de 14 botões-pílula soltos: mesma informação, mas o "Insights"/"DRE
 * Eclesiástica" deixam de parecer um link qualquer perdido no meio de
 * outros treze — cada janela é um cartão com peso visual próprio, no
 * mesmo padrão dos cartões de ministério da Home.
 */
function JanelaAssunto({ icone: Icone, titulo, descricao, links }: {
  icone: LucideIcon; titulo: string; descricao: string;
  links: { to: string; label: string; icone: LucideIcon }[];
}) {
  if (links.length === 0) return null;
  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Icone className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.map(l => (
          <Button key={l.to} asChild variant="outline" size="sm" className="gap-1.5">
            <Link to={l.to}><l.icone className="w-3.5 h-3.5" /> {l.label}</Link>
          </Button>
        ))}
      </div>
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
  if (fila.length === 0) return "Fiscal em dia e nada pendente — tudo em ordem! 🙏";
  return `Nada urgente. Na fila: ${fila.join(", ")}.`;
}
