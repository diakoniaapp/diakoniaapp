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
import { Trash2, Heart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap } from "lucide-react";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { FamiliaBloco } from "@/components/familias/FamiliaBloco";
import { listarClasses, sugerirClasse, classesDaPessoa, type EbdClasse } from "@/services/ebdService";
import { normalizarTelefone, validarTelefone } from "@/lib/telefone";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
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
  const isAdmin = hasRole("admin");

  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Reset wizard step quando abrir
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // EBD: classes disponíveis e seleção atual
  const [ebdClasses, setEbdClasses] = useState<EbdClasse[]>([]);
  const [ebdClasseSelecionada, setEbdClasseSelecionada] = useState<string>("");
  const [ebdSugestaoId, setEbdSugestaoId] = useState<string | null>(null);

  // Áreas disponíveis (agrupadas por ministério) e selecionadas
  const [areasPorMinisterio, setAreasPorMinisterio] = useState<{
    ministerio: { id: string; nome: string };
    areas: { id: string; nome: string; lider_id: string | null; co_lider_id: string | null }[];
  }[]>([]);
  const [areasSelecionadas, setAreasSelecionadas] = useState<Set<string>>(new Set());

  // Preencher ao editar
  useEffect(() => {
    if (membro) {
      const f: any = { ...empty };
      Object.keys(empty).forEach((k) => { f[k] = (membro as any)[k] ?? ""; });
      setForm(f);
    } else {
      setForm(empty);
    }
  }, [membro, open]);

  // EBD: carregar classes disponíveis e classe atual da pessoa (se houver)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const cs = await listarClasses();
        if (cancelled) return;
        setEbdClasses(cs);
        if (membro?.id) {
          const atuais = await classesDaPessoa(membro.id);
          if (cancelled) return;
          setEbdClasseSelecionada(atuais[0]?.classe_id ?? "");
        } else {
          setEbdClasseSelecionada("");
        }
      } catch (e) {
        console.warn("EBD: erro ao carregar classes", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, membro?.id]);

  // EBD: ao mudar data_nascimento/sexo, calcular sugestão
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.data_nascimento) { setEbdSugestaoId(null); return; }
      const id = await sugerirClasse(form.data_nascimento, form.sexo || null);
      if (!cancelled) {
        setEbdSugestaoId(id);
        if (!membro && !ebdClasseSelecionada && id) {
          setEbdClasseSelecionada(id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [form.data_nascimento, form.sexo]);

  // Carregar áreas ativas agrupadas por ministério ativo, e seleção atual da pessoa
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: rawAreas } = await supabase
        .from("areas")
        .select("id, nome, ministerio_id, ativo, lider_id, co_lider_id, ministerios(id, nome, ativo)")
        .eq("ativo", true)
        .order("nome");
      if (cancelled) return;
      // Agrupar por ministério (apenas ativos)
      const mapaMin: Map<string, { ministerio: { id: string; nome: string }; areas: { id: string; nome: string }[] }> = new Map();
      (rawAreas ?? []).forEach((a: any) => {
        const m = a.ministerios;
        if (!m || m.ativo === false) return;
        if (!mapaMin.has(m.id)) mapaMin.set(m.id, { ministerio: { id: m.id, nome: m.nome }, areas: [] });
        mapaMin.get(m.id)!.areas.push({ id: a.id, nome: a.nome, lider_id: a.lider_id ?? null, co_lider_id: a.co_lider_id ?? null });
      });
      const grupos = Array.from(mapaMin.values()).sort((a, b) =>
        a.ministerio.nome.localeCompare(b.ministerio.nome)
      );
      setAreasPorMinisterio(grupos);

      if (membro?.id) {
        const { data: vinculos } = await supabase
          .from("area_voluntarios")
          .select("area_id")
          .eq("membro_id", membro.id)
          .eq("status", "ativa");
        if (cancelled) return;
        setAreasSelecionadas(new Set((vinculos ?? []).map((v: any) => v.area_id)));
      } else {
        setAreasSelecionadas(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [open, membro?.id]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

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

    // Normaliza telefone para formato canônico (55DDDNNNNNNNNN).
    if (payload.telefone_celular) {
      const valid = validarTelefone(payload.telefone_celular);
      if (!valid.ok) { setBusy(false); return toast.error(valid.erro!); }
      payload.telefone_celular = normalizarTelefone(payload.telefone_celular);
    }

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

    // Sincronizar vínculos com áreas (area_voluntarios)
    const pessoaId = membro?.id ?? savedId;
    if (pessoaId) {
      try {
        // Buscar áreas atuais (status='ativa')
        const { data: atuais } = await supabase
          .from("area_voluntarios")
          .select("id, area_id")
          .eq("membro_id", pessoaId)
          .eq("status", "ativa");
        const atuaisSet = new Set((atuais ?? []).map((a: any) => a.area_id));

        // Adicionar novos: precisa do ministerio_id da área
        const novos = [...areasSelecionadas].filter(id => !atuaisSet.has(id));
        if (novos.length > 0) {
          // Buscar ministerio_id de cada área nova
          const { data: areasInfo } = await supabase
            .from("areas")
            .select("id, ministerio_id")
            .in("id", novos);
          const infoMap = new Map((areasInfo ?? []).map((a: any) => [a.id, a.ministerio_id]));
          const hoje = new Date().toISOString().slice(0, 10);
          await supabase.from("area_voluntarios").insert(
            novos.map(areaId => ({
              area_id:       areaId,
              ministerio_id: infoMap.get(areaId),
              membro_id:     pessoaId,
              funcao:        "Voluntário",
              data_inicio:   hoje,
              status:        "ativa",
            }))
          );
        }

        // Encerrar removidos (status='encerrada')
        const removidos = [...atuaisSet].filter(id => !areasSelecionadas.has(id));
        if (removidos.length > 0) {
          await supabase
            .from("area_voluntarios")
            .update({ status: "encerrada", data_fim: new Date().toISOString().slice(0, 10) })
            .eq("membro_id", pessoaId)
            .in("area_id", removidos)
            .eq("status", "ativa");
        }
      } catch (e: any) {
        console.warn("Sync de áreas falhou:", e?.message);
      }
    }

    // EBD: sincronizar matrícula
    const pessoaIdEbd = membro?.id ?? savedId;
    if (pessoaIdEbd) {
      try {
        const atuais = await classesDaPessoa(pessoaIdEbd);
        const atualId = atuais[0]?.classe_id ?? null;
        if (ebdClasseSelecionada && ebdClasseSelecionada !== atualId) {
          // Desativar matrículas anteriores
          for (const a of atuais) {
            await supabase
              .from("ebd_matriculas")
              .update({ ativo: false })
              .eq("pessoa_id", pessoaIdEbd)
              .eq("classe_id", a.classe_id)
              .eq("ativo", true);
          }
          await supabase
            .from("ebd_matriculas")
            .insert({ pessoa_id: pessoaIdEbd, classe_id: ebdClasseSelecionada, ativo: true });
        } else if (!ebdClasseSelecionada && atualId) {
          // Removeu a classe
          await supabase
            .from("ebd_matriculas")
            .update({ ativo: false })
            .eq("pessoa_id", pessoaIdEbd)
            .eq("ativo", true);
        }
      } catch (e: any) {
        console.warn("EBD sync falhou:", e?.message);
      }
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
    : isVisitante ? "Novo visitante"
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

            {/* ── INDICADOR DE PASSOS ── */}
            <div className="flex items-center justify-between gap-1 pt-1">
              {([
                { n: 1 as const, label: "Identificação" },
                { n: 2 as const, label: "Contato" },
                { n: 3 as const, label: "Vínculos" },
              ]).map((p, idx, arr) => (
                <div key={p.n} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => setStep(p.n)}
                    className={`flex flex-col items-center gap-1 ${step === p.n ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                      step === p.n ? "bg-gold text-white border-gold"
                        : step > p.n ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
                        : "bg-muted border-border"
                    }`}>
                      {step > p.n ? "✓" : p.n}
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wide">{p.label}</span>
                  </button>
                  {idx < arr.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${step > p.n ? "bg-emerald-500/40" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>

            {step === 1 && (<>
            {/* ── TIPO DE PESSOA ── */}
            <div>
              <Label translate="no">Tipo de pessoa *</Label>
              <Select
                value={form.tipo_pessoa}
                onValueChange={(v) => {
                  set("tipo_pessoa", v);
                  set("como_conheceu", "");
                  set("quem_convidou_id", "");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visitante">Visitante</SelectItem>
                  <SelectItem value="congregado">Congregado</SelectItem>
                  <SelectItem value="membro">Membro</SelectItem>
                </SelectContent>
              </Select>
              {isVisitante && (
                <p className="text-xs text-muted-foreground mt-1" translate="no">
                  Cadastro rápido — pode virar congregado depois sem perder o histórico.
                </p>
              )}
            </div>

                        </>)}

            {step === 1 && (<>
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
                <TelefoneInput
                  value={form.telefone_celular}
                  onChange={(v) => set("telefone_celular", v)}
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

                        </>)}

            {step === 2 && (<>
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

                        </>)}

            {step === 2 && (<>
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

                        </>)}

            {step === 1 && (<>
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
                      <BuscaPessoa
                        value={form.quem_convidou_id || ""}
                        onChange={(id) => set("quem_convidou_id", id)}
                        tipos={["membro", "congregado", "visitante"]}
                        ignorarIds={membro ? [membro.id] : []}
                      />
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

                        </>)}

            {step === 1 && (<>
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
                        <SelectItem value="inativo">Inativo (afastamento)</SelectItem>
                        <SelectItem value="transferido">Transferido</SelectItem>
                        <SelectItem value="desligado">Desligado</SelectItem>
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

                        </>)}

            {step === 3 && (<>
            {/* ── EBD ── */}
            {(isCongregado || isMembro) && ebdClasses.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5" translate="no">
                  <GraduationCap className="w-3.5 h-3.5" /> Classe EBD
                </h3>
                <Select value={ebdClasseSelecionada || undefined} onValueChange={setEbdClasseSelecionada}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar classe..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>— Nenhuma —</SelectItem>
                    {ebdClasses.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        {ebdSugestaoId === c.id && " ✨"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ebdSugestaoId && (
                  <p className="text-[11px] text-muted-foreground">
                    ✨ Sugestão pela idade e sexo: {ebdClasses.find(c => c.id === ebdSugestaoId)?.nome ?? "—"}
                  </p>
                )}
              </div>
            )}

                        </>)}

            {step === 3 && (<>
            {/* ── ÁREAS DE ATUAÇÃO (agrupadas por ministério) ── */}
            {(isCongregado || isMembro) && areasPorMinisterio.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5" translate="no">
                  <Heart className="w-3.5 h-3.5" /> Áreas de atuação
                </h3>
                <p className="text-xs text-muted-foreground">
                  Em quais áreas esta pessoa serve? (Pode marcar mais de uma; agrupadas pelo ministério.)
                </p>
                <div className="space-y-3 max-h-72 overflow-y-auto rounded-md border p-3">
                  {areasPorMinisterio.map(grupo => (
                    <div key={grupo.ministerio.id} className="space-y-1.5">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 font-semibold">
                        {grupo.ministerio.nome}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {grupo.areas.map(a => {
                          const checked = areasSelecionadas.has(a.id);
                          const ehLider = !!membro && (a.lider_id === membro.id || a.co_lider_id === membro.id);
                          return (
                            <label key={a.id} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-muted/40 px-2 py-1 rounded">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setAreasSelecionadas(prev => {
                                    const next = new Set(prev);
                                    if (v) next.add(a.id); else next.delete(a.id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="flex items-center gap-1 min-w-0">
                                <span className="truncate">{a.nome}</span>
                                {ehLider && (
                                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300 shrink-0">
                                    Líder
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Função padrão registrada: <strong>Voluntário</strong>. Líderes de área podem (e geralmente devem) 
                  marcar a própria área aqui também — assim aparecem nas escalas. Para ajustes finos (líder, 
                  coordenador, etc), abra Ministérios → o ministério desejado → Voluntários.
                </p>
              </div>
            )}

                        </>)}

            {step === 3 && (<>
            {/* ── FAMÍLIA (Fase A) ── */}
            {(isCongregado || isMembro) && (
              <FamiliaBloco
                pessoaId={membro?.id ?? null}
                nomeCompleto={form.nome_completo ?? ""}
                endereco={{
                  endereco: form.endereco ?? undefined,
                  numero: form.numero ?? undefined,
                  complemento: form.complemento ?? undefined,
                  bairro: form.bairro ?? undefined,
                  cidade: form.cidade ?? undefined,
                  cep: form.cep ?? undefined,
                }}
              />
            )}

                        </>)}

            {step === 3 && (<>
            {/* ── ACESSO AO SISTEMA (A4: botão único Convidar como…) ── */}
            {(isCongregado || isMembro) && membro && (
              <div className="pt-2 space-y-2">
                <AcessoCard
                  pessoaId={membro.id}
                  nomeCompleto={form.nome_completo || membro.nome_completo}
                  telefone={form.telefone_celular || membro.telefone_celular}
                />
              </div>
            )}

            {(isCongregado || isMembro) && !membro && (
              <p className="text-xs text-amber-600 px-2 py-1.5 bg-amber-50 rounded border border-amber-200">
                Salve a pessoa primeiro para criar o acesso ao sistema.
              </p>
            )}

                        </>)}

            {/* ── FOOTER ── */}
            <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
              {isAdmin && membro && step === 1 && (
                <Button type="button" variant="destructive" className="sm:mr-auto gap-2"
                  onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              {step > 1 ? (
                <Button type="button" variant="outline"
                  onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                  disabled={busy}>
                  ← Anterior
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancelar
                </Button>
              )}

              {step < 3 ? (
                <Button type="button"
                  onClick={() => {
                    // Valida campos obrigatórios do passo atual
                    if (step === 1 && !form.nome_completo.trim()) {
                      toast.error("Informe o nome completo");
                      return;
                    }
                    if (step === 1 && isVisitante && !form.telefone_celular.trim()) {
                      toast.error("Telefone é obrigatório para visitante");
                      return;
                    }
                    setStep((step + 1) as 1 | 2 | 3);
                  }}
                  disabled={busy}>
                  Próximo →
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "Salvando..." : membro ? "Salvar alteracoes" : `Cadastrar ${tipo}`}
                </Button>
              )}
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
