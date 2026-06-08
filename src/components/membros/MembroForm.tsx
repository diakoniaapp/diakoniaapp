import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { AcessoCard }      from "@/components/pessoas/AcessoCard";
import { CamposEndereco } from "@/components/ui/CamposEndereco";
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
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { Membro } from "@/pages/Membros";

// ── Opções "Como conheceu" ────────────────────────────────────────────────
const COMO_CONHECEU_OPTS = [
  { value: "amigo_familiar",      label: "Amigo / Familiar" },
  { value: "indicacao_membro",    label: "Indicacao de membro" },
  { value: "redes_sociais",       label: "Redes sociais" },
  { value: "projeto_social",      label: "Projeto social" },
  { value: "evento_igreja",       label: "Evento da igreja" },
  { value: "pesquisa_google",     label: "Pesquisa no Google" },
  { value: "youtube",             label: "YouTube" },
  { value: "passando_em_frente",  label: "Passando em frente" },
  { value: "outros",              label: "Outros" },
];
const PRECISA_QUEM_CONVIDOU = ["amigo_familiar", "indicacao_membro"];

// ── Estado vazio ──────────────────────────────────────────────────────────
const empty = {
  nome_completo:            "",
  tipo_pessoa:              "congregado" as const,
  perfil_acesso:            ""               as const, // null no banco; preenchido só se Membro
  cpf:                      "",
  data_nascimento:          "",
  sexo:                     "",
  estado_civil:             "",
  data_casamento:           "",
  telefone_celular:         "",
  email:                    "",
  endereco:                 "",
  numero:                   "",
  complemento:              "",
  bairro:                   "",
  cidade:                   "",
  cep:                      "",
  data_entrada:             new Date().toISOString().slice(0, 10),
  status:                   "ativo",
  observacoes_pastorais:    "",
  // campos visitante
  como_conheceu:            "",
  quem_convidou_id:         "",
  como_conheceu_descricao:  "",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membro: Membro | null;
  onSaved: () => void;
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

// ── Tarefas de acolhimento automáticas ───────────────────────────────────
async function criarTarefasAcolhimento(visitanteId: string, nome: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: evt } = await supabase
    .from("eventos").select("data").gte("data", hoje).neq("status", "cancelado")
    .order("data", { ascending: true }).limit(1).maybeSingle();

  const tarefas = [
    { visitante_id: visitanteId, titulo: `Enviar mensagem de boas-vindas — ${nome}`, data: hoje },
    { visitante_id: visitanteId, titulo: `Entrar em contato com visitante — ${nome}`, data: addDias(2) },
    { visitante_id: visitanteId, titulo: `Convidar para proximo evento — ${nome}`, data: evt?.data ?? addDias(5) },
    { visitante_id: visitanteId, titulo: `Recontato com visitante — ${nome}`, data: addDias(7) },
  ];
  const { error } = await supabase.from("acolhimento_tarefas").insert(tarefas);
  if (error) console.error("Erro ao criar tarefas:", error.message);
}

// ── Componente principal ──────────────────────────────────────────────────
export function MembroForm({ open, onOpenChange, membro, onSaved }: Props) {
  const { hasRole } = useAuth();
  // FASE D: helper unificado — "editando" vs "criando".
  const isEditing = Boolean(membro);
  // FASE B: gerencia acesso via toggle (substitui antiga lógica perfil_acesso).
  // O AcessoCard só renderiza se este toggle estiver ON e a pessoa já estiver salva.
  const [possuiAcesso, setPossuiAcesso] = useState(false);

  // FASE B: ao abrir o formulário de uma pessoa existente, detecta se já tem acesso ativo
  useEffect(() => {
    if (!membro?.id) {
      setPossuiAcesso(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("pessoa_id", membro.id)
          .maybeSingle();
        if (!cancelled) setPossuiAcesso(Boolean(data?.id));
      } catch {
        // Silencioso: o AcessoCard tem fallback próprio para carregar status.
      }
    })();
    return () => { cancelled = true; };
  }, [membro?.id]);
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pessoasLookup, setPessoasLookup] = useState<PessoaLookup[]>([]);
  const [searchPessoa, setSearchPessoa] = useState("");

  // Preencher ao editar
  useEffect(() => {
    if (membro) {
      const f: any = { ...empty };
      Object.keys(empty).forEach((k) => { f[k] = (membro as any)[k] ?? ""; });
      setForm(f);
    } else {
      setForm(empty);
      setSearchPessoa("");
    }
  }, [membro, open]);

  // Carregar lookup de pessoas quando campo "Quem convidou?" aparecer
  useEffect(() => {
    if (!PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu)) return;
    supabase
      .from("membros").select("id,nome_completo,tipo_pessoa")
      .in("tipo_pessoa", ["membro", "congregado", "visitante"])
      .eq("status", "ativo").order("nome_completo")
      .then(({ data }) => setPessoasLookup((data ?? []) as PessoaLookup[]));
  }, [form.como_conheceu]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const filteredPessoas = pessoasLookup.filter((p) =>
    p.nome_completo.toLowerCase().includes(searchPessoa.toLowerCase())
  );

  // ── Submit ─────────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nome_completo.trim()) return toast.error("Informe o nome");

    // Telefone obrigatorio para visitante
    if (form.tipo_pessoa === "visitante" && !form.telefone_celular.trim()) {
      return toast.error("Telefone e obrigatorio para visitantes");
    }

    setBusy(true);

    // ── Montar payload ─────────────────────────────────────────────────
    const payload: any = { ...form, nome_completo: form.nome_completo.trim() };

    // Strings vazias → null
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    // FASE C: membros.perfil_acesso é COLUNA LEGADA. Fonte de verdade do acesso é user_roles.role.
    // Sempre gravamos null aqui para não criar dado fantasma.
    payload.perfil_acesso = null;

    // Campos exclusivos de visitante
    if (!membro && payload.tipo_pessoa === "visitante") {
      payload.numero_visitas    = 1;
      payload.status_acolhimento = "novo";
      payload.status            = "ativo";
    }

    // candidato_membresia para congregado
    if (payload.tipo_pessoa === "congregado" && payload.data_nascimento) {
      payload.candidato_membresia = calcIdade(payload.data_nascimento) >= 9;
    }

    // ── Salvar ─────────────────────────────────────────────────────────
    let savedId: string | null = null;
    let error: any;

    if (membro) {
      ({ error } = await supabase.from("membros").update(payload).eq("id", membro.id));
    } else {
      const { data, error: e } = await supabase.from("membros").insert(payload).select("id").single();
      error = e;
      savedId = data?.id ?? null;
    }

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    // Tarefas de acolhimento so para novos visitantes
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
    toast.success("Contato excluido");
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  };

  const tipo = form.tipo_pessoa as string;
  const isVisitante   = tipo === "visitante";
  const isCongregado  = tipo === "congregado";
  const isMembro      = tipo === "membro";
  const mostraCasamento = form.estado_civil === "casado";
  const mostraQuemConvidou = PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu);
  const mostraDescreva = form.como_conheceu === "outros";
  const idadeEstimada = calcIdade(form.data_nascimento);
  const candidatoMembresia = isCongregado && form.data_nascimento && idadeEstimada >= 9;

  const tituloDialog = membro
    ? "Editar pessoa"
    : isCongregado ? "Novo congregado"
    : "Novo membro";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl" translate="no">
              {tituloDialog}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">

            {/* ── TIPO DE PESSOA ── */}
            <div>
              <Label translate="no">Tipo de pessoa *</Label>
              <Select
                value={form.tipo_pessoa}
                onValueChange={(v) => {
                  set("tipo_pessoa", v);
                  set("como_conheceu", "");
                  set("quem_convidou_id", "");
                  setSearchPessoa("");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="congregado">Congregado</SelectItem>
                  <SelectItem value="membro">Membro</SelectItem>
                </SelectContent>
              </Select>
              {isVisitante && (
                <p className="text-xs text-muted-foreground mt-1" translate="no">
                  Cadastro rapido. Pode ser convertido em congregado ou membro depois.
                </p>
              )}
            </div>

            {/* ── CAMPOS BASICOS (todos os tipos) ── */}
            <section className="grid md:grid-cols-2 gap-3">

              <div className="md:col-span-2">
                <Label translate="no">Nome completo *</Label>
                <Input required value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
              </div>

              <div>
                <Label translate="no">
                  Telefone celular {isVisitante && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  value={form.telefone_celular}
                  placeholder="(00) 00000-0000"
                  onChange={(e) => set("telefone_celular", e.target.value)}
                />
              </div>

              {(isCongregado || isMembro) && (
                <div>
                  <Label translate="no">E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
              )}

              <div>
                <Label translate="no">Sexo</Label>
                <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label translate="no">Data de nascimento</Label>
                <Input type="date" value={form.data_nascimento} onChange={(e) => set("data_nascimento", e.target.value)} />
                {candidatoMembresia && (
                  <Badge variant="outline" className="mt-1 text-[10px] bg-primary/5">
                    Candidato a membresia ({idadeEstimada} anos)
                  </Badge>
                )}
              </div>

              {(isCongregado || isMembro) && (
                <>
                  <div>
                    <Label translate="no">Estado civil</Label>
                    <Select value={form.estado_civil || undefined} onValueChange={(v) => set("estado_civil", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                        <SelectItem value="casado">Casado(a)</SelectItem>
                        <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                        <SelectItem value="viuvo">Viuvo(a)</SelectItem>
                        <SelectItem value="uniao_estavel">Uniao estavel</SelectItem>
                        <SelectItem value="separado">Separado(a)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {mostraCasamento && (
                    <div>
                      <Label translate="no">Data de casamento</Label>
                      <Input type="date" value={form.data_casamento} onChange={(e) => set("data_casamento", e.target.value)} />
                    </div>
                  )}
                </>
              )}

              {isMembro && (
                <div>
                  <Label translate="no">CPF</Label>
                  <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
                </div>
              )}

            </section>

            {/* ── ENDEREÇO (congregado e membro) ── */}
            {(isCongregado || isMembro) && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Endereço</h3>
                <CamposEndereco
                  cep={form.cep ?? ""}
                  endereco={form.endereco ?? ""}
                  numero={form.numero ?? ""}
                  complemento={form.complemento ?? ""}
                  bairro={form.bairro ?? ""}
                  cidade={form.cidade ?? ""}
                  onChange={(campo, valor) => set(campo, valor)}
                  disabled={busy}
                  mostrarNumero
                  mostrarComplemento
                  mostrarUf
                />
              </>
            )}

            {/* ── ENDEREÇO VISITANTE (CEP + bairro + cidade) ── */}
            {isVisitante && (
              <CamposEndereco
                cep={form.cep ?? ""}
                endereco={form.endereco ?? ""}
                bairro={form.bairro ?? ""}
                cidade={form.cidade ?? ""}
                onChange={(campo, valor) => set(campo, valor)}
                disabled={busy}
                mostrarNumero={false}
                mostrarComplemento={false}
              />
            )}

            {/* ── CAMPOS VISITANTE ── */}
            {isVisitante && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Visita</h3>
                <section className="grid md:grid-cols-2 gap-3">

                  <div className="md:col-span-2">
                    <Label translate="no">Data da visita *</Label>
                    <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
                  </div>

                  <div className="md:col-span-2">
                    <Label translate="no">Como conheceu a igreja?</Label>
                    <Select
                      value={form.como_conheceu || undefined}
                      onValueChange={(v) => {
                        set("como_conheceu", v);
                        set("quem_convidou_id", "");
                        set("como_conheceu_descricao", "");
                        setSearchPessoa("");
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {COMO_CONHECEU_OPTS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mostraQuemConvidou && (
                    <div className="md:col-span-2 space-y-1">
                      <Label translate="no">Quem convidou?</Label>
                      <Input
                        placeholder="Digite o nome para buscar..."
                        value={searchPessoa}
                        onChange={(e) => {
                          setSearchPessoa(e.target.value);
                          if (form.quem_convidou_id) set("quem_convidou_id", "");
                        }}
                      />
                      {searchPessoa.length >= 2 && !form.quem_convidou_id && (
                        <div className="border rounded-md max-h-40 overflow-y-auto bg-background shadow-sm">
                          {filteredPessoas.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-3">Nenhuma pessoa encontrada</p>
                          ) : (
                            filteredPessoas.slice(0, 10).map((p) => (
                              <button
                                key={p.id} type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
                                onClick={() => { set("quem_convidou_id", p.id); setSearchPessoa(p.nome_completo); }}
                              >
                                {p.nome_completo}
                                <span className="text-xs text-muted-foreground ml-2">({p.tipo_pessoa ?? "-"})</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      {form.quem_convidou_id && (
                        <p className="text-xs text-emerald-600 font-medium">Selecionado: {searchPessoa}</p>
                      )}
                    </div>
                  )}

                  {mostraDescreva && (
                    <div className="md:col-span-2">
                      <Label translate="no">Descreva como conheceu</Label>
                      <Textarea rows={2} value={form.como_conheceu_descricao}
                        onChange={(e) => set("como_conheceu_descricao", e.target.value)} />
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ── SITUACAO (congregado e membro) ── */}
            {(isCongregado || isMembro) && (
              <>
                <h3 className="font-semibold text-sm mt-2 text-muted-foreground" translate="no">Situacao</h3>
                <section className="grid md:grid-cols-2 gap-3">

                  <div>
                    <Label translate="no">Data de entrada</Label>
                    <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
                  </div>

                  <div>
                    <Label translate="no">{isMembro ? "Status do membro" : "Status"}</Label>
                    <Select value={form.status || "ativo"} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                        <SelectItem value="transferido">Transferido</SelectItem>
                        {isMembro && <>
                          <SelectItem value="desligado">Desligado</SelectItem>
                          <SelectItem value="excluido">Excluido</SelectItem>
                        </>}
                        <SelectItem value="falecido">Falecido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* FASE B: Bloco "Perfil de acesso no sistema" REMOVIDO.
                      O acesso ao sistema vive em user_roles.role e é gerenciado pelo
                      bloco "Acesso ao sistema" abaixo (Toggle + AcessoCard). */}

                  <div className="md:col-span-2">
                    <Label translate="no">Observacoes pastorais</Label>
                    <Textarea
                      value={form.observacoes_pastorais}
                      onChange={(e) => set("observacoes_pastorais", e.target.value)}
                      placeholder="Anotacoes internas (visivel apenas para lideranca)"
                      rows={3}
                    />
                  </div>
                </section>
              </>
            )}

            {/* ── ACESSO AO SISTEMA (FASE B: Toggle "Possui acesso") ── */}
            {(isCongregado || isMembro) && (
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm text-muted-foreground" translate="no">
                      Acesso ao sistema
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Permite que esta pessoa faça login no Diakonia
                    </p>
                  </div>
                  <Switch
                    checked={possuiAcesso}
                    onCheckedChange={setPossuiAcesso}
                    disabled={!membro}
                    aria-label="Possui acesso ao sistema"
                  />
                </div>

                {possuiAcesso && membro && (
                  <AcessoCard
                    pessoaId={membro.id}
                    nomeCompleto={form.nome_completo || membro.nome_completo}
                    telefone={form.telefone_celular || membro.telefone_celular}
                    roleInicial="voluntario"
                  />
                )}

                {possuiAcesso && !membro && (
                  <p className="text-xs text-amber-600 px-2 py-1.5 bg-amber-50 rounded border border-amber-200">
                    Salve a pessoa primeiro para criar o acesso.
                  </p>
                )}
              </div>
            )}

            {/* ── FOOTER ── */}
            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              {isAdmin && membro && (
                <Button type="button" variant="destructive" className="sm:mr-auto gap-2"
                  onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Salvando..." : membro ? "Salvar alteracoes" : `Cadastrar ${tipo}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmacao de exclusao */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{membro?.nome_completo}</strong>?
              Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={busy} className="bg-destructive text-white hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
