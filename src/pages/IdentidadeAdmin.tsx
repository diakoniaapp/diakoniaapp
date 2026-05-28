import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Church, Save, Loader2, Plus, Trash2, GripVertical, Heart, Info } from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Identidade {
  id: string;
  nome_igreja: string;
  cnpj: string | null;
  missao: string | null;
  visao: string | null;
  fundada_em: string | null;
  logo_url: string | null;
  slug: string | null;
  ativa: boolean;
}

interface ValorItem {
  /** undefined = novo (ainda não salvo) */
  id?: string;
  valor: string;
  descricao: string;
  icone: string;
  ordem: number;
  /** marcado para exclusão */
  _delete?: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function IdentidadeAdmin() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  // Dados carregados
  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formulário de identidade
  const [form, setForm] = useState({
    nome_igreja: "",
    cnpj: "",
    missao: "",
    visao: "",
    fundada_em: "",
    slug: "",
    logo_url: "",
  });

  // Lista de valores (inclui novos, editados e marcados para exclusão)
  const [valores, setValores] = useState<ValorItem[]>([]);

  // ── Guarda de acesso ──
  useEffect(() => {
    if (!hasRole(["admin", "secretaria"])) navigate("/", { replace: true });
  }, []);

  // ── Carga ──
  const load = async () => {
    setLoading(true);
    const { data: id } = await supabase
      .from("identidade_igreja")
      .select("*")
      .eq("ativa", true)
      .maybeSingle();

    if (id) {
      setIdentidade(id as Identidade);
      setForm({
        nome_igreja: id.nome_igreja ?? "",
        cnpj: id.cnpj ?? "",
        missao: id.missao ?? "",
        visao: id.visao ?? "",
        fundada_em: id.fundada_em ?? "",
        slug: id.slug ?? "",
        logo_url: id.logo_url ?? "",
      });

      // Carregar valores vinculados
      const { data: vals } = await supabase
        .from("identidade_valores")
        .select("*")
        .eq("igreja_id", id.id)
        .order("ordem");

      setValores(
        ((vals ?? []) as any[]).map((v) => ({
          id: v.id,
          valor: v.valor ?? "",
          descricao: v.descricao ?? "",
          icone: v.icone ?? "",
          ordem: v.ordem ?? 0,
        }))
      );
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Operações nos valores ──
  const addValor = () => {
    setValores((prev) => [
      ...prev,
      { valor: "", descricao: "", icone: "", ordem: prev.length },
    ]);
  };

  const updateValor = (idx: number, field: keyof ValorItem, value: string) => {
    setValores((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v))
    );
  };

  const removeValor = (idx: number) => {
    setValores((prev) =>
      prev.map((v, i) => {
        if (i !== idx) return v;
        // Se tem id (já salvo), marca para delete; senão remove da lista
        return v.id ? { ...v, _delete: true } : null!;
      }).filter(Boolean)
    );
  };

  // ── Salvar tudo ──
  const salvar = async () => {
    if (!form.nome_igreja.trim()) {
      toast.error("Nome da igreja é obrigatório");
      return;
    }
    setSaving(true);

    // 1. Salvar identidade
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    let igrejId = identidade?.id ?? null;

    if (igrejId) {
      const { error } = await supabase
        .from("identidade_igreja")
        .update(payload)
        .eq("id", igrejId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase
        .from("identidade_igreja")
        .insert({ ...payload, ativa: true })
        .select("id")
        .single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      igrejId = (data as any).id;
    }

    // 2. Processar valores
    const erros: string[] = [];

    for (const v of valores) {
      if (v._delete && v.id) {
        const { error } = await supabase
          .from("identidade_valores")
          .delete()
          .eq("id", v.id);
        if (error) erros.push(error.message);
        continue;
      }
      if (v._delete) continue; // novo sem id, só ignora

      if (!v.valor.trim()) continue; // ignora linhas vazias

      if (v.id) {
        // Atualizar existente
        const { error } = await supabase
          .from("identidade_valores")
          .update({
            valor: v.valor.trim(),
            descricao: v.descricao.trim() || null,
            icone: v.icone.trim() || null,
            ordem: v.ordem,
          })
          .eq("id", v.id);
        if (error) erros.push(error.message);
      } else {
        // Inserir novo
        const { error } = await supabase
          .from("identidade_valores")
          .insert({
            igreja_id: igrejId,
            valor: v.valor.trim(),
            descricao: v.descricao.trim() || null,
            icone: v.icone.trim() || null,
            ordem: v.ordem,
            ativo: true,
          });
        if (error) erros.push(error.message);
      }
    }

    setSaving(false);

    if (erros.length > 0) {
      toast.error("Identidade salva, mas alguns valores falharam: " + erros[0]);
    } else {
      toast.success("Identidade e valores salvos com sucesso!");
    }

    load();
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  const valoresVisiveis = valores.filter((v) => !v._delete);

  return (
    <div>
      <PageHeader
        title="Identidade da Igreja"
        description="Missão, visão, valores e dados institucionais"
        actions={
          <Button onClick={salvar} disabled={saving}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : <Save className="w-4 h-4 mr-2" />}
            Salvar tudo
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6 max-w-2xl">

        {/* ── Card: Dados da Igreja ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Church className="w-4 h-4 text-gold" /> Dados da Igreja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da Igreja *</Label>
              <Input
                value={form.nome_igreja}
                onChange={(e) => setForm({ ...form, nome_igreja: e.target.value })}
                placeholder="Ex: QIBRJ — Quadrangular Ibirapuera"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                />
              </div>
              <div>
                <Label>Fundada em</Label>
                <Input
                  type="date"
                  value={form.fundada_em}
                  onChange={(e) => setForm({ ...form, fundada_em: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Missão</Label>
              <Textarea
                rows={3}
                value={form.missao}
                onChange={(e) => setForm({ ...form, missao: e.target.value })}
                placeholder="A missão da nossa igreja é…"
                className="resize-none"
              />
            </div>

            <div>
              <Label>Visão</Label>
              <Textarea
                rows={3}
                value={form.visao}
                onChange={(e) => setForm({ ...form, visao: e.target.value })}
                placeholder="Nossa visão é ser uma igreja que…"
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Slug (URL amigável)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="qibrj"
                />
              </div>
              <div>
                <Label>URL do Logo</Label>
                <Input
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Card: Valores ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Heart className="w-4 h-4 text-gold" /> Valores Institucionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Texto explicativo */}
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Os valores representam os princípios fundamentais da igreja e podem ser
                adicionados, editados ou removidos livremente. Use o ícone (emoji) para
                identificar visualmente cada valor.
              </p>
            </div>

            {/* Lista de valores */}
            {valoresVisiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum valor cadastrado ainda. Clique em "+ Adicionar valor" para começar.
              </p>
            ) : (
              <div className="space-y-3">
                {valores.map((v, idx) => {
                  if (v._delete) return null;
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border bg-background p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        {/* Ícone */}
                        <Input
                          value={v.icone}
                          onChange={(e) => updateValor(idx, "icone", e.target.value)}
                          placeholder="❤️"
                          className="w-16 text-center text-lg px-1"
                        />
                        {/* Nome do valor */}
                        <Input
                          value={v.valor}
                          onChange={(e) => updateValor(idx, "valor", e.target.value)}
                          placeholder="Ex: Amor, Fé, Serviço, Integridade…"
                          className="flex-1 font-medium"
                        />
                        {/* Remover */}
                        <button
                          type="button"
                          onClick={() => removeValor(idx)}
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors shrink-0"
                          aria-label="Remover valor"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                      {/* Descrição */}
                      <Input
                        value={v.descricao}
                        onChange={(e) => updateValor(idx, "descricao", e.target.value)}
                        placeholder="Descrição opcional do valor…"
                        className="text-sm text-muted-foreground"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Botão adicionar */}
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed gap-2"
              onClick={addValor}
            >
              <Plus className="w-4 h-4" /> Adicionar valor
            </Button>
          </CardContent>
        </Card>

        {/* Botão salvar fixo no fundo (mobile) */}
        <div className="sticky bottom-4 md:hidden">
          <Button className="w-full shadow-elevated" onClick={salvar} disabled={saving}>
            {saving
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : <Save className="w-4 h-4 mr-2" />}
            Salvar tudo
          </Button>
        </div>

      </div>
    </div>
  );
}
