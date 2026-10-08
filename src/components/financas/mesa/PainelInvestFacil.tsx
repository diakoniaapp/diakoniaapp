// ─── PainelInvestFacil.tsx — aplicações e resgates do Invest Fácil, sugeridos a partir do PDF do extrato consolidado ──────────
//
// O OFX do Bradesco não traz aplicação nem resgate; o PDF "Extrato Consolidado / Por Período" traz. Anexado aqui, cada aplicação vira um
// cartão "Corrente → Aplicação" e cada resgate "Aplicação → Corrente", já preenchidos. O tesoureiro confirma (uma a uma ou em lote, com o
// resumo antes de gravar) — NADA é gravado sem o clique. O OFX continua sendo a fonte da movimentação; o PDF só aponta o que o OFX não traz.
//
// Sem leitura confiável (cadeia de saldos que não fecha, total diferente do impresso, conta ou período que não conferem), NENHUMA sugestão
// é gerada e o relatório do problema aparece no lugar; a Mesa segue funcionando só com o OFX.
// Reimportar o mesmo PDF não duplica: a linha com chave já gravada sai como "já registrada"; uma transferência feita à mão só ganha a
// evidência ("Vincular Evidência PDF").
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, FileUp, Loader2, Undo2, AlertTriangle, XCircle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { brl, listarContas } from "@/services/finService";
import { reativarIgnorada } from "@/services/importacaoOfxService";
import {
  candidatasDeAplicacao, gravarTransferenciaDoPdf, ignorarLinhaDoPdf, lerPdfDoInvestFacil, situacaoDasLinhas, vincularEvidencia, type PdfDoInvestFacil,
} from "@/services/investFacilService";
import { AVISO_JA_REGISTRADA, resumirLote, type LinhaInvestFacil, type SituacaoDaLinhaInvest } from "@/lib/investFacil";
import type { OFXTransacao } from "@/services/ofxService";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const ROTULO = { aplicacao: "Aplicação Invest Fácil", resgate: "Resgate Invest Fácil" } as const;

interface Props {
  contaId: string;
  contaNome: string;
  /** as transações do OFX já lidas: dão o período que o PDF precisa cobrir */
  transacoes: OFXTransacao[];
  /** avisa a Mesa de que algo foi gravado (ao fechar, ela recarrega a conta) */
  aoGravar: () => void;
}

export function PainelInvestFacil({ contaId, contaNome, transacoes, aoGravar }: Props) {
  const [contas, setContas] = useState<{ id: string; nome: string; conta_numero: string | null }[]>([]);
  const [aplicacaoId, setAplicacaoId] = useState("");
  const [pdf, setPdf] = useState<PdfDoInvestFacil | null>(null);
  const [lendo, setLendo] = useState(false);
  const [situacoes, setSituacoes] = useState<Map<string, SituacaoDaLinhaInvest>>(new Map());
  const [gravadas, setGravadas] = useState<Map<string, () => Promise<void>>>(new Map());   // chave → desfazer (o que foi lançado AGORA)
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [verRecolhidas, setVerRecolhidas] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarContas().then(cs => {
      const lista = cs.map(c => ({ id: c.id, nome: c.nome, conta_numero: c.conta_numero ?? null }));
      setContas(lista);
      setAplicacaoId(candidatasDeAplicacao(lista, contaId)[0]?.id ?? "");
    }).catch(() => { /* sem a lista, o painel avisa que não achou a conta de aplicação */ });
  }, [contaId]);

  const candidatas = useMemo(() => candidatasDeAplicacao(contas, contaId), [contas, contaId]);
  const aplicacao = contas.find(c => c.id === aplicacaoId) ?? null;
  const contaDaMesa = contas.find(c => c.id === contaId) ?? null;
  const periodoDoOfx = useMemo(() => {
    const d = transacoes.map(t => t.data).sort();
    return d.length ? { de: d[0], ate: d[d.length - 1] } : null;
  }, [transacoes]);

  async function carregarSituacoes(p: PdfDoInvestFacil, aplicId: string) {
    if (!aplicId || p.linhas.length === 0) { setSituacoes(new Map()); return; }
    setSituacoes(await situacaoDasLinhas(contaId, aplicId, p.linhas));
  }

  async function escolherPdf(file: File) {
    if (!periodoDoOfx) return;
    setLendo(true); setPdf(null); setGravadas(new Map());
    try {
      const lido = await lerPdfDoInvestFacil(file, { ofxDe: periodoDoOfx.de, ofxAte: periodoDoOfx.ate, contaNumero: contaDaMesa?.conta_numero });
      setPdf(lido);
      await carregarSituacoes(lido, aplicacaoId);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ler o PDF.");
    } finally {
      setLendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  useEffect(() => { if (pdf && pdf.validacao.ok) carregarSituacoes(pdf, aplicacaoId).catch(e => toast.error(e?.message ?? "Não foi possível conferir o que já existe.")); }, [aplicacaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = pdf?.linhas ?? [];
  const situacaoDe = (l: LinhaInvestFacil): SituacaoDaLinhaInvest => (gravadas.has(l.chave) ? { tipo: "ja_registrada", lancamentoId: "" } : situacoes.get(l.chave) ?? { tipo: "nova" });
  const pendentes = linhas.filter(l => !gravadas.has(l.chave) && situacaoDe(l).tipo === "nova");
  const manuais = linhas.filter(l => !gravadas.has(l.chave) && situacaoDe(l).tipo === "transferencia_manual");
  const jaRegistradas = linhas.filter(l => gravadas.has(l.chave) || situacaoDe(l).tipo === "ja_registrada");
  const ignoradas = linhas.filter(l => !gravadas.has(l.chave) && situacaoDe(l).tipo === "ignorada");
  const resumo = resumirLote(pendentes);

  /** "ja": outra aba/usuário registrou a mesma linha primeiro — nada foi duplicado e a linha passa a constar como já registrada. */
  async function confirmar(l: LinhaInvestFacil, silencioso = false): Promise<"ok" | "ja" | "erro"> {
    if (!pdf || !aplicacao) return "erro";
    setOcupado(l.chave);
    try {
      const r = await gravarTransferenciaDoPdf({ contaId, contaNome, aplicacao, linha: l, pdf });
      setGravadas(prev => new Map(prev).set(l.chave, r.desfazer));
      aoGravar();
      if (!silencioso) toast.success(`${ROTULO[l.direcao]} de ${brl(l.valor)} registrada.`);
      return "ok";
    } catch (e: any) {
      if (e?.message === AVISO_JA_REGISTRADA) {
        if (!silencioso) toast.info(AVISO_JA_REGISTRADA);
        await carregarSituacoes(pdf, aplicacao.id).catch(() => { /* a próxima abertura do PDF mostra */ });
        return "ja";
      }
      toast.error(e?.message ?? "Não foi possível registrar a transferência.");
      return "erro";
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarTodas() {
    setResumoAberto(false);
    const lote = [...pendentes];
    setProgresso({ feitos: 0, total: lote.length });
    let feitos = 0, jaFeitas = 0, parou = false;
    for (const l of lote) {
      const r = await confirmar(l, true);
      if (r === "erro") { parou = true; break; }     // para no primeiro erro: nada de seguir às cegas
      if (r === "ja") jaFeitas++; else feitos++;     // "já registrada" por outra aba não é erro: segue com o resto
      setProgresso({ feitos: feitos + jaFeitas, total: lote.length });
    }
    setProgresso(null);
    const jaTxt = jaFeitas > 0 ? ` ${jaFeitas} já ${jaFeitas !== 1 ? "tinham" : "tinha"} sido registrada${jaFeitas !== 1 ? "s" : ""} por outra aba ou usuário (nada duplicado).` : "";
    if (!parou) toast.success(`${feitos} transferência${feitos !== 1 ? "s" : ""} registrada${feitos !== 1 ? "s" : ""}.${jaTxt}`);
    else toast.error(`Parou depois de ${feitos + jaFeitas} de ${lote.length}: as já registradas continuam e têm "Desfazer".${jaTxt}`);
  }

  async function desfazer(l: LinhaInvestFacil) {
    const d = gravadas.get(l.chave);
    if (!d) return;
    setOcupado(l.chave);
    try {
      await d();
      setGravadas(prev => { const n = new Map(prev); n.delete(l.chave); return n; });
      aoGravar();
      toast.success("Transferência desfeita.");
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível desfazer."); }
    finally { setOcupado(null); }
  }

  async function vincular(l: LinhaInvestFacil) {
    const s = situacaoDe(l);
    if (!pdf || s.tipo !== "transferencia_manual") return;
    setOcupado(l.chave);
    try {
      const r = await vincularEvidencia({ lancamentoId: s.lancamentoId, linha: l, pdf });
      setGravadas(prev => new Map(prev).set(l.chave, r.desfazer));
      aoGravar();
      toast.success("Evidência do PDF vinculada à transferência existente.");
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível vincular."); }
    finally { setOcupado(null); }
  }

  async function ignorar(l: LinhaInvestFacil) {
    setOcupado(l.chave);
    try {
      await ignorarLinhaDoPdf(contaId, l);
      setSituacoes(prev => new Map(prev).set(l.chave, { tipo: "ignorada" }));
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível ignorar."); }
    finally { setOcupado(null); }
  }

  async function reativar(l: LinhaInvestFacil) {
    setOcupado(l.chave);
    try {
      await reativarIgnorada(contaId, `PDF:${l.chave}`);
      if (pdf) await carregarSituacoes(pdf, aplicacaoId);
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível reativar."); }
    finally { setOcupado(null); }
  }

  // conta sem nenhuma "Aplicação" para receber as transferências (a maioria das contas): o painel nem aparece
  if (contas.length > 0 && candidatas.length === 0 && !pdf) return null;

  const origemDestino = (l: LinhaInvestFacil) => (l.direcao === "aplicacao" ? [contaNome, aplicacao?.nome ?? "Caixa de Aplicação"] : [aplicacao?.nome ?? "Caixa de Aplicação", contaNome]);

  return (
    <div className="rounded-md border p-3 space-y-2.5" aria-label="Invest Fácil">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Invest Fácil: aplicações e resgates</p>
          <p className="text-xs text-muted-foreground">
            O OFX do Bradesco não traz estes movimentos; o <b>extrato consolidado em PDF</b> traz. Anexe-o e confirme as transferências sugeridas — nada é gravado sem o seu clique.
          </p>
        </div>
        <label className="shrink-0">
          <input ref={entrada} type="file" accept=".pdf,application/pdf" className="hidden" aria-label="PDF do extrato consolidado" disabled={lendo || !!progresso}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) escolherPdf(f); }} />
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/40">
            {lendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />} {pdf ? "Trocar PDF" : "Anexar PDF"}
          </span>
        </label>
      </div>

      {lendo && <p className="text-xs text-muted-foreground" role="status">Lendo e conferindo o PDF…</p>}

      {pdf && !pdf.validacao.ok && (
        <div className="rounded-md border border-destructive-line bg-destructive-soft/40 p-2.5 space-y-1" role="alert">
          <p className="text-sm font-medium text-destructive-text flex items-center gap-1.5"><XCircle className="w-4 h-4" /> O PDF não passou na conferência — nenhuma sugestão foi gerada</p>
          <ul className="list-disc pl-5 text-xs space-y-0.5">{pdf.validacao.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>
          <p className="text-xs text-muted-foreground">A Mesa continua funcionando só com o OFX. Arquivo: {pdf.arquivo}</p>
        </div>
      )}

      {pdf?.validacao.ok && (
        <>
          {pdf.validacao.avisos.map((a, i) => <p key={i} className="text-xs text-warning-text flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {a}</p>)}

          {candidatas.length === 0 ? (
            <p className="text-xs text-destructive-text" role="alert">Não encontrei uma conta de aplicação (nome com “Aplicação”) para receber as transferências.</p>
          ) : candidatas.length > 1 && (
            <label className="text-xs flex items-center gap-2">Conta da aplicação
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={aplicacaoId} onChange={e => setAplicacaoId(e.target.value)} aria-label="Conta da aplicação">
                {candidatas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}

          <div className={`rounded-md border p-2.5 text-sm ${pendentes.length + manuais.length > 0 ? "border-warning-line bg-warning-soft/40" : "border-success-line bg-success-soft/40"}`} role="status">
            {pendentes.length + manuais.length === 0 ? (
              <p className="flex items-center gap-1.5 text-success-text"><CheckCircle2 className="w-4 h-4" /> Todas as {linhas.length} aplicações e resgates do PDF já têm transferência no sistema.</p>
            ) : (
              <p>
                <b className="tabular-nums">{resumo.aplicacoes.n}</b> aplicaç{resumo.aplicacoes.n === 1 ? "ão" : "ões"} ({brl(resumo.aplicacoes.total)}) e{" "}
                <b className="tabular-nums">{resumo.resgates.n}</b> resgate{resumo.resgates.n !== 1 ? "s" : ""} ({brl(resumo.resgates.total)}) do PDF ainda <b>não têm transferência</b> no sistema
                {manuais.length > 0 && <> · {manuais.length} já existe{manuais.length !== 1 ? "m" : ""} à mão e só falta vincular a evidência</>}.
              </p>
            )}
          </div>

          {pendentes.length > 0 && (
            <Button type="button" size="sm" className="gap-1.5" disabled={!aplicacao || !!ocupado || !!progresso} onClick={() => setResumoAberto(true)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar todas ({pendentes.length})
            </Button>
          )}
          {progresso && <p className="text-xs text-muted-foreground flex items-center gap-2" role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gravando… {progresso.feitos} de {progresso.total}</p>}

          <ul className="space-y-2" aria-label="Sugestões do Invest Fácil">
            {linhas.filter(l => pendentes.includes(l) || manuais.includes(l) || gravadas.has(l.chave)).map(l => {
              const [de, para] = origemDestino(l);
              const s = situacaoDe(l);
              const feita = gravadas.has(l.chave);
              return (
                <li key={l.chave} className={`rounded-md border p-2.5 space-y-1.5 ${feita ? "bg-success-soft/30" : ""}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium min-w-0">{ROTULO[l.direcao]} <span className="text-xs font-normal text-muted-foreground">· {dataBr(l.data)}</span></p>
                    <p className="shrink-0 tabular-nums text-sm font-semibold">{brl(l.valor)}</p>
                  </div>
                  <p className="text-xs flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Origem</span> {de} <ArrowRight className="w-3 h-3" /> <span className="text-muted-foreground">Destino</span> {para}</p>
                  <p className="text-[11px] text-muted-foreground truncate" title={l.textoOriginal}>{l.textoOriginal} · lote {l.documento}</p>
                  {feita ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-success-text flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Registrada com a evidência do PDF</span>
                      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={ocupado === l.chave} onClick={() => desfazer(l)}><Undo2 className="w-3 h-3" /> Desfazer</Button>
                    </div>
                  ) : s.tipo === "transferencia_manual" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Transferência já registrada (lançada à mão em {dataBr(s.data)}) — não será criada outra.</span>
                      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={ocupado === l.chave} onClick={() => vincular(l)}><Link2 className="w-3 h-3" /> Vincular Evidência PDF</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="h-7" disabled={!aplicacao || !!ocupado || !!progresso} onClick={() => confirmar(l)}>
                        {ocupado === l.chave ? "Gravando…" : "Confirmar"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7" disabled={!!ocupado || !!progresso} onClick={() => ignorar(l)}>Ignorar</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {(jaRegistradas.length > 0 || ignoradas.length > 0) && (
            <div>
              <button type="button" className="text-xs underline underline-offset-2 text-muted-foreground" aria-expanded={verRecolhidas} onClick={() => setVerRecolhidas(v => !v)}>
                {jaRegistradas.length} já registrada{jaRegistradas.length !== 1 ? "s" : ""} · {ignoradas.length} ignorada{ignoradas.length !== 1 ? "s" : ""}
              </button>
              {verRecolhidas && (
                <ul className="mt-1 divide-y rounded-md border text-xs">
                  {jaRegistradas.filter(l => !gravadas.has(l.chave)).map(l => (
                    <li key={l.chave} className="px-2 py-1 flex justify-between gap-3"><span className="min-w-0 truncate">{dataBr(l.data)} · {ROTULO[l.direcao]} · Transferência já registrada</span><span className="tabular-nums">{brl(l.valor)}</span></li>
                  ))}
                  {ignoradas.map(l => (
                    <li key={l.chave} className="px-2 py-1 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{dataBr(l.data)} · {ROTULO[l.direcao]} · ignorada · {brl(l.valor)}</span>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={ocupado === l.chave} onClick={() => reativar(l)}>Reativar</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog open={resumoAberto} onOpenChange={setResumoAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resumo antes de gravar</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Serão criadas <b>{pendentes.length}</b> transferências entre <b>{contaNome}</b> e <b>{aplicacao?.nome}</b>, cada uma com as duas pernas e a evidência do PDF <span className="font-mono text-xs">{pdf?.arquivo}</span>:</p>
                <ul className="list-disc pl-5">
                  <li>{resumo.aplicacoes.n} aplicaç{resumo.aplicacoes.n === 1 ? "ão" : "ões"} · {brl(resumo.aplicacoes.total)} (saem de {contaNome})</li>
                  <li>{resumo.resgates.n} resgate{resumo.resgates.n !== 1 ? "s" : ""} · {brl(resumo.resgates.total)} (entram em {contaNome})</li>
                </ul>
                <p>Efeito no saldo de {contaNome}: <b className="tabular-nums">{brl(resumo.efeitoNaCorrente)}</b>; em {aplicacao?.nome}: <b className="tabular-nums">{brl(-resumo.efeitoNaCorrente)}</b>.
                  {resumo.datas && <> Período: {dataBr(resumo.datas.de)} a {dataBr(resumo.datas.ate)}.</>}</p>
                <p className="text-xs text-muted-foreground">Nenhuma outra linha é alterada. Cada transferência pode ser desfeita depois.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarTodas}>Gravar {pendentes.length} transferências</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
