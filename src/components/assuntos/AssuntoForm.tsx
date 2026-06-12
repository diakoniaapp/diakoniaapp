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
import { CheckSquare } from "lucide-react";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { supabase } from "@/integrations/supabase/client";
import {
  criarAssunto, atualizarAssunto,
  PRIORIDADE_LABEL, STATUS_LABEL,
  type Assunto, type AssuntoPrioridade, type AssuntoStatus,
} from "@/services/assuntosService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assunto?: Assunto | null;
  reuniaoId?: string;     // se vier, vincula ao criar
  onSaved: () => void;
}

export function AssuntoForm({ open, onOpenChange, assunto, reuniaoId, onSaved }: Props) {
  const isEdit = !!assunto;
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<AssuntoPrioridade>("media");
  const [status, setStatus] = useState<AssuntoStatus>("aberto");
  const [responsavelId, setResponsavelId] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (assunto) {
      setTitulo(assunto.titulo);
      setDescricao(assunto.descricao ?? "");
      setPrioridade(assunto.prioridade);
      setStatus(assunto.status);
      setResponsavelId(assunto.responsavel_id ?? "");
      setResponsavelNome(assunto.responsavel_nome ?? "");
      setPrazo(assunto.prazo ?? "");
    } else {
      setTitulo(""); setDescricao(""); setPrioridade("media"); setStatus("aberto");
      setResponsavelId(""); setResponsavelNome(""); setPrazo("");
    }
  }, [open, assunto]);

  useEffect(() => {
    if (!responsavelId) return;
    supabase.from("membros").select("nome_completo").eq("id", responsavelId).maybeSingle().then(({ data }) => {
      if (data?.nome_completo) setResponsavelNome(data.nome_completo);
    });
  }, [responsavelId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    setBusy(true);
    try {
      const payload: any = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        prioridade, status,
        responsavel_id: responsavelId || null,
        responsavel_nome: responsavelNome || null,
        prazo: prazo || null,
        origem: reuniaoId ? "reuniao" : "manual",
        reuniao_origem_id: reuniaoId ?? null,
      };
      let id: string;
      if (isEdit && assunto) {
        await atualizarAssunto(assunto.id, payload);
        id = assunto.id;
        toast.success("Assunto atualizado");
      } else {
        const novo = await criarAssunto(payload);
        id = novo.id;
        toast.success("Assunto criado");
      }
      // Se veio de uma reunião, vincula
      if (reuniaoId && !isEdit) {
        await supabase.from("reuniao_assuntos").upsert({
          reuniao_id: reuniaoId, assunto_id: id,
        }, { onConflict: "reuniao_id,assunto_id" });
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-gold" />
            {isEdit ? "Editar assunto" : "Novo assunto"}
          </DialogTitle>
          <DialogDescription>Assuntos vivem entre reuniões até serem concluídos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as AssuntoPrioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">🔴 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AssuntoStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABEL) as [AssuntoStatus, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Responsável</Label>
            <BuscaPessoa value={responsavelId} onChange={(id) => setResponsavelId(id)}
              placeholder="A quem fica o assunto..." />
          </div>
          <div>
            <Label>Prazo</Label>
            <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-0.5">Data limite para conclusão (opcional)</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : isEdit ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
