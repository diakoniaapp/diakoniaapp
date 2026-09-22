import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { CampoData } from "@/components/CampoData";
import { paraNumero } from "@/lib/dinheiro";
import {
  atualizarTransferencia, carregarTransferencia, listarContas, brl,
  type FinConta, type FinLancamentoExtenso, type FinTransferenciaDetalhe,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lancamento: FinLancamentoExtenso | null;
  onSaved: () => void;
}

// Edição de transferência, estilo Omie — pedido da Telma (22/09/2026), em
// duas rodadas: primeiro achou ao vivo que o lápis abria o `LancamentoForm`
// inteiro (deixava mudar Conta/Valor/Categoria de só UMA perna, sem nada
// impedir a outra de ficar pra trás); depois, vendo a versão restrita a só
// Data/Descrição, pediu pra "mostrar opções como no Omie sistema" — lá
// Origem, Destino e Valor são editáveis na mesma tela, porque a
// transferência é UM registro. Aqui continuam sendo DUAS linhas em
// `fin_lancamentos` — a diferença fica escondida dentro de
// `atualizarTransferencia()` (finService.ts), que escreve nas duas pernas
// quando Data/Valor mudam, e na perna certa quando Conta muda.
export function EditarTransferenciaForm({ open, onOpenChange, lancamento, onSaved }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<FinTransferenciaDetalhe | null>(null);
  const [contas, setContas] = useState<FinConta[]>([]);

  const [contaOrigemId, setContaOrigemId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [data, setData] = useState("");
  const [valorTexto, setValorTexto] = useState("0");
  const [descricao, setDescricao] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !lancamento) return;
    setCarregando(true);
    Promise.all([carregarTransferencia(lancamento.id), listarContas()])
      .then(([det, cs]) => {
        setDetalhe(det);
        setContas(cs);
        setContaOrigemId(det.contaOrigemId);
        setContaDestinoId(det.contaDestinoId ?? "");
        setData(det.data);
        setValorTexto(String(det.valor));
        setDescricao(det.descricao ?? "");
      })
      .catch((e: any) => toast.error(e?.message ?? "Erro ao carregar a transferência"))
      .finally(() => setCarregando(false));
  }, [open, lancamento]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lancamento || !detalhe) return;
    const valor = paraNumero(valorTexto);
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    // Sem par conhecido (perna importada do Omie/OFX): só o lado desta
    // própria perna existe pra editar — o outro campo de conta nem
    // aparece no formulário (ver JSX abaixo), então não valida contra ele.
    if (detalhe.temPar && contaOrigemId === contaDestinoId) {
      toast.error("Origem e destino precisam ser contas diferentes");
      return;
    }

    setBusy(true);
    try {
      await atualizarTransferencia(lancamento.id, {
        data, valor,
        descricao: descricao.trim() || null,
        contaOrigemId: detalhe.temPar || detalhe.tipo === "saida" ? contaOrigemId : undefined,
        contaDestinoId: detalhe.temPar || detalhe.tipo === "entrada" ? contaDestinoId : undefined,
      });
      toast.success("Transferência atualizada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (!lancamento) return null;

  // Contas oferecidas no seletor de Origem/Destino — mesmo filtro de
  // `TransferenciaForm.tsx` (aceita_transferencia_saida/entrada, item 5),
  // com a conta já escolhida sempre visível mesmo se não aceitar mais
  // (evita um Select "vazio" por engano de configuração depois do fato).
  const opcoesOrigem = contas.filter(c => c.id === contaOrigemId || c.aceita_transferencia_saida);
  const opcoesDestino = contas.filter(c => c.id === contaDestinoId || c.aceita_transferencia_entrada);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-info-text" /> Editar transferência
          </DialogTitle>
          <DialogDescription>
            {detalhe && !detalhe.temPar
              ? "Esta perna veio de uma importação (Omie/OFX) sem a perna irmã identificada — só dá pra editar o lado desta própria conta."
              : "Data e valor valem pras duas pernas da transferência."}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Conta de origem *</Label>
                {detalhe?.temPar || detalhe?.tipo === "saida" ? (
                  <Select value={contaOrigemId} onValueChange={setContaOrigemId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {opcoesOrigem.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                    {contas.find(c => c.id === contaOrigemId)?.nome ?? "—"}
                  </div>
                )}
              </div>
              <div>
                <Label>Conta de destino *</Label>
                {detalhe?.temPar || detalhe?.tipo === "entrada" ? (
                  <Select value={contaDestinoId} onValueChange={setContaDestinoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {opcoesDestino.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                    {contas.find(c => c.id === contaDestinoId)?.nome ?? "—"}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data da transferência *</Label>
                <CampoData value={data} onChange={setData} />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="text" inputMode="decimal" required
                  value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-0.5">
                Só desta perna — cada lado da transferência pode ter uma nota própria.
              </p>
            </div>

            {detalhe && (
              <p className="text-xs text-muted-foreground">
                Valor atual: {brl(detalhe.valor)}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
