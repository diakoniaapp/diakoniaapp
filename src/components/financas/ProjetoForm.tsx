// ─── ProjetoForm.tsx ─────────────────────────────────────────────────────
//
// Fase 6 do ERP financeiro (17/09/2026). Formulário de um Projeto — a
// terceira dimensão financeira, além de Categoria e Centro de Custo, pra
// acompanhar iniciativas como "120 Anos" ou "Reforma do Templo". Ver
// docs/ROADMAP_FINANCEIRO_ERP.md Fase 6 para a auditoria e a decisão.
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FolderKanban } from "lucide-react";
import { paraNumero } from "@/lib/dinheiro";
import { criarProjeto, atualizarProjeto, type FinProjeto } from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projeto?: FinProjeto | null;
  onSaved: () => void;
}

const VAZIO = {
  nome: "", descricao: "", metaValor: "", dataInicio: "", dataFim: "",
};

export function ProjetoForm({ open, onOpenChange, projeto, onSaved }: Props) {
  const isEdit = !!projeto;
  const [campos, setCampos] = useState(VAZIO);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (projeto) {
      setCampos({
        nome: projeto.nome,
        descricao: projeto.descricao ?? "",
        // `paraNumero` só entra no submit — aqui é o caminho inverso
        // (número do banco → texto pro campo), formatação simples com
        // vírgula decimal, do jeito que a pessoa vai editar de volta.
        metaValor: projeto.meta_valor != null ? String(projeto.meta_valor).replace(".", ",") : "",
        dataInicio: projeto.data_inicio ?? "",
        dataFim: projeto.data_fim ?? "",
      });
    } else {
      setCampos(VAZIO);
    }
  }, [open, projeto]);

  function set<K extends keyof typeof VAZIO>(campo: K, valor: typeof VAZIO[K]) {
    setCampos(c => ({ ...c, [campo]: valor }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campos.nome.trim()) { toast.error("Informe o nome do projeto"); return; }

    setBusy(true);
    try {
      const payload = {
        nome: campos.nome.trim(),
        descricao: campos.descricao.trim() || null,
        meta_valor: campos.metaValor.trim() ? paraNumero(campos.metaValor) : null,
        data_inicio: campos.dataInicio || null,
        data_fim: campos.dataFim || null,
      };

      if (isEdit && projeto) {
        await atualizarProjeto(projeto.id, payload);
        toast.success("Projeto atualizado");
      } else {
        await criarProjeto(payload);
        toast.success("Projeto cadastrado");
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar projeto");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-gold" />
            {isEdit ? "Editar projeto" : "Novo projeto"}
          </DialogTitle>
          <DialogDescription>
            Uma iniciativa específica (campanha, reforma, congresso...) que a
            tesouraria quer acompanhar separada — meta, arrecadação e
            despesas próprias, além de categoria e centro de custo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={campos.nome} onChange={(e) => set("nome", e.target.value)} required
              placeholder="Ex: 120 Anos da Igreja" autoFocus />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={campos.descricao} onChange={(e) => set("descricao", e.target.value)}
              placeholder="Opcional" />
          </div>

          <div>
            <Label>Meta de arrecadação</Label>
            <Input type="text" inputMode="decimal" value={campos.metaValor}
              onChange={(e) => set("metaValor", e.target.value)}
              placeholder="Opcional — nem todo projeto tem meta" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <Input type="date" value={campos.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={campos.dataFim} onChange={(e) => set("dataFim", e.target.value)}
                placeholder="Em andamento" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
