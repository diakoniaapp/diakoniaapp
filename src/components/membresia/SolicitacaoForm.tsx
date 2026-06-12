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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { supabase } from "@/integrations/supabase/client";
import {
  criarSolicitacao, TIPO_LABEL,
  type TipoSolicitacao,
} from "@/services/membresiaService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function SolicitacaoForm({ open, onOpenChange, onSaved }: Props) {
  const [pessoaId, setPessoaId] = useState("");
  const [pessoaNome, setPessoaNome] = useState("");
  const [tipo, setTipo] = useState<TipoSolicitacao>("transferencia_emitida");
  const [motivo, setMotivo] = useState("");
  const [igrejaOrigem, setIgrejaOrigem] = useState("");
  const [igrejaDestino, setIgrejaDestino] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPessoaId(""); setPessoaNome("");
    setTipo("transferencia_emitida"); setMotivo("");
    setIgrejaOrigem(""); setIgrejaDestino(""); setObservacoes("");
  }, [open]);

  useEffect(() => {
    if (!pessoaId) return;
    supabase.from("membros").select("nome_completo").eq("id", pessoaId).maybeSingle().then(({ data }) => {
      if (data?.nome_completo) setPessoaNome(data.nome_completo);
    });
  }, [pessoaId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pessoaId && !pessoaNome.trim()) { toast.error("Selecione a pessoa ou informe o nome"); return; }
    setBusy(true);
    try {
      await criarSolicitacao({
        pessoa_id: pessoaId || null,
        pessoa_nome: pessoaNome.trim(),
        tipo,
        status: "aguardando_documento",
        motivo: motivo.trim() || null,
        igreja_origem: igrejaOrigem.trim() || null,
        igreja_destino: igrejaDestino.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      toast.success("Solicitação criada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  const tipoEhTransferencia = tipo.startsWith("transferencia");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            Nova solicitação de membresia
          </DialogTitle>
          <DialogDescription>Registra pedido de entrada, saída, transferência.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoSolicitacao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(TIPO_LABEL) as [TipoSolicitacao, string][]).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pessoa</Label>
            <BuscaPessoa value={pessoaId} onChange={(id) => setPessoaId(id)} placeholder="Buscar pessoa..." />
            <p className="text-[10px] text-muted-foreground mt-0.5">Ou nome (se não cadastrada):</p>
            <Input value={pessoaNome} onChange={(e) => setPessoaNome(e.target.value)} placeholder="Nome completo" className="mt-1" />
          </div>
          {tipoEhTransferencia && (
            <div className="grid grid-cols-2 gap-2 border rounded-md p-2 bg-muted/20">
              <div>
                <Label className="text-xs">Igreja de origem</Label>
                <Input value={igrejaOrigem} onChange={(e) => setIgrejaOrigem(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Igreja de destino</Label>
                <Input value={igrejaDestino} onChange={(e) => setIgrejaDestino(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Motivo / Contexto</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Criar solicitação"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
