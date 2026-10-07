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

import { useCallback, useEffect, useMemo, useState } from "react";
import { IndicadoresMissionarios } from "@/components/financas/IndicadoresMissionarios";
import { carregarDadosDeMissoes, type DadosDeMissoes } from "@/services/missoesService";
import { categoriaPadraoDeRepasse, ehCategoriaDeRepasse, fundoAcumulado } from "@/lib/indicadoresMissionarios";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { lerRetorno, limparRetorno } from "@/lib/contextoExtrato";
import { renovarRecorrenciasSemFim } from "@/services/recorrenciaService";
import {
  DollarSign, Receipt, Wallet, ChevronRight, RefreshCw, Sparkles, Package,
  Clock, CalendarClock, Target, HandCoins, Scale, Lightbulb, Paperclip,
  HeartHandshake, Users, ScrollText, Layers, Handshake,
  TrendingDown, TrendingUp, RotateCw, Briefcase, LineChart, Building2, FolderKanban,
  Globe2, Archive, BookOpenCheck, ClipboardCheck, FileStack, Star, Plus, ArrowUpCircle, ArrowDownCircle,
  ArrowLeftRight, Download, CheckCircle2, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { CampoData } from "@/components/CampoData";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { carregarResumoFiscal, type ResumoFiscalDashboard } from "@/services/fiscalService";
import {
  brl, resumoFinanceiroMes, listarProjetos, listarCategorias, listarLancamentosSemTeto, listarContas,
  nomeExtrato,
  type FinVencimento, type FinAlertaCentro, type FinResumoMes,
  type FinProjeto, type FinLancamentoExtenso, type FinConta,
} from "@/services/finService";
import { iconeConta } from "@/pages/Financas";
import {
  listarPendencias, type ItemPendencia, type PendenciaLancamento, type PendenciaFechamento, DIAS_JANELA_COMPROVANTE,
  listarVencimentosDaSemana, listarAlertasOrcamento, DIAS_JANELA_VENCIMENTOS,
  listarAlertasTesouraria, type AlertaTesouraria,
  carregarMesaTesoureiro, type MesaTesoureiro,
  carregarCruzamentoDiaconia, type CruzamentoDiaconia,
} from "@/services/painelTesourariaService";
import { AgendaFiscalUrgente } from "@/components/dashboard/AgendaFiscalUrgente";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { ConciliacaoDrawer } from "@/components/financas/ConciliacaoDrawer";
import { FornecedoresDrawer } from "@/components/financas/FornecedoresDrawer";
import { RecorrenciasDrawer } from "@/components/financas/RecorrenciasDrawer";
import { ExtratoContaDrawer } from "@/components/financas/ExtratoContaDrawer";
import { EstoqueDrawer } from "@/components/financas/EstoqueDrawer";
import { ProjetosDrawer } from "@/components/financas/ProjetosDrawer";
import { ContratadosDrawer } from "@/components/financas/ContratadosDrawer";
import { OrcamentoDrawer } from "@/components/financas/OrcamentoDrawer";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { FixarFavoritoDialog } from "@/components/financas/FixarFavoritoDialog";
import { MissoesDrawer } from "@/components/financas/MissoesDrawer";
import { RemessaMissionariaDetalheDrawer } from "@/components/financas/RemessaMissionariaDetalheDrawer";
import { listarFavoritos, desfixarFavorito, type FinFavorito } from "@/services/favoritosService";
import { useAcoesLancamento, BotaoPagar, BotoesAprovacao } from "@/hooks/useAcoesLancamento";
import { FechamentoMensal } from "@/components/financas/FechamentoMensal";
import { MesaDoTesoureiro } from "@/components/financas/MesaDoTesoureiro";
import { LiquidacoesDoPeriodo } from "@/components/financas/LiquidacoesDoPeriodo";
import { useAuth } from "@/hooks/useAuth";
import { hojeLocal, parseLocalDate, daquiADias } from "@/lib/data";
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
  // Fase 10 (Central Operacional), parte 2 (22/09/2026): saldo por conta
  // embutido aqui — até agora só dava pra ver isso indo em `/financas`, a
  // tela que a Central deveria substituir no dia a dia. Ver extrato
  // completo (filtro, OFX, impressão) continua em `/financas/conta/:id` —
  // isso é profundidade ocasional, não cabe numa linha desta central.
  const [contas, setContas] = useState<FinConta[]>([]);
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
      const [f, r, c, proj, p, v, a, al, m, d] = await Promise.all([
        carregarResumoFiscal(),
        resumoFinanceiroMes(),
        listarContas(),
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
      setContas(c);
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
  // Recorrência sem data final não acaba: a janela de previstos anda com o tempo (1× por dia).
  useEffect(() => {
    renovarRecorrenciasSemFim().then(n => { if (n > 0) carregar(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fase 10 (Central Operacional Financeira, 22/09/2026) ─────────────────
  //
  // Pedido dela: "o usuário deve conseguir realizar trabalho financeiro sem
  // navegar entre múltiplas telas". Até aqui, Pendências e Próximos
  // vencimentos eram fila de LEITURA — cada linha levava pra Agenda
  // Financeira pra decidir. Agora decide aqui: `useAcoesLancamento` é o
  // mesmo hook que `FinancasAgenda.tsx` usa (extraído de lá nesta mesma
  // fase, pra não duplicar Pix/QR/anexo), e `AnexosLancamentoDialog` é o
  // mesmo diálogo que já existe no extrato de conta (Fase 9).
  const acoes = useAcoesLancamento(carregar);
  const [anexosPara, setAnexosPara] = useState<PendenciaLancamento | null>(null);
  // Fase 10, parte 3 (22/09/2026), pedido dela: "drawer largo... sem trocar
  // de rota". Guarda {id, nome} (não o objeto pendência inteiro) porque as
  // TRÊS entradas pra conciliação (linha da pendência, tile da Mesa,
  // "Mais ações") levam à mesma conta mas nenhuma delas tem o mesmo shape.
  const [conciliandoConta, setConciliandoConta] = useState<{ id: string; nome: string } | null>(null);
  // Fase 11b do Workspace Financeiro (23/09/2026): os dois primeiros
  // atalhos de "Ir para" a virar drawer, provando o padrão antes de
  // estender pros outros nove do mapa.
  const [fornecedoresAberto, setFornecedoresAberto] = useState(false);
  const [recorrenciasAberto, setRecorrenciasAberto] = useState(false);
  // Fase 11c: maior drawer do mapa — extrato completo de UMA conta.
  const [extratoContaId, setExtratoContaId] = useState<string | null>(null);
  /** Só preenchida ao voltar do "Extrato completo": a rolagem que a lista tinha ao sair. */
  const [rolagemDoExtrato, setRolagemDoExtrato] = useState<number | undefined>(undefined);
  // Fase 11d: os últimos quatro atalhos de "Ir para" a virar drawer.
  const [estoqueAberto, setEstoqueAberto] = useState(false);
  const [projetosAberto, setProjetosAberto] = useState(false);
  const [contratadosAberto, setContratadosAberto] = useState(false);
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);

  // Fase 12, ajuste 2 (23/09/2026): as 4 áreas viram abas de verdade —
  // troca de `aba` decide o que renderiza, nunca `scrollIntoView`. Meu
  // Trabalho e Favoritos ficam FORA do `switch` (renderizados sempre,
  // pedido dela: "são transversais, pertencem ao usuário, não à área").
  type Aba = "operacoes" | "gestao" | "cadastros" | "fechamento";
  const [aba, setAbaInterno] = useState<Aba>("operacoes");
  // Trocar de aba também grava a aba no endereço (`#fechamento`), SUBSTITUINDO a entrada
  // atual do histórico: ir para outra tela e voltar reabre o painel na aba de onde a
  // pessoa saiu, e a trilha "Financeiro › Fechamento" aponta para um endereço real.
  const setAba = (a: Aba) => { setAbaInterno(a); navigate({ hash: a }, { replace: true }); };

  // ── Fase 12 (Workspace Financeiro, 23/09/2026) ───────────────────────────
  // Meu Trabalho: `LancamentoForm` e `TransferenciaForm` já aceitam conta
  // opcional (`contaIdPadrao`/`contaOrigemPadrao`) — escolher a conta é
  // parte do próprio formulário, então os dois cabem soltos aqui, sem
  // precisar que a tesoureira já tenha uma conta em mente pra começar.
  const [novoLancamentoAberto, setNovoLancamentoAberto] = useState<null | "entrada" | "saida">(null);
  const [transferenciaAberta, setTransferenciaAberta] = useState(false);
  const [missoesDrawerAberto, setMissoesDrawerAberto] = useState(false);

  // Favoritos — pessoais (RLS por usuário, ver a migration), por isso
  // carregados à parte de `carregar()`: um erro de RLS aqui não pode
  // derrubar o resto do painel, e a lista não muda quando ela clica
  // "Atualizar" nos números financeiros.
  const [favoritos, setFavoritos] = useState<FinFavorito[]>([]);
  const [fixarAberto, setFixarAberto] = useState(false);
  const carregarFavoritos = useCallback(() => {
    listarFavoritos().then(setFavoritos).catch(() => setFavoritos([]));
  }, []);
  useEffect(() => { carregarFavoritos(); }, [carregarFavoritos]);
  async function removerFavorito(id: string) {
    setFavoritos(fs => fs.filter(f => f.id !== id)); // otimista — é só um atalho pessoal
    try { await desfixarFavorito(id); } catch { carregarFavoritos(); }
  }

  function abrirImportacao() {
    // Igual a `abrirConciliacao()` abaixo: importar OFX é sempre de UMA
    // conta, e a `ConciliacaoOFXDialog`/`ImportacaoOmieDialog` vivem dentro
    // do `ExtratoContaDrawer` (Fase 11c) — abrir o extrato da primeira
    // conta ativa é o caminho real pra chegar lá, não um botão novo.
    if (contas.length === 0) { navigate("/financas"); return; }
    setExtratoContaId(contas[0].id);
  }

  function abrirAprovacoes() {
    if (aprovacoesPendentes.length === 0) { toast.info("Nenhuma aprovação parada."); return; }
    setAba("fechamento");
  }

  function abrirConciliacao() {
    // Sem pendência real, não tem conta certa pra abrir — cai no hub de
    // contas mesmo, mais honesto que fingir que sabe onde ir (mesma régua
    // de antes desta fase, só que agora só se aplica ao caso vazio).
    if (aguardandoConciliacao.length === 0) { navigate("/financas"); return; }
    const p = aguardandoConciliacao[0];
    setConciliandoConta({ id: p.conta_id, nome: p.conta_nome ?? "Conta" });
  }

  // ── Indicadores Eclesiásticos (Fase 12, aba Gestão) ───────────────────────
  //
  // Pedido dela (23/09/2026): "além dos indicadores financeiros
  // tradicionais, indicadores de arrecadação da igreja — Dízimos, Ofertas,
  // Ofertas para Missões, Doações e Contribuições". MEDIDO antes de montar
  // o mapa: só três batem com uma categoria de ENTRADA de verdade no plano
  // de contas oficial — "Dizimos" (sem acento, é assim que está gravado),
  // "Ofertas" e "Ofertas para Missões". "Doações e Contribuições" EXISTE no
  // banco, mas é categoria de SAÍDA (a igreja doando pra fora, não
  // recebendo) — o oposto do que ela pediu. Fica de fora deste mapa até ela
  // decidir o que "Doações e Contribuições" deve significar aqui (perguntei
  // no chat, não inventei uma resposta).
  //
  // Generaliza o que já existia só para Missões (pedido de 22/09/2026:
  // "ver de forma rápida... as ofertas para missões, filtrando por
  // calendário entre datas") — mesma ideia, agora com período PRESET
  // (Hoje/7 dias/30 dias/Mês atual/Ano atual/Personalizado) e comparação
  // com o período imediatamente anterior, de mesma duração.
  // Classes por extenso (não construídas com template literal): o Tailwind
  // varre o CÓDIGO-FONTE em busca de nomes de classe literais — uma classe
  // montada em runtime (`border-t-${tom}`) nunca é vista pelo scanner e
  // sai do build sem estilo nenhum. Achado revisando este mesmo bloco
  // antes de considerar pronto.
  const ECCLESIASTICAS = [
    { chave: "dizimos", nome: "Dizimos", rotulo: "Dízimos", borda: "border-t-gold", texto: "text-gold-text" },
    { chave: "ofertas", nome: "Ofertas", rotulo: "Ofertas", borda: "border-t-info", texto: "text-info-text" },
    { chave: "missoes", nome: "Ofertas para Missões", rotulo: "Ofertas para Missões", borda: "border-t-violeta", texto: "text-violeta-text" },
  ];
  const [categoriasEcl, setCategoriasEcl] = useState<Record<string, string | null>>({});
  useEffect(() => {
    listarCategorias("entrada").then(cats => {
      const mapa: Record<string, string | null> = {};
      for (const e of ECCLESIASTICAS) mapa[e.chave] = cats.find(c => c.nome === e.nome)?.id ?? null;
      setCategoriasEcl(mapa);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug de produtividade (23/09/2026), pedido dela: "o sistema deve abrir
  // sempre com a data atual — a tesouraria trabalha com 'o que aconteceu
  // hoje', não 'desde o início do mês'". O período inicial mudou de "mes"
  // pra "hoje" — afeta de uma vez a Central de Arrecadação, os
  // Indicadores Eclesiásticos (Dízimos/Ofertas/Missões) e "Enviado no
  // período" do Saldo Missionário, porque os três leem este mesmo
  // período (`eclInicio`/`eclFim`). Mudar as datas continua valendo
  // enquanto ela ficar na tela — só reabrir a aba/o Financeiro de novo
  // volta pra "hoje", porque é um `useState` reavaliado do zero a cada
  // montagem, não algo persistido.
  //
  // 06/10/2026, pedido dela: SÓ o filtro por período (De/Até), igual ao dos Indicadores Missionários — sem os
  // botões Hoje/7 dias/30 dias/Mês/Ano/Personalizado. Continua abrindo em HOJE (a regra de 23/09 acima).
  const hoje = hojeLocal();
  const [eclCustomInicio, setEclCustomInicio] = useState(hoje);
  const [eclCustomFim, setEclCustomFim] = useState(hoje);

  // Data apagada ou incompleta no meio da digitação volta ao padrão (hoje) em vez de quebrar a consulta;
  // De/Até invertidos pela digitação são trocados, nunca viram período negativo.
  const eclDataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const { eclInicio, eclFim } = (() => {
    const i = eclDataValida(eclCustomInicio) ? eclCustomInicio : hoje;
    const f = eclDataValida(eclCustomFim) ? eclCustomFim : hoje;
    return i <= f ? { eclInicio: i, eclFim: f } : { eclInicio: f, eclFim: i };
  })();
  // Período anterior = mesma duração, terminando um dia antes do início do
  // período atual — definição única que funciona igual pros 6 presets,
  // inclusive "Personalizado".
  const eclDuracaoDias = Math.round(
    (parseLocalDate(eclFim).getTime() - parseLocalDate(eclInicio).getTime()) / 86400000,
  ) + 1;
  const eclFimAnterior = daquiADias(eclInicio, -1);
  const eclInicioAnterior = daquiADias(eclFimAnterior, -(eclDuracaoDias - 1));

  const [eclDados, setEclDados] = useState<Record<string, { atual: FinLancamentoExtenso[]; anterior: FinLancamentoExtenso[] }>>({});
  const [eclCarregando, setEclCarregando] = useState(true);
  const [eclDetalheAberto, setEclDetalheAberto] = useState<string | null>(null);

  const carregarEclesiasticos = useCallback(async () => {
    if (Object.keys(categoriasEcl).length === 0) return;
    setEclCarregando(true);
    try {
      const entradas = await Promise.all(ECCLESIASTICAS.map(async e => {
        const catId = categoriasEcl[e.chave];
        if (!catId) return [e.chave, { atual: [], anterior: [] }] as const;
        const [atual, anterior] = await Promise.all([
          listarLancamentosSemTeto({ tipo: "entrada", categoriaId: catId, dataInicio: eclInicio, dataFim: eclFim }),
          listarLancamentosSemTeto({ tipo: "entrada", categoriaId: catId, dataInicio: eclInicioAnterior, dataFim: eclFimAnterior }),
        ]);
        return [e.chave, { atual, anterior }] as const;
      }));
      setEclDados(Object.fromEntries(entradas));
    } finally {
      setEclCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriasEcl, eclInicio, eclFim, eclInicioAnterior, eclFimAnterior]);

  useEffect(() => { carregarEclesiasticos(); }, [carregarEclesiasticos]);

  // ── Missões: arrecadado × enviado × saldo (Fase 12, 23/09/2026) ────────
  // Pedido dela: "vincular Ofertas para Missões (entrada) com Repasses
  // Missionários (saída) — arrecadado, enviado, saldo disponível". MEDIDO
  // antes de montar: "Repasses Missionários" já existe no plano de contas
  // como categoria de SAÍDA — não precisei criar nada no banco, só ligar
  // as duas pontas que já existiam soltas.
  //
  // "Saldo disponível" NÃO respeita o filtro de período — é "quanto ainda
  // falta repassar", uma pergunta de HOJE, não de um recorte de tempo; ela
  // mesma definiu assim ("quanto ainda precisa ser repassado"). Por isso
  // as duas somas do saldo buscam SEM `dataInicio`/`dataFim` (o histórico
  // inteiro) e só contam o que já é dinheiro de verdade (`realizado` ou
  // `conciliado`) — um repasse ainda `previsto` não pode reduzir um saldo
  // que representa caixa disponível agora. "Enviado (período)" já é outra
  // pergunta — essa sim usa o mesmo período (`eclInicio`/`eclFim`) da seção,
  // reaproveitado, não duplicado.
  //
  // 06/10/2026 — o carregamento deixou de depender do período: busca a vida
  // inteira UMA vez e o componente recorta (período) ou soma tudo (fundo).
  // Antes refazia as 3 consultas a cada clique no filtro. A categoria de repasse
  // é procurada pelas DUAS grafias (a oficial "Outros Repasses Missionários" e a
  // antiga "Repasses Missionários"): só a antiga fazia o painel inteiro sumir se
  // ela fosse desativada.
  const [repassesCategoriaId, setRepassesCategoriaId] = useState<string | null | undefined>(undefined);
  const [repassesCategoriasIds, setRepassesCategoriasIds] = useState<string[]>([]);
  useEffect(() => {
    listarCategorias("saida")
      .then(cats => {
        const doRepasse = cats.filter(c => ehCategoriaDeRepasse(c.nome));
        setRepassesCategoriasIds(doRepasse.map(c => c.id));
        setRepassesCategoriaId(categoriaPadraoDeRepasse(doRepasse)?.id ?? null);
      })
      .catch(() => setRepassesCategoriaId(null));
  }, []);

  // 06/10/2026 — modelagem nova: os dados vêm de `carregarDadosDeMissoes` (entradas, Envio Oficial,
  // sustento, mobilização, ajustes, metas, projetos) e o painel `IndicadoresMissionarios` faz as contas.
  const [missoes, setMissoes] = useState<DadosDeMissoes | null>(null);
  const [missoesRemessaCarregando, setMissoesRemessaCarregando] = useState(true);
  // Mesmo agregado de antes (o drawer da remessa lê "arrecadadoTotal/enviadoTotal").
  const missoesSaldo = useMemo(() => {
    if (repassesCategoriaId === null || repassesCategoriaId === undefined || !missoes) return null;
    const f = fundoAcumulado(missoes.entradas, missoes.envios);
    return { arrecadadoTotal: f.arrecadado, enviadoTotal: f.enviado };
  }, [missoes, repassesCategoriaId]);

  const carregarMissoesRemessa = useCallback(async () => {
    // Categorias ainda carregando → espera. Categoria de ENTRADA ausente (null) não
    // pode deixar o painel em "Carregando…" para sempre: segue só com os repasses.
    if (Object.keys(categoriasEcl).length === 0 || repassesCategoriaId === undefined) return;
    const missoesCatId = categoriasEcl["missoes"];
    if (repassesCategoriaId === null) { setMissoes(null); setMissoesRemessaCarregando(false); return; }
    setMissoesRemessaCarregando(true);
    try {
      setMissoes(await carregarDadosDeMissoes({ categoriaDeEntradaId: missoesCatId ?? null, categoriasDeRepasseIds: repassesCategoriasIds }));
    } catch (e) {
      console.error("Indicadores Missionários — falha ao carregar:", e);
      toast.error("Não foi possível carregar os indicadores missionários.");
    } finally {
      setMissoesRemessaCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriasEcl, repassesCategoriaId, repassesCategoriasIds]);

  useEffect(() => { carregarMissoesRemessa(); }, [carregarMissoesRemessa]);
  const [remessaMissionariaAberta, setRemessaMissionariaAberta] = useState(false);
  // Tela de detalhe de UMA remessa (30/09/2026) — ver o cabeçalho de
  // `RemessaMissionariaDetalheDrawer.tsx` pro escopo da v1. Dois estados
  // porque abrir "Editar" a partir do detalhe precisa fechar o Sheet de
  // leitura e abrir o `LancamentoForm` por cima, não os dois juntos.
  const [remessaDetalhe, setRemessaDetalhe] = useState<FinLancamentoExtenso | null>(null);
  const [remessaEditando, setRemessaEditando] = useState<FinLancamentoExtenso | null>(null);

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
  const tipoDeNavegacao = useNavigationType();

  // Voltando do "Extrato completo": reabre o painel daquela conta, com o contexto de trabalho que
  // a pessoa deixou (período, filtros, busca — lib/contextoExtrato.ts). Dois caminhos:
  //   · o botão "Voltar para movimentações" avisa por `location.state.reabrirExtrato`;
  //   · o "voltar" do navegador (POP) não carrega estado, então vale a promessa gravada ao sair —
  //     só se for recente e do mesmo endereço, para não abrir o painel do nada, dias depois.
  // Uma vez só: consome a promessa e limpa o estado do histórico (F5 não reabre de novo).
  useEffect(() => {
    const pedido = (location.state as { reabrirExtrato?: string } | null)?.reabrirExtrato;
    if (pedido) {
      setRolagemDoExtrato(lerRetorno()?.rolagem);
      limparRetorno();
      setExtratoContaId(pedido);
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
      return;
    }
    if (tipoDeNavegacao === "POP") {
      const r = lerRetorno();
      if (r && r.origem.split(/[?#]/)[0] === location.pathname) {
        setRolagemDoExtrato(r.rolagem);
        limparRetorno();
        setExtratoContaId(r.contaId);
      }
    }
    // só na chegada à tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (location.hash === "#ir-para" && !carregando) irParaSecao("ir-para");
  }, [location.hash, carregando]);

  // A trilha de navegação (BarraDeContexto) liga "Financeiro › Fechamento" a
  // `/painel-tesouraria#fechamento`: abrir o painel por esse endereço cai direto na aba
  // certa. Antes a aba era só estado interno e não havia endereço para ela (03/10/2026).
  useEffect(() => {
    const h = location.hash.replace("#", "");
    if (h === "operacoes" || h === "gestao" || h === "cadastros" || h === "fechamento") setAbaInterno(h);
  }, [location.hash]);

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

  // Fase 12, item 4 do pedido dela (23/09/2026): "a realidade de uma
  // igreja é diferente da de uma empresa — não temos cliente, cobrança
  // recorrente nem contas a receber comercial". MEDIDO ao vivo antes dela
  // pedir a troca: a extinta "Central de Recebimentos" (baseada em
  // `vencimentos` tipo entrada, o forecast de "contas a receber") mostrava
  // R$ 0,00 em produção — a igreja não cadastra dízimo/oferta como
  // vencimento futuro, ela REGISTRA quando entra. "Central de Arrecadação"
  // troca a fonte: mesma consulta por categoria da seção Gestão
  // (`eclDados`), Dízimos + Ofertas + Ofertas para Missões somados —
  // dado que existe de verdade. "Doações e Contribuições", que ela também
  // pediu, fica de fora da soma por ora — é categoria de SAÍDA no banco,
  // perguntei a ela o que deveria significar aqui antes de somar algo
  // errado.
  const arrecTotalAtual = ECCLESIASTICAS.reduce((s, e) => s + (eclDados[e.chave]?.atual ?? []).reduce((s2, l) => s2 + Number(l.valor), 0), 0);
  const arrecTotalAnterior = ECCLESIASTICAS.reduce((s, e) => s + (eclDados[e.chave]?.anterior ?? []).reduce((s2, l) => s2 + Number(l.valor), 0), 0);
  const arrecQtd = ECCLESIASTICAS.reduce((s, e) => s + (eclDados[e.chave]?.atual ?? []).length, 0);
  const arrecTendencia = arrecTotalAnterior > 0
    ? ((arrecTotalAtual - arrecTotalAnterior) / arrecTotalAnterior) * 100
    : (arrecTotalAtual > 0 ? 100 : 0);
  // Rótulo do período no cabeçalho: "hoje" quando é o dia de hoje; senão "dd/mm" ou "dd/mm a dd/mm".
  const eclDiaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const eclRotuloDoPeriodo = eclInicio === eclFim
    ? (eclInicio === hoje ? "hoje" : eclDiaMes(eclInicio))
    : `${eclDiaMes(eclInicio)} a ${eclDiaMes(eclFim)}`;

  const valorNaoConciliado = aguardandoConciliacao.reduce((s, p) => s + Number(p.valor), 0);
  const contaNaoConciliadaNome = aguardandoConciliacao[0]?.conta_nome ?? null;

  const [accAberto, setAccAberto] = useState<null | "pagamentos-atrasados" | "pagamentos-hoje" | "conciliacao">(null);
  // Fase 12, revisão da Central de Pagamentos (23/09/2026) — Prioridade 4:
  // "visualizar/baixar comprovante direto da Central, não só na hora de
  // pagar". Reaproveita o MESMO `AnexosLancamentoDialog` que a lista de
  // Pendências já usa (`anexosPara`) — estado próprio porque aquele guarda
  // um `PendenciaLancamento`, e aqui a origem é `FinVencimento` (a view de
  // vencimentos, tipo diferente) — só o `id`+rótulo importam pro diálogo.
  const [anexosVencimento, setAnexosVencimento] = useState<{ id: string; label: string } | null>(null);

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* Mesma largura e mesmo cabeçalho fixo do Painel Pastoral e do Painel
          da Secretaria — ver os comentários de largura naqueles dois
          arquivos, resolvidos em 27/08/2026. A faixa de indicadores é o
          índice da tela. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-gold shrink-0" />
              Workspace Financeiro
            </h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>

          {/* ── Saldos, no cabeçalho ──────────────────────────────────────
              Fase 12 (Workspace Financeiro, 23/09/2026): "a Home não deve
              depender de rolagem — saldos cabem no cabeçalho, não num
              cartão próprio". `resumo.saldo_total` e `valorSemanaPagar` já
              existiam (a seção "Saldo e movimento" abaixo continua com a
              visão mensal completa); `valorSemanaReceber` é o par do lado
              ENTRADA que só faltava calcular. */}
          {resumo && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Disponível</p>
                <p className="text-sm font-bold tabular-nums text-success-text">{brl(resumo.saldo_total)}</p>
              </div>
              <div className="w-px h-7 bg-border" />
              <div className="text-right">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Sai/semana</p>
                <p className="text-sm font-bold tabular-nums text-destructive-text">{brl(valorSemanaPagar)}</p>
              </div>
              {aba !== "operacoes" && (
                <>
                  <div className="w-px h-7 bg-border" />
                  <div className="text-right">
                    <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Arrecadado ({eclRotuloDoPeriodo})</p>
                    <p className="text-sm font-bold tabular-nums text-info-text">{brl(arrecTotalAtual)}</p>
                  </div>
                </>
              )}
            </div>
          )}

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
        {fiscal && aba !== "fechamento" && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <span className="min-w-0">
              {resumoNatural(fiscal, aprovacoesPendentes, semComprovante, aguardandoConciliacao, fechamentosPendentes, vencimentos, orcamentoCriticos, alertasOrc, alertasCriticos, alertas)}
              {atualizadoEm && (
                <span className="text-2xs text-muted-foreground ml-1.5 whitespace-nowrap">
                  · {formatarAtualizadoHa(atualizadoEm)}
                </span>
              )}
            </span>
          </p>
        )}

        {/* ── As 4 áreas do Workspace ──────────────────────────────────────
            Fase 12, item 2 do pedido dela ("nomenclatura mais próxima de
            ERP SaaS", avaliação, não obrigação): troquei Operar/Analisar/
            Administrar/Fechamento & Compliance por Operações/Gestão/
            Cadastros/Fechamento — evita a palavra "Central" competir com
            as 3 Centrais (Pagamentos/Arrecadação/Conciliação) que moram
            DENTRO de Operações, um nível abaixo.
            Fase 12, ajuste 2 (23/09/2026), pedido dela: "a troca de aba
            não deve rolar a página — deve trocar o conteúdo na mesma
            região". Trocado `irParaSecao` (scroll) por `setAba` (troca
            de qual bloco é renderizado) — a antiga faixa de 7 indicadores
            abaixo do cabeçalho (Fiscal/Pendências/Vencimentos/Projetos/
            Missões/Orçamento/Alertas) SAIU: ela apontava pra seções que
            agora vivem em abas diferentes, e um índice cujo alvo muda de
            aba a cada clique não serve mais pra nada — a própria aba já
            é o índice. */}
        <nav className="flex gap-5 -mb-3 pt-1 overflow-x-auto">
          {([
            ["operacoes", "1 Operações"], ["gestao", "2 Gestão"],
            ["cadastros", "3 Cadastros"], ["fechamento", "4 Fechamento"],
          ] as [Aba, string][]).map(([chave, rotulo]) => (
            <button key={chave} type="button" onClick={() => setAba(chave)}
              className={`text-xs font-bold pb-2 border-b-2 whitespace-nowrap ${
                aba === chave ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {rotulo}
            </button>
          ))}
        </nav>
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
          {/* ── Meu Trabalho ──────────────────────────────────────────────
              Fase 12, prioridade 5 do pedido dela: ações que valem o dia
              inteiro, não só quando há algo pendente — por isso não somem
              quando as 3 Centrais abaixo estiverem todas zeradas. Substitui
              "Ações rápidas" (Sprint 3): mesmos dois gestos que já existiam
              (lançar, conciliar) mais quatro que só existiam enterrados em
              menu ou não existiam soltos nenhum lugar. `LancamentoForm` e
              `TransferenciaForm` já aceitam conta opcional — nenhum dos
              dois precisou de prop nova pra funcionar solto aqui. */}
          <section className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mr-1 shrink-0">
              Meu trabalho
            </span>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={() => setNovoLancamentoAberto("saida")}>
              <Plus className="w-3 h-3" /> Novo lançamento
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={() => setNovoLancamentoAberto("entrada")}>
              <ArrowDownCircle className="w-3 h-3" /> Registrar recebimento
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={() => setTransferenciaAberta(true)}>
              <ArrowLeftRight className="w-3 h-3" /> Transferir
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={abrirImportacao}>
              <Download className="w-3 h-3" /> Importar extrato
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs"
              onClick={abrirAprovacoes}>
              <CheckCircle2 className="w-3 h-3" /> Aprovar pendências
              {aprovacoesPendentes.length > 0 ? ` (${aprovacoesPendentes.length})` : ""}
            </Button>
            <Button asChild type="button" variant="outline" size="sm" className="h-7 rounded-full gap-1.5 text-xs">
              <Link to="/financas/prestacao-de-contas"><Archive className="w-3 h-3" /> Fechar o mês</Link>
            </Button>
          </section>

          {/* ── Favoritos da tesouraria ──────────────────────────────────
              Fase 12, prioridade 4: `fin_favoritos` (migration
              20260923100000) — pessoal, RLS por `usuario_id = auth.uid()`.
              "Também pertencem ao usuário e não à área", pedido dela — por
              isso continuam visíveis independente de qual seção da tela se
              está olhando. */}
          <section className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mr-1 shrink-0">
              Favoritos
            </span>
            {favoritos.map(f => (
              <span key={f.id} className="inline-flex items-center gap-1 rounded-full border bg-card pl-2.5 pr-1 py-1 text-xs">
                <Link to={f.rota} className="flex items-center gap-1 font-medium hover:text-gold-text">
                  <Star className="w-3 h-3 text-gold fill-gold shrink-0" /> {f.rotulo}
                </Link>
                <button type="button" onClick={() => removerFavorito(f.id)} title="Desfixar"
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => setFixarAberto(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40">
              <Plus className="w-3 h-3" /> Fixar novo atalho
            </button>
          </section>

          {aba === "operacoes" && (
          <>
          {/* ── A mesa do tesoureiro (06/10/2026) ──────────────────────────
              Substitui as 3 Centrais (Pagamentos, Arrecadação, Conciliação): a rotina real
              é pagar, conferir débitos automáticos, anexar comprovantes e fechar o caixa —
              não acompanhar arrecadação. Arrecadação segue em "2 Gestão"; conciliação, no
              checklist do "4 Fechamento" e no importador de extrato. Ver
              docs/OPERACOES_MESA_DO_TESOUREIRO.md. */}
          <section id="operar">
            <MesaDoTesoureiro
              chaveDeAtualizacao={atualizadoEm?.getTime() ?? 0}
              aprovacoesPendentes={aprovacoesPendentes.length}
              onPagar={(v) => acoes.pagar(v)}
              onAnexo={(a) => setAnexosVencimento(a)}
              onNovaSaida={() => setNovoLancamentoAberto("saida")}
              onImportarExtrato={abrirImportacao}
              onAprovacoes={abrirAprovacoes}
              onRecorrencias={() => setRecorrenciasAberto(true)}
            />
          </section>
          <section id="liquidacoes" className="scroll-mt-[220px]">
            <LiquidacoesDoPeriodo chaveDeAtualizacao={atualizadoEm?.getTime() ?? 0} />
          </section>
          </>
          )}

          {/* ── 4 Fechamento — CHECKLIST DO MÊS (03/10/2026) ───────────────────
              Antes: agenda fiscal, "sem comprovante" (duplicado da Central de
              Documentos), próximos vencimentos — nada disso é o fechamento real
              dela. Agora: o checklist de `FechamentoMensal` (conciliação →
              lançamentos → documentação → pacote → envio), que responde "estou
              pronta para gerar e enviar o malote?". O Fiscal continua em
              Financeiro > Módulo Fiscal; Caixa do Bazar já saiu daqui em
              22/09/2026 (mora no painel da Administração). */}
          {aba === "fechamento" && (
          <>
          <FechamentoMensal onConciliar={(c) => setConciliandoConta(c)} />

          {/* A ÚNICA parte da antiga lista de Pendências que não tem outro lar: aprovar ou
              rejeitar um lançamento parado. Só aparece quando existe uma. */}
          {aprovacoesPendentes.length > 0 && (
            <section id="aprovacoes" className="scroll-mt-[220px]">
              <TituloDaSecao icone={Clock} tom="warning" contagem={aprovacoesPendentes.length}>
                Aguardando aprovação
              </TituloDaSecao>
              <ul className="divide-y rounded-md border bg-card">
                {aprovacoesPendentes.slice(0, 8).map(p => (
                  <li key={`aprovacao-${p.id}`} className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                    <span className="text-sm min-w-0 flex-1">
                      <span className="font-medium">{nomeExtrato(p).principal}</span>
                      <span className="text-muted-foreground"> — {brl(p.valor)}</span>
                    </span>
                    <BotoesAprovacao onAprovar={() => acoes.aprovar(p)} onRejeitar={() => acoes.rejeitar(p)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          </>
          )}
          {aba === "gestao" && (
          <>
          {/* ── Saldo e movimento (Indicadores Financeiros) ───────────────
              Fase 12, ajuste 3 (23/09/2026): saiu de Operações — "só a
              Central de Pagamentos/Arrecadação/Conciliação, nada além
              disso" — e entrou aqui, sob "Indicadores Financeiros" do
              pedido dela: visão mensal (não semanal, como o cabeçalho),
              `resumoFinanceiroMes()` de sempre. */}
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
              <div className="rounded-md border border-dashed p-2.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-warning-text" /> Previstas (mês)
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-lg text-warning-text">{brl(resumo.previstas_mes)}</p>
              </div>
            </section>
          )}

          {/* ── Projetos em andamento ─────────────────────────────────────
              Fase 12, ajuste 3 (23/09/2026): saiu de Operações — "projetos
              é acompanhamento de meta ao longo do tempo, não trabalho de
              hoje" — e entrou em Gestão, ao lado de Orçamento e dos
              Indicadores. Progresso = mesma conta de
              `FinancasProjetoDetalhe.tsx` (soma de entradas do projeto ÷
              meta), calculada em `carregar()` acima — não uma segunda
              fonte de verdade. */}
          <section id="projetos" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={FolderKanban} tom="violeta" contagem={projetos.length}
              // Fase 11d (23/09/2026): "Abrir Projetos" agora abre o
              // ProjetosDrawer (ver todos, inclusive encerrados, e
              // gerenciar o cadastro) em vez de navegar pra
              // /financas/projetos — a lista com progresso continua sendo
              // esta seção, o drawer não a duplica.
              acao={<button type="button" onClick={() => setProjetosAberto(true)} className="text-sm text-primary hover:underline">Abrir Projetos</button>}
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

          {/* "Dia a dia" (Contas correntes/a pagar/a receber, Doações,
              Recorrências) SAIU daqui na Fase 12, ajuste 3 — Contas a pagar/
              a receber/Doações ficaram redundantes com as Centrais e os
              Indicadores Eclesiásticos; Recorrências virou atalho da aba
              Cadastros (Central Administrativa), junto do resto do
              cadastro que muda pouco. */}

          {/* ── Indicadores Eclesiásticos (aba Gestão) ───────────────────
              Fase 12 (23/09/2026), pedido dela: "além dos indicadores
              financeiros tradicionais, indicadores de arrecadação da
              igreja". Substitui a antiga seção só-de-Missões — mesma
              consulta de base (`listarLancamentosSemTeto` por categoria +
              período), agora com Dízimos e Ofertas ao lado, mais
              comparação com o período anterior e tendência. "Doações e
              Contribuições" ficou de fora — é categoria de SAÍDA no banco,
              não de entrada; perguntei a ela o que deveria significar
              aqui em vez de adivinhar. */}
          <section id="analisar" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Globe2} tom="info">
              Indicadores Eclesiásticos
            </TituloDaSecao>
            <div className="flex flex-wrap items-end gap-2 mb-3">
              <span>
                <label className="text-xs text-muted-foreground block">De</label>
                <CampoData value={eclCustomInicio} onChange={setEclCustomInicio} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
              </span>
              <span>
                <label className="text-xs text-muted-foreground block">Até</label>
                <CampoData value={eclCustomFim} onChange={setEclCustomFim} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {ECCLESIASTICAS.filter(e => e.chave !== "missoes").map(e => {
                const catId = categoriasEcl[e.chave];
                const d = eclDados[e.chave];
                const totalAtual = (d?.atual ?? []).reduce((s, l) => s + Number(l.valor), 0);
                const totalAnterior = (d?.anterior ?? []).reduce((s, l) => s + Number(l.valor), 0);
                const tendencia = totalAnterior > 0
                  ? ((totalAtual - totalAnterior) / totalAnterior) * 100
                  : (totalAtual > 0 ? 100 : 0);
                return (
                  <div key={e.chave} className={`rounded-lg border border-t-4 ${e.borda} bg-card flex flex-col overflow-hidden`}>
                    <div className="p-3 pb-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{e.rotulo}</p>
                      {eclCarregando ? (
                        <p className="text-sm text-muted-foreground py-2">Carregando…</p>
                      ) : catId === null ? (
                        <p className="text-xs text-muted-foreground py-2">Categoria não encontrada no plano de contas.</p>
                      ) : (
                        <>
                          <p className={`text-xl font-extrabold tabular-nums ${e.texto}`}>{brl(totalAtual)}</p>
                          <p className="text-[11px] text-muted-foreground">{(d?.atual ?? []).length} lançamento{(d?.atual ?? []).length === 1 ? "" : "s"} no período</p>
                        </>
                      )}
                    </div>
                    {!eclCarregando && catId !== null && (
                      <>
                        <div className="px-3 pt-1 flex items-center justify-between text-xs border-t py-1.5">
                          <span className="text-muted-foreground">Período anterior</span>
                          <span className="font-medium tabular-nums">{brl(totalAnterior)}</span>
                        </div>
                        <div className="px-3 flex items-center justify-between text-xs border-t py-1.5">
                          <span className="text-muted-foreground">Tendência</span>
                          <span className={`font-bold tabular-nums ${tendencia >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                            {tendencia >= 0 ? "▲" : "▼"} {Math.abs(tendencia).toFixed(1)}%
                          </span>
                        </div>
                        <div className="px-3">
                          <button type="button" onClick={() => setEclDetalheAberto(a => a === e.chave ? null : e.chave)}
                            className="w-full text-left text-[11px] text-muted-foreground py-1.5 border-t border-dashed">
                            {eclDetalheAberto === e.chave ? "▴" : "▾"} Ver detalhes
                          </button>
                          {eclDetalheAberto === e.chave && (
                            (d?.atual ?? []).length === 0 ? (
                              <p className="text-xs text-muted-foreground pb-2">Nenhum lançamento no período.</p>
                            ) : (
                              <ul className="pb-2 space-y-1.5 max-h-48 overflow-y-auto">
                                {(d?.atual ?? []).slice(0, 20).map(l => (
                                  <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate min-w-0">
                                      {nomeExtrato(l, e.rotulo).principal}
                                      <span className="text-muted-foreground"> · {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                                    </span>
                                    <span className="tabular-nums font-medium shrink-0">{brl(l.valor)}</span>
                                  </li>
                                ))}
                                {(d?.atual ?? []).length > 20 && (
                                  <li className="text-[11px] text-muted-foreground">+ {(d?.atual ?? []).length - 20} outros no período.</li>
                                )}
                              </ul>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Indicadores Missionários ───────────────────────────────────
              Pedido dela (06/10/2026): separar o RESULTADO DO PERÍODO do FUNDO
              ACUMULADO, abrir no mês atual e deixar o gráfico seguir o filtro.
              Filtro próprio — ver o cabeçalho de IndicadoresMissionarios.tsx. */}
          <section id="missoes" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Globe2} tom="violeta">
              Indicadores Missionários
            </TituloDaSecao>
            <IndicadoresMissionarios
              dados={missoes}
              carregando={missoesRemessaCarregando || eclCarregando}
              onRecarregar={carregarMissoesRemessa}
              semCategoriaDeEntrada={categoriasEcl["missoes"] === null}
              semCategoriaDeRepasse={repassesCategoriaId === null}
              hoje={hoje}
              onRegistrarRemessa={() => setRemessaMissionariaAberta(true)}
              onAbrirRemessa={setRemessaDetalhe}
              onVerDetalheDasOfertas={() => setMissoesDrawerAberto(true)}
            />
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
              do painel... refaça com janelas por assunto". Quatro janelas,
              uma por aba — Fase 12, ajuste 2 (23/09/2026): cada uma que
              morava junto em "Ir para" (uma seção só, id="ir-para") virou o
              rodapé de referência DA PRÓPRIA aba a que pertence. "Ir para"
              como seção separada deixou de existir — a aba já é o
              agrupamento. */}
          <div className="pt-1">
            <JanelaAssunto
              icone={LineChart} titulo="Leitura estratégica"
              descricao="Análise, não operação do dia a dia."
              links={[
                { to: "/financas/insights", label: "Insights", icone: Sparkles },
                ...(hasRole(ROLES_PASTORAL_SEM_TITULAR) ? [
                  { to: "/financas/executivo", label: "Visão Executiva", icone: LineChart },
                  { to: "/financas/dre", label: "DRE Eclesiástica", icone: ScrollText },
                ] : []),
              ]}
            />
          </div>
          </>
          )}

          {/* ── Central Administrativa ────────────────────────────────────
              Fase 12, ajuste 3 (23/09/2026): a aba virou de fato "Central
              Administrativa" — ganhou o grid de Contas (saiu de Operações,
              é cadastro/consulta, não trabalho de hoje) e passou a listar
              TODO cadastro do pedido dela: Contas Financeiras, Categorias
              (link novo — `/financas/admin?aba=categorias`, a aba antes só
              abria em "Contas" por padrão fixo), Recorrências e Contratados
              (saíram de onde estavam antes) e Doadores (saiu de "Leitura
              estratégica" — é cadastro de PESSOA que contribui, não
              análise). */}
          {aba === "cadastros" && (
          <>
          {contas.length > 0 && (
            <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {/* "Todas as Contas" — pedido dela (30/09/2026), vendo o
                  seletor de conta do Omie: lá existe uma opção no topo do
                  dropdown pra ver o extrato consolidado de todas as contas
                  de uma vez, sem escolher uma por uma. Mesmo drawer
                  (`ExtratoContaDrawer`), `contaId=null` — ver o comentário
                  lá dentro sobre o que muda no modo consolidado. */}
              <button type="button" onClick={() => setExtratoContaId("__todas__")}
                className="rounded-md border-2 border-gold/40 bg-gold/5 p-2.5 hover:border-gold transition-colors min-w-0 text-left">
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-gold-text truncate">
                  <Layers className="w-3.5 h-3.5" />
                  <span className="truncate">Todas as Contas</span>
                </p>
                <p className="font-semibold tabular-nums mt-0.5 text-base truncate">
                  {brl(contas.reduce((s, c) => s + Number(c.saldo_atual), 0))}
                </p>
              </button>
              {contas.map(c => (
                <button key={c.id} type="button" onClick={() => setExtratoContaId(c.id)}
                  className="rounded-md border bg-card p-2.5 hover:border-gold/50 transition-colors min-w-0 text-left">
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground truncate">
                    {iconeConta(c, "w-3.5 h-3.5")}
                    <span className="truncate">{c.nome}</span>
                  </p>
                  <p className="font-semibold tabular-nums mt-0.5 text-base truncate" style={{ color: c.cor ?? undefined }}>
                    {brl(Number(c.saldo_atual))}
                  </p>
                </button>
              ))}
            </section>
          )}
          <div className="pt-1 space-y-2.5">
            <JanelaAssunto
              icone={Archive} titulo="Cadastros"
              descricao="Referência que muda pouco — configure uma vez."
              links={[
                { to: "/financas/admin", label: "Contas Financeiras", icone: Wallet },
                { to: "/financas/admin?aba=categorias", label: "Categorias", icone: DollarSign },
                // Fase 11b (23/09/2026), achado ao migrar: Centros de
                // Custo é ranking de gasto de 90 dias com duas abas e
                // alertas — mais perto de relatório (página) do que de
                // lista simples. Fica de fora do drawer de propósito.
                { to: "/financas/centros", label: "Centros de Custo", icone: Layers },
                { onClick: () => setFornecedoresAberto(true), label: "Favorecidos", icone: Building2 },
                // Fase 11d: EstoqueDrawer e OrcamentoDrawer, mesmo
                // conteúdo de /financas/estoque e /financas/orcamento.
                { onClick: () => setEstoqueAberto(true), label: "Estoque", icone: Package },
                { onClick: () => setOrcamentoAberto(true), label: "Planejar Orçamento", icone: Target },
                { onClick: () => setRecorrenciasAberto(true), label: "Recorrências", icone: RotateCw },
                { onClick: () => setContratadosAberto(true), label: "Contratados", icone: Briefcase },
                { to: "/financas/folha", label: "Calculadoras (Folha)", icone: Briefcase },
                ...(hasRole(ROLES_DOADORES) ? [{ to: "/financas/doadores", label: "Doadores", icone: Users }] : []),
              ]}
            />
          </div>
          </>
          )}

        </>
      )}

      {acoes.dialogs}
      {anexosPara && (
        <AnexosLancamentoDialog
          open={!!anexosPara}
          onOpenChange={(v) => !v && setAnexosPara(null)}
          lancamentoId={anexosPara.id}
          descricaoLancamento={nomeExtrato(anexosPara).principal}
          onChange={carregar}
        />
      )}
      {anexosVencimento && (
        <AnexosLancamentoDialog
          open={!!anexosVencimento}
          onOpenChange={(v) => !v && setAnexosVencimento(null)}
          lancamentoId={anexosVencimento.id}
          descricaoLancamento={anexosVencimento.label}
          onChange={carregar}
        />
      )}
      {conciliandoConta && (
        <ConciliacaoDrawer
          open={!!conciliandoConta}
          onOpenChange={(v) => !v && setConciliandoConta(null)}
          contaId={conciliandoConta.id}
          contaNome={conciliandoConta.nome}
          onChange={carregar}
        />
      )}
      <FornecedoresDrawer open={fornecedoresAberto} onOpenChange={setFornecedoresAberto} />
      <RecorrenciasDrawer open={recorrenciasAberto} onOpenChange={setRecorrenciasAberto} />
      {extratoContaId && (
        <ExtratoContaDrawer
          open={!!extratoContaId}
          onOpenChange={(v) => !v && setExtratoContaId(null)}
          contaId={extratoContaId === "__todas__" ? null : extratoContaId}
          contas={contas}
          onTrocarConta={(id) => setExtratoContaId(id ?? "__todas__")}
          onChange={carregar}
          rolagemInicial={rolagemDoExtrato}
        />
      )}
      <EstoqueDrawer open={estoqueAberto} onOpenChange={setEstoqueAberto} />
      <ProjetosDrawer open={projetosAberto} onOpenChange={setProjetosAberto} onChange={carregar} />
      <ContratadosDrawer open={contratadosAberto} onOpenChange={setContratadosAberto} />
      <OrcamentoDrawer open={orcamentoAberto} onOpenChange={setOrcamentoAberto} />

      {/* Fase 12 (Workspace Financeiro) — Meu Trabalho e Favoritos. */}
      <LancamentoForm
        open={!!novoLancamentoAberto}
        onOpenChange={(v) => !v && setNovoLancamentoAberto(null)}
        tipoPadrao={novoLancamentoAberto ?? "saida"}
        onSaved={carregar}
      />
      <TransferenciaForm
        open={transferenciaAberta}
        onOpenChange={setTransferenciaAberta}
        onSaved={carregar}
      />
      {/* Fase 12 (23/09/2026) — "Registrar Remessa Missionária": mesmo
          `LancamentoForm` de sempre, só chega com a categoria "Repasses
          Missionários" já marcada (`categoriaIdPadrao`, prop nova, não
          trava o campo). `onSaved` recarrega os dois — o painel geral E
          o saldo missionário, que não faz parte de `carregar()`. */}
      <LancamentoForm
        open={remessaMissionariaAberta}
        onOpenChange={setRemessaMissionariaAberta}
        tipoPadrao="saida"
        categoriaIdPadrao={repassesCategoriaId ?? undefined}
        onSaved={() => { carregar(); carregarMissoesRemessa(); }}
      />
      {/* Detalhe de UMA remessa + "Editar" — ver RemessaMissionariaDetalheDrawer.tsx */}
      <RemessaMissionariaDetalheDrawer
        open={!!remessaDetalhe}
        onOpenChange={(v) => !v && setRemessaDetalhe(null)}
        lancamento={remessaDetalhe}
        saldoMissionario={missoesSaldo}
        onEditar={() => { setRemessaEditando(remessaDetalhe); setRemessaDetalhe(null); }}
      />
      <LancamentoForm
        open={!!remessaEditando}
        onOpenChange={(v) => !v && setRemessaEditando(null)}
        lancamento={remessaEditando}
        onSaved={() => { carregar(); carregarMissoesRemessa(); setRemessaEditando(null); }}
      />
      <FixarFavoritoDialog
        open={fixarAberto}
        onOpenChange={setFixarAberto}
        contas={contas}
        onFixado={carregarFavoritos}
      />
      <MissoesDrawer
        open={missoesDrawerAberto}
        onOpenChange={setMissoesDrawerAberto}
        categoriaId={categoriasEcl["missoes"] ?? null}
        podeVerContribuintes={hasRole(ROLES_DOADORES)}
      />
    </div>
  );
}

/**
 * Uma linha de vencimento dentro da Central de Pagamentos — Fase 12,
 * revisão da Central (23/09/2026), prioridades 2–4 de uma vez: favorecido
 * antes de descrição, tags de projeto/centro de custo quando existem
 * (migration 20260923110000 — antes disso a view nem entregava esses
 * dois), e um botão de anexo que abre o mesmo `AnexosLancamentoDialog` de
 * sempre, sem esperar o momento de pagar.
 */
function LinhaVencimento({ v, onPagar, onAnexo }: {
  v: FinVencimento; onPagar: () => void; onAnexo: () => void;
}) {
  const { principal, secundario } = nomeExtrato(v);
  return (
    <li className="py-1.5 border-t first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate min-w-0">
          <span className="font-semibold">{principal}</span>
          {secundario && <span className="text-muted-foreground"> · {secundario}</span>}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="tabular-nums font-medium">{brl(v.valor)}</span>
          <button type="button" onClick={onAnexo} title="Ver/anexar comprovante ou documento"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Paperclip className="w-3 h-3" />
          </button>
          <BotaoPagar vencimento={v} onClick={onPagar} />
        </div>
      </div>
      {(v.centro_custo_nome || v.projeto_nome) && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {v.centro_custo_nome && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{v.centro_custo_nome}</span>
          )}
          {v.projeto_nome && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-violeta-soft text-violeta-text">{v.projeto_nome}</span>
          )}
        </div>
      )}
    </li>
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
  // Fase 11b do Workspace Financeiro (23/09/2026): `onClick` é o atalho que
  // abre um drawer sem trocar de rota — `to` continua existindo pra quem
  // não tem drawer ainda (a maioria, por enquanto). Nunca os dois juntos
  // no mesmo link: ou abre por cima (drawer), ou navega (rota).
  links: { to?: string; onClick?: () => void; label: string; icone: LucideIcon }[];
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
        {links.map(l => l.onClick ? (
          <Button key={l.label} type="button" variant="outline" size="sm" className="gap-1.5" onClick={l.onClick}>
            <l.icone className="w-3.5 h-3.5" /> {l.label}
          </Button>
        ) : (
          <Button key={l.to} asChild variant="outline" size="sm" className="gap-1.5">
            <Link to={l.to!}><l.icone className="w-3.5 h-3.5" /> {l.label}</Link>
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
