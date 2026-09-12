// ─── ConciliacaoOFXDialog.tsx ────────────────────────────────────────────
//
// Item 7 do roadmap do ERP financeiro. Mesmo padrão de Dialog que
// `TransferenciaForm.tsx`/`LancamentoForm.tsx` já usam — não uma tela
// nova. Lê o arquivo, mostra o que casou (vai ser conciliado com um
// clique, reaproveitando `conciliarEmLote` do item 6) e o que não casou.
//
// "O que não casou" tem um botão "Lançar" que abre o MESMO
// `LancamentoForm` de sempre, pré-preenchido com data/valor/descrição da
// linha do extrato — a pessoa ainda escolhe categoria e centro de custo,
// nunca adivinhados a partir do MEMO do banco (ver `ofxService.ts`).
// Depois de salvar, a lista é recasada: o lançamento recém-criado tem os
// mesmos data/valor/tipo da transação, então cai automaticamente em
// "encontrado" e entra no próximo "Conciliar N".
import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileUp, Scale, CheckCircle2, HelpCircle, Plus } from "lucide-react";
import { listarLancamentos, conciliarEmLote, brl, type FinMovimentoTipo } from "@/services/finService";
import {
  parseOFX, encodingDoOFX, casarComLancamentos, inferirFormaPagamento,
  type OFXCasamento, type OFXTransacao,
} from "@/services/ofxService";
import { LancamentoForm } from "./LancamentoForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function addDias(s: string, n: number): string {
  const d = new Date(s + "T00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ConciliacaoOFXDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [transacoes, setTransacoes] = useState<OFXTransacao[] | null>(null);
  const [resultado, setResultado] = useState<OFXCasamento[] | null>(null);
  const [lancarTransacao, setLancarTransacao] = useState<OFXTransacao | null>(null);

  function reiniciar() {
    setArquivo(null);
    setTransacoes(null);
    setResultado(null);
  }

  async function recasar(txs: OFXTransacao[]) {
    const datas = txs.map(t => t.data).sort();
    const dataInicio = addDias(datas[0], -5);
    const dataFim = addDias(datas[datas.length - 1], 5);
    const realizados = await listarLancamentos({ contaId, status: "realizado", dataInicio, dataFim });
    setResultado(casarComLancamentos(txs, realizados));
  }

  async function processarArquivo(file: File) {
    setArquivo(file);
    setProcessando(true);
    setResultado(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoding = encodingDoOFX(bytes);
      const texto = new TextDecoder(encoding).decode(bytes);
      const txs = parseOFX(texto);
      if (txs.length === 0) {
        toast.error("Nenhuma transação encontrada nesse arquivo — confira se é o extrato em OFX.");
        setProcessando(false);
        return;
      }
      setTransacoes(txs);
      await recasar(txs);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler o arquivo");
    } finally {
      setProcessando(false);
    }
  }

  const encontrados = resultado?.filter(r => r.status === "encontrado") ?? [];
  const pendentes = resultado?.filter(r => r.status !== "encontrado") ?? [];

  async function conciliar() {
    if (encontrados.length === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(encontrados.map(r => r.lancamentoId!));
      toast.success(`${encontrados.length} lançamento${encontrados.length > 1 ? "s" : ""} conciliado${encontrados.length > 1 ? "s" : ""}`);
      onOpenChange(false);
      reiniciar();
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setConciliando(false);
    }
  }

  async function aoSalvarLancamento() {
    setLancarTransacao(null);
    if (transacoes) await recasar(transacoes);
    onSaved(); // refresca a lista por trás (FinancasConta) mesmo sem fechar este dialog
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reiniciar(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold" /> Importar extrato (OFX)
          </DialogTitle>
          <DialogDescription>
            Casa as transações do extrato de <strong>{contaNome}</strong> com os lançamentos já
            registrados como "Realizado" e concilia os que baterem. O que não casar pode ser
            lançado na hora — ou conferido à mão depois.
          </DialogDescription>
        </DialogHeader>

        {!arquivo ? (
          <label className="cursor-pointer block">
            <input type="file" accept=".ofx,.OFX" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
            <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
              <FileUp className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">Selecionar arquivo .OFX</span>
            </div>
          </label>
        ) : processando ? (
          <p className="text-sm text-center text-muted-foreground py-6">Lendo o extrato...</p>
        ) : resultado && (
          <div className="space-y-3">
            <div className="rounded-md border border-success-line bg-success-soft/30 p-3">
              <p className="text-sm font-medium text-success-text flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {encontrados.length} encontrada{encontrados.length !== 1 ? "s" : ""} — {encontrados.length === 1 ? "será conciliada" : "serão conciliadas"}
              </p>
              {encontrados.length > 0 && (
                <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                  {encontrados.map((r, i) => (
                    <li key={i} className="truncate">
                      {dataBr(r.transacao.data)} · {brl(r.transacao.valor)} · {r.transacao.memo}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pendentes.length > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4" />
                  {pendentes.length} sem correspondência automática
                </p>
                <ul className="text-xs mt-1.5 space-y-1 max-h-48 overflow-y-auto">
                  {pendentes.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-muted-foreground">
                        {dataBr(r.transacao.data)} · {brl(r.transacao.valor)} · {r.transacao.memo}
                        {r.status === "ambiguo" && ` — ${r.candidatos.length} lançamentos parecidos, revise à mão`}
                      </span>
                      {r.status === "sem_correspondencia" && (
                        <Button type="button" size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 shrink-0"
                          onClick={() => setLancarTransacao(r.transacao)}>
                          <Plus className="w-3 h-3" /> Lançar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={conciliando}>
            Fechar
          </Button>
          {resultado && encontrados.length > 0 && (
            <Button type="button" onClick={conciliar} disabled={conciliando}
              className="bg-success hover:bg-success text-white gap-1.5">
              <Scale className="w-3.5 h-3.5" /> {conciliando ? "..." : `Conciliar ${encontrados.length}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Lançar a partir de uma linha do extrato sem correspondência —
        mesmo formulário de sempre, só pré-preenchido. Dialog irmão, não
        aninhado dentro do de cima — mesmo padrão de FinancasConta.tsx
        (TransferenciaForm/LancamentoForm lado a lado, nunca um dentro
        do outro). */}
    <LancamentoForm
      open={!!lancarTransacao}
      onOpenChange={(v) => { if (!v) setLancarTransacao(null); }}
      contaIdPadrao={contaId}
      contaTravada
      contaNomeTravado={contaNome}
      tipoPadrao={lancarTransacao?.tipo as FinMovimentoTipo}
      rascunho={lancarTransacao ? {
        data: lancarTransacao.data,
        valor: lancarTransacao.valor,
        descricao: lancarTransacao.memo,
        forma: inferirFormaPagamento(lancarTransacao.memo),
      } : undefined}
      onSaved={aoSalvarLancamento}
    />
    </>
  );
}
