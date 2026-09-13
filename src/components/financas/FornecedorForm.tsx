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
import { Building2, User } from "lucide-react";
import {
  listarCategorias, criarFornecedor, atualizarFornecedor,
  type FinCategoria, type FinFornecedor,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedor?: FinFornecedor | null;
  onSaved: (f: FinFornecedor) => void;
}

const VAZIO = {
  nome: "", tipo: "juridica" as string, cnpjCpf: "", email: "", telefone: "",
  chavePix: "", bancoNome: "", agencia: "", conta: "",
  endereco: "", bairro: "", cidade: "", uf: "", cep: "",
  categoriaPadraoId: "", observacao: "",
};

export function FornecedorForm({ open, onOpenChange, fornecedor, onSaved }: Props) {
  const isEdit = !!fornecedor;
  const [campos, setCampos] = useState(VAZIO);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Categoria padrão é sempre de despesa — fornecedor é de quem a igreja
    // COMPRA, nunca de quem ela recebe.
    listarCategorias("saida").then(setCategorias);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (fornecedor) {
      setCampos({
        nome: fornecedor.nome,
        tipo: fornecedor.tipo ?? "juridica",
        cnpjCpf: fornecedor.cnpj_cpf ?? "",
        email: fornecedor.email ?? "",
        telefone: fornecedor.telefone ?? "",
        chavePix: fornecedor.chave_pix ?? "",
        bancoNome: fornecedor.banco_nome ?? "",
        agencia: fornecedor.agencia ?? "",
        conta: fornecedor.conta ?? "",
        endereco: fornecedor.endereco ?? "",
        bairro: fornecedor.bairro ?? "",
        cidade: fornecedor.cidade ?? "",
        uf: fornecedor.uf ?? "",
        cep: fornecedor.cep ?? "",
        categoriaPadraoId: fornecedor.categoria_padrao_id ?? "",
        observacao: fornecedor.observacao ?? "",
      });
    } else {
      setCampos(VAZIO);
    }
  }, [open, fornecedor]);

  function set<K extends keyof typeof VAZIO>(campo: K, valor: typeof VAZIO[K]) {
    setCampos(c => ({ ...c, [campo]: valor }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campos.nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const payload: Partial<FinFornecedor> = {
        nome: campos.nome.trim(),
        tipo: campos.tipo,
        cnpj_cpf: campos.cnpjCpf.replace(/\D/g, "") || null,
        email: campos.email.trim() || null,
        telefone: campos.telefone.trim() || null,
        chave_pix: campos.chavePix.trim() || null,
        banco_nome: campos.bancoNome.trim() || null,
        agencia: campos.agencia.trim() || null,
        conta: campos.conta.trim() || null,
        endereco: campos.endereco.trim() || null,
        bairro: campos.bairro.trim() || null,
        cidade: campos.cidade.trim() || null,
        uf: campos.uf.trim().toUpperCase() || null,
        cep: campos.cep.replace(/\D/g, "") || null,
        categoria_padrao_id: campos.categoriaPadraoId || null,
        observacao: campos.observacao.trim() || null,
      };

      let salvo: FinFornecedor;
      if (isEdit && fornecedor) {
        await atualizarFornecedor(fornecedor.id, payload);
        salvo = { ...fornecedor, ...payload } as FinFornecedor;
        toast.success("Fornecedor atualizado");
      } else {
        salvo = await criarFornecedor(payload);
        toast.success("Fornecedor cadastrado");
      }

      onOpenChange(false);
      onSaved(salvo);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar fornecedor");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            {isEdit ? "Editar fornecedor" : "Novo fornecedor"}
          </DialogTitle>
          <DialogDescription>
            Quem a igreja paga — empresa, prestador de serviço ou pessoa física avulsa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={campos.tipo === "juridica" ? "default" : "outline"}
              onClick={() => set("tipo", "juridica")}
              className={campos.tipo === "juridica" ? "bg-gold hover:bg-gold/90 text-white gap-1.5" : "gap-1.5"}>
              <Building2 className="w-3.5 h-3.5" /> Pessoa jurídica
            </Button>
            <Button type="button" size="sm"
              variant={campos.tipo === "fisica" ? "default" : "outline"}
              onClick={() => set("tipo", "fisica")}
              className={campos.tipo === "fisica" ? "bg-gold hover:bg-gold/90 text-white gap-1.5" : "gap-1.5"}>
              <User className="w-3.5 h-3.5" /> Pessoa física
            </Button>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={campos.nome} onChange={(e) => set("nome", e.target.value)} required
              placeholder={campos.tipo === "juridica" ? "Razão social" : "Nome completo"} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{campos.tipo === "juridica" ? "CNPJ" : "CPF"}</Label>
              <Input value={campos.cnpjCpf} onChange={(e) => set("cnpjCpf", e.target.value)}
                placeholder="Só números" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={campos.telefone} onChange={(e) => set("telefone", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>E-mail</Label>
            <Input type="email" value={campos.email} onChange={(e) => set("email", e.target.value)} />
          </div>

          <div className="border rounded-md p-2 bg-muted/20 space-y-2">
            <p className="text-xs font-medium">Dados para pagamento</p>
            <div>
              <Label className="text-xs">Chave Pix</Label>
              <Input value={campos.chavePix} onChange={(e) => set("chavePix", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label className="text-xs">Banco</Label>
                <Input value={campos.bancoNome} onChange={(e) => set("bancoNome", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Agência</Label>
                <Input value={campos.agencia} onChange={(e) => set("agencia", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Conta</Label>
                <Input value={campos.conta} onChange={(e) => set("conta", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          <div>
            <Label>Categoria padrão de despesa</Label>
            <Select value={campos.categoriaPadraoId} onValueChange={(v) => set("categoriaPadraoId", v)}>
              <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
              <SelectContent>
                {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sugerida sozinha ao lançar uma despesa com este fornecedor.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Endereço</Label>
              <Input value={campos.endereco} onChange={(e) => set("endereco", e.target.value)} />
            </div>
            <div>
              <Label>CEP</Label>
              <Input value={campos.cep} onChange={(e) => set("cep", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label>Bairro</Label>
              <Input value={campos.bairro} onChange={(e) => set("bairro", e.target.value)} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={campos.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Input value={campos.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={campos.observacao} onChange={(e) => set("observacao", e.target.value)} />
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
