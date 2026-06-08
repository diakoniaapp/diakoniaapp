import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Users, Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatarTelefone, limparTelefone, normalizarTelefone, validarTelefone } from "@/lib/telefone";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

interface PessoaItem {
  id: string;
  nome_completo: string;
}

const COMO_CONHECEU_OPTIONS = [
  { value: "",                   label: "— Não informado —" },
  { value: "indicacao_membro",   label: "Indicação de membro ou congregado" },
  { value: "redes_sociais",      label: "Redes sociais" },
  { value: "passando_na_frente", label: "Passando na frente / vizinhança" },
  { value: "familia",            label: "Familiar já frequenta" },
  { value: "evento",             label: "Evento / campanha" },
  { value: "outro",              label: "Outro" },
];

export default function CongregadoDialog({ open, onOpenChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome_completo:   "",
    telefone_celular:"",
    email:           "",
    data_nascimento: "",
    sexo:            "",
    data_entrada:    new Date().toISOString().split("T")[0],
    como_conheceu:   "",
    observacoes:     "",
    congregacao_id:  "",
  });
  const [errors, setErrors] = useState<{ nome_completo?: string; telefone_celular?: string }>({});

  // Indicação
  const [buscaIndicacao,       setBuscaIndicacao]       = useState("");
  const [pessoasIndicacao,     setPessoasIndicacao]     = useState<PessoaItem[]>([]);
  const [loadingIndicacao,     setLoadingIndicacao]     = useState(false);
  const [indicacaoSelecionada, setIndicacaoSelecionada] = useState<PessoaItem | null>(null);
  const [showIndicacaoDrop,    setShowIndicacaoDrop]    = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef     = useRef<HTMLDivElement>(null);

  // Congregações disponíveis
  const [congregacoes, setCongregacoes] = useState<{ id: string; nome: string }[]>([]);

  const isIndicacao = form.como_conheceu === "indicacao_membro";

  useEffect(() => {
    if (!open) return;
    // Carregar congregações
    supabase.from("congregacoes").select("id, nome").order("nome")
      .then(({ data }) => setCongregacoes((data ?? []) as { id: string; nome: string }[]));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setForm({ nome_completo: "", telefone_celular: "", email: "", data_nascimento: "",
        sexo: "", data_entrada: new Date().toISOString().split("T")[0],
        como_conheceu: "", observacoes: "", congregacao_id: "" });
      setBuscaIndicacao(""); setIndicacaoSelecionada(null); setErrors({});
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowIndicacaoDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const buscarIndicacao = (q: string) => {
    setBuscaIndicacao(q);
    setIndicacaoSelecionada(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setPessoasIndicacao([]); setShowIndicacaoDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingIndicacao(true);
      const { data } = await supabase
        .from("membros").select("id, nome_completo")
        .in("tipo_pessoa", ["membro", "congregado"])
        .ilike("nome_completo", `%${q}%`).order("nome_completo").limit(8);
      setPessoasIndicacao((data ?? []) as PessoaItem[]);
      setShowIndicacaoDrop(true);
      setLoadingIndicacao(false);
    }, 350);
  };

  const selecionarIndicacao = (p: PessoaItem) => {
    setIndicacaoSelecionada(p);
    setBuscaIndicacao(p.nome_completo);
    setShowIndicacaoDrop(false);
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.nome_completo.trim())    e.nome_completo    = "Nome é obrigatório";
    const _vTel = validarTelefone(form.telefone_celular);
    if (!_vTel.ok) e.telefone_celular = _vTel.erro || "Telefone é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const camposIndicacao = isIndicacao && indicacaoSelecionada
      ? { convidado_por: indicacaoSelecionada.id, como_conheceu_descricao: indicacaoSelecionada.nome_completo }
      : {};

    const payload: any = {
      nome_completo:    form.nome_completo.trim(),
      telefone_celular: normalizarTelefone(form.telefone_celular) || null,
      email:            form.email.trim()           || null,
      data_nascimento:  form.data_nascimento         || null,
      sexo:             form.sexo                    || null,
      data_entrada:     form.data_entrada            || null,
      como_conheceu:    form.como_conheceu           || null,
      observacoes:      form.observacoes.trim()      || null,
      congregacao_id:   form.congregacao_id          || null,
      tipo_pessoa:      "congregado",
      perfil_acesso:    "membro",
      status_acolhimento: "congregado",
      ...camposIndicacao,
    };

    const { error } = await supabase.from("membros").insert(payload);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(`${form.nome_completo.trim().split(" ")[0]} cadastrado(a) como congregado(a)! ✅`);
    onOpenChange(false);
    onSaved?.();
  };

  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 ring-1 ring-blue-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            Novo Congregado
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Congregado é alguém que frequenta a igreja regularmente mas ainda não é membro formal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Nome */}
          <div className="space-y-1.5">
            <Label>Nome completo <span className="text-destructive">*</span></Label>
            <Input placeholder="Nome completo" value={form.nome_completo} autoFocus
              className={errors.nome_completo ? "border-destructive" : ""}
              onChange={(e) => { set("nome_completo")(e.target.value); if (errors.nome_completo) setErrors(p => ({ ...p, nome_completo: undefined })); }} />
            {errors.nome_completo && <p className="text-xs text-destructive">{errors.nome_completo}</p>}
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone / WhatsApp <span className="text-destructive">*</span></Label>
              <Input type="tel" placeholder="+55 (00) 00000-0000" inputMode="tel" value={formatarTelefone(form.telefone_celular)}
                className={errors.telefone_celular ? "border-destructive" : ""}
                onChange={(e) => { set("telefone_celular")(limparTelefone(e.target.value)); if (errors.telefone_celular) setErrors(p => ({ ...p, telefone_celular: undefined })); }} />
              {errors.telefone_celular && <p className="text-xs text-destructive">{errors.telefone_celular}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>E-mail <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => set("email")(e.target.value)} />
            </div>
          </div>

          {/* Nascimento + Sexo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data de nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={form.sexo} onValueChange={set("sexo")}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data de entrada */}
          <div className="space-y-1.5">
            <Label>Começou a frequentar em</Label>
            <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada")(e.target.value)} />
          </div>

          {/* Congregação */}
          {congregacoes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Congregação</Label>
              <Select value={form.congregacao_id} onValueChange={set("congregacao_id")}>
                <SelectTrigger><SelectValue placeholder="Selecione a congregação…" /></SelectTrigger>
                <SelectContent>
                  {congregacoes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Como conheceu */}
          <div className="space-y-1.5">
            <Label>Como conheceu a igreja?</Label>
            <Select value={form.como_conheceu} onValueChange={(v) => { set("como_conheceu")(v); if (v !== "indicacao_membro") { setBuscaIndicacao(""); setIndicacaoSelecionada(null); } }}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {COMO_CONHECEU_OPTIONS.map(o => (
                  <SelectItem key={o.value || "__none__"} value={o.value || "__none__"}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Indicação: busca de pessoa */}
          {isIndicacao && (
            <div className="rounded-md border border-dashed p-3 bg-muted/30 space-y-2">
              <Label className="text-xs font-medium">Quem indicou?</Label>
              <div ref={dropRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Busque pelo nome…" value={buscaIndicacao} className="pl-8 pr-8"
                    autoComplete="off"
                    onChange={(e) => buscarIndicacao(e.target.value)}
                    onFocus={() => { if (pessoasIndicacao.length > 0) setShowIndicacaoDrop(true); }} />
                  {indicacaoSelecionada && (
                    <button type="button" onClick={() => { setIndicacaoSelecionada(null); setBuscaIndicacao(""); }}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {showIndicacaoDrop && pessoasIndicacao.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-44 overflow-y-auto">
                    {pessoasIndicacao.map(p => (
                      <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => selecionarIndicacao(p)}>{p.nome_completo}</button>
                    ))}
                  </div>
                )}
                {showIndicacaoDrop && !loadingIndicacao && pessoasIndicacao.length === 0 && buscaIndicacao.trim() && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma pessoa encontrada
                  </div>
                )}
              </div>
              {indicacaoSelecionada && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {indicacaoSelecionada.nome_completo}
                </p>
              )}
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <Textarea rows={2} placeholder="Informações relevantes sobre participação, família, etc."
              value={form.observacoes} onChange={(e) => set("observacoes")(e.target.value)} />
          </div>

        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Salvando…" : "Cadastrar congregado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
