import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ClipboardList, Plus, Save, Trash2, Loader2, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarEspacos,
  listarChecklistTemplates, criarChecklistTemplate,
  atualizarChecklistTemplate, arquivarChecklistTemplate,
  type Espaco, type ChecklistTemplate, type ChecklistTipo,
} from "@/services/arrecadacaoService";

export default function ChecklistTemplates() {
  const [espacos, setEspacos] = useState<Espaco[]>([]);
  const [filtroEspaco, setFiltroEspaco] = useState<string>("__todos__");
  const [filtroTipo, setFiltroTipo] = useState<ChecklistTipo | "todos">("todos");
  const [incluirArquivados, setIncluirArquivados] = useState(false);
  const [itens, setItens] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const [novo, setNovo] = useState({
    item: "",
    ordem: 10,
    obrigatorio: true,
    tipo: "pre_uso" as ChecklistTipo,
    espaco_id: "" as string,    // "" = global, ou id de espaço
  });
  const [criando, setCriando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const filtro: Parameters<typeof listarChecklistTemplates>[0] = {
        apenas_ativos: !incluirArquivados,
      };
      if (filtroEspaco !== "__todos__") {
        filtro.espaco_id = filtroEspaco === "__global__" ? null : filtroEspaco;
      }
      if (filtroTipo !== "todos") filtro.tipo = filtroTipo;
      const lst = await listarChecklistTemplates(filtro);
      setItens(lst);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    listarEspacos().then(setEspacos);
  }, []);
  useEffect(() => { carregar(); }, [filtroEspaco, filtroTipo, incluirArquivados]);

  async function criar() {
    if (!novo.item.trim()) { toast.error("Informe o texto do item"); return; }
    setCriando(true);
    try {
      await criarChecklistTemplate({
        item: novo.item.trim(),
        ordem: novo.ordem,
        obrigatorio: novo.obrigatorio,
        tipo: novo.tipo,
        espaco_id: novo.espaco_id || null,
      });
      toast.success("Item criado");
      setNovo({ item: "", ordem: novo.ordem + 10, obrigatorio: true, tipo: novo.tipo, espaco_id: novo.espaco_id });
      carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar");
    } finally { setCriando(false); }
  }

  async function atualizar(id: string, patch: Partial<ChecklistTemplate>) {
    try {
      await atualizarChecklistTemplate(id, patch);
      setItens(itens.map(i => i.id === id ? { ...i, ...patch } as ChecklistTemplate : i));
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  async function arquivar(id: string) {
    if (!confirm("Arquivar este item? Ele deixa de aparecer em novas reservas.")) return;
    try {
      await arquivarChecklistTemplate(id);
      toast.success("Item arquivado");
      carregar();
    } catch (err: any) { toast.error(err?.message); }
  }

  // Agrupar por tipo
  const preUso = itens.filter(i => i.tipo === "pre_uso");
  const posUso = itens.filter(i => i.tipo === "pos_uso");

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <ListChecks className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Checklist · templates</h1>
        <Badge variant="outline" className="text-[10px] ml-2">{itens.length} {itens.length === 1 ? "item" : "itens"}</Badge>
      </header>

      <p className="text-xs text-muted-foreground">
        Itens-padrão que são copiados pra cada nova reserva. Você pode ter itens globais (valem
        pra todos os espaços) ou específicos de um espaço.
      </p>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <Field label="Espaço">
            <Select value={filtroEspaco} onValueChange={setFiltroEspaco}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos (globais + específicos)</SelectItem>
                <SelectItem value="__global__">Só globais</SelectItem>
                {espacos.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome} ({e.codigo})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pre_uso">Pré-uso</SelectItem>
                <SelectItem value="pos_uso">Pós-uso</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Arquivados">
            <div className="flex items-center gap-2 pt-1.5">
              <Checkbox checked={incluirArquivados}
                onCheckedChange={(v) => setIncluirArquivados(Boolean(v))} />
              <span className="text-xs">incluir arquivados</span>
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Form criar */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-700" /> Novo item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Texto do item *">
            <Input value={novo.item}
              onChange={(e) => setNovo({...novo, item: e.target.value})}
              placeholder="Ex: Conferir tomadas estão funcionando" />
          </Field>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Field label="Tipo *">
              <Select value={novo.tipo} onValueChange={(v) => setNovo({...novo, tipo: v as ChecklistTipo})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_uso">Pré-uso</SelectItem>
                  <SelectItem value="pos_uso">Pós-uso</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Espaço">
              <Select value={novo.espaco_id || "__global__"}
                onValueChange={(v) => setNovo({...novo, espaco_id: v === "__global__" ? "" : v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">Global (todos)</SelectItem>
                  {espacos.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ordem">
              <Input type="number" value={novo.ordem}
                onChange={(e) => setNovo({...novo, ordem: Number(e.target.value) || 0})} />
            </Field>
            <Field label="Obrigatório">
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox checked={novo.obrigatorio}
                  onCheckedChange={(v) => setNovo({...novo, obrigatorio: Boolean(v)})} />
                <span className="text-xs">obrigatório</span>
              </div>
            </Field>
          </div>
          <Button onClick={criar} disabled={criando}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar item
          </Button>
        </CardContent>
      </Card>

      {/* Listas por tipo */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> carregando...
        </div>
      ) : (
        <>
          <SecaoTipo
            titulo="Pré-uso (antes de iniciar)"
            cor="emerald"
            itens={preUso}
            espacos={espacos}
            onUpdate={atualizar}
            onArquivar={arquivar}
          />
          <SecaoTipo
            titulo="Pós-uso (no encerramento)"
            cor="amber"
            itens={posUso}
            espacos={espacos}
            onUpdate={atualizar}
            onArquivar={arquivar}
          />
        </>
      )}
    </div>
  );
}

function SecaoTipo({
  titulo, cor, itens, espacos, onUpdate, onArquivar,
}: {
  titulo: string;
  cor: "emerald" | "amber";
  itens: ChecklistTemplate[];
  espacos: Espaco[];
  onUpdate: (id: string, patch: Partial<ChecklistTemplate>) => void;
  onArquivar: (id: string) => void;
}) {
  const corCard = cor === "emerald" ? "border-emerald-200" : "border-amber-200";
  return (
    <Card className={corCard}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className={`w-4 h-4 text-${cor}-700`} /> {titulo}
          <Badge variant="outline" className="text-[9px] ml-1">{itens.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {itens.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum item.</p>
        ) : itens.map(i => (
          <ItemEditavel key={i.id} item={i} espacos={espacos}
            onUpdate={onUpdate} onArquivar={onArquivar} />
        ))}
      </CardContent>
    </Card>
  );
}

function ItemEditavel({
  item, espacos, onUpdate, onArquivar,
}: {
  item: ChecklistTemplate;
  espacos: Espaco[];
  onUpdate: (id: string, patch: Partial<ChecklistTemplate>) => void;
  onArquivar: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(item);

  const nomeEspaco = item.espaco_id
    ? espacos.find(e => e.id === item.espaco_id)?.nome ?? "—"
    : "Global";

  if (!editando) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded border ${item.ativo ? "border-border" : "border-dashed opacity-60"}`}>
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">#{item.ordem}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{item.item}</div>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            <Badge variant="outline" className="text-[9px]">{nomeEspaco}</Badge>
            {item.obrigatorio && <Badge className="text-[9px] bg-rose-100 text-rose-700 border-rose-300">obrigatório</Badge>}
            {!item.ativo && <Badge variant="outline" className="text-[9px]">arquivado</Badge>}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(item); setEditando(true); }}
          className="h-7 text-xs">editar</Button>
        {item.ativo && (
          <Button size="sm" variant="ghost" onClick={() => onArquivar(item.id)}
            className="h-7 text-rose-600 hover:bg-rose-50">
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border-2 border-emerald-300 rounded p-2 space-y-2 bg-emerald-50/40">
      <Input value={draft.item} onChange={(e) => setDraft({...draft, item: e.target.value})}
        className="text-xs" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 text-xs">
        <Input type="number" value={draft.ordem}
          onChange={(e) => setDraft({...draft, ordem: Number(e.target.value) || 0})}
          placeholder="ordem" className="h-7" />
        <Select value={draft.tipo} onValueChange={(v) => setDraft({...draft, tipo: v as ChecklistTipo})}>
          <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pre_uso">Pré-uso</SelectItem>
            <SelectItem value="pos_uso">Pós-uso</SelectItem>
          </SelectContent>
        </Select>
        <Select value={draft.espaco_id || "__global__"}
          onValueChange={(v) => setDraft({...draft, espaco_id: v === "__global__" ? null : v})}>
          <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">Global</SelectItem>
            {espacos.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 pt-1">
          <Checkbox checked={draft.obrigatorio}
            onCheckedChange={(v) => setDraft({...draft, obrigatorio: Boolean(v)})} />
          <span>obrigatório</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={async () => {
          await onUpdate(item.id, {
            item: draft.item, ordem: draft.ordem, tipo: draft.tipo,
            espaco_id: draft.espaco_id, obrigatorio: draft.obrigatorio,
          });
          setEditando(false);
          toast.success("Salvo");
        }} className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700">
          <Save className="w-3 h-3" /> salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(false)} className="h-7">
          cancelar
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
