import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Church, Save, Loader2, Plus, Trash2, Heart, Info,
  Globe, Building2, Link,
} from "lucide-react";
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
  site_oficial: string | null;
  redes_sociais: RedeSocial[];
  ativa: boolean;
}

interface ValorItem {
  id?: string;
  valor: string;
  descricao: string;
  icone: string;
  ordem: number;
  _delete?: boolean;
}

interface RedeSocial {
  plataforma: string;
  url: string;
  _delete?: boolean;
}

interface Instituicao {
  id: string;
  nome: string;
  sigla: string | null;
  site_oficial: string | null;
  oficial: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLATAFORMAS = [
  { value: "instagram",  label: "Instagram",  icon: "📷" },
  { value: "facebook",   label: "Facebook",   icon: "👥" },
  { value: "youtube",    label: "YouTube",    icon: "📺" },
  { value: "tiktok",     label: "TikTok",     icon: "🎵" },
  { value: "whatsapp",   label: "WhatsApp",   icon: "💬" },
  { value: "telegram",   label: "Telegram",   icon: "✈️" },
  { value: "spotify",    label: "Spotify",    icon: "🎧" },
  { value: "outro",      label: "Outro",      icon: "🔗" },
];

const plataformaLabel = (v: string) =>
  PLATAFORMAS.find((p) => p.value === v) ?? { label: v, icon: "🔗" };

// ─── Componente ───────────────────────────────────────────────────────────────

export default function IdentidadeAdmin() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formulário principal
  const [form, setForm] = useState({
    nome_igreja: "",
    cnpj: "",
    missao: "",
    visao: "",
    fundada_em: "",
    slug: "",
    logo_url: "",
    site_oficial: "",
  });

  // Valores institucionais
  const [valores, setValores] = useState<ValorItem[]>([]);

  // Redes sociais
  const [redes, setRedes] = useState<RedeSocial[]>([]);

  // Instituições disponíveis + vinculadas
  const [todasInstituicoes, setTodasInstituicoes] = useState<Instituicao[]>([]);
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set());
  const [novaInst, setNovaInst] = useState({ nome: "", sigla: "" });
  const [adicionandoInst, setAdicionandoInst] = useState(false);

  // ── Guarda de acesso ──
  useEffect(() => {
    if (!hasRole(["admin", "secretaria"])) navigate("/", { replace: true });
  }, []);

  // ── Carga ──
  const load = async () => {
    setLoading(true);

    const [{ data: id }, { data: insts }] = await Promise.all([
      supabase.from("identidade_igreja").select("*").eq("ativa", true).maybeSingle(),
      supabase.from("instituicoes").select("*").eq("ativo", true).order("oficial", { ascending: false }).order("nome"),
    ]);

    setTodasInstituicoes((insts ?? []) as Instituicao[]);

    if (id) {
      const ident = id as any;
      setIdentidade(ident);
      setForm({
        nome_igreja:  ident.nome_igreja   ?? "",
        cnpj:         ident.cnpj          ?? "",
        missao:       ident.missao        ?? "",
        visao:        ident.visao         ?? "",
        fundada_em:   ident.fundada_em    ?? "",
        slug:         ident.slug          ?? "",
        logo_url:     ident.logo_url      ?? "",
        site_oficial: ident.site_oficial  ?? "",
      });
      setRedes(
        Array.isArray(ident.redes_sociais)
          ? ident.redes_sociais.map((r: any) => ({ plataforma: r.plataforma, url: r.url }))
          : []
      );

      // Valores
      const { data: vals } = await supabase
        .from("identidade_valores")
        .select("*")
        .eq("igreja_id", ident.id)
        .order("ordem");
      setValores(
        ((vals ?? []) as any[]).map((v) => ({
          id: v.id, valor: v.valor ?? "", descricao: v.descricao ?? "",
          icone: v.icone ?? "", ordem: v.ordem ?? 0,
        }))
      );

      // Vínculos institucionais
      const { data: vins } = await supabase
        .from("igreja_instituicoes")
        .select("instituicao_id")
        .eq("igreja_id", ident.id);
      setVinculadas(new Set((vins ?? []).map((v: any) => v.instituicao_id)));
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Valores ──
  const addValor = () =>
    setValores((p) => [...p, { valor: "", descricao: "", icone: "", ordem: p.length }]);

  const updateValor = (idx: number, field: keyof ValorItem, value: string) =>
    setValores((p) => p.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));

  const removeValor = (idx: number) =>
    setValores((p) =>
      p.map((v, i) => (i !== idx ? v : v.id ? { ...v, _delete: true } : null!)).filter(Boolean)
    );

  // ── Redes sociais ──
  const addRede = () =>
    setRedes((p) => [...p, { plataforma: "instagram", url: "" }]);

  const updateRede = (idx: number, field: keyof RedeSocial, value: string) =>
    setRedes((p) => p.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const removeRede = (idx: number) =>
    setRedes((p) => p.filter((_, i) => i !== idx));

  // ── Instituições ──
  const toggleInst = (id: string) =>
    setVinculadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const criarInstPersonalizada = async () => {
    if (!novaInst.nome.trim()) return;
    const { data, error } = await supabase
      .from("instituicoes")
      .insert({ nome: novaInst.nome.trim(), sigla: novaInst.sigla.trim() || null, oficial: false, ativo: true })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    await load();
    setVinculadas((prev) => new Set([...prev, (data as any).id]));
    setNovaInst({ nome: "", sigla: "" });
    setAdicionandoInst(false);
    toast.success("Instituição adicionada");
  };

  // ── Salvar tudo ──
  const salvar = async () => {
    if (!form.nome_igreja.trim()) { toast.error("Nome da igreja é obrigatório"); return; }
    setSaving(true);

    const redesAtivas = redes.filter((r) => !r._delete && r.url.trim());
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    payload.redes_sociais = redesAtivas.map(({ plataforma, url }) => ({ plataforma, url }));

    let igrejId = identidade?.id ?? null;

    if (igrejId) {
      const { error } = await supabase.from("identidade_igreja").update(payload).eq("id", igrejId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase
        .from("identidade_igreja")
        .insert({ ...payload, ativa: true })
        .select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      igrejId = (data as any).id;
    }

    // Valores
    for (const v of valores) {
      if (v._delete && v.id) {
        await supabase.from("identidade_valores").delete().eq("id", v.id);
        continue;
      }
      if (v._delete || !v.valor.trim()) continue;
      if (v.id) {
        await supabase.from("identidade_valores")
          .update({ valor: v.valor.trim(), descricao: v.descricao.trim() || null, icone: v.icone.trim() || null, ordem: v.ordem })
          .eq("id", v.id);
      } else {
        await supabase.from("identidade_valores")
          .insert({ igreja_id: igrejId, valor: v.valor.trim(), descricao: v.descricao.trim() || null, icone: v.icone.trim() || null, ordem: v.ordem, ativo: true });
      }
    }

    // Instituições: recalcular vínculos
    const { data: atuais } = await supabase
      .from("igreja_instituicoes").select("instituicao_id").eq("igreja_id", igrejId);
    const atuaisSet = new Set((atuais ?? []).map((a: any) => a.instituicao_id));

    // Inserir novos
    for (const id of vinculadas) {
      if (!atuaisSet.has(id)) {
        await supabase.from("igreja_instituicoes").insert({ igreja_id: igrejId, instituicao_id: id });
      }
    }
    // Remover desmarcados
    for (const id of atuaisSet) {
      if (!vinculadas.has(id)) {
        await supabase.from("igreja_instituicoes")
          .delete().eq("igreja_id", igrejId).eq("instituicao_id", id);
      }
    }

    setSaving(false);
    toast.success("Identidade salva com sucesso!");
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

  return (
    <div>
      <PageHeader
        title="Identidade da Igreja"
        description="Dados institucionais, digital e vínculos denominacionais"
        actions={
          <Button onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar tudo
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6 max-w-2xl">

        {/* ── 1. Dados da Igreja ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Church className="w-4 h-4 text-gold" /> Dados da Igreja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da Igreja *</Label>
              <Input value={form.nome_igreja} onChange={(e) => setForm({ ...form, nome_igreja: e.target.value })}
                placeholder="Ex: QIBRJ — Quadrangular Ibirapuera" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <Label>Fundada em</Label>
                <Input type="date" value={form.fundada_em} onChange={(e) => setForm({ ...form, fundada_em: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Missão</Label>
              <Textarea rows={3} value={form.missao}
                onChange={(e) => setForm({ ...form, missao: e.target.value })}
                placeholder="A missão da nossa igreja é…" className="resize-none" />
            </div>
            <div>
              <Label>Visão</Label>
              <Textarea rows={3} value={form.visao}
                onChange={(e) => setForm({ ...form, visao: e.target.value })}
                placeholder="Nossa visão é ser uma igreja que…" className="resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Slug (URL amigável)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="qibrj" />
              </div>
              <div>
                <Label>URL do Logo</Label>
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 2. Identidade Digital ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Globe className="w-4 h-4 text-gold" /> Identidade Digital
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Centralize aqui os canais oficiais da igreja. Essas informações serão
                usadas em relatórios, comunicados e no futuro portal da congregação.
              </p>
            </div>

            {/* Site oficial */}
            <div>
              <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Site Oficial</Label>
              <Input value={form.site_oficial}
                onChange={(e) => setForm({ ...form, site_oficial: e.target.value })}
                placeholder="https://www.suaigreja.com.br" />
            </div>

            {/* Redes sociais */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2"><Link className="w-3.5 h-3.5" /> Redes Sociais</Label>

              {redes.length === 0 && (
                <p className="text-xs text-muted-foreground mb-2">Nenhuma rede social cadastrada.</p>
              )}

              <div className="space-y-2">
                {redes.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={r.plataforma} onValueChange={(v) => updateRede(idx, "plataforma", v)}>
                      <SelectTrigger className="w-36 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATAFORMAS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.icon} {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={r.url}
                      onChange={(e) => updateRede(idx, "url", e.target.value)}
                      placeholder={`URL ou @usuário do ${plataformaLabel(r.plataforma).label}`}
                    />
                    <button type="button" onClick={() => removeRede(idx)}
                      className="w-8 h-8 flex items-center justify-center rounded hover:bg-destructive/10 shrink-0">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" className="w-full border-dashed gap-2 mt-2"
                onClick={addRede}>
                <Plus className="w-4 h-4" /> Adicionar rede social
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── 3. Vínculos Institucionais ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Building2 className="w-4 h-4 text-gold" /> Vínculos Institucionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Marque as convenções, juntas e entidades às quais a igreja é filiada.
                Esses vínculos serão exibidos em relatórios e utilizados na integração
                com agendas e missões.
              </p>
            </div>

            {/* Instituições oficiais */}
            <div className="space-y-2">
              {todasInstituicoes.filter((i) => i.oficial).map((inst) => (
                <label
                  key={inst.id}
                  className="flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={vinculadas.has(inst.id)}
                    onCheckedChange={() => toggleInst(inst.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{inst.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {inst.sigla && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{inst.sigla}</span>
                      )}
                      {inst.site_oficial && (
                        <a href={inst.site_oficial} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}>
                          {inst.site_oficial.replace("https://", "")}
                        </a>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Instituições personalizadas */}
            {todasInstituicoes.filter((i) => !i.oficial).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personalizadas</p>
                {todasInstituicoes.filter((i) => !i.oficial).map((inst) => (
                  <label key={inst.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox
                      checked={vinculadas.has(inst.id)}
                      onCheckedChange={() => toggleInst(inst.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{inst.nome}</p>
                      {inst.sigla && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{inst.sigla}</span>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Adicionar instituição personalizada */}
            {adicionandoInst ? (
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Nova instituição personalizada</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input value={novaInst.nome}
                      onChange={(e) => setNovaInst({ ...novaInst, nome: e.target.value })}
                      placeholder="Nome da instituição" />
                  </div>
                  <Input value={novaInst.sigla}
                    onChange={(e) => setNovaInst({ ...novaInst, sigla: e.target.value })}
                    placeholder="Sigla" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={criarInstPersonalizada} disabled={!novaInst.nome.trim()}>
                    Adicionar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAdicionandoInst(false); setNovaInst({ nome: "", sigla: "" }); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full border-dashed gap-2"
                onClick={() => setAdicionandoInst(true)}>
                <Plus className="w-4 h-4" /> Adicionar instituição personalizada
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── 4. Valores Institucionais ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Heart className="w-4 h-4 text-gold" /> Valores Institucionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Os valores representam os princípios fundamentais da igreja e podem ser
                adicionados, editados ou removidos livremente. Use o campo de ícone (emoji)
                para identificar visualmente cada valor.
              </p>
            </div>

            {valores.filter((v) => !v._delete).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                Nenhum valor cadastrado ainda.
              </p>
            ) : (
              <div className="space-y-3">
                {valores.map((v, idx) => {
                  if (v._delete) return null;
                  return (
                    <div key={idx} className="rounded-lg border bg-background p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={v.icone} onChange={(e) => updateValor(idx, "icone", e.target.value)}
                          placeholder="❤️" className="w-16 text-center text-lg px-1" />
                        <Input value={v.valor} onChange={(e) => updateValor(idx, "valor", e.target.value)}
                          placeholder="Ex: Amor, Fé, Integridade…" className="flex-1 font-medium" />
                        <button type="button" onClick={() => removeValor(idx)}
                          className="w-8 h-8 flex items-center justify-center rounded hover:bg-destructive/10 shrink-0">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                      <Input value={v.descricao} onChange={(e) => updateValor(idx, "descricao", e.target.value)}
                        placeholder="Descrição opcional…" className="text-sm text-muted-foreground" />
                    </div>
                  );
                })}
              </div>
            )}

            <Button type="button" variant="outline" className="w-full border-dashed gap-2" onClick={addValor}>
              <Plus className="w-4 h-4" /> Adicionar valor
            </Button>
          </CardContent>
        </Card>

        {/* Botão sticky mobile */}
        <div className="sticky bottom-4 md:hidden">
          <Button className="w-full shadow-elevated" onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar tudo
          </Button>
        </div>

      </div>
    </div>
  );
}
