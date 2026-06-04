/**
 * VisitorForm — Cadastro rápido de visitante
 *
 * CORREÇÕES (v3-temp):
 *  - setBusy(false) movido para DEPOIS de criarTarefasAcolhimento
 *  - REMOVIDO temporariamente: numero_visitas e score_engajamento
 *    (serão reativados após alterações no banco)
 *  - Erro no insert não fecha o modal nem executa tarefas
 */

import { useEffect, useState } from "react";
import { CamposEndereco } from "@/components/ui/CamposEndereco";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Opções do dropdown "Como conheceu a igreja?" ──────────────────────────

const COMO_CONHECEU_OPTS = [
  { value: "amigo_familiar", label: "Amigo / Familiar" },
  { value: "indicacao_membro", label: "Indicação de membro" },
  { value: "redes_sociais", label: "Redes sociais" },
  { value: "projeto_social", label: "Projeto social" },
  { value: "evento_igreja", label: "Evento da igreja" },
  { value: "pesquisa_google", label: "Pesquisa no Google" },
  { value: "youtube", label: "YouTube" },
  { value: "passando_em_frente", label: "Passando em frente / viu a igreja" },
  { value: "outros", label: "Outros" },
];

// Valores que exibem o campo "Quem convidou?"
const PRECISA_QUEM_CONVIDOU = ["amigo_familiar", "indicacao_membro"];

// ─── Estado inicial do formulário ──────────────────────────────────────────

const empty = {
  nome_completo: "",
  telefone_celular: "",
  email: "",
  sexo: "",
  data_nascimento: "",
  bairro: "",
  cidade: "",
  data_entrada: new Date().toISOString().slice(0, 10),
  como_conheceu: "",
  quem_convidou_id: "",
  como_conheceu_descricao: "",
};

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

interface Pessoa {
  id: string;
  nome_completo: string;
  tipo_pessoa: string | null;
}

// ─── Componente ────────────────────────────────────────────────────────────

export function VisitorForm({ open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [searchPessoa, setSearchPessoa] = useState("");

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setForm(empty);
      setSearchPessoa("");
      setPessoas([]);
    }
  }, [open]);

  // Carregar lista de pessoas quando campo "Quem convidou?" aparecer
  useEffect(() => {
    if (!PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu)) return;
    supabase
      .from("membros")
      .select("id, nome_completo, tipo_pessoa")
      .in("tipo_pessoa", ["membro", "congregado", "visitante"])
      .eq("status", "ativo")
      .order("nome_completo")
      .then(({ data }) => setPessoas((data ?? []) as Pessoa[]));
  }, [form.como_conheceu]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Filtro local pelo texto digitado
  const filteredPessoas = pessoas.filter((p) => p.nome_completo.toLowerCase().includes(searchPessoa.toLowerCase()));

  // Data + N dias a partir de hoje
  const addDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // ── Criar as 4 tarefas de acolhimento automáticas ─────────────────────

  const criarTarefasAcolhimento = async (visitanteId: string, nome: string) => {
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: proximoEvento } = await supabase
      .from("eventos")
      .select("data, titulo")
      .gte("data", hoje)
      .neq("status", "cancelado")
      .order("data", { ascending: true })
      .limit(1)
      .maybeSingle();

    const tarefas = [
      {
        visitante_id: visitanteId,
        titulo: `Enviar mensagem de boas-vindas — ${nome}`,
        data: hoje,
      },
      {
        visitante_id: visitanteId,
        titulo: `Entrar em contato com visitante — ${nome}`,
        data: addDays(2),
      },
      {
        visitante_id: visitanteId,
        titulo: `Convidar visitante para próximo evento — ${nome}`,
        data: proximoEvento?.data ?? addDays(5),
      },
      {
        visitante_id: visitanteId,
        titulo: `Recontato com visitante — ${nome}`,
        data: addDays(7),
      },
    ];

    const { error } = await supabase.from("acolhimento_tarefas").insert(tarefas);
    if (error) console.error("Erro ao criar tarefas de acolhimento:", error.message);
  };

  // ── Submit ────────────────────────────────────────────────────────────

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nome_completo.trim()) {
      toast.error("Informe o nome do visitante");
      return;
    }

    setBusy(true);

    // Montar payload — strings vazias → null
    const payload: any = {
      ...form,
      nome_completo: form.nome_completo.trim(),
      tipo_pessoa: "visitante",
      perfil_acesso: "he",
      status: "ativo",
      status_acolhimento: "novo",
      // numero_visitas e score_engajamento removidos temporariamente
    };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });

    const { data, error } = await supabase.from("membros").insert(payload).select("id").single();

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    if (data?.id) {
      await criarTarefasAcolhimento(data.id, form.nome_completo.trim());
    }

    setBusy(false);

    toast.success("Visitante registrado! Tarefas de acolhimento criadas 💙");
    onOpenChange(false);
    onSaved?.();
  };

  const mostraQuemConvidou = PRECISA_QUEM_CONVIDOU.includes(form.como_conheceu);
  const mostraDescreva = form.como_conheceu === "outros";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle translate="no" className="font-serif text-2xl">
            Novo visitante
          </DialogTitle>
          <DialogDescription translate="no">
            Cadastro rápido. O visitante poderá ser convertido em congregado ou membro depois.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Nome */}
          <div>
            <Label translate="no">Nome completo *</Label>
            <Input required value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Telefone */}
            <div>
              <Label translate="no">Telefone celular</Label>
              <Input
                value={form.telefone_celular}
                placeholder="(00) 00000-0000"
                onChange={(e) => set("telefone_celular", e.target.value)}
              />
            </div>

            {/* E-mail */}
            <div>
              <Label translate="no">E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>

            {/* Sexo */}
            <div>
              <Label translate="no">Sexo</Label>
              <Select value={form.sexo || undefined} onValueChange={(v) => set("sexo", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data nascimento */}
            <div>
              <Label translate="no">Data de nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => set("data_nascimento", e.target.value)}
              />
            </div>

            {/* Endereço com busca por CEP */}
            <div className="md:col-span-2">
              <CamposEndereco
                cep={form.cep ?? ""}
                endereco={form.endereco ?? ""}
                bairro={form.bairro ?? ""}
                cidade={form.cidade ?? ""}
                onChange={(campo, valor) => set(campo, valor)}
                mostrarNumero={false}
                mostrarComplemento={false}
              />
            </div>

            {/* Data da visita */}
            <div className="md:col-span-2">
              <Label translate="no">Data da visita</Label>
              <Input type="date" value={form.data_entrada} onChange={(e) => set("data_entrada", e.target.value)} />
            </div>

            {/* Como conheceu a igreja? */}
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
                <SelectTrigger>
                  <SelectValue placeholder="Selecione como conheceu" />
                </SelectTrigger>
                <SelectContent>
                  {COMO_CONHECEU_OPTS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quem convidou? (condicional) */}
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
                  <div className="border rounded-md max-h-40 overflow-y-auto bg-background shadow-sm z-10 relative">
                    {filteredPessoas.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3">Nenhuma pessoa encontrada</p>
                    ) : (
                      filteredPessoas.slice(0, 10).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
                          onClick={() => {
                            set("quem_convidou_id", p.id);
                            setSearchPessoa(p.nome_completo);
                          }}
                        >
                          {p.nome_completo}
                          <span className="text-xs text-muted-foreground ml-2">({p.tipo_pessoa ?? "—"})</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {form.quem_convidou_id && (
                  <p className="text-xs text-emerald-600 font-medium">✓ Selecionado: {searchPessoa}</p>
                )}
              </div>
            )}

            {/* Descreva (condicional — "Outros") */}
            {mostraDescreva && (
              <div className="md:col-span-2">
                <Label translate="no">Descreva como conheceu</Label>
                <Textarea
                  rows={2}
                  placeholder="Conte como conheceu a igreja..."
                  value={form.como_conheceu_descricao}
                  onChange={(e) => set("como_conheceu_descricao", e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando..." : "Registrar visitante"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
