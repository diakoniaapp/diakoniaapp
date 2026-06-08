import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatarTelefone, limparTelefone, normalizarTelefone, validarTelefone } from "@/lib/telefone";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

interface PessoaItem {
  id: string;
  nome_completo: string;
  telefone_celular?: string | null;
}

// Opções de Como Conheceu
const COMO_CONHECEU_OPTIONS = [
  { value: "",                  label: "— Não informado —" },
  { value: "indicacao_membro",  label: "Indicação de membro ou congregado" },
  { value: "redes_sociais",     label: "Redes sociais" },
  { value: "passando_na_frente",label: "Passando na frente / vizinhança" },
  { value: "familia",           label: "Familiar já frequenta" },
  { value: "evento",            label: "Evento / campanha" },
  { value: "outro",             label: "Outro" },
];

// ── Componente ─────────────────────────────────────────────────────────────────

export default function VisitanteRapidoDialog({ open, onOpenChange, onSaved }: Props) {
  // Dados principais
  const [nome,      setNome]      = useState("");
  const [telefone,  setTelefone]  = useState("");
  const [email,     setEmail]     = useState("");
  const [dataVisita,setDataVisita]= useState(() => new Date().toISOString().split("T")[0]);
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState<{ nome?: string; telefone?: string }>({});

  // Como conheceu
  const [comoConheceu, setComoConheceu] = useState("");

  // Indicação — busca de pessoas
  const [buscaIndicacao,    setBuscaIndicacao]    = useState("");
  const [pessoasIndicacao,  setPessoasIndicacao]  = useState<PessoaItem[]>([]);
  const [loadingIndicacao,  setLoadingIndicacao]  = useState(false);
  const [indicacaoSelecionada, setIndicacaoSelecionada] = useState<PessoaItem | null>(null);
  const [showIndicacaoDrop, setShowIndicacaoDrop] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef     = useRef<HTMLDivElement>(null);

  // Mini-cadastro de nova pessoa indicadora
  const [showMiniCadastro,  setShowMiniCadastro]  = useState(false);
  const [miniNome,          setMiniNome]           = useState("");
  const [miniTelefone,      setMiniTelefone]       = useState("");
  const [savingMini,        setSavingMini]         = useState(false);

  const isIndicacao = comoConheceu === "indicacao_membro";

  // ── Fechar dropdown ao clicar fora ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowIndicacaoDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Reset ao fechar ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setNome(""); setTelefone(""); setEmail("");
      setDataVisita(new Date().toISOString().split("T")[0]);
      setComoConheceu("");
      setBuscaIndicacao(""); setPessoasIndicacao([]);
      setIndicacaoSelecionada(null); setShowIndicacaoDrop(false);
      setShowMiniCadastro(false); setMiniNome(""); setMiniTelefone("");
      setErrors({}); setSaving(false);
    }
  }, [open]);

  // ── Busca de indicação com debounce ──────────────────────────────────────
  const buscarIndicacao = (q: string) => {
    setBuscaIndicacao(q);
    setIndicacaoSelecionada(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setPessoasIndicacao([]); setShowIndicacaoDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingIndicacao(true);
      const { data } = await supabase
        .from("membros")
        .select("id, nome_completo, telefone_celular")
        .in("tipo_pessoa", ["membro", "congregado"])
        .ilike("nome_completo", `%${q}%`)
        .order("nome_completo")
        .limit(8);
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

  const limparIndicacao = () => {
    setIndicacaoSelecionada(null);
    setBuscaIndicacao("");
    setPessoasIndicacao([]);
  };

  // ── Mini-cadastro de indicador ────────────────────────────────────────────
  const salvarMiniCadastro = async () => {
    if (!miniNome.trim()) { toast.error("Informe o nome"); return; }
    setSavingMini(true);
    const { data, error } = await supabase
      .from("membros")
      .insert({
        nome_completo:    miniNome.trim(),
        telefone_celular: normalizarTelefone(miniTelefone) || null,
        tipo_pessoa:      "visitante",
        perfil_acesso:    "membro",
      } as any)
      .select("id, nome_completo, telefone_celular")
      .single();
    setSavingMini(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${miniNome.trim().split(" ")[0]} cadastrado(a)!`);
    selecionarIndicacao(data as PessoaItem);
    setShowMiniCadastro(false);
    setMiniNome(""); setMiniTelefone("");
  };

  // ── Validação ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e: typeof errors = {};
    if (!nome.trim())     e.nome     = "Nome é obrigatório";
    const _vTel = validarTelefone(telefone);
    if (!_vTel.ok) e.telefone = _vTel.erro || "WhatsApp/telefone é obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Tarefas de acolhimento ────────────────────────────────────────────────
  const criarTarefas = async (visitanteId: string, nomeCompleto: string) => {
    const primeiro = nomeCompleto.split(" ")[0];
    const base = new Date(dataVisita);
    const addDias = (n: number) => {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return d.toISOString().split("T")[0];
    };
    const tarefas = [
      { visitante_id: visitanteId, titulo: `Enviar mensagem de boas-vindas — ${primeiro}`,  data: addDias(0)  },
      { visitante_id: visitanteId, titulo: `Entrar em contato com ${primeiro}`,              data: addDias(2)  },
      { visitante_id: visitanteId, titulo: `Convidar ${primeiro} para retornar ao culto`,    data: addDias(7)  },
      { visitante_id: visitanteId, titulo: `Recontato — verificar situação de ${primeiro}`,  data: addDias(15) },
    ];
    await supabase.from("acolhimento_tarefas").insert(tarefas);
  };

  // ── Salvar visitante ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const camposIndicacao = isIndicacao && indicacaoSelecionada
      ? { convidado_por: indicacaoSelecionada.id, convidado_nome: null, como_conheceu_descricao: indicacaoSelecionada.nome_completo }
      : isIndicacao && buscaIndicacao.trim()
      ? { convidado_por: null, convidado_nome: buscaIndicacao.trim(), como_conheceu_descricao: buscaIndicacao.trim() }
      : {};

    const { data, error } = await supabase
      .from("membros")
      .insert({
        nome_completo:      nome.trim(),
        telefone_celular:   normalizarTelefone(telefone) || null,
        email:              email.trim() || null,
        data_entrada:       dataVisita,
        tipo_pessoa:        "visitante",
        como_conheceu:      comoConheceu || null,
        numero_visitas:     1,
        status_acolhimento: "novo",
        perfil_acesso:      "membro",
        ...camposIndicacao,
      } as any)
      .select()
      .single();

    if (error) { toast.error("Erro ao salvar: " + error.message); setSaving(false); return; }
    if (data?.id) await criarTarefas(data.id, nome.trim());

    toast.success(`${nome.trim().split(" ")[0]} cadastrado(a)! Já está no acompanhamento. ✅`);
    onOpenChange(false);
    onSaved?.();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gold/20 ring-1 ring-gold/40 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4 text-gold" />
            </div>
            Novo Visitante
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Preencha o essencial agora. O perfil completo pode ser editado depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="vr-nome">Nome completo <span className="text-destructive">*</span></Label>
            <Input
              id="vr-nome" placeholder="Ex: Maria da Silva"
              value={nome} autoFocus autoComplete="off"
              onChange={(e) => { setNome(e.target.value); if (errors.nome) setErrors(p => ({ ...p, nome: undefined })); }}
              className={errors.nome ? "border-destructive" : ""}
            />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="vr-tel">WhatsApp / Telefone <span className="text-destructive">*</span></Label>
            <Input
              id="vr-tel" type="tel" inputMode="tel" placeholder="(11) 99999-9999"
              value={formatarTelefone(telefone)} autoComplete="off" inputMode="tel" placeholder="+55 (00) 00000-0000"
              onChange={(e) => { setTelefone(limparTelefone(e.target.value)); if (errors.telefone) setErrors(p => ({ ...p, telefone: undefined })); }}
              className={errors.telefone ? "border-destructive" : ""}
            />
            {errors.telefone && <p className="text-xs text-destructive">{errors.telefone}</p>}
          </div>

          {/* Email (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="vr-email">E-mail <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              id="vr-email" type="email" placeholder="exemplo@email.com"
              value={email} autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Data da visita */}
          <div className="space-y-1.5">
            <Label htmlFor="vr-data">Data da visita</Label>
            <Input
              id="vr-data" type="date"
              value={dataVisita}
              onChange={(e) => setDataVisita(e.target.value)}
            />
          </div>

          {/* Como conheceu */}
          <div className="space-y-1.5">
            <Label>Como conheceu a igreja? <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
            <Select value={comoConheceu} onValueChange={(v) => { setComoConheceu(v); if (v !== "indicacao_membro") limparIndicacao(); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {COMO_CONHECEU_OPTIONS.map((o) => (
                  <SelectItem key={o.value || "__none__"} value={o.value || "__none__"}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Indicação: busca de pessoa */}
          {isIndicacao && !showMiniCadastro && (
            <div className="space-y-1.5 rounded-md border border-dashed p-3 bg-muted/30">
              <Label className="text-xs font-medium">Quem indicou? <span className="text-muted-foreground font-normal">(busque pelo nome)</span></Label>
              <div ref={dropRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome…"
                    value={buscaIndicacao}
                    className="pl-8 pr-8"
                    autoComplete="off"
                    onChange={(e) => buscarIndicacao(e.target.value)}
                    onFocus={() => { if (pessoasIndicacao.length > 0) setShowIndicacaoDrop(true); }}
                  />
                  {indicacaoSelecionada && (
                    <button type="button" onClick={limparIndicacao}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown de resultados */}
                {showIndicacaoDrop && pessoasIndicacao.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-44 overflow-y-auto">
                    {pessoasIndicacao.map((p) => (
                      <button
                        key={p.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => selecionarIndicacao(p)}
                      >
                        {p.nome_completo}
                        {p.telefone_celular && (
                          <span className="text-xs text-muted-foreground ml-2">{p.telefone_celular}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sem resultados */}
                {showIndicacaoDrop && !loadingIndicacao && pessoasIndicacao.length === 0 && buscaIndicacao.trim() && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma pessoa encontrada
                  </div>
                )}
              </div>

              {/* Indicação selecionada */}
              {indicacaoSelecionada && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                  <Check className="w-3 h-3" /> {indicacaoSelecionada.nome_completo} selecionado(a)
                </p>
              )}

              {/* Botão cadastrar nova pessoa */}
              <button
                type="button"
                onClick={() => setShowMiniCadastro(true)}
                className="text-xs text-primary underline underline-offset-2 mt-1 hover:opacity-80"
              >
                + Cadastrar nova pessoa
              </button>
            </div>
          )}

          {/* Mini-formulário de nova pessoa indicadora */}
          {isIndicacao && showMiniCadastro && (
            <div className="rounded-md border border-dashed p-3 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Cadastrar novo indicador</Label>
                <button type="button" onClick={() => setShowMiniCadastro(false)}
                  className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Nome completo *" autoFocus
                  value={miniNome} onChange={(e) => setMiniNome(e.target.value)}
                />
                <Input
                  type="tel" placeholder="Telefone (opcional)"
                  value={miniTelefone} onChange={(e) => setMiniTelefone(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => { setShowMiniCadastro(false); setMiniNome(""); setMiniTelefone(""); }}>
                  Cancelar
                </Button>
                <Button size="sm" className="flex-1" onClick={salvarMiniCadastro} disabled={savingMini}>
                  {savingMini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar e selecionar"}
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Salvando..." : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
