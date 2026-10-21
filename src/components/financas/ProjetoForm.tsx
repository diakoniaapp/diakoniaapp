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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FolderKanban } from "lucide-react";
import { paraNumero } from "@/lib/dinheiro";
import { criarProjeto, atualizarProjeto, type FinProjeto } from "@/services/finService";
import { CampoData } from "@/components/CampoData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projeto?: FinProjeto | null;
  onSaved: () => void;
}

const VAZIO = {
  nome: "", descricao: "", metaValor: "", dataInicio: "", dataFim: "", semMeta: false, reserva: false,
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
        // Reflete o estado atual gravado — editar um projeto que já não
        // tinha meta não pode virar "tem meta zero" sem ninguém pedir.
        semMeta: projeto.meta_valor == null,
        reserva: !!projeto.reserva_financeira,
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
        meta_valor: campos.semMeta ? null : (campos.metaValor.trim() ? paraNumero(campos.metaValor) : null),
        data_inicio: campos.dataInicio || null,
        data_fim: campos.dataFim || null,
        // só vai no payload quando MUDOU (ou num projeto novo marcado): editar outro campo não depende da coluna nova existir no banco
        ...((projeto?.reserva_financeira ?? false) !== campos.reserva ? { reserva_financeira: campos.reserva } : {}),
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
      // a coluna da reserva só existe depois da migration 20261021150000: sem ela o banco recusa o campo — diz o que fazer, em vez do texto técnico do PostgREST
      if (/reserva_financeira/.test(e?.message ?? "")) {
        toast.error("A reserva financeira ainda não está ativa no banco (falta aplicar a migration 20261021150000). Desmarque “Projeto com Reserva Financeira” para salvar agora, ou aplique a migration e tente de novo.");
      } else toast.error(e?.message ?? "Erro ao salvar projeto");
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
            <div className="flex items-center justify-between">
              <Label>Meta de arrecadação</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={campos.semMeta}
                  onCheckedChange={(v) => set("semMeta", !!v)} />
                Projeto sem meta definida
              </label>
            </div>
            <Input type="text" inputMode="decimal" value={campos.metaValor}
              onChange={(e) => set("metaValor", e.target.value)}
              disabled={campos.semMeta}
              placeholder={campos.semMeta ? "Sem meta de arrecadação definida" : "Opcional — nem todo projeto tem meta"} />
            <p className="text-xs text-muted-foreground mt-1">
              Só afeta a nota "meta de arrecadação definida" do relatório — o
              cartão de déficit/superávit compara sempre com o total de
              despesas já lançadas, com ou sem essa meta.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início</Label>
              <CampoData value={campos.dataInicio} onChange={(v) => set("dataInicio", v)} />
            </div>
            <div>
              <Label>Fim</Label>
              <CampoData value={campos.dataFim} onChange={(v) => set("dataFim", v)} placeholder="Em andamento" />
            </div>
          </div>

          {/* Pedido dela (21/10/2026): "nem todo projeto deve reservar dinheiro" — desmarcado por padrão; só os marcados entram no card "Reservado" da Tesouraria. */}
          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2.5">
            <Checkbox className="mt-0.5" checked={campos.reserva} onCheckedChange={(v) => set("reserva", !!v)} />
            <span className="text-sm">
              <span className="font-medium">Projeto com Reserva Financeira</span>
              <span className="block text-xs text-muted-foreground">
                O que este projeto arrecadou (menos o que já gastou nele) fica reservado: aparece em "Reservado" na Tesouraria e sai do saldo livre. Não bloqueia pagamentos.
              </span>
            </span>
          </label>

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
