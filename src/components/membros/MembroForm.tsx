import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, ChevronDown, ChevronUp, Church, UserCircle, MapPin, CalendarDays, Users, Star, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Membro } from "@/pages/Membros";
import { FamiliaSection } from "@/components/familias/FamiliaSection";
import { EnderecoInteligente, emptyEndereco } from "@/components/membros/EnderecoInteligente";
import type { EnderecoData } from "@/components/membros/EnderecoInteligente";
import { cn } from "@/lib/utils";

// ── Opções "Como conheceu" ────────────────────────────────────────────────
const COMO_CONHECEU_OPTS = [
  { value: "amigo_familiar",     label: "Amigo / Familiar" },
  { value: "indicacao_membro",   label: "Indicação de membro" },
  { value: "redes_sociais",      label: "Redes sociais" },
  { value: "projeto_social",     label: "Projeto social" },
  { value: "evento_igreja",      label: "Evento da igreja" },
  { value: "pesquisa_google",    label: "Pesquisa no Google" },
  { value: "youtube",            label: "YouTube" },
  { value: "passando_em_frente", label: "Passando em frente" },
  { value: "outros",             label: "Outros" },
];
const PRECISA_QUEM_CONVIDOU = ["amigo_familiar", "indicacao_membro"];

// ── Perfis / funções ministeriais ────────────────────────────────────────
const PERFIL_OPTS = [
  { value: "membro",        label: "Membro",        tipos: ["membro", "congregado"] },
  { value: "voluntario",    label: "Voluntário",     tipos: ["membro", "congregado"] },
  { value: "lideranca",     label: "Líder",          tipos: ["membro"] },
  { value: "professor_ebd", label: "Professor EBD",  tipos: ["membro"] },
  { value: "tesoureiro",    label: "Tesoureiro",     tipos: ["membro"] },
  { value: "secretaria",    label: "Secretaria",     tipos: ["membro"] },
  { value: "pastor",        label: "Pastor",         tipos: ["membro"] },
  { value: "admin",         label: "Administrador",  tipos: ["membro"] },
];

// ── Estado vazio ──────────────────────────────────────────────────────────
const empty = {
  nome_completo:             "",
  tipo_pessoa:               "visitante" as const,
  perfil_acesso:             "membro"    as const,
  cpf:                       "",
  data_nascimento:           "",
  sexo:                      "",
  estado_civil:              "",
  data_casamento:            "",
  telefone_celular:          "",
  email:                     "",
  data_entrada:              new Date().toISOString().slice(0, 10),
  data_batismo:              "",
  data_consagracao_pastoral: "",
  status:                    "ativo",
  observacoes_pastorais:     "",
  como_conheceu:             "",
  quem_convidou_id:          "",
  como_conheceu_descricao:   "",
};

interface Props {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  membro:        Membro | null;
  onSaved:       () => void;
}

interface PessoaLookup { id: string; nome_completo: string; tipo_pessoa: string | null; }

// ── Helpers ───────────────────────────────────────────────────────────────
function calcIdade(dataNasc: string): number {
  if (!dataNasc) return 0;
  return Math.floor((Date.now() - new Date(dataNasc).getTime()) / (365.25 * 86_400_000));
}

function addDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function criarTarefasAcolhimento(visitanteId: string, nome: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: evt } = await supabase
    .from("eventos").select("data").gte("data", hoje).neq("status", "cancelado")
    .order("data", { ascending: true }).limit(1).maybeSingle();
  const tarefas = [
    { visitante_id: visitanteId, titulo: `Enviar mensagem de boas-vindas — ${nome}`,  data: hoje },
    { visitante_id: visitanteId, titulo: `Entrar em contato com visitante — ${nome}`, data: addDias(2) },
    { visitante_id: visitanteId, titulo: `Convidar para próximo evento — ${nome}`,    data: evt?.data ?? addDias(5) },
    { visitante_id: visitanteId, titulo: `Recontato com visitante — ${nome}`,         data: addDias(7) },
  ];
  const { error } = await supabase.from("acolhimento_tarefas").insert(tarefas);
  if (error) console.error("Erro ao criar tarefas:", error.message);
}

// ── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, collapsible = false, defaultOpen = true }: {
  title: string; icon?: any; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-3 bg-muted/30 text-left",
          collapsible && "cursor-pointer hover:bg-muted/50 transition-colors",
          !collapsible && "cursor-default"
        )}
      >
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-sm flex-1">{title}</span>
        {collapsible && (open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground" />)}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────
export function MembroForm({ open, onOpenChange, membro, onSaved }: Props) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [form,              setForm]              = useState<any>(empty);
  const [busy,              setBusy]              = useState(false);
  const [confirmDelete,     setConfirmDelete]     = useState(false);
  const [pessoasLookup,     setPessoasLookup]     = useState<PessoaLookup[]>([]);
  const [searchPessoa,      setSearchPessoa]      = useState("");
  const [showPastorSuggestion, setShowPastorSuggestion] = useState(false);
  // ── Endereço inteligente ──────────────────────────────────────────────
  const [enderecoData, setEnderecoData] = useState<EnderecoData>(emptyEndereco());

  // Preencher ao editar
  useEffect(() => {
    if (membro) {
      const f: any = { ...empty };
      Object.keys(empty).forEach((k) => { f[k] = (membro as any)[k] ?? ""; });
      setForm(f);
      // Restaurar endereço ao editar
      setEnderecoData({
        endereco:          (membro as any).endereco          ?? "",
        numero:            (membro as any).numero            ?? "",
        complemento:       (membro as any).complemento       ?? "",
        bairro:            (membro as any).bairro            ?? "",
        cidade:            (membro as any).cidade            ?? "",
        estado:            (membro as any).estado            ?? "",
        cep:               (membro as any).cep               ?? "",
        endereco_completo: (membro as any).endereco_completo ?? "",
        latitude:          (membro as any).latitude  ?? null,
        longitude:         (membro as any).longitude ?? null,
        geo_fonte:         (membro as any).geo_fonte  ?? "manual",
        geo_place_id:      (membro as any).geo_place_id ?? "",
      });
    } else {
      setForm(empty);
      setEnderecoData(emptyEndereco());
      setSearchPessoa("");
      setShowPastorSuggestion(false);
    }
  }, [membro, open]);

  // Carregar lookup de pessoas
  useEffect(() => {
    if (!PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu)) return;
    supabase
      .from("membros").select("id,nome_completo,tipo_pessoa")
      .in("tipo_pessoa", ["membro", "congregado", "visitante"])
      .eq("status", "ativo").order("nome_completo")
      .then(({ data }) => setPessoasLookup((data ?? []) as PessoaLookup[]));
  }, [form.como_conheceu]);

  // Sugestão pastor
  useEffect(() => {
    setShowPastorSuggestion(form.perfil_acesso === "pastor" && !membro);
  }, [form.perfil_acesso, membro]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const filteredPessoas = pessoasLookup.filter((p) =>
    p.nome_completo.toLowerCase().includes(searchPessoa.toLowerCase())
  );

  // ── Submit ─────────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_completo.trim()) return toast.error("Informe o nome");
    if (form.tipo_pessoa === "visitante" && !form.telefone_celular.trim())
      return toast.error("Telefone é obrigatório para visitantes");
    if (form.perfil_acesso === "pastor" && !form.data_consagracao_pastoral)
      return toast.error("Informe a data de consagração pastoral para pastores");

    setBusy(true);
    const payload: any = { ...form, nome_completo: form.nome_completo.trim() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    // ── Mesclar endereço inteligente ──────────────────────────────────
    Object.assign(payload, {
      endereco:          enderecoData.endereco          || null,
      numero:            enderecoData.numero            || null,
      complemento:       enderecoData.complemento       || null,
      bairro:            enderecoData.bairro            || null,
      cidade:            enderecoData.cidade            || null,
      estado:            enderecoData.estado            || null,
      cep:               enderecoData.cep               || null,
      endereco_completo: enderecoData.endereco_completo || null,
      latitude:          enderecoData.latitude,
      longitude:         enderecoData.longitude,
      geo_fonte:         enderecoData.latitude ? enderecoData.geo_fonte : null,
      geo_place_id:      enderecoData.geo_place_id      || null,
    });

    const VALID_PERFIL = ["admin","pastor","secretaria","tesoureiro","lideranca","professor_ebd","voluntario","membro"];
    payload.perfil_acesso = VALID_PERFIL.includes(payload.perfil_acesso) ? payload.perfil_acesso : "membro";
    if (payload.tipo_pessoa !== "membro") payload.perfil_acesso = "membro";
    if (payload.perfil_acesso !== "pastor") payload.data_consagracao_pastoral = null;

    if (!membro && payload.tipo_pessoa === "visitante") {
      payload.numero_visitas    = 1;
      payload.status_acolhimento = "novo";
      payload.status            = "ativo";
    }
    if (payload.tipo_pessoa === "congregado" && payload.data_nascimento)
      payload.candidato_membresia = calcIdade(payload.data_nascimento) >= 9;

    let savedId: string | null = null;
    let error: any;
    if (membro) {
      ({ error } = await supabase.from("membros").update(payload).eq("id", membro.id));
    } else {
      const { data, error: e } = await supabase.from("membros").insert(payload).select("id").single();
      error = e; savedId = data?.id ?? null;
    }

    if (error) { setBusy(false); return toast.error(error.message); }

    if (!membro && savedId && payload.tipo_pessoa === "visitante") {
      await criarTarefasAcolhimento(savedId, form.nome_completo.trim());
      toast.success("Visitante registrado! Tarefas de acolhimento criadas");
    } else {
      toast.success(membro ? "Pessoa atualizada" : "Pessoa cadastrada");
    }
    setBusy(false);
    onOpenChange(false);
    onSaved();
  };

  // ── Excluir ────────────────────────────────────────────────────────────
  const onDelete = async () => {
    if (!membro) return;
    setBusy(true);
    const { error } = await supabase.from("membros").delete().eq("id", membro.id);
    setBusy(false);
    if (error) return toast.error("Erro ao excluir: " + error.message);
    toast.success("Contato excluído");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  };

  // ── Derivados ──────────────────────────────────────────────────────────
  const tipo   = form.tipo_pessoa as string;
  const perfil = form.perfil_acesso as string;
  const isVisitante  = tipo === "visitante";
  const isCongregado = tipo === "congregado";
  const isMembro     = tipo === "membro";
  const isPastor     = perfil === "pastor" && isMembro;
  const mostraCasamento    = form.estado_civil === "casado";
  const mostraQuemConvidou = PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu);
  const mostraDescreva     = form.como_conheceu === "outros";
  const idadeEstimada      = calcIdade(form.data_nascimento);
  const candidatoMembresia = isCongregado && form.data_nascimento && idadeEstimada >= 9;
  const perfisDisponiveis  = PERFIL_OPTS.filter(p => p.tipos.includes(tipo));
  const tituloDialog = membro
    ? "Editar pessoa"
    : isVisitante ? "Novo visitante"
    : isCongregado ? "Novo congregado"
    : "Novo membro";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle className="font-serif text-2xl">{tituloDialog}</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="px-6 py-4 space-y-4">

            {/* ── IDENTIFICAÇÃO ── */}
            <Section title="Identificação" icon={UserCircle}>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tipo de pessoa *</Label>
                  <Select value={form.tipo_pessoa} onValueChange={(v) => {
                    set("tipo_pessoa", v);
                    set("como_conheceu", "");
                    set("quem_convidou_id", "");
                    set("perfil_acesso", "membro");
                    setSearchPessoa("");
                    setShowPastorSuggestion(false);
                  }}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visitante">Visitante</SelectItem>
                      <SelectItem value="congregado">Congregado</SelectItem>
                      <SelectItem value="membro">Membro</SelectItem>
                    </SelectContent>
                  </Select>
                  {isVisitante && <p className="text-xs text-muted-foreground">Cadastro rápido. Pode ser convertido depois.</p>}
                </div>

                {isMembro && (
                  <div className="space-y-1.5">
                    <Label>Função / Perfil</Label>
                    <Select value={form.perfil_acesso || "membro"} onValueChange={(v) => set("perfil_acesso", v)}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {perfisDisponiveis.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className={cn("space-y-1.5", !isMembro && "md:col-span-2")}>
                  <Label>Nome completo *</Label>
                  <Input required value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)}
                    className="h-11" placeholder="Nome completo da pessoa" />
                </div>

                {(isCongregado || isMembro) && (
                  <div className="space-y-1.5">
                    <Label>Nome social <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input value={form.nome_social ?? ""} onChange={(e) => set("nome_social", e.target.value)}
                      className="h-11" placeholder="Como prefere ser chamado" />
                  </div>
                )}
              </div>
            </Section>

            {/* ── AVISO PASTOR ── */}
            {showPastorSuggestion && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Pastor registrado</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Preencha a data de consagração abaixo e depois acesse o Organograma para vincular.
                  </p>
                </div>
              </div>
            )}

            {/* ── DADOS PESSOAIS ── */}
            <Section title="Dados Pessoais" icon={UserCircle} collapsible defaultOpen>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Telefone celular {isVisitante && <span className="text-destructive">*</span>}</Label>
                  <Input type="tel" inputMode="tel" value={form.telefone_celular}
                    placeholder="(00) 00000-0000" className="h-11"
                    onChange={(e) => set("telefone_celular", e.target.value)} />
                </div>

                {(isCongregado || isMembro) && (
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input type="email" inputMode="email" value={form.email} className="h-11"
                      onChange={(e) => set("email", e.target.value)} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Data de nascimento</Label>
                  <Input type="date" value={form.data_nascimento} className="h-11"
                    onChange={(e) => set("data_nascimento", e.target.value)} />
                  {candidatoMembresia && (
                    <Badge variant="outline" className="text-[10px] bg-primary/5">
                      Candidato à membresia ({idadeEstimada} anos)
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Sexo</Label>
                  <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(isCongregado || isMembro) && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Estado civil</Label>
                      <Select value={form.estado_civil || undefined} onValueChange={(v) => set("estado_civil", v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                    {mostraCasamento && (
                      <div className="space-y-1.5">
                        <Label>Data de casamento</Label>
                        <Input type="date" value={form.data_casamento} className="h-11"
                          onChange={(e) => set("data_casamento", e.target.value)} />
                      </div>
                    )}
                  </>
                )}

                {isMembro && (
                  <div className="space-y-1.5">
                    <Label>CPF</Label>
                    <Input value={form.cpf} inputMode="numeric" className="h-11"
                      onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
                  </div>
                )}
              </div>
            </Section>

            {/* ── ENDEREÇO INTELIGENTE ── */}
            <Section title="Endereço" icon={MapPin} collapsible defaultOpen={!isVisitante}>
              <EnderecoInteligente
                value={enderecoData}
                onChange={setEnderecoData}
                compact={isVisitante}
              />
            </Section>

            {/* ── VISITA (visitante) ── */}
            {isVisitante && (
              <Section title="Informações da Visita" icon={Church}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Data da visita *</Label>
                    <Input type="date" value={form.data_entrada} className="h-11"
                      onChange={(e) => set("data_entrada", e.target.value)} />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Como conheceu a igreja?</Label>
                    <Select value={form.como_conheceu || undefined} onValueChange={(v) => {
                      set("como_conheceu", v); set("quem_convidou_id", "");
                      set("como_conheceu_descricao", ""); setSearchPessoa("");
                    }}>
                      <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {COMO_CONHECEU_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {mostraQuemConvidou && (
                    <div className="md:col-span-2 space-y-1.5">
                      <Label>Quem convidou?</Label>
                      <Input placeholder="Digite o nome para buscar..." value={searchPessoa} className="h-11"
                        onChange={(e) => { setSearchPessoa(e.target.value); if (form.quem_convidou_id) set("quem_convidou_id", ""); }} />
                      {searchPessoa.length >= 2 && !form.quem_convidou_id && (
                        <div className="border rounded-md max-h-40 overflow-y-auto bg-background shadow-sm">
                          {filteredPessoas.length === 0
                            ? <p className="text-sm text-muted-foreground p-3">Nenhuma pessoa encontrada</p>
                            : filteredPessoas.slice(0, 10).map((p) => (
                              <button key={p.id} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
                                onClick={() => { set("quem_convidou_id", p.id); setSearchPessoa(p.nome_completo); }}>
                                {p.nome_completo}
                                <span className="text-xs text-muted-foreground ml-2">({p.tipo_pessoa ?? "-"})</span>
                              </button>
                            ))}
                        </div>
                      )}
                      {form.quem_convidou_id && <p className="text-xs text-emerald-600 font-medium">Selecionado: {searchPessoa}</p>}
                    </div>
                  )}
                  {mostraDescreva && (
                    <div className="md:col-span-2 space-y-1.5">
                      <Label>Descreva como conheceu</Label>
                      <Textarea rows={2} value={form.como_conheceu_descricao}
                        onChange={(e) => set("como_conheceu_descricao", e.target.value)} />
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── DADOS ECLESIÁSTICOS ── */}
            {(isCongregado || isMembro) && (
              <Section title="Dados Eclesiásticos" icon={Church} collapsible defaultOpen>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Data de entrada</Label>
                    <Input type="date" value={form.data_entrada} className="h-11"
                      onChange={(e) => set("data_entrada", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de batismo</Label>
                    <Input type="date" value={form.data_batismo} className="h-11"
                      onChange={(e) => set("data_batismo", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isMembro ? "Status do membro" : "Status"}</Label>
                    <Select value={form.status || "ativo"} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                        <SelectItem value="transferido">Transferido</SelectItem>
                        {isMembro && <>
                          <SelectItem value="desligado">Desligado</SelectItem>
                          <SelectItem value="excluido">Excluído</SelectItem>
                        </>}
                        <SelectItem value="falecido">Falecido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isPastor && (
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        Data de consagração pastoral *
                      </Label>
                      <Input type="date" value={form.data_consagracao_pastoral}
                        className="h-11 border-amber-300 focus-visible:ring-amber-400"
                        onChange={(e) => set("data_consagracao_pastoral", e.target.value)}
                        required={isPastor} />
                      <p className="text-xs text-muted-foreground">Obrigatório para pastores.</p>
                    </div>
                  )}
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Observações pastorais</Label>
                    <Textarea value={form.observacoes_pastorais}
                      onChange={(e) => set("observacoes_pastorais", e.target.value)}
                      placeholder="Anotações internas (visível apenas para liderança)" rows={3} />
                  </div>
                </div>
              </Section>
            )}

            {/* ── FAMÍLIA ── */}
            {(isCongregado || isMembro) && membro && (
              <Section title="Família" icon={Users} collapsible defaultOpen={false}>
                <FamiliaSection pessoaId={membro.id} pessoaNome={form.nome_completo} readOnly={false} />
              </Section>
            )}

            {/* ── FOOTER ── */}
            <div className="sticky bottom-0 bg-background border-t pt-4 pb-4 -mx-6 px-6">
              <div className="flex flex-col sm:flex-row gap-2">
                {isAdmin && membro && (
                  <Button type="button" variant="destructive" className="sm:mr-auto gap-2"
                    onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}
                  disabled={busy} className="sm:ml-auto">Cancelar</Button>
                <Button type="submit" disabled={busy} className="min-w-[140px]">
                  {busy ? "Salvando..." : membro ? "Salvar alterações" : `Cadastrar ${tipo}`}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{membro?.nome_completo}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
