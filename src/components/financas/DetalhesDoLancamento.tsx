// ─── DetalhesDoLancamento — a despesa como UMA entidade: documento, pagamento, OFX, conciliação, comprovante e malote ────────────────────────────
//
// Ao clicar no lançamento do extrato (pedido de 09/10/2026): o documento original, o comprovante, o vencimento, o pagamento, a obrigação relacionada
// e em que ponto do ciclo ele está (Prevista → Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta para o Malote).
// Só leitura; os botões levam aos diálogos que já existem (anexos, editar).
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, FileText, Loader2, MinusCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ORDEM_DO_CICLO, ROTULO_DO_CICLO, type EstadoDoCiclo } from "@/lib/cicloDaDespesa";
import { carregarDetalhesDaDespesa, type DetalhesDaDespesa } from "@/services/cicloDaDespesaService";
import { brl, comprovanteSignedUrl, FIN_ANEXO_TIPO_LABEL, nomeExtrato, type FinLancamentoExtenso } from "@/services/finService";

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const COR: Record<EstadoDoCiclo, string> = {
  prevista: "border-border bg-muted text-muted-foreground", em_aberto: "border-warning-line bg-warning-soft/60 text-warning-text",
  pagamento_realizado: "border-info-line bg-info-soft/60 text-info-text", aguardando_conciliacao: "border-warning-line bg-warning-soft/60 text-warning-text",
  conciliada: "border-success-line bg-success-soft/60 text-success-text", pronta_para_malote: "border-success-line bg-success-soft text-success-text font-semibold",
  cancelada: "border-border bg-muted text-muted-foreground line-through",
};

export function EstadoDoCicloChip({ estado }: { estado: EstadoDoCiclo }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${COR[estado]}`}>{ROTULO_DO_CICLO[estado]}</span>;
}

export function DetalhesDoLancamento({ lancamento, onFechar, onAnexos }: { lancamento: FinLancamentoExtenso | null; onFechar: () => void; onAnexos?: (l: FinLancamentoExtenso) => void }) {
  const [d, setD] = useState<DetalhesDaDespesa | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setD(null); setErro(false);
    if (!lancamento) return;
    let vivo = true;
    carregarDetalhesDaDespesa(lancamento).then(x => { if (vivo) setD(x); }).catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [lancamento]);

  async function abrir(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer"); else toast.error("Não foi possível abrir o arquivo.");
  }

  const l = lancamento;
  const nome = l ? nomeExtrato(l).principal : "";
  const documentos = d?.anexos.filter(a => a.tipo !== "comprovante") ?? [];
  const comprovantes = d?.anexos.filter(a => a.tipo === "comprovante") ?? [];
  const o = d?.obrigacao;
  const temDiferenca = !!o && (o.juros + o.multa + o.complemento + o.ajuste + o.desconto) > 0.004;

  return (
    <Dialog open={!!l} onOpenChange={o2 => { if (!o2) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        {l && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate">{nome}</span>
                {d?.ciclo && <EstadoDoCicloChip estado={d.ciclo.estado} />}
              </DialogTitle>
              <DialogDescription>
                {l.tipo === "entrada" ? "Entrada" : "Despesa"} de <b className="tabular-nums">{brl(Number(l.valor))}</b>{d?.contaNome ? <> · conta {d.contaNome}</> : null}
              </DialogDescription>
            </DialogHeader>

            {erro && <p className="text-sm text-destructive-text" role="alert">Não foi possível carregar os detalhes.</p>}
            {!d && !erro && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reunindo o histórico…</p>}

            {d && (
              <div className="space-y-4">
                {d.ciclo && (
                  <section aria-label="Ciclo da despesa" className="space-y-2">
                    {/* o ciclo inteiro, com o ponto em que esta despesa está */}
                    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px]">
                      {ORDEM_DO_CICLO.map((e, i) => {
                        const atual = d.ciclo!.estado === e, passou = ORDEM_DO_CICLO.indexOf(d.ciclo!.estado) > i;
                        return (
                          <li key={e} className={`flex items-center gap-1 ${atual ? "font-semibold text-foreground" : passou ? "text-success-text" : "text-muted-foreground"}`}>
                            {i > 0 && <span aria-hidden className="opacity-40">→</span>}
                            <span className={`rounded px-1.5 py-0.5 ${atual ? "bg-gold/20 ring-1 ring-gold/40" : ""}`}>{ROTULO_DO_CICLO[e]}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="text-sm">{d.ciclo.proximoPasso}</p>
                    <ul className="rounded-md border divide-y text-sm">
                      {d.ciclo.etapas.map(e => (
                        <li key={e.chave} className="flex items-start gap-2 px-3 py-1.5">
                          {e.naoSeAplica ? <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            : e.feita ? <CheckCircle2 className="w-4 h-4 text-success-text shrink-0 mt-0.5" /> : <Circle className="w-4 h-4 text-warning-text shrink-0 mt-0.5" />}
                          <span className="min-w-0 flex-1">{e.rotulo}{e.detalhe && <span className="text-xs text-muted-foreground"> · {e.chave === "pagamento" ? dataBr(e.detalhe) : e.detalhe}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section aria-label="Datas e valores" className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vencimento</p><p className="tabular-nums">{dataBr(l.data)}</p></div>
                  <div className="rounded-md border px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pagamento (banco)</p><p className="tabular-nums">{dataBr(l.data_pagamento ?? (l.status === "previsto" ? null : l.data))}</p></div>
                  {o && (
                    <div className="col-span-2 rounded-md border px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Obrigação</p>
                      <p className="tabular-nums">Valor original {brl(o.valor_original)}
                        {temDiferenca && <>
                          {o.juros > 0 && <> · juros {brl(o.juros)}</>}{o.multa > 0 && <> · multa {brl(o.multa)}</>}
                          {o.complemento + o.ajuste > 0 && <> · outros {brl(o.complemento + o.ajuste)}</>}{o.desconto > 0 && <> · desconto − {brl(o.desconto)}</>}
                          {" "}· <b>total pago {brl(o.total_pago)}</b></>}
                      </p>
                      {d.contrato && <p className="text-xs text-muted-foreground">Contrato: {d.contrato}</p>}
                    </div>
                  )}
                </section>

                <section aria-label="Documentos" className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documento original</h3>
                  {documentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p> : (
                    <ul className="space-y-1">{documentos.map(a => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{FIN_ANEXO_TIPO_LABEL[a.tipo] ?? a.tipo}{a.nome ? ` · ${a.nome}` : ""}</span>
                        <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => abrir(a.url)}><ExternalLink className="w-3 h-3" /> Abrir</Button>
                      </li>))}
                    </ul>
                  )}
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-1">Comprovante de pagamento</h3>
                  {comprovantes.length === 0 && !l.comprovante_url ? <p className="text-sm text-muted-foreground">Nenhum comprovante anexado.</p> : (
                    <ul className="space-y-1">
                      {l.comprovante_url && comprovantes.length === 0 && (
                        <li className="flex items-center gap-2 text-sm"><Paperclip className="w-3.5 h-3.5 text-muted-foreground" /><span className="flex-1">Comprovante</span>
                          <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => abrir(l.comprovante_url!)}><ExternalLink className="w-3 h-3" /> Abrir</Button></li>
                      )}
                      {comprovantes.map(a => (
                        <li key={a.id} className="flex items-center gap-2 text-sm"><Paperclip className="w-3.5 h-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{a.nome ?? "Comprovante"}</span>
                          <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => abrir(a.url)}><ExternalLink className="w-3 h-3" /> Abrir</Button></li>
                      ))}
                    </ul>
                  )}
                </section>

                {(d.ofx || d.liquidacao) && (
                  <section aria-label="Vínculo com o banco" className="space-y-1 text-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banco e liquidação</h3>
                    {d.ofx && <p>Linha do extrato (OFX): <span className="font-mono text-xs">{d.ofx}</span></p>}
                    {d.liquidacao && <p>Liquidação de {dataBr(d.liquidacao.data_pagamento)} · {brl(d.liquidacao.valor_total)} saiu do banco</p>}
                  </section>
                )}

                {onAnexos && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => { onFechar(); onAnexos(l); }}><Paperclip className="w-3.5 h-3.5" /> Anexar ou gerenciar documentos</Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
