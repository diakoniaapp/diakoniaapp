// ─── QuitacaoCard — quem pagou esta obrigação e por quê, com o que o sistema DEDUZ disso (grau, risco, resultado, credor, fila) ──────────────────────
//
// Fase 1A da Política de Compras por Terceiros, Reembolsos e Doações. Aparece no detalhe da despesa. Os FATOS (responsável, intenção, datas) são os que a Tesouraria registrou;
// o grau de prova nasce dos anexos, e o nível de risco, a suficiência, o resultado, o credor atual e a fila são DERIVADOS pelo banco (vw_fin_quitacao) — nada aqui é digitado.
// Aprovar o reembolso é uma decisão própria: NÃO paga, NÃO gera liquidação, NÃO mexe em conta nem em saldo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, Paperclip, ShieldCheck, UserRoundCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CancelarNotaDialog } from "@/components/financas/CancelarNotaDialog";
import { DeclaracaoDoTerceiroCard } from "@/components/financas/DeclaracaoDoTerceiroCard";
import { PagarReembolsoDialog } from "@/components/financas/PagarReembolsoDialog";
import { MudarIntencaoDialog } from "@/components/financas/MudarIntencaoDialog";
import { QuitacaoDialog } from "@/components/financas/QuitacaoDialog";
import { useAuth } from "@/hooks/useAuth";
import { mensagemErro } from "@/lib/erroRede";
import { bloqueioDaMudanca, ehTrocavel } from "@/lib/mudarIntencao";
import {
  MOTIVO_OFERTA_ALTO_RISCO, ROTULO_FILA, ROTULO_GRAU, ROTULO_INTENCAO, ROTULO_NIVEL, ROTULO_RESPONSAVEL, ROTULO_RESULTADO, alcadaDoReembolso, type Grau, type Nivel,
} from "@/lib/quitacao";
import { adicionarAnexo, brl, conciliarLancamento, desconciliarLancamento, type FinAnexoTipo, type FinLancamentoExtenso, FIN_ANEXO_TIPO_LABEL } from "@/services/finService";
import {
  carregarParametros, decidirQuitacao, declaracaoDisponivel, eventosDaQuitacao, mudarIntencaoDisponivel, quitacaoDaObrigacao, quitacaoDisponivel, removerQuitacao,
  type EventoDaQuitacao, type QuitacaoDaObrigacao,
} from "@/services/quitacaoService";
import type { ParametrosDaQuitacao } from "@/lib/quitacao";

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
/** data e HORA (auditoria completa: usuário, data, hora). O horário é o de Brasília. */
const dataHoraBr = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return dataBr(iso);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
};
/** A decisão que ainda vale: a mais recente do tipo, e só se a quitação (ou os dados da declaração) não mudou depois dela (a mesma regra do banco). */
function decisaoVigente(eventos: EventoDaQuitacao[] | null, tipo: "aprovacao_reembolso" | "aprovacao_relatado"): EventoDaQuitacao | null {
  if (!eventos) return null;
  const mudancas = eventos.filter(e => e.evento === "registrada" || e.evento === "alterada" || e.evento === "declaracao_invalidada" || e.evento === "intencao_mudada").map(e => e.em).sort();
  const ultimaMudanca = mudancas[mudancas.length - 1] ?? "";
  const dec = eventos.filter(e => e.evento === tipo && e.em > ultimaMudanca).sort((a, b) => (a.em < b.em ? -1 : 1));
  return dec[dec.length - 1] ?? null;
}
/** A última decisão POSITIVA do tipo, mesmo que já tenha caído: serve para avisar que foi preciso decidir de novo. */
function decisaoQueCaiu(eventos: EventoDaQuitacao[] | null, tipo: "aprovacao_reembolso" | "aprovacao_relatado"): EventoDaQuitacao | null {
  if (!eventos) return null;
  const dec = eventos.filter(e => e.evento === tipo && e.decisao === "aprovada").sort((a, b) => (a.em < b.em ? -1 : 1));
  return dec[dec.length - 1] ?? null;
}
const COR_GRAU: Record<Grau, string> = { formal: "border-success-line bg-success-soft/60 text-success-text", relatado: "border-warning-line bg-warning-soft/60 text-warning-text", nenhum: "border-destructive-line bg-destructive-soft text-destructive-text" };
const COR_NIVEL: Record<Nivel, string> = { baixo: "border-success-line bg-success-soft/60 text-success-text", medio: "border-warning-line bg-warning-soft/60 text-warning-text", alto: "border-destructive-line bg-destructive-soft text-destructive-text" };
const EVENTO: Record<string, string> = {
  registrada: "Registrada", alterada: "Alterada", removida: "Removida", aprovacao_reembolso: "Decisão sobre o reembolso", aprovacao_relatado: "Decisão sobre o grau Relatado", parametros: "Parâmetros alterados",
  extinta_por_oferta: "Obrigação extinta por oferta", extincao_desfeita: "Extinção desfeita", reembolso_pago: "Reembolso pago",
  declaracao_gerada: "Declaração do Terceiro gerada", declaracao_assinada: "Declaração do Terceiro assinada", declaracao_invalidada: "Declaração invalidada (os dados mudaram)", intencao_mudada: "Intenção mudada",
};

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

export function QuitacaoCard({ lancamento, recarga, onMudou }: { lancamento: FinLancamentoExtenso; recarga?: number; onMudou?: () => void }) {
  const { hasRole } = useAuth();
  const [pronto, setPronto] = useState<boolean | null>(null);
  const [q, setQ] = useState<QuitacaoDaObrigacao | null>(null);
  const [par, setPar] = useState<ParametrosDaQuitacao | null>(null);
  const [eventos, setEventos] = useState<EventoDaQuitacao[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [dialogo, setDialogo] = useState<"registrar" | "corrigir" | null>(null);
  const [remover, setRemover] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [declDisp, setDeclDisp] = useState(false);   // Fase 1D-a: com a Declaração do Terceiro gerada pelo sistema, os botões de anexar declaração/pedido à mão saem
  const [cancelando, setCancelando] = useState(false);
  const [mudarDisp, setMudarDisp] = useState(false);   // Fase 2B aplicada no banco: só então a ação "Mudar intenção" aparece
  const [mudando, setMudando] = useState(false);
  const [recusar, setRecusar] = useState<null | "reembolso" | "relatado">(null);
  const [aprovando, setAprovando] = useState(false);   // a aprovação do Administrador exige a justificativa (pelo menos 10 letras): fica registrada na quitação
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [n, setN] = useState(0);
  const recarregar = useCallback(() => { setN(x => x + 1); onMudou?.(); }, [onMudou]);
  const alvo = useMemo(() => ({ id: lancamento.id, descricao: lancamento.descricao ?? "", valor: Number(lancamento.valor) }), [lancamento.id, lancamento.descricao, lancamento.valor]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const ok = await quitacaoDisponivel();
      if (!vivo) return;
      setPronto(ok);
      if (!ok) return;
      const [quitacao, parametros] = await Promise.all([quitacaoDaObrigacao(lancamento.id).catch(() => null), carregarParametros()]);
      if (!vivo) return;
      setQ(quitacao); setPar(parametros);
      setDeclDisp(await declaracaoDisponivel().catch(() => false));
      setMudarDisp(await mudarIntencaoDisponivel().catch(() => false));
      // o histórico se lê sempre: quem decidiu e quando (usuário, data e hora) aparece no cartão, não só na lista aberta
      setEventos(quitacao ? await eventosDaQuitacao(quitacao.quitacaoId).catch(() => []) : null);
    })();
    return () => { vivo = false; };
  }, [lancamento.id, n, recarga]);

  if (!pronto || lancamento.tipo !== "saida") return null;
  // quitada por terceiro (oferta): o status do lançamento é `quitado_terceiro` — a obrigação está extinta, sem caixa, sem banco e sem extrato; a quitação ainda pode ser corrigida (se não foi enviada)
  const quitada = (lancamento.status as string) === "quitado_terceiro";
  const aberta = lancamento.status === "previsto" || quitada;
  const conferidaEm = (lancamento as unknown as { conferido_em?: string | null }).conferido_em ?? null;
  const podeEscrever = hasRole(["admin", "diakonia", "secretaria", "tesouraria"]);
  const ehAdmin = hasRole(["admin"]);
  // Fase 2B: Oferta ⇄ Reembolso é uma ação própria; reembolso já pago não volta a Oferta (é caso do estorno)
  const bloqueioMudanca = q ? bloqueioDaMudanca({ intencao: q.intencao, reembolsado: q.reembolsado, aberta }) : null;
  // sem quitação e a despesa já paga (ou cancelada): o cartão não tem o que mostrar
  if (!q && !aberta) return null;

  async function anexar(tipo: FinAnexoTipo, arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    try { await adicionarAnexo(lancamento.id, arquivo, tipo); toast.success(`${FIN_ANEXO_TIPO_LABEL[tipo]} anexado.`); recarregar(); }
    catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function decidir(tipo: "reembolso" | "relatado", decisao: "aprovada" | "recusada") {
    if (!q) return;
    setOcupado(true);
    try {
      await decidirQuitacao(q.quitacaoId, tipo, decisao, motivo.trim() || undefined);
      toast.success(decisao === "aprovada" ? (tipo === "reembolso" ? "Reembolso aprovado: a igreja assume a dívida com o terceiro. Nada foi pago." : "Aprovação do Administrador registrada, com a justificativa.") : "Decisão registrada.");
      setRecusar(null); setAprovando(false); setMotivo(""); recarregar();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function conferir(marcar: boolean) {
    setOcupado(true);
    try { if (marcar) await conciliarLancamento(lancamento.id); else await desconciliarLancamento(lancamento.id); toast.success(marcar ? "Conferida. O status não mudou: a obrigação segue quitada por terceiro." : "Conferência desmarcada."); recarregar(); }
    catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }
  async function removerQuitacaoAgora() {
    if (!q) return;
    setOcupado(true);
    try { await removerQuitacao(q.quitacaoId, motivo.trim()); toast.success("Quitação removida; a despesa volta a poder ser paga pela igreja."); setRemover(false); setMotivo(""); recarregar(); }
    catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }

  const precisaDeAprovar = q?.fila === "aprovar_reembolso";
  const alcada = q && par ? alcadaDoReembolso(q.valorDaObrigacao, par.teto1) : "tesouraria";
  const possoAprovarReembolso = !!q && precisaDeAprovar && (alcada === "tesouraria" ? hasRole(["admin", "tesouraria"]) : ehAdmin);
  const possoPagarReembolso = !!q && q.fila === "reembolso_a_pagar" && podeEscrever;
  const possoAprovarRelatado = !!q && q.exigeAprovacaoDoAdministrador && ehAdmin && !q.aprovacaoDoRelatado;
  // Oferta: a nota da igreja + a Declaração do Terceiro assinada bastam (15/10/2026). O comprovante do pagamento do terceiro só entra no ALTO RISCO, onde a alternativa é a aprovação do Administrador.
  const ofertaAltoRisco = !!q && q.intencao === "oferta" && (q.nivelRisco === "alto" && (q.motivoInsuficiencia ?? "").startsWith(MOTIVO_OFERTA_ALTO_RISCO));
  const ofertaSemComprovante = !!q && q.intencao === "oferta" && q.nivelRisco !== "alto";

  return (
    <section aria-label="Quitação" className="space-y-2 rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quem pagou</h3>
        {q && <Chip cls="border-border bg-muted text-foreground">{ROTULO_RESULTADO[q.resultado]}</Chip>}
        {q?.fila && <Chip cls="border-warning-line bg-warning-soft/60 text-warning-text">Fila: {ROTULO_FILA[q.fila]}</Chip>}
        {q?.bloqueiaFechamento && <Chip cls="border-destructive-line bg-destructive-soft text-destructive-text">Bloqueia o fechamento</Chip>}
        {quitada && <Chip cls="border-info-line bg-info-soft text-info-text">Quitada por terceiro</Chip>}
      </div>
      {quitada && (
        <p className="text-xs text-info-text">
          Oferta com prova suficiente: a obrigação está <b>extinta</b>, sem caixa, sem banco e sem extrato; nenhum saldo mudou. {conferidaEm ? <>Conferida em {dataHoraBr(conferidaEm)}.</> : <>Falta só a <b>conferência</b> da Tesouraria para ficar Pronta.</>}
        </p>
      )}

      {!q && (
        <>
          <p className="text-sm text-muted-foreground">Nenhuma quitação registrada: a conta está em aberto e quem a paga é a igreja. Se um terceiro (pessoa, empresa ou entidade) já pagou o fornecedor, registre — a conta <b>não</b> deve ser paga de novo.</p>
          {podeEscrever && <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setDialogo("registrar")}><UserRoundCheck className="h-3.5 w-3.5" /> Outra pessoa pagou? Registrar</Button>}
          {podeEscrever && lancamento.status === "previsto" && <Button size="sm" variant="ghost" className="h-8" onClick={() => setCancelando(true)}>Nota cancelada com o emitente…</Button>}
        </>
      )}

      {q && (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-3">
            <div><dt className="text-[11px] text-muted-foreground">Responsável</dt><dd className="min-w-0 break-words">{q.responsavelNome ? <b>{q.responsavelNome}</b> : null}{q.responsavelNome ? " · " : ""}{ROTULO_RESPONSAVEL[q.responsavel]}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Intenção</dt><dd>{ROTULO_INTENCAO[q.intencao]}{q.declaradoEm ? ` · declarada em ${dataBr(q.declaradoEm)}` : ""}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Pagou o fornecedor em</dt><dd className="tabular-nums">{dataBr(q.pagoEm)}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Credor atual</dt><dd>{{ emitente: "O fornecedor", terceiro: "O terceiro (dívida da igreja)", nenhum: "Ninguém", em_analise: "Em análise" }[q.credorAtual]}</dd></div>
          </dl>

          {q.responsavel !== "nao_localizado" && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Prova:</span>
              {ofertaSemComprovante && q.grauResponsavel !== "formal"
                ? <Chip cls="border-border text-muted-foreground">pagamento do terceiro: não exigido</Chip>
                : <Chip cls={COR_GRAU[q.grauResponsavel]}>pagamento {ROTULO_GRAU[q.grauResponsavel]}</Chip>}
              <Chip cls={COR_GRAU[q.grauIntencao]}>intenção {ROTULO_GRAU[q.grauIntencao]}</Chip>
              <span className="text-muted-foreground">Risco:</span>
              <Chip cls={COR_NIVEL[q.nivelRisco]}>{ROTULO_NIVEL[q.nivelRisco]}</Chip>
              {q.moduladores.length > 0 && <span className="text-muted-foreground">({q.moduladores.map(m => m === "vencida" ? "formalização vencida" : m).join(", ")})</span>}
            </div>
          )}
          {q.motivoInsuficiencia && !q.suficiente && q.responsavel !== "nao_localizado" && <p className="text-xs text-warning-text">{q.motivoInsuficiencia}</p>}
          {q.responsavel === "nao_localizado" && <p className="text-xs text-muted-foreground">Ninguém sabe quem pagou (ou se foi paga). Descubra: se a igreja pagar, esta marcação some; se um terceiro pagou, corrija para registrar quem.</p>}
          {q.aprovacaoDoReembolso && (() => { const d = decisaoVigente(eventos, "aprovacao_reembolso"); return (
            <p className="text-xs">Reembolso <b>{q.aprovacaoDoReembolso === "aprovada" ? "aprovado" : "recusado"}</b>{d ? <> por {d.porNome ?? "usuário"} em {dataHoraBr(d.em)}</> : null}. Aprovar não paga: o pagamento é um ato posterior.{d?.motivo ? <> Motivo: {d.motivo}</> : null}</p>); })()}
          {q.intencao === "reembolso" && q.saldoAReembolsar !== null && (q.reembolsado ?? 0) > 0 && (
            <p className="text-xs">Reembolsado até agora: <b className="tabular-nums">{brl(q.reembolsado ?? 0)}</b> · falta <b className="tabular-nums">{brl(q.saldoAReembolsar)}</b>.</p>
          )}
          {q.aprovacaoDoRelatado && (() => { const d = decisaoVigente(eventos, "aprovacao_relatado"); return (
            <p className="text-xs">{q.intencao === "oferta" ? "Oferta" : "Grau Relatado"} <b>{q.aprovacaoDoRelatado === "aprovada" ? "aprovada" : "recusada"}</b> pelo Administrador{d ? <> ({d.porNome ?? "usuário"}, {dataHoraBr(d.em)})</> : null}.{d?.motivo ? <> Justificativa: {d.motivo}</> : null}</p>); })()}
          {(["aprovacao_reembolso", "aprovacao_relatado"] as const).map(tipo => {
            const vigente = tipo === "aprovacao_reembolso" ? q.aprovacaoDoReembolso : q.aprovacaoDoRelatado;
            const caiu = vigente ? null : decisaoQueCaiu(eventos, tipo);
            return caiu ? (
              <p key={tipo} className="text-xs text-warning-text">
                A {tipo === "aprovacao_reembolso" ? "aprovação do reembolso" : "aprovação do Administrador"} dada por {caiu.porNome ?? "usuário"} em {dataHoraBr(caiu.em)} <b>deixou de valer</b>: os dados da declaração mudaram depois dela. A nova via precisa ser assinada e a decisão, tomada de novo.
              </p>) : null;
          })}
          <p className="text-[11px] text-muted-foreground">Registrada por {eventos?.find(e => e.evento === "registrada")?.porNome ?? "usuário"} em {dataHoraBr(q.registradoEm)}.</p>

          {q.responsavel !== "nao_localizado" && <DeclaracaoDoTerceiroCard q={q} podeEscrever={podeEscrever} aberta={aberta} recarga={n} onMudou={onMudou} />}

          {podeEscrever && q.responsavel !== "nao_localizado" && aberta && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {([["prova_pagamento_terceiro", q.intencao === "oferta" ? "Anexar comprovante do pagamento do terceiro" : "Anexar prova do pagamento"], [q.intencao === "reembolso" ? "pedido_reembolso" : "declaracao_terceiro", q.intencao === "reembolso" ? "Anexar Pedido de Reembolso" : "Anexar declaração do terceiro"]] as const)
                .filter(([t]) => !(t === "declaracao_terceiro" && (q.intencao === "nao_declarada" || q.intencao === "nao_se_aplica")))
                .filter(([t]) => !(t === "prova_pagamento_terceiro" && q.intencao === "oferta" && !ofertaAltoRisco))   // oferta comum não pede comprovante: pedir leva a anexar documento que não existe
                .filter(([t]) => !(declDisp && (t === "declaracao_terceiro" || t === "pedido_reembolso")))
                .map(([t, r]) => (
                  <label key={t} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted/60">
                    <Paperclip className="h-3.5 w-3.5" /> {r}
                    <input type="file" className="sr-only" accept="image/jpeg,image/png,application/pdf" disabled={ocupado} onChange={e => { void anexar(t, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                ))}
            </div>
          )}

          {podeEscrever && aberta && mudarDisp && bloqueioMudanca && <p className="text-xs text-muted-foreground">{bloqueioMudanca}</p>}
          <div className="flex flex-wrap gap-1.5">
            {possoAprovarReembolso && (<>
              <Button size="sm" className="h-8 gap-1.5" disabled={ocupado || !q.suficiente} onClick={() => void decidir("reembolso", "aprovada")}><ShieldCheck className="h-3.5 w-3.5" /> Aprovar reembolso ({brl(q.valorDaObrigacao)})</Button>
              <Button size="sm" variant="outline" className="h-8" disabled={ocupado} onClick={() => { setMotivo(""); setRecusar("reembolso"); }}>Recusar…</Button>
            </>)}
            {precisaDeAprovar && !possoAprovarReembolso && <p className="text-xs text-muted-foreground">Falta a aprovação de {alcada === "administrador" ? "um Administrador (acima do teto)" : "outra pessoa da Tesouraria ou do Administrador"}.</p>}
            {possoPagarReembolso && <Button size="sm" className="h-8 gap-1.5" disabled={ocupado} onClick={() => setPagando(true)}><Wallet className="h-3.5 w-3.5" /> Pagar reembolso ({brl(q.saldoAReembolsar ?? q.valorDaObrigacao)})</Button>}
            {possoAprovarRelatado && (<>
              <Button size="sm" variant="outline" className="h-8" disabled={ocupado} onClick={() => { setMotivo(""); setAprovando(true); }}>{q.intencao === "oferta" ? "Aprovar a oferta (Administrador)…" : "Aprovar o Relatado (Administrador)…"}</Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={ocupado} onClick={() => { setMotivo(""); setRecusar("relatado"); }}>Recusar…</Button>
            </>)}
            {podeEscrever && quitada && !conferidaEm && <Button size="sm" className="h-8" disabled={ocupado} onClick={() => void conferir(true)}>Conferir</Button>}
            {podeEscrever && quitada && !!conferidaEm && <Button size="sm" variant="ghost" className="h-8" disabled={ocupado} onClick={() => void conferir(false)}>Desmarcar conferência</Button>}
            {podeEscrever && aberta && mudarDisp && ehTrocavel(q.intencao) && !bloqueioMudanca && <Button size="sm" variant="outline" className="h-8" disabled={ocupado} onClick={() => setMudando(true)}>Mudar intenção…</Button>}
            {podeEscrever && aberta && <Button size="sm" variant="ghost" className="h-8" onClick={() => setDialogo("corrigir")}>Corrigir</Button>}
            {podeEscrever && aberta && <Button size="sm" variant="ghost" className="h-8 text-destructive-text" onClick={() => { setMotivo(""); setRemover(true); }}>Remover</Button>}
            <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => setAberto(a => !a)}><History className="h-3.5 w-3.5" /> Histórico</Button>
          </div>

          {aberto && (
            eventos === null ? <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Lendo o histórico…</p> : (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {eventos.length === 0 ? <li>Sem eventos.</li> : eventos.map(e => (
                  <li key={e.id}>{dataHoraBr(e.em)} — <b>{EVENTO[e.evento] ?? e.evento}</b>{e.decisao ? ` (${e.decisao})` : ""}{e.evento === "intencao_mudada" ? ` — de ${String((e.de as { intencao?: string } | null)?.intencao ?? "?")} para ${String((e.para as { intencao?: string } | null)?.intencao ?? "?")}` : ""}{e.evento === "declaracao_invalidada" && Array.isArray((e.para as { campos?: unknown } | null)?.campos) ? ` — mudou: ${((e.para as { campos: string[] }).campos).join(", ")}` : ""}{e.porNome ? ` por ${e.porNome}` : ""}{e.motivo ? ` — ${e.motivo}` : ""}</li>
                ))}
              </ul>
            )
          )}
        </>
      )}

      <CancelarNotaDialog alvo={cancelando ? { id: lancamento.id, descricao: lancamento.descricao ?? "" } : null} onFechar={() => setCancelando(false)} onFeito={recarregar} />
      <PagarReembolsoDialog alvo={pagando && q ? q : null} onFechar={() => setPagando(false)} onFeito={recarregar} />
      {q && ehTrocavel(q.intencao) && <MudarIntencaoDialog quitacaoId={q.quitacaoId} atual={q.intencao} aberto={mudando} onFechar={() => setMudando(false)} onFeito={recarregar} />}
      <QuitacaoDialog alvo={dialogo ? alvo : null} quitacao={dialogo === "corrigir" ? q : null} onFechar={() => setDialogo(null)} onFeito={recarregar} />

      <AlertDialog open={remover} onOpenChange={o => { if (!o) setRemover(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a quitação?</AlertDialogTitle>
            <AlertDialogDescription>A despesa volta a ser uma conta em aberto que a igreja paga ao fornecedor. A remoção fica no histórico. Faça isso só se a quitação foi registrada por engano.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório, pelo menos 5 letras)" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado || motivo.trim().length < 5} onClick={e => { e.preventDefault(); void removerQuitacaoAgora(); }}>{ocupado ? "…" : "Remover"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={aprovando} onOpenChange={o => { if (!o && !ocupado) setAprovando(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{q?.intencao === "oferta" ? "Aprovar esta oferta?" : "Aprovar o grau Relatado?"}</AlertDialogTitle>
            <AlertDialogDescription>
              A aprovação do Administrador dispensa documento que não existe, mas exige a justificativa: ela fica registrada na quitação, com seu nome, a data e a hora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Justificativa (obrigatória, pelo menos 10 letras)" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado || motivo.trim().length < 10} onClick={e => { e.preventDefault(); void decidir("relatado", "aprovada"); }}>{ocupado ? "…" : "Aprovar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recusar} onOpenChange={o => { if (!o) setRecusar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{recusar === "reembolso" ? "Recusar o reembolso?" : "Recusar o grau Relatado?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {recusar === "reembolso"
                ? "A conta volta para A esclarecer: o Administrador decide entre converter em oferta (com a declaração), cancelar a nota com o emitente ou assumir a dívida."
                : "Sem o Relatado aceito, a quitação continua em Formalizar até chegar o documento assinado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório, pelo menos 5 letras)" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado || motivo.trim().length < 5} onClick={e => { e.preventDefault(); if (recusar) void decidir(recusar, "recusada"); }}>{ocupado ? "…" : "Recusar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
