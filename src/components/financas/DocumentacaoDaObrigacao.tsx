// ─── DocumentacaoDaObrigacao — o painel lateral com TODOS os documentos de uma obrigação ────────────────────────────────────────────────────────────────────
//
// Pedido de 20/10/2026: do Extrato de Obrigações o tesoureiro abre a documentação, confere a NF, a declaração e o comprovante, e decide — sem sair da tela. Os dados vêm de
// `carregarDetalhesDaDespesa` (os anexos de TODAS as linhas da obrigação, a quitação, os vínculos com o banco e o ciclo); o agrupamento em quatro blocos é de `lib/documentacaoDaObrigacao.ts`.
// Só leitura: "Anexar ou gerenciar documentos" leva ao diálogo de anexos de sempre.
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Link2, Loader2, Paperclip, Receipt, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EstadoDoCicloChip } from "@/components/financas/DetalhesDoLancamento";
import { agruparDocumentacao, type ItemDeDocumento } from "@/lib/documentacaoDaObrigacao";
import { carregarDetalhesDaDespesa, type DetalhesDaDespesa } from "@/services/cicloDaDespesaService";
import { brl, comprovanteSignedUrl, FORMA_LABEL, nomeExtrato, type FinLancamentoExtenso } from "@/services/finService";

const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

function Bloco({ titulo, icone, children, destaque }: { titulo: string; icone: React.ReactNode; children: React.ReactNode; destaque?: boolean }) {
  return (
    <section aria-label={titulo} className={`rounded-lg border ${destaque ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
      <h3 className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground border-b">{icone}{titulo}</h3>
      <div className="px-3 py-2 space-y-2 text-sm">{children}</div>
    </section>
  );
}

function Linha({ i, onAbrir }: { i: ItemDeDocumento; onAbrir: (url: string) => void }) {
  return (
    <li className="flex items-center gap-2">
      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{i.nome ?? i.rotulo}</span>
        <span className="block text-xs text-muted-foreground truncate">{i.rotulo} · enviado em {dataBr(i.enviadoEm)}{i.origem ? ` · ${i.origem}` : ""}</span>
      </span>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0" onClick={() => onAbrir(i.url)}><ExternalLink className="w-3 h-3" /> Abrir</Button>
    </li>
  );
}

const Vazio = ({ children }: { children: React.ReactNode }) => <p className="text-muted-foreground">{children}</p>;

export function DocumentacaoDaObrigacao({ lancamento, onFechar, onAnexos }: { lancamento: FinLancamentoExtenso | null; onFechar: () => void; onAnexos?: (l: FinLancamentoExtenso) => void }) {
  const [d, setD] = useState<DetalhesDaDespesa | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setD(null); setErro(false);
    if (!lancamento) return;
    let vivo = true;
    carregarDetalhesDaDespesa(lancamento).then(x => { if (vivo) setD(x); }).catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [lancamento]);

  const forma = lancamento?.forma_pagamento ? FORMA_LABEL[lancamento.forma_pagamento] ?? null : null;
  const doc = useMemo(() => (d && lancamento ? agruparDocumentacao(d, lancamento.id, forma) : null), [d, lancamento, forma]);

  async function abrir(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer"); else toast.error("Não foi possível abrir o arquivo.");
  }

  const terceiro = !!d?.quitacao;
  return (
    <Sheet open={!!lancamento} onOpenChange={o => { if (!o) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        {lancamento && (
          <>
            <SheetHeader className="px-4 pt-5 pb-3 border-b text-left space-y-1.5">
              <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="min-w-0 truncate">Documentação · {nomeExtrato(lancamento).principal}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Despesa de <b className="tabular-nums">{brl(Number(lancamento.valor))}</b>{d?.contaNome ? <> · conta {d.contaNome}</> : null}</span>
                {d?.ciclo && <EstadoDoCicloChip estado={d.ciclo.estado} atrasoEmDias={d.ciclo.atrasoEmDias} quitadaPorTerceiro={(lancamento.status as string) === "quitado_terceiro"} />}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {erro && <p role="alert" className="text-sm text-destructive-text">Não foi possível carregar a documentação.</p>}
              {!doc && !erro && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reunindo os documentos…</p>}

              {doc && (
                <>
                  <Bloco titulo="Documentos da obrigação" icone={<FileText className="w-3.5 h-3.5" />}>
                    {doc.documentos.length === 0 ? <Vazio>Nenhum documento anexado (nota fiscal, fatura, boleto, guia, XML ou contrato).</Vazio> : doc.documentos.map(g => (
                      <div key={g.tipo}>
                        <p className="text-xs font-semibold text-foreground">{g.rotulo}{g.itens.length > 1 ? ` (${g.itens.length})` : ""}{g.dica && <span className="font-normal text-muted-foreground"> — {g.dica}</span>}</p>
                        <ul className="mt-1 space-y-1.5">{g.itens.map(i => <Linha key={i.id} i={i} onAbrir={abrir} />)}</ul>
                      </div>
                    ))}
                  </Bloco>

                  {/* na obrigação quitada por terceiro a documentação é o centro da decisão: NF, declaração e a prova de quem pagou */}
                  <Bloco titulo="Documentos da quitação" icone={<ShieldCheck className="w-3.5 h-3.5" />} destaque={terceiro}>
                    {!doc.quitacao.existe ? <Vazio>Esta obrigação não tem quitação por terceiro: a igreja é quem paga.</Vazio> : (
                      <>
                        {doc.quitacao.resumo && <p className="text-xs text-muted-foreground">{doc.quitacao.resumo}</p>}
                        {doc.quitacao.itens.length > 0 && <ul className="space-y-1.5">{doc.quitacao.itens.map(i => <Linha key={i.id} i={i} onAbrir={abrir} />)}</ul>}
                        {doc.quitacao.ausencias.length > 0 && (
                          <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                            <p className="font-semibold">Não anexado <span className="font-normal">(a Política de Quitação define o que cada caso exige)</span></p>
                            <ul className="mt-0.5 space-y-0.5">{doc.quitacao.ausencias.map(a => <li key={a}>• {a}</li>)}</ul>
                          </div>
                        )}
                      </>
                    )}
                  </Bloco>

                  <Bloco titulo="Comprovantes" icone={<Receipt className="w-3.5 h-3.5" />}>
                    {doc.comprovantes.forma && <p className="text-xs text-muted-foreground">Forma de pagamento registrada: <b className="text-foreground">{doc.comprovantes.forma}</b></p>}
                    {doc.comprovantes.itens.length === 0 && !doc.comprovantes.comprovanteAntigo ? <Vazio>Nenhum comprovante de pagamento anexado (Pix, TED, transferência ou comprovante bancário).</Vazio> : (
                      <ul className="space-y-1.5">
                        {doc.comprovantes.comprovanteAntigo && (
                          <li className="flex items-center gap-2"><Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="flex-1">Comprovante (anexo antigo)</span>
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => abrir(doc.comprovantes.comprovanteAntigo!)}><ExternalLink className="w-3 h-3" /> Abrir</Button></li>
                        )}
                        {doc.comprovantes.itens.map(i => <Linha key={i.id} i={i} onAbrir={abrir} />)}
                      </ul>
                    )}
                  </Bloco>

                  <Bloco titulo="Vínculos" icone={<Link2 className="w-3.5 h-3.5" />}>
                    {doc.vinculos.length === 0 ? <Vazio>Sem vínculo com o banco: nenhuma linha de OFX ou PDF, liquidação ou conferência registrada.</Vazio> : (
                      <ul className="space-y-1">
                        {doc.vinculos.map((v, k) => (
                          <li key={k} className={v.tom === "aviso" ? "text-warning-text" : v.tom === "historico" ? "text-muted-foreground" : ""}>
                            <span className="font-semibold">{v.rotulo}:</span> <span className={v.tom === "historico" ? "text-xs" : ""}>{v.texto}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Bloco>
                </>
              )}
            </div>

            {onAnexos && (
              <div className="border-t px-4 py-3 flex justify-end">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onAnexos(lancamento)}><Paperclip className="w-3.5 h-3.5" /> Anexar ou gerenciar documentos</Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
