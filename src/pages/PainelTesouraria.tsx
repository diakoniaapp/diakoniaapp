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

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign, Receipt, Wallet, ChevronRight, RefreshCw, Sparkles, Package,
  Clock, CalendarClock, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { carregarResumoFiscal, type ResumoFiscalDashboard } from "@/services/fiscalService";
import { brl, type FinVencimento, type FinAlertaCentro } from "@/services/finService";
import {
  listarCaixasAbertos, formatarTempoAberto, caixaEhUrgente, type CaixaAberto,
  listarPendencias, type PendenciaLancamento, DIAS_JANELA_COMPROVANTE,
  listarVencimentosDaSemana, listarAlertasOrcamento, DIAS_JANELA_VENCIMENTOS,
} from "@/services/painelTesourariaService";
import { AgendaFiscalUrgente } from "@/components/dashboard/AgendaFiscalUrgente";

export default function PainelTesouraria() {
  const [fiscal, setFiscal] = useState<ResumoFiscalDashboard | null>(null);
  const [caixas, setCaixas] = useState<CaixaAberto[]>([]);
  const [pendencias, setPendencias] = useState<PendenciaLancamento[]>([]);
  const [vencimentos, setVencimentos] = useState<FinVencimento[]>([]);
  const [alertasOrc, setAlertasOrc] = useState<FinAlertaCentro[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [f, c, p, v, a] = await Promise.all([
        carregarResumoFiscal(),
        listarCaixasAbertos(),
        listarPendencias(),
        listarVencimentosDaSemana(),
        listarAlertasOrcamento(),
      ]);
      setFiscal(f);
      setCaixas(c);
      setPendencias(p);
      setVencimentos(v);
      setAlertasOrc(a);
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
  const aprovacoesPendentes = pendencias.filter(p => p.motivo === "aprovacao");
  const semComprovante = pendencias.filter(p => p.motivo === "comprovante");
  const orcamentoCriticos = alertasOrc.filter(a => a.severidade === "critico");

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
              {resumoNatural(fiscal, caixas, caixasUrgentes, aprovacoesPendentes, semComprovante, vencimentos, orcamentoCriticos, alertasOrc)}
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
          <FaixaDeIndicadores colunas={5}>
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
              acao={<Link to="/financas" className="text-sm text-primary hover:underline">Abrir Tesouraria</Link>}
            >
              Pendências
            </TituloDaSecao>
            {pendencias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma aprovação parada e nenhum comprovante faltando nos últimos {DIAS_JANELA_COMPROVANTE} dias.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {pendencias.slice(0, 8).map(p => (
                  <li key={`${p.motivo}-${p.id}`} className="flex items-center gap-2 px-3 py-2.5 min-h-11">
                    <span className="text-sm min-w-0 flex-1">
                      <span className="font-medium">{p.descricao ?? p.categoria_nome ?? "Lançamento"}</span>
                      <span className="text-muted-foreground"> — {brl(p.valor)}</span>
                      <span className={p.motivo === "aprovacao" ? "text-warning-text" : "text-muted-foreground"}>
                        {" "}· {p.motivo === "aprovacao" ? "aguardando aprovação" : "sem comprovante"}
                      </span>
                    </span>
                  </li>
                ))}
                {pendencias.length > 8 && (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    + {pendencias.length - 8} outras — veja todas em Tesouraria.
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

          {/* ── Atalhos ────────────────────────────────────────────────── */}
          <section className="pt-1">
            <TituloDaSecao icone={DollarSign} tom="neutro">Ir para</TituloDaSecao>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas"><DollarSign className="w-3.5 h-3.5" /> Tesouraria</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas/fiscal"><Receipt className="w-3.5 h-3.5" /> Módulo Fiscal</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/arrecadacao"><Package className="w-3.5 h-3.5" /> Bazar e Cantina</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas/insights"><Sparkles className="w-3.5 h-3.5" /> Insights</Link>
              </Button>
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
  vencimentos: FinVencimento[],
  orcamentoCriticos: FinAlertaCentro[],
  alertasOrc: FinAlertaCentro[],
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
  if (vencimentos.length > 0) {
    fila.push(`${vencimentos.length} ${vencimentos.length === 1
      ? "vencimento nos próximos dias" : "vencimentos nos próximos dias"}`);
  }
  if (alertasOrc.length > 0) {
    fila.push(`${alertasOrc.length} ${alertasOrc.length === 1
      ? "centro de custo em atenção" : "centros de custo em atenção"}`);
  }
  if (fila.length === 0) return "Fiscal em dia, nenhum caixa aberto e nada pendente — tudo em ordem! 🙏";
  return `Nada urgente. Na fila: ${fila.join(", ")}.`;
}
