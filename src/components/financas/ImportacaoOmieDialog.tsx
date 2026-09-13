// ─── ImportacaoOmieDialog.tsx ────────────────────────────────────────────
//
// Pedido da Telma (13/09/2026): trazer histórico anterior ao Diakonia, que
// hoje só existe no Omie. Diferente de `ConciliacaoOFXDialog.tsx` — aqui
// não existe lançamento nenhum no Diakonia ainda pra casar, então o
// caminho é CRIAR (via `omieImportService.ts`), não conciliar.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileUp, Upload, TrendingUp, TrendingDown, AlertTriangle, Building2, Users, Undo2,
} from "lucide-react";
import { brl, atualizarConta, type FinMovimentoTipo } from "@/services/finService";
import {
  lerArquivoOmie, prepararImportacaoOmie, confirmarImportacaoOmie, desfazerImportacaoOmie,
  type RascunhoOmie, type ResumoImportacaoOmie,
} from "@/services/omieImportService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function ImportacaoOmieDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [processando, setProcessando] = useState(false);
  const [rascunhos, setRascunhos] = useState<RascunhoOmie[] | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacaoOmie | null>(null);
  const [usarSaldoInicial, setUsarSaldoInicial] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [ultimoLote, setUltimoLote] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  function reiniciar() {
    setRascunhos(null);
    setResumo(null);
    setUltimoLote(null);
  }

  async function processarArquivo(file: File) {
    setProcessando(true);
    try {
      const { linhas, saldoAnterior } = await lerArquivoOmie(file);
      if (linhas.length === 0) {
        toast.error("Nenhum lançamento encontrado nesse arquivo.");
        return;
      }
      const { rascunhos: r, resumo: res } = await prepararImportacaoOmie(linhas, saldoAnterior);
      setRascunhos(r);
      setResumo(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler o arquivo");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!rascunhos) return;
    setConfirmando(true);
    try {
      // `saldo_inicial` PRIMEIRO, os lançamentos DEPOIS — nessa ordem de
      // propósito. `fin_recalc_saldo_conta()` (gatilho em fin_lancamentos)
      // recalcula `saldo_atual = saldo_inicial + movimento` a cada
      // lançamento gravado, lendo o `saldo_inicial` que a conta tiver
      // NAQUELE INSTANTE. Gravar na ordem invertida deixa `saldo_atual`
      // travado em "0 + movimento" em vez de "saldo_inicial + movimento" —
      // bug real, achado ao vivo pela Telma (Caixa de Envelopes mostrou
      // -R$928 em vez de R$0) e corrigido direto no banco naquela conta.
      if (usarSaldoInicial && resumo?.saldoAnterior != null) {
        await atualizarConta(contaId, { saldo_inicial: resumo.saldoAnterior });
      }
      const r = await confirmarImportacaoOmie(rascunhos, contaId);
      toast.success(`${r.criados} lançamento${r.criados !== 1 ? "s" : ""} importado${r.criados !== 1 ? "s" : ""}` +
        (r.fornecedoresCriados > 0 ? ` · ${r.fornecedoresCriados} fornecedor(es) novo(s)` : ""));
      setUltimoLote(r.loteTag);
      setRascunhos(null);
      setResumo(null);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao importar");
    } finally {
      setConfirmando(false);
    }
  }

  async function desfazer() {
    if (!ultimoLote) return;
    setDesfazendo(true);
    try {
      const n = await desfazerImportacaoOmie(ultimoLote);
      toast.success(`${n} lançamento(s) removido(s) — importação desfeita`);
      setUltimoLote(null);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao desfazer");
    } finally {
      setDesfazendo(false);
    }
  }

  const amostra = rascunhos?.slice(0, 50) ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reiniciar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Upload className="w-5 h-5 text-gold" /> Importar histórico do Omie
          </DialogTitle>
          <DialogDescription>
            Traz lançamentos que nunca existiram no Diakonia, lidos do extrato de
            <strong> {contaNome}</strong> exportado do Omie (Excel). Diferente do OFX, aqui não
            concilia — cria os lançamentos direto.
          </DialogDescription>
        </DialogHeader>

        {ultimoLote && (
          <div className="rounded-md border border-success-line bg-success-soft/30 p-3 flex items-center justify-between gap-3">
            <p className="text-sm text-success-text">Importação concluída.</p>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={desfazer} disabled={desfazendo}>
              <Undo2 className="w-3.5 h-3.5" /> {desfazendo ? "..." : "Desfazer esta importação"}
            </Button>
          </div>
        )}

        {!rascunhos && !ultimoLote && (
          processando ? (
            <p className="text-sm text-center text-muted-foreground py-6">Lendo a planilha...</p>
          ) : (
            <label className="cursor-pointer block">
              <input type="file" accept=".xlsx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
              <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
                <FileUp className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm">Selecionar planilha (.xlsx) do Omie</span>
                <span className="text-xs text-muted-foreground text-center">
                  Finanças → Passo 5 - Conciliar Contas Correntes → botão direito → Exportar →
                  Excel. Precisa da coluna Categoria visível na grade.
                </span>
              </div>
            </label>
          )
        )}

        {rascunhos && resumo && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Linhas do Omie</p>
                <p className="text-lg font-semibold tabular-nums">{resumo.totalLinhas}</p>
                {rascunhos.length !== resumo.totalLinhas && (
                  <p className="text-xs text-muted-foreground">
                    → {rascunhos.length} lançamentos (uma linha tinha rateio entre categorias)
                  </p>
                )}
              </div>
              <div className="rounded-md border border-success-line bg-success-soft/20 p-2">
                <p className="text-xs text-success-text flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
                <p className="text-lg font-semibold tabular-nums text-success-text">{brl(resumo.totalEntradas)}</p>
              </div>
              <div className="rounded-md border border-destructive-line bg-destructive-soft/20 p-2">
                <p className="text-xs text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
                <p className="text-lg font-semibold tabular-nums text-destructive-text">− {brl(resumo.totalSaidas)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className="text-lg font-semibold tabular-nums">{brl(resumo.totalEntradas - resumo.totalSaidas)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1"><Building2 className="w-3 h-3" /> {resumo.fornecedoresACriar} fornecedor(es) novo(s) a criar</Badge>
              <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" /> {resumo.pessoasVinculadas} vinculado(s) a membro por CPF</Badge>
            </div>

            {resumo.categoriasNaoEncontradas.length > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {resumo.categoriasNaoEncontradas.length} categoria(s) do Omie sem correspondente aqui
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esses lançamentos entram sem categoria (dá pra classificar um por um depois):
                  {" "}{resumo.categoriasNaoEncontradas.join(", ")}
                </p>
              </div>
            )}

            {resumo.saldoAnterior != null && (
              <label className="flex items-center gap-2 text-xs cursor-pointer border rounded-md p-2 bg-muted/20">
                <input type="checkbox" checked={usarSaldoInicial} onChange={(e) => setUsarSaldoInicial(e.target.checked)} />
                Usar {brl(resumo.saldoAnterior)} (saldo anterior no Omie) como saldo inicial de {contaNome}
              </label>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2">
              {amostra.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 py-1 last:border-0">
                  <span className="text-muted-foreground shrink-0">{dataBr(r.data)}</span>
                  <span className="flex-1 min-w-0 truncate">{r.descricao}</span>
                  <span className="text-muted-foreground shrink-0">{r.categoriaNome ?? r.categoriaBruta}</span>
                  <span className={`tabular-nums shrink-0 ${r.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                    {r.tipo === "entrada" ? "+" : "−"} {brl(r.valor)}
                  </span>
                </div>
              ))}
              {rascunhos.length > amostra.length && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {rascunhos.length - amostra.length} lançamento(s)...
                </p>
              )}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirmando}>
            Fechar
          </Button>
          {rascunhos && (
            <Button type="button" onClick={confirmar} disabled={confirmando}
              className="bg-gold hover:bg-gold/90 text-white gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {confirmando ? "Importando..." : `Importar ${rascunhos.length} lançamento(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
