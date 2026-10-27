// ─── RecalcularGuiaDialog — a guia atrasou e foi recalculada: altera a obrigação em vez de excluir e criar outra ──────────────────────────────────────────────
//
// Pedido dela (23/10/2026, FGTS): preservar o valor original, registrar o encargo (juros, multa, correção), guardar o motivo e a nova guia, e deixar o custo extra aparecer nos relatórios. A regra mora no banco
// (`fin_recalcular_obrigacao`); a conferência ao vivo desta tela é `lib/recalculoDeGuia` — as mesmas regras, para a pessoa ver o que falta antes de clicar.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paraNumero } from "@/lib/dinheiro";
import { conferirRecalculo, MOTIVOS_SUGERIDOS, resumoDoRecalculo } from "@/lib/recalculoDeGuia";
import { recalcularGuia } from "@/services/recalculoDeObrigacaoService";
import { brl } from "@/services/finService";

export interface AlvoDoRecalculo { id: string; descricao: string; valor: number }

export function RecalcularGuiaDialog({ alvo, onFechar, onFeito }: { alvo: AlvoDoRecalculo | null; onFechar: () => void; onFeito: () => void }) {
  const [novoValor, setNovoValor] = useState("");
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [correcao, setCorrecao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guia, setGuia] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Zera a cada ABERTURA (o `alvo` é um objeto novo toda vez que o link do Pagar o define), não só quando muda o id: reabrir a MESMA despesa depois de cancelar ou de um erro mostrava os valores antigos
  // e deixava a guia escolhida só no estado — o campo de arquivo, remontado, aparecia vazio com o botão liberado (achado na auditoria de 27/10/2026).
  useEffect(() => { setNovoValor(""); setJuros(""); setMulta(""); setCorrecao(""); setMotivo(""); setGuia(null); }, [alvo]);

  if (!alvo) return null;
  const e = { valorAtual: alvo.valor, novoValor: paraNumero(novoValor), juros: paraNumero(juros), multa: paraNumero(multa), correcao: paraNumero(correcao), motivo, temGuia: !!guia };
  const conf = conferirRecalculo(e);

  async function confirmar() {
    if (!conf.ok || !guia || !alvo) return;
    setSalvando(true);
    try {
      await recalcularGuia({ lancamentoId: alvo.id, novoValor: e.novoValor, juros: e.juros, multa: e.multa, correcao: e.correcao, motivo, guia });
      toast.success("Guia recalculada — o valor original e o encargo ficaram registrados");
      onFeito(); onFechar();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Não consegui recalcular a guia"); }
    finally { setSalvando(false); }
  }

  const campo = (id: string, rotulo: string, valor: string, set: (v: string) => void, dica?: string) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input id={id} inputMode="decimal" autoComplete="off" value={valor} onChange={ev => set(ev.target.value)} placeholder="0,00" className="h-9 tabular-nums" />
      {dica && <p className="text-2xs text-muted-foreground">{dica}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recalcular a guia</DialogTitle>
          <DialogDescription>
            {alvo.descricao || "Esta despesa"} · hoje {brl(alvo.valor)}. A obrigação continua UMA só: o valor original, o encargo e o motivo ficam registrados nela e aparecem nos relatórios como custo extra.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {campo("rg-novo", "Novo valor da guia", novoValor, setNovoValor, conf.diferenca > 0 ? resumoDoRecalculo(alvo.valor, e.novoValor) : undefined)}
          <fieldset className="rounded-md border p-2.5 space-y-2">
            <legend className="px-1 text-xs font-medium">De onde vem a diferença{conf.diferenca > 0 ? ` (${brl(conf.diferenca)})` : ""}</legend>
            <div className="grid grid-cols-3 gap-2">
              {campo("rg-juros", "Juros", juros, setJuros)}
              {campo("rg-multa", "Multa", multa, setMulta)}
              {campo("rg-correcao", "Correção", correcao, setCorrecao)}
            </div>
            {conf.diferenca > 0 && (
              <p className={`text-xs ${Math.abs(conf.sobra) < 0.005 ? "text-success-text" : "text-warning-text"}`} aria-live="polite">
                {Math.abs(conf.sobra) < 0.005 ? "✓ A quebra fecha com a diferença." : conf.sobra > 0 ? `Faltam ${brl(conf.sobra)} para explicar.` : `Passou ${brl(-conf.sobra)} da diferença.`}
              </p>
            )}
            <p className="text-2xs text-muted-foreground">A correção (atualização monetária) aparece nos relatórios somada aos juros, como nas guias; o detalhe fica no registro do recálculo.</p>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="rg-motivo" className="text-xs">Motivo</Label>
            <Input id="rg-motivo" value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Ex.: encargos por atraso" className="h-9" />
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_SUGERIDOS.map(m => (
                <button key={m} type="button" className="rounded-full border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted" onClick={() => setMotivo(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rg-guia" className="text-xs flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> Nova guia (obrigatória)</Label>
            <input id="rg-guia" type="file" accept="application/pdf,image/png,image/jpeg" onChange={ev => setGuia(ev.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2.5 file:py-1.5 file:text-xs" />
            <p className="text-2xs text-muted-foreground">A guia de antes continua anexada: o relatório e a contabilidade veem as duas.</p>
          </div>

          {conf.problemas.length > 0 && (novoValor || motivo || guia) && (
            <ul className="list-disc pl-5 text-xs text-warning-text space-y-0.5" aria-live="polite">{conf.problemas.map(p => <li key={p}>{p}</li>)}</ul>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void confirmar()} disabled={!conf.ok || salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recalcular guia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
