// ─── MesaDoTesoureiro.tsx — a aba "1 Operações" como mesa de trabalho ───────────
//
// Antes: três "Centrais" (Pagamentos, Arrecadação, Conciliação) — um painel de indicadores.
// Na rotina real o tesoureiro não abre o dia olhando quanto se arrecadou; abre olhando o que
// precisa PAGAR, o que VENCE, o que o banco vai DEBITAR sozinho, o que falta DOCUMENTAR e se o
// CAIXA aguenta. Esta é essa tela, na ordem em que a manhã dele acontece:
//
//   1. a faixa do dia  — caixa, compromissos, o que sobra, débitos a conferir;
//   2. contas a pagar  — atrasadas · hoje · amanhã · 7 dias · 30 dias, com Pagar e anexo;
//   3. seu dia         — o checklist (cada item diz o que falta ou que está em dia);
//   4. débitos automáticos — acompanhar, não pagar (previstos × encontrados × não encontrados);
//   5. pagamentos de hoje e comprovantes pendentes;
//   6. documentação, recorrências e extrato.
//
// Arrecadação (dízimos e ofertas) mora em "2 Gestão"; a conciliação, no checklist do
// "4 Fechamento" e no importador de extrato. Racional completo: docs/OPERACOES_MESA_DO_TESOUREIRO.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, FileText, Landmark,
  Loader2, Paperclip, Pencil, RefreshCw, RotateCw, Send, Wallet,
} from "lucide-react";
import { PrepararEnvioDialog } from "@/components/financas/envio/PrepararEnvioDialog";
import { ContasJaPagas } from "@/components/financas/ContasJaPagas";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { PagarReembolsoDialog } from "@/components/financas/PagarReembolsoDialog";
import { NotaQuitadaDialog } from "@/components/financas/NotaQuitadaDialog";
import { FilaDoDia } from "@/components/financas/mesa/FilaDoDia";
import { SaneamentoDeCadastros } from "@/components/financas/SaneamentoDeCadastros";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import { ROTULO_FILA, ROTULO_RESPONSAVEL } from "@/lib/quitacao";
import { contaPrevista, quemRecebe } from "@/lib/reembolsoApresentacao";
import { quitacaoDisponivel, quitacoesDasObrigacoes, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import { toast } from "sonner";
import { mensagemErro } from "@/lib/erroRede";
import { Button } from "@/components/ui/button";
import { brl, nomeExtrato, type FinLancamentoExtenso, type FinVencimento } from "@/services/finService";
import { hojeLocal } from "@/lib/data";
import { parciaisEmAberto, type ParcialEmAberto } from "@/services/obrigacoesService";
import { DIAS_DE_TOLERANCIA_DO_DEBITO, ehAutomatica, indicadoresDeDebitos, situacaoDoDebito } from "@/lib/formaLiquidacao";
import { DebitoChip } from "@/components/financas/DebitoChip";
import { CalendarioDeVencimentos } from "@/components/financas/mesa/CalendarioDeVencimentos";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoNaUrl } from "@/hooks/useEstadoNaUrl";
import {
  agruparVencimentos, coberturaDoCaixa, diasEntreDatas, montarChecklist, pendenciasDoChecklist,
  resumoDoCaixa, soma, totalAPagar, type ItemDoChecklist,
} from "@/lib/mesaOperacoes";
import { carregarMesa, type DadosDaMesa, type DebitoDoMes, type PagoRecente } from "@/services/mesaOperacoesService";

interface Props {
  /** Muda quando o painel recarrega (depois de pagar…): a mesa lê de novo. */
  chaveDeAtualizacao: number;
  onPagar: (v: FinVencimento) => void;
  onAnexo: (a: { id: string; label: string }) => void;
  onNovaSaida: () => void;
  onImportarExtrato: () => void;
  onRecorrencias: () => void;
}

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const rolarPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function Cartao({ id, titulo, subtitulo, direita, children, className = "" }: {
  id?: string; titulo: string; subtitulo?: string; direita?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border bg-card scroll-mt-[220px] ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="text-sm font-bold">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {direita && <div className="min-w-0 max-w-full text-right">{direita}</div>}
      </header>
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}

function Numero({ rotulo, valor, tom, detalhe, onClick }: { rotulo: string; valor: string; tom?: "bom" | "ruim" | "aviso" | "neutro"; detalhe?: string; onClick?: () => void }) {
  const cor = tom === "bom" ? "text-success-text" : tom === "ruim" ? "text-destructive-text" : tom === "aviso" ? "text-warning-text" : "";
  const miolo = (
    <>
      <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold leading-tight">{rotulo}</p>
      <p className={`text-lg font-extrabold tabular-nums truncate ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground truncate">{detalhe}</p>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="rounded-lg border bg-card px-3 py-2.5 min-w-0 text-left hover:border-gold/60 hover:bg-muted/30 transition-colors">{miolo}</button>
    : <div className="rounded-lg border bg-card px-3 py-2.5 min-w-0">{miolo}</div>;
}

export function LinhaDeConta({ v, temAnexo, parcial, quitacao, onPagar, onPagarReembolso, onEditar, onAnexo, onAbrir, chip }: {
  /** o chip da ação (vocabulário único da fila do dia), à frente da linha */
  chip?: React.ReactNode;
  v: FinVencimento; temAnexo: boolean; parcial?: ParcialEmAberto; quitacao?: QuitacaoDaObrigacao; onPagar: () => void; onPagarReembolso: () => void; onEditar: () => void; onAnexo: () => void; onAbrir: () => void;
}) {
  // Fase 1A da Quitação: se um terceiro já pagou o fornecedor, a igreja NÃO paga de novo — o botão Pagar dá lugar à fila em que a conta está.
  // EXCEÇÃO (20/10/2026): o reembolso JÁ APROVADO é dívida da igreja com a pessoa que pagou — aí o botão é "Pagar reembolso" (outro fluxo: paga a PESSOA, não o fornecedor).
  const reembolsoAPagar = !!quitacao && quitacao.fila === "reembolso_a_pagar";
  const terceiro = !!quitacao && quitacao.responsavel !== "nao_localizado" && !reembolsoAPagar;
  const { principal, secundario } = nomeExtrato(v);
  const dias = v.dias_para_vencer;
  const quando = dias < 0 ? `há ${Math.abs(dias)}d` : dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dataCurta(v.data);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-t first:border-t-0 text-sm min-w-0 sm:flex-nowrap">
      {chip && <span className="shrink-0 sm:w-[8.5rem]">{chip}</span>}
      <span className={`w-14 shrink-0 text-xs tabular-nums ${dias < 0 ? "text-destructive-text font-semibold" : "text-muted-foreground"}`}>{quando}</span>
      <span className="min-w-0 flex-1 basis-40">
        {/* reembolso a pagar: a dívida da igreja é com QUEM PAGOU — ele vem em destaque e o fornecedor passa a ser "o que ele quitou" (pedido dela, 22/10/2026) */}
        <span data-quem-recebe={reembolsoAPagar ? "" : undefined} className="block truncate font-medium">{reembolsoAPagar ? quemRecebe({ quem_recebe: quitacao.responsavelNome }) : principal}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {reembolsoAPagar
            ? <span data-reembolso-detalhe className="truncate">Quitou: {principal} · Conta prevista para pagamento: {contaPrevista({ conta_prevista: v.conta_nome })}</span>
            : secundario && <span className="truncate">{secundario}</span>}
          {v.centro_custo_nome && <span className="truncate">{v.centro_custo_nome}</span>}
          {v.valor_variavel && <span>valor estimado</span>}
        </span>
        {quitacao && (
          <span className="block text-xs text-warning-text">
            {quitacao.responsavel === "nao_localizado" ? "Marcada como Não localizado: ninguém sabe quem pagou"
              : reembolsoAPagar ? `Reembolso a pagar · saldo ${brl(quitacao.saldoAReembolsar ?? quitacao.valorDaObrigacao)}`
              : `Quitada por Terceiro — ${quitacao.responsavelNome ?? ROTULO_RESPONSAVEL[quitacao.responsavel]}`}{!reembolsoAPagar && quitacao.fila ? ` · fila: ${ROTULO_FILA[quitacao.fila]}` : ""}
          </span>
        )}
        {parcial && (
          <span className="block text-xs text-warning-text tabular-nums">
            Pago parcialmente: {brl(parcial.pago)} de {brl(parcial.original)} · saldo pendente {brl(parcial.saldo)}
          </span>
        )}
      </span>
      <span className="tabular-nums font-medium shrink-0">{brl(v.valor)}</span>
      <button type="button" onClick={onAnexo}
        title={temAnexo ? "Documento anexado — abrir" : "Sem documento — anexar boleto/fatura"}
        className={`rounded p-1.5 shrink-0 hover:bg-muted ${temAnexo ? "text-success-text" : "text-warning-text"}`}>
        <Paperclip className="w-3.5 h-3.5" />
      </button>
      {terceiro ? (
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onAbrir}>Ver quitação</Button>
      ) : (
        <>
          {/* Editar sem sair da Mesa: o MESMO formulário de lançamento (fornecedor, valor, categoria, centro, projeto, conta, vencimento); o anexo ao lado já cuida da documentação */}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onEditar} title="Editar obrigação" aria-label="Editar obrigação">
            <Pencil className="w-3 h-3" /> <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button variant="success" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={reembolsoAPagar ? onPagarReembolso : onPagar}>
            <CheckCircle2 className="w-3 h-3" /> {reembolsoAPagar ? "Pagar reembolso" : "Pagar agora"}
          </Button>
        </>
      )}
    </li>
  );
}

export function MesaDoTesoureiro({
  chaveDeAtualizacao, onPagar, onAnexo, onNovaSaida, onImportarExtrato, onRecorrencias,
}: Props) {
  const hoje = hojeLocal();
  const [dados, setDados] = useState<DadosDaMesa | null>(null);
  const [carregando, setCarregando] = useState(true);
  // LISTA (as janelas de sempre) ou CALENDÁRIO (o mês numa grade). O calendário substitui a Agenda Financeira (Fase A, 20/10/2026); `/financas/agenda` redireciona para cá com `?mesa=calendario`.
  // Pedido dela (20/10/2026): a Mesa abre SEMPRE no Calendário (formato agenda); trocar de aba leva à Fila. `?mesa=fila` abre a Fila direto (link compartilhável); nada é lembrado entre visitas.
  // A visão vai para a URL (`?mesa=fila`): abrir uma obrigação da Fila e voltar devolve a Fila; abrir pelo menu (sem parâmetro) continua no Calendário (decisão dela, 22/10/2026).
  const [naUrl, mudarNaUrl] = useEstadoNaUrl({ mesa: "" });
  const visao: "fila" | "calendario" = naUrl.mesa === "fila" ? "fila" : "calendario";
  const setVisao = (v: "fila" | "calendario") => mudarNaUrl({ mesa: v === "fila" ? "fila" : "" });
  // a fila relê as quitações quando algo muda aqui (reembolso pago, detalhe fechado…)
  const [recargaDaFila, setRecargaDaFila] = useState(0);
  const { hasRole } = useAuth();
  const podeOperar = hasRole(ROLES_FINANCEIRO);
  // "Preparar envio": os pagamentos que a Tesouraria manda aos tesoureiros por e-mail/WhatsApp (a Mesa passa só o que PODE ir: sem débito automático, sem o que um terceiro já quitou, até 7 dias)
  const [envioAberto, setEnvioAberto] = useState(false);
  // contas pagas parcialmente (liquidação real): a linha do saldo diz quanto já foi pago; sem a migration, mapa vazio
  const [parciais, setParciais] = useState<Map<string, ParcialEmAberto>>(new Map());
  // Fase 1A da Quitação: as contas em que um terceiro já pagou o fornecedor (vazio até a migration ser aplicada) e o detalhe aberto a partir delas
  const [quitacoes, setQuitacoes] = useState<Map<string, QuitacaoDaObrigacao>>(new Map());
  const [detalhe, setDetalhe] = useState<FinLancamentoExtenso | null>(null);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const [pagandoReembolso, setPagandoReembolso] = useState<QuitacaoDaObrigacao | null>(null);
  // Fase 1B: registrar uma NOTA que o aplicativo ainda não tinha, já quitada por terceiro (só depois da migration da Quitação)
  const [quitacaoOk, setQuitacaoOk] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  useEffect(() => { let vivo = true; quitacaoDisponivel().then(ok => { if (vivo) setQuitacaoOk(ok); }); return () => { vivo = false; }; }, [chaveDeAtualizacao]);
  useEffect(() => {
    let cancelado = false;
    parciaisEmAberto().then(m => { if (!cancelado) setParciais(m); }).catch(() => { /* melhoria: a mesa segue igual */ });
    return () => { cancelado = true; };
  }, [chaveDeAtualizacao]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setDados(await carregarMesa(hoje)); } finally { setCarregando(false); }
  }, [hoje]);
  useEffect(() => { carregar(); }, [carregar, chaveDeAtualizacao]);

  useEffect(() => {
    if (!dados) return;
    let vivo = true;
    quitacoesDasObrigacoes(dados.vencimentos.map(v => v.id)).then(mp => { if (vivo) setQuitacoes(mp); }).catch(() => { /* melhoria: a mesa segue igual */ });
    return () => { vivo = false; };
  }, [dados, chaveDeAtualizacao]);

  const derivados = useMemo(() => {
    if (!dados) return null;
    const { aPagar, automaticos } = agruparVencimentos(dados.vencimentos);
    const caixa = resumoDoCaixa(dados.contas);
    const compromissos7 = totalAPagar(aPagar, "semana");
    const cobertura = coberturaDoCaixa(caixa.disponivel, compromissos7);
    const ind = indicadoresDeDebitos(dados.debitos, hoje);
    // a conferir = JÁ passou do vencimento e o banco não confirmou (🟡 + 🔴); o que vence hoje ainda é só "previsto para hoje"
    const debitosAConferir = ind.aguardando + ind.naoEncontrados;
    const pagosHoje = dados.pagosRecentes.filter(p => p.dia === hoje);
    const semComprovante = dados.pagosRecentes.filter(p => !p.temComprovante);
    const checklist = montarChecklist({
      atrasadas: aPagar.atrasadas.length, venceHoje: aPagar.hoje.length, debitosAConferir,
      comprovantesPendentes: semComprovante.length,
      diasSemExtrato: dados.ultimoMovimentoBanco ? diasEntreDatas(dados.ultimoMovimentoBanco, hoje) : null,
      documentosFaltando: (dados.documentos?.pendencias ?? 0) + (dados.documentosAnterior?.resumo.pendencias ?? 0),
    });
    const porId = new Map(dados.vencimentos.map(v => [v.id, v]));
    // o que ficou atrasado ANTES do mês corrente: a grade do calendário só mostra o mês aberto, a Fila mostra tudo
    const primeiroDia = hoje.slice(0, 7) + "-01";
    const velhas = aPagar.atrasadas.filter(v => String(v.data).slice(0, 10) < primeiroDia);
    const velhosDebitos = dados.debitos.filter(d => d.status === "previsto" && d.data < primeiroDia);
    const atrasadasDeAntes = { n: velhas.length + velhosDebitos.length, total: velhas.reduce((t, v) => t + Number(v.valor), 0) + velhosDebitos.reduce((t, d) => t + d.valor, 0) };
    return { aPagar, automaticos, caixa, compromissos7, cobertura, ind, debitosAConferir, pagosHoje, semComprovante, checklist, porId, atrasadasDeAntes };
  }, [dados, hoje]);

  if (!dados || !derivados) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Montando a mesa de hoje…
      </p>
    );
  }
  const { aPagar, caixa, compromissos7, cobertura, ind, pagosHoje, semComprovante, checklist, porId } = derivados;
  // os itens do checklist que NÃO são um dos quatro números do topo (atrasadas, hoje e débitos já são números)
  const tambemHoje = checklist.filter(i => !i.feito && !["atrasadas", "hoje", "debitos"].includes(i.chave));
  const irParaAFila = () => { setVisao("fila"); window.setTimeout(() => rolarPara("mesa-contas"), 60); };

  /** A linha de uma conta a pagar, com o chip da ação à frente — a MESMA da Mesa, agora dentro da fila única. */
  const renderConta = (v: FinVencimento, chip: React.ReactNode) => (
    <LinhaDeConta key={v.id} v={v} chip={chip} temAnexo={dados.comAnexo.has(v.id)} parcial={parciais.get(v.id)} quitacao={quitacoes.get(v.id)}
      onPagar={() => onPagar(v)} onAnexo={() => onAnexo({ id: v.id, label: nomeExtrato(v).principal })}
      onPagarReembolso={() => { const q = quitacoes.get(v.id); if (q) setPagandoReembolso(q); }}
      onEditar={() => { void buscarLancamentoParaEditar(v.id).then(l => { if (l) setEditando(l); else toast.error("Não encontrei esta obrigação — atualize a mesa."); }).catch(e => toast.error(mensagemErro(e))); }}
      onAbrir={() => { void buscarLancamentoParaEditar(v.id).then(l => { if (l) setDetalhe(l); }).catch(() => { /* só não abre */ }); }} />
  );
  const abrirObrigacao = (id: string) => { void buscarLancamentoParaEditar(id).then(l => { if (l) setDetalhe(l); else toast.error("Não encontrei a obrigação — atualize a mesa."); }).catch(e => toast.error(mensagemErro(e))); };
  const obrigacoesComQuitacao = new Set(quitacoes.keys());

  return (
    <div className="space-y-4">
      {/* 1 · o "Seu dia": quatro números que levam ao que pede ação. Substituem a coluna lateral (que deixava um buraco do tamanho da Fila e repetia estes mesmos números) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-seu-dia>
        <Numero rotulo="▲ Atrasadas" valor={String(aPagar.atrasadas.length)} tom={aPagar.atrasadas.length > 0 ? "ruim" : "bom"}
          detalhe={aPagar.atrasadas.length > 0 ? `${brl(soma(aPagar.atrasadas))} · resolver →` : "nada atrasado"}
          onClick={aPagar.atrasadas.length > 0 ? irParaAFila : undefined} />
        <Numero rotulo="Vencem hoje" valor={String(aPagar.hoje.length)} tom={aPagar.hoje.length > 0 ? "aviso" : "bom"}
          detalhe={aPagar.hoje.length > 0 ? `${brl(soma(aPagar.hoje))} · pagar →` : "nada vence hoje"}
          onClick={aPagar.hoje.length > 0 ? irParaAFila : undefined} />
        <Numero rotulo="Débitos a conferir" valor={String(derivados.debitosAConferir)} tom={derivados.debitosAConferir > 0 ? "ruim" : "bom"}
          detalhe={dados.debitosIndisponiveis ? "migration pendente" : ind.naoEncontrados > 0 ? `${ind.naoEncontrados} possível falha${ind.naoEncontrados > 1 ? "s" : ""} · conferir →` : "aguardando confirmação do banco"}
          onClick={derivados.debitosAConferir > 0 ? irParaAFila : undefined} />
        <Numero rotulo={cobertura.cobre ? "Sobra depois de pagar a semana" : "Falta para pagar a semana"} valor={brl(Math.abs(cobertura.saldoDepois))}
          tom={cobertura.cobre ? "bom" : "ruim"} detalhe={`caixa ${brl(caixa.disponivel)} · a pagar em 7 dias ${brl(compromissos7)}`} />
      </div>

      {tambemHoje.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-card px-3 py-2 text-xs" data-tambem-hoje>
          <span className="font-bold uppercase tracking-wide text-muted-foreground text-2xs">Também hoje</span>
          {tambemHoje.map(i => {
            const acao = acaoDoItem(i.chave, { onImportarExtrato });
            const rotulo = <>{i.rotulo}<span className="text-muted-foreground"> · {i.detalhe}</span></>;
            const cls = "rounded-full border bg-background px-2.5 py-1 hover:bg-muted/60";
            return i.chave === "documentos"
              ? <Link key={i.chave} to="/financas/documentos" className={cls}>{rotulo}</Link>
              : acao ? <button key={i.chave} type="button" onClick={acao} className={cls}>{rotulo}</button>
              : <span key={i.chave} className={cls}>{rotulo}</span>;
          })}
        </div>
      ) : (
        <p className="text-xs text-success-text px-1" data-tambem-hoje>✓ Comprovantes, extrato e documentos em dia.</p>
      )}

      {dados.erros.length > 0 && (
        <p className="text-xs text-warning-text border border-warning-line bg-warning-soft/40 rounded-md px-3 py-2">
          Parte da mesa não carregou ({dados.erros.map(e => e.split(":")[0]).join(", ")}). O resto está correto.
        </p>
      )}

      <div className="space-y-4">
        {/* 2 · contas a pagar — a lista de obrigações é o ambiente de trabalho: largura inteira */}
        <Cartao id="mesa-contas" titulo={visao === "calendario" ? "Calendário de vencimentos" : "Fila do dia"}
          subtitulo={visao === "calendario" ? "O mês de uma vez: contas e débitos automáticos — clique num dia" : "O que pede você agora: contas, débitos e quitações — um vocabulário, uma ordem"}
          direita={<div className="flex flex-wrap justify-end gap-1.5">
            <div role="group" aria-label="Visão" className="inline-flex overflow-hidden rounded-md border">
              {(["calendario", "fila"] as const).map(v => (
                <button key={v} type="button" aria-pressed={visao === v} onClick={() => setVisao(v)}
                  className={`h-7 px-2.5 text-xs font-medium ${visao === v ? "bg-gold text-gold-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>{v === "fila" ? "Fila" : "Calendário"}</button>
              ))}
            </div>
            {podeOperar && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setEnvioAberto(true)}><Send className="w-3 h-3" /> Preparar envio</Button>}
            {quitacaoOk && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setNotaAberta(true)}>NF já quitada por terceiro</Button>}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onNovaSaida}>+ Nova conta</Button>
          </div>}>
          {visao === "calendario" && derivados.atrasadasDeAntes.n > 0 && (
            <p role="status" data-atrasadas-de-antes className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-destructive-line bg-destructive-soft/40 px-3 py-2 text-xs text-destructive-text">
              <span>▲ {derivados.atrasadasDeAntes.n} {derivados.atrasadasDeAntes.n === 1 ? "obrigação atrasada" : "obrigações atrasadas"} de meses anteriores ({brl(derivados.atrasadasDeAntes.total)}) — não aparecem na grade deste mês.</span>
              <button type="button" className="font-medium underline underline-offset-2" onClick={() => setVisao("fila")}>Ver na Fila</button>
            </p>
          )}
          {visao === "calendario" ? (
            <CalendarioDeVencimentos hoje={hoje} podeOperar={podeOperar} chaveDeAtualizacao={chaveDeAtualizacao} onMudou={carregar} />
          ) : <>
          {/* conta aberta que já tem pagamento no extrato (criada depois dele, ou a linha entrou como lançamento comum): um registro só */}
          <ContasJaPagas chave={chaveDeAtualizacao} onMudou={carregar} />
          <FilaDoDia hoje={hoje} vencimentos={dados.vencimentos} debitos={dados.debitos} obrigacoesComQuitacao={obrigacoesComQuitacao} chave={chaveDeAtualizacao + recargaDaFila}
            acoes={{ renderConta, onAbrirObrigacao: abrirObrigacao, onPagarReembolso: q => setPagandoReembolso(q), podePagar: podeOperar,
              onMarcarDebitado: id => { const v = porId.get(id); if (v) onPagar(v); else abrirObrigacao(id); } }} />
          </>}
        </Cartao>

        {/* o que sobra do dia: saneamento de cadastros e pagamentos de hoje — só aparecem quando há o que mostrar */}
        <div className="grid gap-4 empty:hidden md:grid-cols-2">
          {/* as filas e os prazos da Quitação agora são itens da Fila do dia (um vocabulário só) */}
          <SaneamentoDeCadastros chave={chaveDeAtualizacao} />
          {pagosHoje.length > 0 && (
            <Cartao titulo="Pagamentos de hoje" subtitulo={`${pagosHoje.length} · ${brl(soma(pagosHoje))}`}>
              <ul>
                {pagosHoje.slice(0, 8).map(p => <LinhaPaga key={p.id} p={p} onAnexo={() => onAnexo({ id: p.id, label: p.fornecedor || p.descricao })} />)}
              </ul>
            </Cartao>
          )}
        </div>
      </div>

      {/* 4 · débitos automáticos */}
      <Cartao id="mesa-debitos" titulo="Débitos automáticos"
        subtitulo="Contas que o banco debita sozinho — você só confere se aconteceu"
        direita={<Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onImportarExtrato}>Importar extrato</Button>}>
        {dados.debitosIndisponiveis ? (
          <p className="text-sm text-muted-foreground">
            Para separar os débitos automáticos das contas a pagar falta aplicar a migration{" "}
            <code className="text-xs">20261006120000_fin_forma_liquidacao.sql</code>. Até lá, tudo continua em "Contas a pagar".
          </p>
        ) : dados.debitos.length === 0 ? (
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
            Nenhuma conta deste mês está marcada como débito automático. Escolha a forma de liquidação ao criar ou editar a recorrência.
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onRecorrencias}><RotateCw className="w-3 h-3" /> Abrir recorrências</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2" data-indicadores-de-debitos>
              <Numero rotulo="Débitos previstos hoje" valor={String(ind.previstosHoje)} detalhe={ind.aVencer > 0 ? `+ ${ind.aVencer} a vencer no mês` : "o banco debita hoje"} />
              <Numero rotulo="Aguardando confirmação bancária" valor={String(ind.aguardando)} tom={ind.aguardando > 0 ? "aviso" : "neutro"} detalhe="venceram; o banco ainda não confirmou" />
              <Numero rotulo="Débitos confirmados" valor={String(ind.encontrados)} tom="bom" detalhe={brl(ind.valorDebitado)} />
              <Numero rotulo="Possíveis falhas de débito" valor={String(ind.naoEncontrados)} tom={ind.naoEncontrados > 0 ? "ruim" : "neutro"} detalhe={`sem confirmação há mais de ${DIAS_DE_TOLERANCIA_DO_DEBITO} dias`} />
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">{ind.previstos} débitos no mês · previsto {brl(ind.valorPrevisto)} · o sistema NUNCA marca "realizado" sozinho: só a confirmação do banco (OFX ou PDF) ou a sua conferência.</p>
            <ul>
              {dados.debitos.map(d => (
                <LinhaDeDebito key={d.id} d={d} hoje={hoje}
                  venc={porId.get(d.id)} onConferir={(v) => onPagar(v)} />
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <div className="grid gap-4 md:grid-cols-3">
        {/* comprovantes pendentes */}
        <Cartao titulo="Comprovantes pendentes" subtitulo={`Pagamentos dos últimos 7 dias sem comprovante`}>
          {semComprovante.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os pagamentos recentes têm comprovante.</p>
          ) : (
            <ul>
              {semComprovante.slice(0, 6).map(p => <LinhaPaga key={p.id} p={p} onAnexo={() => onAnexo({ id: p.id, label: p.fornecedor || p.descricao })} mostrarDia />)}
              {semComprovante.length > 6 && <li className="text-xs text-muted-foreground pt-1">+ {semComprovante.length - 6} outros.</li>}
            </ul>
          )}
        </Cartao>

        {/* documentação */}
        <Cartao titulo="Documentos para a contabilidade" subtitulo="Pagamentos que exigem documento — mês atual e o que ainda está em fechamento">
          {dados.documentos ? (
            <div className="space-y-2">
              {dados.documentosAnterior && (
                <ResumoDeDocumentos rotulo={dados.documentosAnterior.rotulo} r={dados.documentosAnterior.resumo} />
              )}
              <ResumoDeDocumentos rotulo="Este mês" r={dados.documentos} />
              <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                <Link to="/financas/documentos"><FileText className="w-3 h-3" /> Abrir Central de Documentos</Link>
              </Button>
            </div>
          ) : <p className="text-sm text-muted-foreground">Não foi possível calcular a cobertura agora.</p>}
        </Cartao>

        {/* recorrências e extrato */}
        <Cartao titulo="Recorrências e extrato" subtitulo="O que se repete e o que o banco já mostrou">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0"><RotateCw className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {dados.recorrenciasAtivas} recorrência{dados.recorrenciasAtivas === 1 ? "" : "s"} ativa{dados.recorrenciasAtivas === 1 ? "" : "s"}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onRecorrencias}>Abrir <ArrowRight className="w-3 h-3" /></Button>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {dados.ultimoMovimentoBanco
                  ? `Último movimento no banco: ${dataCurta(dados.ultimoMovimentoBanco)}`
                  : "Sem movimento no banco"}
              </span>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onImportarExtrato}>Importar <ArrowRight className="w-3 h-3" /></Button>
            </li>
            <li className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="flex items-center gap-1.5 min-w-0"><Wallet className="w-3.5 h-3.5 shrink-0" /> Cartão de crédito em aberto</span>
              <span className="tabular-nums">{brl(Math.abs(caixa.cartao))}</span>
            </li>
          </ul>
        </Cartao>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar a mesa
        </Button>
      </div>

      <PrepararEnvioDialog aberto={envioAberto} onFechar={() => setEnvioAberto(false)} hojeYmd={hoje} onAbrirObrigacao={abrirObrigacao}
        candidatas={envioAberto ? dados.vencimentos
          .filter(v => !ehAutomatica(v.forma_liquidacao) && !obrigacoesComQuitacao.has(v.id) && v.dias_para_vencer <= 7)
          .map(v => ({ v, valor: parciais.get(v.id)?.saldo ?? v.valor })) : []} />

      <DetalhesDoLancamento lancamento={detalhe} onFechar={() => { setDetalhe(null); setRecargaDaFila(n => n + 1); }} />
      <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); void carregar(); }} />
      <PagarReembolsoDialog alvo={pagandoReembolso} onFechar={() => setPagandoReembolso(null)} onFeito={() => { setPagandoReembolso(null); setRecargaDaFila(n => n + 1); void carregar(); }} />
      <NotaQuitadaDialog aberto={notaAberta} onFechar={() => setNotaAberta(false)}
        onFeito={id => { void carregar(); void buscarLancamentoParaEditar(id).then(l => { if (l) setDetalhe(l); }).catch(() => { /* só não abre o detalhe */ }); }} />
    </div>
  );
}

function ResumoDeDocumentos({ rotulo, r }: { rotulo: string; r: { exigem: number; comDocumento: number; pendencias: number; cobertura: number } }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{rotulo}</p>
      {r.exigem === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento a documentar ainda.</p>
      ) : (
        <>
          <p className="text-xl font-extrabold tabular-nums leading-tight">{r.cobertura.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p>
          <p className="text-xs text-muted-foreground">
            {r.comDocumento} de {r.exigem} com documentação completa
            {r.pendencias > 0 && <> · <b className="text-warning-text">{r.pendencias} faltando</b></>}
          </p>
        </>
      )}
    </div>
  );
}

function acaoDoItem(chave: string, a: { onImportarExtrato: () => void }): (() => void) | null {
  switch (chave) {
    case "atrasadas": case "hoje": return () => rolarPara("mesa-contas");
    case "debitos": return () => rolarPara("mesa-debitos");
    case "extrato": return a.onImportarExtrato;
    default: return null;
  }
}

function LinhaPaga({ p, onAnexo, mostrarDia }: { p: PagoRecente; onAnexo: () => void; mostrarDia?: boolean }) {
  return (
    <li className="flex items-center gap-2 py-1.5 border-t first:border-t-0 text-sm min-w-0">
      {mostrarDia && <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(p.dia)}</span>}
      <span className="min-w-0 flex-1 truncate">{p.fornecedor || p.descricao || "(sem descrição)"}</span>
      <span className="tabular-nums text-xs shrink-0">{brl(p.valor)}</span>
      <button type="button" onClick={onAnexo} title={p.temComprovante ? "Comprovante anexado" : "Anexar comprovante"}
        className={`rounded p-1 shrink-0 hover:bg-muted ${p.temComprovante ? "text-success-text" : "text-warning-text"}`}>
        <Paperclip className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

function LinhaDeDebito({ d, hoje, venc, onConferir }: {
  d: DebitoDoMes; hoje: string; venc?: FinVencimento; onConferir: (v: FinVencimento) => void;
}) {
  const s = situacaoDoDebito(d, hoje);
  if (!s) return null;
  return (
    <li className="flex items-center gap-2 py-2 border-t first:border-t-0 text-sm min-w-0">
      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(d.data)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{d.fornecedor || d.descricao || "(sem descrição)"}</span>
        <span className="block text-xs text-muted-foreground truncate">
          {d.variavel ? "valor variável (estimado)" : "valor fixo"}
          {s === "encontrado" && d.dataPagamento && ` · debitado em ${dataCurta(String(d.dataPagamento).slice(0, 10))}`}
        </span>
      </span>
      <span className="tabular-nums font-medium shrink-0">{brl(d.valor)}</span>
      <DebitoChip situacao={s} />
      {s !== "encontrado" && venc && d.data <= hoje && (
        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => onConferir(venc)}
          title="Já conferi no banco: marcar como debitado">
          Marcar debitado
        </Button>
      )}
    </li>
  );
}
