import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BuscaPessoa, type PessoaResultado } from "@/components/ui/BuscaPessoa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, X, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Pessoa { id: string; nome_completo: string; cpf: string|null; telefone_celular: string|null; tipo_pessoa: string; status: string; }
interface Atuacao {
  id: string; area_id: string; ministerio_id: string; membro_id: string;
  funcao: string; data_inicio: string; data_fim: string|null;
  status: "ativa" | "encerrada";
}
interface AreaInfo { id: string; nome: string; ativo: boolean; ministerio_id: string; ministerio_ativo: boolean; lider_id?: string | null; co_lider_id?: string | null; }

interface Props {
  area: AreaInfo;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function VoluntariosDialog({ area, open, onOpenChange }: Props) {
  const { canEdit } = useAuth();
  const [list, setList] = useState<Atuacao[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Pessoa | null>(null);
  const [funcao, setFuncao] = useState("");
  const [dataInicio, setDataInicio] = useState<string>(new Date().toISOString().slice(0,10));

  const podeAdicionar = area.ativo && area.ministerio_ativo;

  const load = async () => {
    const { data } = await supabase.from("area_voluntarios").select("*")
      .eq("area_id", area.id).order("status").order("data_inicio", { ascending: false });
    const lista = (data ?? []) as Atuacao[];
    setList(lista);

    // Carregar nomes dos voluntarios listados (apenas os IDs presentes)
    const ids = Array.from(new Set(lista.map(a => a.membro_id))).filter(Boolean);
    if (ids.length > 0) {
      const { data: ps } = await supabase
        .from("membros")
        .select("id, nome_completo, cpf, telefone_celular, tipo_pessoa, status")
        .in("id", ids);
      setPessoas((ps ?? []) as Pessoa[]);
    } else {
      setPessoas([]);
    }
  };
  useEffect(()=>{ if(open) { load(); resetForm(); } }, [open, area.id]);

  const resetForm = () => {
    setShowForm(false); setSelected(null); setSearch(""); setFuncao("");
    setDataInicio(new Date().toISOString().slice(0,10));
  };

  const pessoaName = (id: string) => pessoas.find(p=>p.id===id)?.nome_completo ?? "—";

  const filteredPessoas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pessoas.slice(0, 8);
    return pessoas.filter(p =>
      p.nome_completo.toLowerCase().includes(q) ||
      (p.cpf ?? "").includes(q) ||
      (p.telefone_celular ?? "").includes(q)
    ).slice(0, 8);
  }, [pessoas, search]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeAdicionar) return toast.error("Ministério ou Área inativos — não é possível adicionar voluntários.");
    if (!selected) return toast.error("Selecione uma pessoa.");
    if (selected.status !== "ativo") return toast.error("Pessoa inativa — não pode ser inserida.");
    if (!funcao.trim()) return toast.error("Informe a Função.");
    const { error } = await supabase.from("area_voluntarios").insert({
      area_id: area.id,
      ministerio_id: area.ministerio_id,
      membro_id: selected.id,
      funcao: funcao.trim(),
      data_inicio: dataInicio,
      status: "ativa",
    });
    if (error) {
      if (error.code === "23505") return toast.error("Esta pessoa já tem uma atuação ativa nesta função/área.");
      return toast.error(error.message);
    }
    toast.success("Voluntário adicionado");
    resetForm();
    load();
  };

  const encerrar = async (a: Atuacao) => {
    const hoje = new Date().toISOString().slice(0,10);
    const { error } = await supabase.from("area_voluntarios")
      .update({ status: "encerrada", data_fim: hoje })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Atuação encerrada");
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Users className="w-5 h-5"/> Voluntários — {area.nome}
          </DialogTitle>
        </DialogHeader>

        {!podeAdicionar && (
          <p className="text-xs text-center text-muted-foreground border rounded-md p-2 bg-muted/30">
            {!area.ministerio_ativo ? "Ministério inativo" : "Área inativa"} — não é possível adicionar novos voluntários. Histórico permanece preservado.
          </p>
        )}

        <div className="space-y-3">
          {list.length === 0 && !showForm && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum voluntário cadastrado nesta área.</p>
          )}

          {list.map((a) => (
            <Card key={a.id} className={a.status === "encerrada" ? "opacity-60 border-dashed" : ""}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{pessoaName(a.membro_id)}</span>
                    {(a.membro_id === area.lider_id || a.membro_id === area.co_lider_id) && (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
                        {a.membro_id === area.lider_id ? "Líder" : "Co-líder"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-muted/50">{a.funcao}</Badge>
                    {a.status === "ativa"
                      ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">Ativa</Badge>
                      : <Badge variant="outline" className="bg-muted text-muted-foreground">Encerrada</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Início: {a.data_inicio}{a.data_fim ? ` • Encerramento: ${a.data_fim}` : ""}
                  </div>
                </div>
                {canEdit && a.status === "ativa" && (
                  <Button variant="ghost" size="sm" onClick={()=>encerrar(a)}>
                    <X className="w-4 h-4 mr-1"/>Encerrar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {canEdit && podeAdicionar && !showForm && (
            <Button variant="outline" className="w-full" onClick={()=>setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2"/>Adicionar Voluntário
            </Button>
          )}

          {showForm && (
            <form onSubmit={onAdd} className="space-y-3 border rounded-md p-4 bg-muted/30">
              <div className="text-sm font-medium">Novo voluntário</div>
              <div>
                <Label>Pessoa (Membro/Congregado) *</Label>
                {selected ? (
                  <div className="flex items-center justify-between border rounded-md p-2 bg-background">
                    <div className="text-sm">
                      <div className="font-medium">{selected.nome_completo}</div>
                      <div className="text-xs text-muted-foreground">
                        {selected.tipo_pessoa} {selected.cpf ? `• ${selected.cpf}` : ""} {selected.telefone_celular ? `• ${selected.telefone_celular}` : ""}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={()=>setSelected(null)}>Trocar</Button>
                  </div>
                ) : (
                  <BuscaPessoa
                    value={selected?.id ?? ""}
                    onChange={(_id, p) => setSelected(p ? p as any : null)}
                    tipos={["membro", "congregado"]}
                    placeholder="Buscar por nome..."
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Função / Papel *</Label><Input required value={funcao} onChange={(e)=>setFuncao(e.target.value)} placeholder="Ex.: Recepção, Som, Diaconia"/></div>
                <div><Label>Data de início *</Label><Input type="date" required value={dataInicio} onChange={(e)=>setDataInicio(e.target.value)}/></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}