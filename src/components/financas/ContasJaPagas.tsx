// ─── ContasJaPagas — "estas contas abertas já foram pagas: o pagamento está no extrato" ──────────────────────────────────────────
//
// O ciclo único (08/10/2026, "a Mesa de Operações deve representar só o que realmente está em aberto"): conta prevista → documentos → pagamento →
// OFX → liquidada → histórico. Quando o pagamento entrou no extrato SEM encontrar a obrigação (ela foi criada depois, ou a linha foi importada como
// lançamento comum), este aviso as reúne: a tesouraria vê as duas lado a lado e liquida com um clique. A fusão deixa UM registro — a obrigação,
// com os anexos dos dois lados, paga na data do banco e com a marca do OFX. Nada acontece sem a confirmação.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LiquidacaoPainel } from "@/components/financas/LiquidacaoPainel";
import { brl } from "@/services/finService";
import {
  carregarSugestoesDeLiquidacao, fusaoDisponivel, liquidarComPagamentoExistente, planoDireto,
} from "@/services/contasJaPagasService";
import type { SugestaoDeLiquidacao } from "@/lib/contasJaPagas";
import type { PlanoDeLiquidacao } from "@/lib/liquidacao";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const CHAVE_DISPENSADAS = "diakonia-contas-ja-pagas-dispensadas";
const chaveDoPar = (s: SugestaoDeLiquidacao) => `${s.obrigacao.id}|${s.pagamento.id}`;
const ROTULO_ORIGEM: Record<string, string> = { importado_ofx: "importado do OFX", importado_omie: "importado do Omie", manual: "lançado à mão" };

function lerDispensadas(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_DISPENSADAS) ?? "[]") as string[]); } catch { return new Set(); }
}
function guardarDispensadas(s: Set<string>) {
  try { localStorage.setItem(CHAVE_DISPENSADAS, JSON.stringify([...s])); } catch { /* sem armazenamento: dispensa só vale até recarregar */ }
}

export function ContasJaPagas({ onMudou, chave }: { onMudou: () => void; chave?: unknown }) {
  const [todas, setTodas] = useState<SugestaoDeLiquidacao[] | null>(null);
  const [disponivel, setDisponivel] = useState(true);
  const [dispensadas, setDispensadas] = useState<Set<string>>(() => lerDispensadas());
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState<SugestaoDeLiquidacao | null>(null);
  const [comDiferenca, setComDiferenca] = useState<SugestaoDeLiquidacao | null>(null);
  const [plano, setPlano] = useState<PlanoDeLiquidacao | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [s, ok] = await Promise.all([carregarSugestoesDeLiquidacao(), fusaoDisponivel()]);
      setTodas(s); setDisponivel(ok);
    } catch { setTodas([]); }   // é um aviso: nunca atrapalha a Mesa
  }, []);
  useEffect(() => { carregar(); }, [carregar, chave]);

  const visiveis = useMemo(() => (todas ?? []).filter(s => !dispensadas.has(chaveDoPar(s))), [todas, dispensadas]);
  const seguras = visiveis.filter(s => s.nivel === "segura");

  function dispensar(s: SugestaoDeLiquidacao) {
    const n = new Set(dispensadas); n.add(chaveDoPar(s)); setDispensadas(n); guardarDispensadas(n);
  }

  async function liquidar(s: SugestaoDeLiquidacao, p: PlanoDeLiquidacao): Promise<boolean> {
    setProcessando(s.obrigacao.id);
    try {
      await liquidarComPagamentoExistente({ obrigacaoId: s.obrigacao.id, pagamentoId: s.pagamento.id, plano: p, adotarValor: s.adotarValor });
      return true;
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível liquidar.");
      return false;
    } finally { setProcessando(null); }
  }

  async function confirmarUma() {
    const s = confirmando; if (!s) return;
    const ok = await liquidar(s, planoDireto(s));
    setConfirmando(null);
    if (ok) { toast.success(`${s.obrigacao.nome || "Obrigação"} liquidada com o pagamento de ${dataBr(s.pagamento.data)}.`); await carregar(); onMudou(); }
  }

  async function confirmarComDiferenca() {
    const s = comDiferenca; if (!s || !plano) return;
    const ok = await liquidar(s, plano);
    if (ok) { setComDiferenca(null); setPlano(null); toast.success(`${s.obrigacao.nome || "Obrigação"} liquidada — diferença registrada.`); await carregar(); onMudou(); }
  }

  async function liquidarSeguras() {
    let feitas = 0;
    for (const s of seguras) {
      if (!(await liquidar(s, planoDireto(s)))) break;
      feitas++;
    }
    if (feitas > 0) toast.success(`${feitas} conta${feitas !== 1 ? "s" : ""} liquidada${feitas !== 1 ? "s" : ""} com o pagamento já registrado.`);
    await carregar(); onMudou();
  }

  if (!todas || visiveis.length === 0) return null;

  return (
    <>
      <div className="mb-3 rounded-md border border-warning-line bg-warning-soft/40 p-3 flex flex-wrap items-center gap-2" role="status">
        <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />
        <p className="text-sm min-w-0 flex-1">
          <b>{visiveis.length} conta{visiveis.length !== 1 ? "s" : ""} aberta{visiveis.length !== 1 ? "s" : ""}</b> {visiveis.length !== 1 ? "já têm" : "já tem"} pagamento registrado no extrato
          <span className="text-muted-foreground"> — liquidar com ele deixa um registro só, com os anexos, e tira da Mesa.</span>
        </p>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAberto(true)}><Link2 className="w-3 h-3" /> Revisar</Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contas abertas com pagamento já registrado</DialogTitle>
            <DialogDescription>
              Liquidar funde os dois registros: fica a obrigação (com a classificação, o contrato, o vencimento e os anexos dos dois lados), paga na data do banco. O lançamento duplicado do extrato sai; o saldo da conta não muda.
            </DialogDescription>
          </DialogHeader>
          {!disponivel && (
            <p className="text-xs text-warning-text border border-warning-line bg-warning-soft/40 rounded-md px-3 py-2" role="alert">
              A ação de liquidar fica disponível depois que a migration 20261008220000 for aplicada no banco. A lista abaixo já mostra o que seria ligado.
            </p>
          )}
          {seguras.length > 1 && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-success-soft/30 px-3 py-2">
              <p className="text-xs">{seguras.length} sugestões <b>seguras</b> (mesmo favorecido, valor exato ou estimativa trocada pelo valor real).</p>
              <Button size="sm" className="h-7 text-xs" disabled={!disponivel || !!processando} onClick={liquidarSeguras}>Liquidar as {seguras.length} seguras</Button>
            </div>
          )}
          <ul className="space-y-2">
            {visiveis.map(s => (
              <li key={chaveDoPar(s)} className="rounded-md border p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Obrigação aberta</p>
                    <p className="text-sm font-medium truncate">{s.obrigacao.nome || "—"}</p>
                    <p className="text-xs text-muted-foreground">vence {dataBr(s.obrigacao.data)}{s.obrigacao.valor_variavel ? " · valor estimado" : ""}</p>
                    <p className="text-sm tabular-nums">{brl(s.obrigacao.valor)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pagamento no extrato</p>
                    <p className="text-sm font-medium truncate" title={s.pagamento.descricao}>{s.pagamento.nome || s.pagamento.descricao || "—"}</p>
                    <p className="text-xs text-muted-foreground">pago {dataBr(s.pagamento.data)} · {ROTULO_ORIGEM[s.pagamento.origem] ?? s.pagamento.origem}</p>
                    <p className="text-sm tabular-nums">{brl(s.pagamento.valor)}
                      {Math.abs(s.diferenca) >= 0.005 && <span className={`ml-2 text-xs ${s.diferenca > 0 ? "text-warning-text" : "text-muted-foreground"}`}>{s.diferenca > 0 ? "+" : "−"} {brl(Math.abs(s.diferenca))}</span>}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{s.motivos.join(" · ")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {s.nivel === "segura"
                    ? <span className="text-[11px] rounded-full border border-success-line bg-success-soft/50 text-success-text px-2 py-0.5">segura</span>
                    : <span className="text-[11px] rounded-full border border-warning-line bg-warning-soft/50 text-warning-text px-2 py-0.5">conferir</span>}
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" disabled={!!processando} onClick={() => dispensar(s)}><X className="w-3 h-3" /> Não é este</Button>
                  {(s.adotarValor || Math.abs(s.diferenca) < 0.005)
                    ? <Button size="sm" className="h-7 gap-1 text-xs" disabled={!disponivel || !!processando} onClick={() => setConfirmando(s)}>
                        {processando === s.obrigacao.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Liquidar com este pagamento
                      </Button>
                    : <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!disponivel || !!processando} onClick={() => { setPlano(null); setComDiferenca(s); }}>
                        Liquidar explicando a diferença…
                      </Button>}
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmando} onOpenChange={o => { if (!o && !processando) setConfirmando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liquidar com o pagamento já registrado?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {confirmando && (
                <div className="space-y-2 text-sm">
                  <p>Vai ficar <b>um registro só</b>: <b>{confirmando.obrigacao.nome}</b>, vencimento {dataBr(confirmando.obrigacao.data)}, <b>paga em {dataBr(confirmando.pagamento.data)}</b> no valor de <b>{brl(confirmando.pagamento.valor)}</b>
                    {confirmando.adotarValor && <> (o valor estimado de {brl(confirmando.obrigacao.valor)} é trocado pelo real)</>}.</p>
                  <p>Os anexos dos dois lados ficam na obrigação, a marca do banco passa para ela e o lançamento duplicado do extrato ({brl(confirmando.pagamento.valor)}) é removido. O saldo da conta não muda.</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!processando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={!!processando} onClick={e => { e.preventDefault(); confirmarUma(); }}>Liquidar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!comDiferenca} onOpenChange={o => { if (!o && !processando) { setComDiferenca(null); setPlano(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Explique a diferença</DialogTitle>
            <DialogDescription>
              {comDiferenca && <>{comDiferenca.obrigacao.nome}: o documento é de {brl(comDiferenca.obrigacao.valor)} e o extrato mostra {brl(comDiferenca.pagamento.valor)}.</>}
            </DialogDescription>
          </DialogHeader>
          {comDiferenca && (
            <LiquidacaoPainel
              lancamento={{ id: comDiferenca.obrigacao.id, valor: comDiferenca.obrigacao.valor, data: comDiferenca.obrigacao.data, fornecedor_id: comDiferenca.obrigacao.fornecedor_id } as never}
              valorPagoFixo={comDiferenca.pagamento.valor} onPlano={setPlano} />
          )}
          {plano && plano.itens.length > 1 && (
            <p className="text-xs text-destructive-text" role="alert">Aqui o pagamento liquida uma obrigação só. Para incluir outro documento, use o botão Pagar da própria conta.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={!!processando} onClick={() => { setComDiferenca(null); setPlano(null); }}>Cancelar</Button>
            <Button disabled={!plano || !plano.pronto || plano.itens.length !== 1 || !!processando || !disponivel} onClick={confirmarComDiferenca}>
              {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Liquidar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
