import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Membro } from "@/pages/Membros";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membro: Membro | null;
  onSaved: () => void;
}

const empty = {
  nome_completo: "",
  tipo_pessoa: "membro" as const,
  perfil_acesso: "membro" as const,
  cpf: "",
  data_nascimento: "",
  sexo: "",
  estado_civil: "",
  data_casamento: "",
  telefone_celular: "",
  email: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  cep: "",
  data_entrada: "",
  status: "ativo" as const,
  observacoes_pastorais: "",
};

export function MembroForm({ open, onOpenChange, membro, onSaved }: Props) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (membro) {
      const f: any = { ...empty };
      Object.keys(empty).forEach((k) => { f[k] = (membro as any)[k] ?? ""; });
      setForm(f);
    } else setForm(empty);
  }, [membro, open]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload: any = { ...form };
    ["data_nascimento","data_casamento","data_entrada","cpf","telefone_celular",
     "email","sexo","estado_civil","endereco","numero","complemento","bairro",
     "cidade","cep","observacoes_pastorais"].forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    let error;
    if (membro) ({ error } = await supabase.from("membros").update(payload).eq("id", membro.id));
    else ({ error } = await supabase.from("membros").insert(payload));
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(membro ? "Pessoa atualizada" : "Pessoa cadastrada");
    onOpenChange(false);
    onSaved();
  };

  const onDelete = async () => {
    if (!membro) return;
    setBusy(true);
    const { error } = await supabase.from("membros").delete().eq("id", membro.id);
    setBusy(false);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    toast.success("Contato excluído com sucesso");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {membro ? "Editar pessoa" : "Nova pessoa"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <section className="grid md:grid-cols-2 gap-3">

              {/* Nome completo */}
              <div className="md:col-span-2">
                <Label>Nome completo *</Label>
                <Input required value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
              </div>

              {/* Tipo de pessoa */}
              <div className="md:col-span-2">
                <Label>Tipo de pessoa *</Label>
                <Select value={form.tipo_pessoa} onValueChange={(v) => set("tipo_pessoa", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="membro">Membro</SelectItem>
                    <SelectItem value="congregado">Congregado</SelectItem>
                    <SelectItem value="visitante">Visitante</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Perfil de acesso */}
              <div className="md:col-span-2">
                <Label>Perfil de acesso</Label>
                <Select value={form.perfil_acesso} onValueChange={(v) => set("perfil_acesso", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pastor">Pastor</SelectItem>
                    <SelectItem value="secretaria">Secretaria</SelectItem>
                    <SelectItem value="tesoureiro">Tesoureiro</SelectItem>
                    <SelectItem value="lideranca">Liderança</SelectItem>
                    <SelectItem value="professor_ebd">Professor EBD</SelectItem>
                    <SelectItem value="voluntario">Voluntário</SelectItem>
                    <SelectItem value="membro">Membro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* CPF */}
              <div>
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
              </div>

              {/* Data de nascimento */}
              <div>
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
              </div>

              {/* Sexo */}
              <div>
                <Label>Sexo</Label>
                <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Estado civil */}
              <div>
                <Label>Estado civil</Label>
                <Select value={form.estado_civil || undefined} onValueChange={(v) => set("estado_civil", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                    <SelectItem value="casado">Casado(a)</SelectItem>
                    <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                    <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                    <SelectItem value="uniao_estavel">União estável</SelectItem>
                    <SelectItem value="separado">Separado(a)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data de casamento */}
              <div>
                <Label>Data de casamento</Label>
                <Input type="date" value={form.data_casamento} onChange={(e) => set("data_casamento", e.target.value)} />
              </div>

              {/* Telefone celular */}
              <div>
                <Label>Telefone celular</Label>
                <Input value={form.telefone_celular} onChange={(e) => set("telefone_celular", e.target.value)} placeholder="(00) 00000-0000" />
              </div>

              {/* Email */}
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>

            </section>

            <h3 className="font-semibold text-base mt-4">Endereço</h3>
            <section className="grid md:grid-cols-2 gap-3">

              <div className="md:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} />
              </div>

              <div>
                <Label>Número</Label>
                <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} />
              </div>

              <div>
                <Label>Complemento</Label>
                <Input value={form.complemento} onChange={(e) => set("complemento", e.target.value)} />
              </div>

              <div>
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
              </div>

              <div>
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
              </div>

              <div>
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
              </div>

            </section>

            <h3 className="font-semibold text-base mt-4">Situação</h3>
            <section className="grid md:grid-cols-2 gap-3">

              <div>
                <Label>Data de entrada</Label>
                <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
              </div>

              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="transferido">Transferido</SelectItem>
                    <SelectItem value="falecido">Falecido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Observações pastorais</Label>
                <Textarea
                  value={form.observacoes_pastorais}
                  onChange={(e) => set("observacoes_pastorais", e.target.value)}
                  placeholder="Anotações internas (visível apenas para liderança)"
                  rows={3}
                />
              </div>

            </section>

            {/* DialogFooter: Excluir (admin) + Cancelar + Salvar */}
            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              {/* Botão Excluir — visível APENAS para admin, e somente ao editar */}
              {isAdmin && membro && (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto flex items-center gap-2"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir contato
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancelar
              </Button>

              <Button type="submit" disabled={busy}>
                {busy ? "Salvando..." : membro ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong>{membro?.nome_completo}</strong>?
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
