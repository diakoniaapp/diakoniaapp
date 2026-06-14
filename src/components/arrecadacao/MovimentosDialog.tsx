import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingDown, FileText, Receipt, ArrowLeftRight, Loader2, Save,
  Trash2, ExternalLink, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarMovimentos, arquivarMovimento,
  registrarCusto, registrarReembolsoPessoa, registrarAbateCompraCNPJ, registrarReversaoAdmin,
  uploadAnexoNF, urlNF, listarLancamentosSaidaDisponiveis,
  type Movimento, type MovimentoTipo, type FinLancamentoDisp,
} from "@/services/arrecadacaoService";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIPO_LABEL: Record<MovimentoTipo, string> = {
  custo: "Custo",
  reembolso_pessoa: "Reembolso a pessoa",
  abate_compra_cnpj: "Abate de compra (cartão CNPJ)",
  reversao_admin: "Reversão para Administração",
  ajuste: "Ajuste",
};

const TIPO_COR: Record<MovimentoTipo, string> = {
  custo: "bg-rose-50 text-rose-700 border-rose-200",
  reembolso_pessoa: "bg-amber-50 text-amber-700 border-amber-200",
  abate_compra_cnpj: "bg-blue-50 text-blue-700 border-blue-200",
  reversao_admin: "bg-purple-50 text-purple-700 border-purple-200",
  ajuste: "bg-muted",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caixaId: string;
  onChange?: () => void;
}

export function MovimentosDialog({ open, onOpenChange, caixaId, onChange }: Props) {
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"lista" | "custo" | "reembolso" | "abate" | "reversao">("lista");

  async function carregar() {
    setLoading(true);
    try { setMovs(await listarMovimentos(caixaId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, caixaId]);

  function aposRegistrar() {
    carregar(); onChange?.(); setTab("lista");
  }

  async function excluir(id: string) {
    if (!confirm("Arquivar movimento? Saldo recalcula automaticamente.")) return;
    try {
      await arquivarMovimento(id);
      toast.success("Arquivado");
      carregar(); onChange?.();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  async function verAnexo(path: string) {
    try { window.open(await urlNF(path), "_blank"); }
    catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-gold" /> Movimentos do caixa
          </DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="custo">Custo</TabsTrigger>
            <TabsTrigger value="reembolso">Reembolso</TabsTrigger>
            <TabsTrigger value="abate">Abate CNPJ</TabsTrigger>
            <TabsTrigger value="reversao">Reversão</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
            ) : movs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum movimento registrado neste caixa ainda.
              </p>
            ) : movs.map(m => (
              <div key={m.id} className="border rounded-md p-2 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className={`text-[9px] ${TIPO_COR[m.tipo]}`}>
                    {TIPO_LABEL[m.tipo]}
                  </Badge>
                  <span className="font-medium flex-1">{m.descricao}</span>
                  <span className="font-medium tabular-nums">{fmtBR(m.valor)}</span>
                  {m.nf_anexo_path && (
                    <button onClick={() => verAnexo(m.nf_anexo_path!)}
                      className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Ver NF">
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => excluir(m.id)}
                    className="text-rose-600 hover:bg-rose-50 p-1 rounded" title="Arquivar">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex gap-2 flex-wrap">
                  <span>📅 {new Date(m.data_movimento + "T00:00").toLocaleDateString("pt-BR")}</span>
                  {m.beneficiario && <span>👤 {m.beneficiario.nome_completo}</span>}
                  {m.nf_numero && <span>📄 NF {m.nf_numero}{m.nf_serie ? `/${m.nf_serie}` : ""}</span>}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="custo"><FormCusto caixaId={caixaId} onSaved={aposRegistrar} /></TabsContent>
          <TabsContent value="reembolso"><FormReembolso caixaId={caixaId} onSaved={aposRegistrar} /></TabsContent>
          <TabsContent value="abate"><FormAbate caixaId={caixaId} onSaved={aposRegistrar} /></TabsContent>
          <TabsContent value="reversao"><FormReversao caixaId={caixaId} onSaved={aposRegistrar} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Formulários ───────────────────────────────────────────────────────
function FormCusto({ caixaId, onSaved }: { caixaId: string; onSaved: () => void }) {
  const [desc, setDesc] = useState(""); const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    const v = Number(valor.replace(",", "."));
    if (!desc.trim() || isNaN(v) || v <= 0) { toast.error("Descrição e valor"); return; }
    setSalvando(true);
    try {
      await registrarCusto(caixaId, v, desc);
      toast.success("Custo registrado"); setDesc(""); setValor(""); onSaved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }
  return (
    <div className="space-y-3 mt-3 text-sm">
      <p className="text-[10px] text-muted-foreground">
        Compra simples (sem NF necessária) que abate do saldo virtual. Use pra despesas miúdas do evento.
      </p>
      <Field label="Descrição *"><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Caixa de água" /></Field>
      <Field label="Valor *"><Input value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" /></Field>
      <Button onClick={salvar} disabled={salvando} className="w-full gap-2 bg-rose-600 hover:bg-rose-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Registrar custo
      </Button>
    </div>
  );
}

function FormReembolso({ caixaId, onSaved }: { caixaId: string; onSaved: () => void }) {
  const [membros, setMembros] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("membros").select("id, nome_completo").eq("status", "ativo")
      .order("nome_completo").limit(500)
      .then(({ data }) => setMembros(data ?? []));
  }, []);

  const [form, setForm] = useState({
    valor: "", desc: "", beneficiario: "",
    nf_numero: "", nf_serie: "", nf_emitida: new Date().toISOString().slice(0,10), nf_cnpj: "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const v = Number(form.valor.replace(",", "."));
    if (isNaN(v) || v <= 0 || !form.desc.trim() || !form.beneficiario || !form.nf_numero.trim()) {
      toast.error("Preencha beneficiário, descrição, valor e nº da NF"); return;
    }
    setSalvando(true);
    try {
      let anexo_path: string | undefined;
      if (arquivo) anexo_path = await uploadAnexoNF(caixaId, arquivo);
      await registrarReembolsoPessoa(caixaId, v, form.beneficiario, form.desc, {
        numero: form.nf_numero, serie: form.nf_serie || undefined,
        emitida_em: form.nf_emitida, cnpj_emitente: form.nf_cnpj || undefined,
        anexo_path,
      });
      toast.success("Reembolso registrado · fin_lancamentos gerado automaticamente");
      onSaved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-3 mt-3 text-sm">
      <p className="text-[10px] text-muted-foreground">
        A pessoa pagou do bolso. Esta operação <strong>gera fin_lancamentos automaticamente</strong>
        (saída da conta CNPJ) E debita o saldo virtual da área.
      </p>
      <Field label="Beneficiário *">
        <Select value={form.beneficiario} onValueChange={(v) => setForm({...form, beneficiario: v})}>
          <SelectTrigger><SelectValue placeholder="Quem vai receber..." /></SelectTrigger>
          <SelectContent>
            {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor *"><Input value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} /></Field>
        <Field label="Emitida em *"><Input type="date" value={form.nf_emitida} onChange={e => setForm({...form, nf_emitida: e.target.value})} /></Field>
        <Field label="Nº da NF *"><Input value={form.nf_numero} onChange={e => setForm({...form, nf_numero: e.target.value})} /></Field>
        <Field label="Série"><Input value={form.nf_serie} onChange={e => setForm({...form, nf_serie: e.target.value})} /></Field>
      </div>
      <Field label="CNPJ emitente"><Input value={form.nf_cnpj} onChange={e => setForm({...form, nf_cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></Field>
      <Field label="Descrição *"><Textarea value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} placeholder="Ex: Compra de flores para enfeitar" /></Field>
      <Field label="Arquivo da NF (PDF/imagem)">
        <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
      </Field>
      <Button onClick={salvar} disabled={salvando} className="w-full gap-2 bg-amber-600 hover:bg-amber-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Registrar reembolso
      </Button>
    </div>
  );
}

function FormAbate({ caixaId, onSaved }: { caixaId: string; onSaved: () => void }) {
  const [lancs, setLancs] = useState<FinLancamentoDisp[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    fin_id: "", desc: "",
    nf_numero: "", nf_serie: "", nf_emitida: new Date().toISOString().slice(0,10), nf_cnpj: "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  useEffect(() => { listarLancamentosSaidaDisponiveis().then(setLancs); }, []);

  const selecionado = lancs.find(l => l.id === form.fin_id);

  async function salvar() {
    if (!form.fin_id || !form.desc.trim() || !form.nf_numero.trim()) {
      toast.error("Selecione lançamento, descrição e nº da NF"); return;
    }
    setSalvando(true);
    try {
      let anexo_path: string | undefined;
      if (arquivo) anexo_path = await uploadAnexoNF(caixaId, arquivo);
      await registrarAbateCompraCNPJ(caixaId, form.fin_id, selecionado!.valor, form.desc, {
        numero: form.nf_numero, serie: form.nf_serie || undefined,
        emitida_em: form.nf_emitida, cnpj_emitente: form.nf_cnpj || undefined,
        anexo_path,
      });
      toast.success("Abate registrado · sem nova saída bancária");
      onSaved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-3 mt-3 text-sm">
      <p className="text-[10px] text-muted-foreground">
        Administração já comprou no cartão CNPJ (saída JÁ existe em fin_lancamentos).
        Esta operação <strong>só debita o saldo virtual da área</strong>. Sem nova saída bancária.
      </p>
      <Field label="Lançamento existente a abater *">
        <Select value={form.fin_id} onValueChange={(v) => setForm({...form, fin_id: v})}>
          <SelectTrigger><SelectValue placeholder={lancs.length === 0 ? "Nenhum lançamento disponível" : "Selecione..."} /></SelectTrigger>
          <SelectContent>
            {lancs.map(l => (
              <SelectItem key={l.id} value={l.id}>
                {fmtBR(l.valor)} · {l.descricao}
                {l.data ? ` (${new Date(l.data + "T00:00").toLocaleDateString("pt-BR")})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {selecionado && (
        <div className="border rounded-md p-2 text-[10px] bg-blue-50/30">
          Valor do abate: <strong>{fmtBR(selecionado.valor)}</strong>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nº da NF *"><Input value={form.nf_numero} onChange={e => setForm({...form, nf_numero: e.target.value})} /></Field>
        <Field label="Emitida em *"><Input type="date" value={form.nf_emitida} onChange={e => setForm({...form, nf_emitida: e.target.value})} /></Field>
      </div>
      <Field label="Descrição *"><Textarea value={form.desc} onChange={e => setForm({...form, desc: e.target.value})} /></Field>
      <Field label="Arquivo da NF (PDF/imagem)">
        <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
      </Field>
      <Button onClick={salvar} disabled={salvando} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Registrar abate
      </Button>
    </div>
  );
}

function FormReversao({ caixaId, onSaved }: { caixaId: string; onSaved: () => void }) {
  const [valor, setValor] = useState(""); const [desc, setDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    const v = Number(valor.replace(",", "."));
    if (isNaN(v) || v <= 0 || !desc.trim()) { toast.error("Valor e descrição"); return; }
    if (!confirm(`Reverter ${fmtBR(v)} pra Administração? Esta operação não move dinheiro real.`)) return;
    setSalvando(true);
    try {
      await registrarReversaoAdmin(caixaId, v, desc);
      toast.success("Reversão registrada"); onSaved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }
  return (
    <div className="space-y-3 mt-3 text-sm">
      <p className="text-[10px] text-muted-foreground">
        Devolve saldo virtual da área para a Administração. <strong>Não move dinheiro real</strong> —
        o dinheiro já está no CNPJ.
      </p>
      <Field label="Valor a reverter *"><Input value={valor} onChange={e => setValor(e.target.value)} /></Field>
      <Field label="Descrição *"><Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Saldo remanescente devolvido para uso da Admin" /></Field>
      <Button onClick={salvar} disabled={salvando} className="w-full gap-2 bg-purple-600 hover:bg-purple-700">
        {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Registrar reversão
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
