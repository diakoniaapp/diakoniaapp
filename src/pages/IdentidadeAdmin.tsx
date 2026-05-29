import { useEffect, useState, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Church, Save, Loader2, Plus, Trash2, Heart, Info,
  Globe, Building2, Link, ExternalLink, AlertTriangle,
  CheckCircle2, Zap, Sparkles, User, X,
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
  resumo: string | null;
  pastor_id: string | null;
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
  tipo_instituicao: string;
  permite_integracao: boolean;
}

interface PessoaOption {
  id: string;
  nome_completo: string;
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

const TIPOS_INSTITUICAO: Record<string, string> = {
  denominacao:  "Denominação",
  missoes:      "Missões",
  organizacao:  "Organização",
  outro:        "Outro",
};

const plataformaLabel = (v: string) =>
  PLATAFORMAS.find((p) => p.value === v) ?? { label: v, icon: "🔗" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizarSite(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

function validarUrl(url: string): boolean {
  if (!url) return true;
  return /^https?:\/\/.+\..+/.test(url.trim());
}

/**
 * Gera um resumo institucional a partir dos dados disponíveis.
 * Ponto de integração: substitua este bloco por uma chamada real
 * à API de IA (Anthropic, OpenAI, Gemini) via Supabase Edge Function.
 */
function gerarResumoIA(params: {
  nome: string;
  missao: string;
  visao: string;
  site: string;
  denominacao: string;
  pastor: string;
  fundadaEm: string;
}): string {
  const { nome, missao, visao, site, denominacao, pastor, fundadaEm } = params;
  const ano = fundadaEm ? new Date(fundadaEm).getFullYear() : null;

  const partes: string[] = [];

  // Apresentação
  if (nome) {
    let intro = `A ${nome}`;
    if (ano) intro += `, fundada em ${ano},`;
    if (denominacao) intro += ` é uma igreja ${denominacao.toLowerCase()}`;
    else intro += " é uma comunidade cristã";
    intro += " comprometida com o crescimento espiritual e o serviço ao próximo.";
    partes.push(intro);
  }

  // Missão
  if (missao) {
    partes.push(`Sua missão: ${missao.trim().replace(/\.$/, "")}.`);
  }

  // Visão
  if (visao) {
    partes.push(`Visão: ${visao.trim().replace(/\.$/, "")}.`);
  }

  // Pastor
  if (pastor) {
    partes.push(`Sob a liderança pastoral de ${pastor}, a igreja busca impactar vidas por meio do evangelho.`);
  }

  // Site
  if (site) {
    partes.push(`Saiba mais em ${site}.`);
  }

  if (partes.length === 0) {
    return "Preencha os campos Nome, Missão e Visão para gerar um resumo automaticamente.";
  }

  return partes.join(" ");
}

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
    resumo: "",
    slug: "",
    logo_url: "",
    site_oficial: "",
  });

  // Pastor
  const [pastorId, setPastorId] = useState<string>("");
  const [pastorBusca, setPastorBusca] = useState("");
  const [pastorNome, setPastorNome] = useState("");
  const [pastorOpcoes, setPastorOpcoes] = useState<PessoaOption[]>([]);
  const [showPastorDrop, setShowPastorDrop] = useState(false);
  const pastorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pastorRef = useRef<HTMLDivElement>(null);

  // Cadastro de novo pastor
  const [showCadastrarPastor, setShowCadastrarPastor] = useState(false);
  const [novoPastorForm, setNovoPastorForm] = useState({
    nome_completo: "", telefone_celular: "", email: "", data_nascimento: "", sexo: "",
  });
  const [salvandoPastor, setSalvandoPastor] = useState(false);

  // Resumo IA
  const [gerandoResumo, setGerandoResumo] = useState(false);

  // Valores institucionais
  const [valores, setValores] = useState<ValorItem[]>([]);

  // Redes sociais
  const [redes, setRedes] = useState<RedeSocial[]>([]);

  // Instituições disponíveis + vinculadas
  const [todasInstituicoes, setTodasInstituicoes] = useState<Instituicao[]>([]);
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set());

  // Nova instituição personalizada
  const [adicionandoInst, setAdicionandoInst] = useState(false);
  const [novaInst, setNovaInst] = useState({
    nome: "", sigla: "", site_oficial: "", tipo_instituicao: "outro",
  });
  const [erroSiteInst, setErroSiteInst] = useState("");
  const [sugestoes, setSugestoes] = useState<Instituicao[]>([]);
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Guarda de acesso ──
  useEffect(() => {
    if (!hasRole(["admin", "secretaria"])) navigate("/", { replace: true });
  }, []);

  // ── Fechar dropdown pastor ao clicar fora ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pastorRef.current && !pastorRef.current.contains(e.target as Node)) {
        setShowPastorDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Carga ──
  const load = async () => {
    setLoading(true);

    const [{ data: id }, { data: insts }] = await Promise.all([
      supabase.from("identidade_igreja").select("*").eq("ativa", true).maybeSingle(),
      supabase
        .from("instituicoes")
        .select("*")
        .eq("ativo", true)
        .order("oficial", { ascending: false })
        .order("nome"),
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
        resumo:       ident.resumo        ?? "",
        slug:         ident.slug          ?? "",
        logo_url:     ident.logo_url      ?? "",
        site_oficial: ident.site_oficial  ?? "",
      });
      setRedes(
        Array.isArray(ident.redes_sociais)
          ? ident.redes_sociais.map((r: any) => ({ plataforma: r.plataforma, url: r.url }))
          : []
      );

      // Pastor
      if (ident.pastor_id) {
        setPastorId(ident.pastor_id);
        const { data: p } = await supabase
          .from("membros")
          .select("id, nome_completo")
          .eq("id", ident.pastor_id)
          .maybeSingle();
        if (p) { setPastorNome((p as any).nome_completo); setPastorBusca((p as any).nome_completo); }
      }

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

  // ── Pastor autocomplete ──
  const buscarPastor = (q: string) => {
    setPastorBusca(q);
    setPastorId("");
    setPastorNome("");
    if (pastorDebounce.current) clearTimeout(pastorDebounce.current);
    if (!q.trim()) { setPastorOpcoes([]); setShowPastorDrop(false); return; }
    pastorDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from("membros")
        .select("id, nome_completo")
        .eq("tipo_pessoa", "membro")
        .ilike("nome_completo", `%${q}%`)
        .order("nome_completo")
        .limit(8);
      setPastorOpcoes((data ?? []) as PessoaOption[]);
      setShowPastorDrop(true);
    }, 350);
  };

  const selecionarPastor = (p: PessoaOption) => {
    setPastorId(p.id);
    setPastorNome(p.nome_completo);
    setPastorBusca(p.nome_completo);
    setPastorOpcoes([]);
    setShowPastorDrop(false);
  };

  // ── Cadastrar novo membro como pastor ──
  const cadastrarNovoPastor = async () => {
    if (!novoPastorForm.nome_completo.trim()) { toast.error("Nome é obrigatório"); return; }
    setSalvandoPastor(true);
    const { data, error } = await supabase
      .from("membros")
      .insert({
        nome_completo:    novoPastorForm.nome_completo.trim(),
        telefone_celular: novoPastorForm.telefone_celular.trim() || null,
        email:            novoPastorForm.email.trim() || null,
        data_nascimento:  novoPastorForm.data_nascimento || null,
        sexo:             (novoPastorForm.sexo as any) || null,
        tipo_pessoa:      "membro",
        perfil_acesso:    "pastor",
      } as any)
      .select("id, nome_completo")
      .single();
    setSalvandoPastor(false);
    if (error) { toast.error("Erro ao cadastrar pastor: " + error.message); return; }
    const p = data as any;
    setPastorId(p.id);
    setPastorNome(p.nome_completo);
    setPastorBusca(p.nome_completo);
    setShowCadastrarPastor(false);
    setNovoPastorForm({ nome_completo: "", telefone_celular: "", email: "", data_nascimento: "", sexo: "" });
    toast.success(`${p.nome_completo.split(" ")[0]} cadastrado(a) como pastor(a)!`);
  };

  // ── Gerar resumo com IA (template inteligente) ──
  const gerarResumo = async () => {
    setGerandoResumo(true);

    // Buscar denominação vinculada (se houver)
    let denominacao = "";
    if (vinculadas.size > 0) {
      const firstId = Array.from(vinculadas)[0];
      const inst = todasInstituicoes.find((i) => i.id === firstId);
      if (inst) denominacao = inst.nome;
    }

    // Simula delay de processamento (substituir por chamada real à API de IA)
    await new Promise((r) => setTimeout(r, 1200));

    const texto = gerarResumoIA({
      nome:        form.nome_igreja,
      missao:      form.missao,
      visao:       form.visao,
      site:        form.site_oficial,
      denominacao,
      pastor:      pastorNome,
      fundadaEm:   form.fundada_em,
    });

    setForm((p) => ({ ...p, resumo: texto }));
    setGerandoResumo(false);
    toast.success("Resumo gerado! Você pode editar antes de salvar.");
  };

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
  const addRede = () => setRedes((p) => [...p, { plataforma: "instagram", url: "" }]);
  const updateRede = (idx: number, field: keyof RedeSocial, value: string) =>
    setRedes((p) => p.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const removeRede = (idx: number) => setRedes((p) => p.filter((_, i) => i !== idx));

  // ── Instituições ──
  const toggleInst = (id: string) =>
    setVinculadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const buscarSugestoes = (nome: string, site: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!nome.trim() && !site.trim()) { setSugestoes([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscandoSugestoes(true);
      const { data } = await supabase.rpc("buscar_instituicao_similar", {
        p_nome: nome.trim() || null,
        p_site: site.trim() ? normalizarSite(site) : null,
      });
      setSugestoes((data ?? []) as Instituicao[]);
      setBuscandoSugestoes(false);
    }, 450);
  };

  const handleNovaInstNome = (v: string) => {
    setNovaInst((p) => ({ ...p, nome: v }));
    buscarSugestoes(v, novaInst.site_oficial);
  };

  const handleNovaInstSite = (v: string) => {
    setNovaInst((p) => ({ ...p, site_oficial: v }));
    setErroSiteInst("");
    buscarSugestoes(novaInst.nome, v);
  };

  const selecionarSugestao = (inst: Instituicao) => {
    setVinculadas((prev) => new Set([...prev, inst.id]));
    setAdicionandoInst(false);
    setNovaInst({ nome: "", sigla: "", site_oficial: "", tipo_instituicao: "outro" });
    setSugestoes([]);
    toast.success(`"${inst.nome}" vinculada à igreja.`);
  };

  const criarInstPersonalizada = async () => {
    if (!novaInst.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (novaInst.site_oficial.trim() && !validarUrl(novaInst.site_oficial)) {
      setErroSiteInst("Informe um site válido. Exemplo: https://exemplo.com");
      return;
    }
    const siteNorm = novaInst.site_oficial.trim() ? normalizarSite(novaInst.site_oficial) : null;
    const { data, error } = await supabase
      .from("instituicoes")
      .insert({
        nome: novaInst.nome.trim(), sigla: novaInst.sigla.trim() || null,
        site_oficial: siteNorm, tipo_instituicao: novaInst.tipo_instituicao,
        permite_integracao: false, oficial: false, ativo: true,
      })
      .select("id").single();
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma instituição com esse site." : error.message);
      return;
    }
    await load();
    setVinculadas((prev) => new Set([...prev, (data as any).id]));
    setNovaInst({ nome: "", sigla: "", site_oficial: "", tipo_instituicao: "outro" });
    setSugestoes([]);
    setAdicionandoInst(false);
    toast.success("Instituição adicionada e vinculada.");
  };

  // ── Salvar tudo ──
  const salvar = async () => {
    if (!form.nome_igreja.trim()) { toast.error("Nome da igreja é obrigatório"); return; }
    setSaving(true);

    const redesAtivas = redes.filter((r) => !r._delete && r.url.trim());
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    payload.redes_sociais = redesAtivas.map(({ plataforma, url }) => ({ plataforma, url }));
    payload.pastor_id = pastorId || null;

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
      if (v._delete && v.id) { await supabase.from("identidade_valores").delete().eq("id", v.id); continue; }
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

    // Vínculos institucionais
    const { data: atuais } = await supabase.from("igreja_instituicoes").select("instituicao_id").eq("igreja_id", igrejId);
    const atuaisSet = new Set((atuais ?? []).map((a: any) => a.instituicao_id));
    for (const id of vinculadas) {
      if (!atuaisSet.has(id))
        await supabase.from("igreja_instituicoes").insert({ igreja_id: igrejId, instituicao_id: id });
    }
    for (const id of atuaisSet) {
      if (!vinculadas.has(id))
        await supabase.from("igreja_instituicoes").delete().eq("igreja_id", igrejId).eq("instituicao_id", id);
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

  const instOficiais   = todasInstituicoes.filter((i) => i.oficial);
  const instPersonaliz = todasInstituicoes.filter((i) => !i.oficial);
  const isAdmin        = hasRole(["admin"]);

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

        {/* ── 1. Dados Institucionais ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Church className="w-4 h-4 text-gold" /> Dados Institucionais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Nome */}
            <div>
              <Label>Nome da Igreja *</Label>
              <Input value={form.nome_igreja}
                onChange={(e) => setForm({ ...form, nome_igreja: e.target.value })}
                placeholder="Ex: Quarta Igreja Batista do Rio de Janeiro" />
            </div>

            {/* CNPJ + Fundada em */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <Label>Fundada em</Label>
                <Input type="date" value={form.fundada_em}
                  onChange={(e) => setForm({ ...form, fundada_em: e.target.value })} />
              </div>
            </div>

            {/* Missão */}
            <div>
              <Label>Missão</Label>
              <Textarea rows={3} value={form.missao}
                onChange={(e) => setForm({ ...form, missao: e.target.value })}
                placeholder="A missão da nossa igreja é…" className="resize-none" />
            </div>

            {/* Visão */}
            <div>
              <Label>Visão</Label>
              <Textarea rows={3} value={form.visao}
                onChange={(e) => setForm({ ...form, visao: e.target.value })}
                placeholder="Nossa visão é ser uma igreja que…" className="resize-none" />
            </div>
          </CardContent>
        </Card>

        {/* ── 2. Valores Institucionais ── */}
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
                Princípios fundamentais da igreja. Use emoji no campo de ícone para identificar visualmente.
              </p>
            </div>

            {valores.filter((v) => !v._delete).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum valor cadastrado ainda.</p>
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

        {/* ── 3. Resumo da Igreja ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Sparkles className="w-4 h-4 text-gold" /> Resumo da Igreja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Apresentação institucional da igreja usada em relatórios e comunicações.
                Gere automaticamente a partir dos dados cadastrados ou escreva manualmente.
              </p>
            </div>

            <Textarea
              rows={5}
              value={form.resumo}
              onChange={(e) => setForm({ ...form, resumo: e.target.value })}
              placeholder="Breve apresentação da igreja, missão, atuação e contexto…"
              className="resize-none"
            />

            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-gold/40 text-gold hover:bg-gold/5 hover:border-gold"
                onClick={gerarResumo}
                disabled={gerandoResumo}
              >
                {gerandoResumo
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando resumo…</>
                  : <><Sparkles className="w-4 h-4" /> Gerar resumo automaticamente</>
                }
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── 4. Pastor Titular ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <User className="w-4 h-4 text-gold" /> Pastor Titular
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* Pastor já vinculado */}
            {pastorId && (
              <div className="flex items-center gap-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pastorNome}</p>
                  <p className="text-xs text-muted-foreground">Vinculado ao cadastro de membros</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 shrink-0"
                  onClick={() => { setPastorId(""); setPastorNome(""); setPastorBusca(""); }}
                >
                  Alterar
                </button>
              </div>
            )}

            {/* Seleção / busca de pastor existente */}
            {!pastorId && !showCadastrarPastor && (
              <div ref={pastorRef} className="relative space-y-2">
                <Label>Selecionar membro existente</Label>
                <div className="relative">
                  <Input
                    value={pastorBusca}
                    onChange={(e) => buscarPastor(e.target.value)}
                    onFocus={() => pastorBusca && setShowPastorDrop(true)}
                    placeholder="Digite o nome para buscar…"
                  />
                </div>
                {showPastorDrop && pastorOpcoes.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border bg-background shadow-elevated">
                    {pastorOpcoes.map((p) => (
                      <button
                        key={p.id} type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors text-sm"
                        onMouseDown={(e) => { e.preventDefault(); selecionarPastor(p); }}
                      >
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {p.nome_completo}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Não encontrou?</span>
                  <button
                    type="button"
                    className="text-xs text-primary underline underline-offset-2"
                    onClick={() => { setShowCadastrarPastor(true); setPastorBusca(""); }}
                  >
                    + Cadastrar novo membro como pastor
                  </button>
                </div>
              </div>
            )}

            {/* Formulário de novo pastor */}
            {showCadastrarPastor && (
              <div className="rounded-md border border-dashed p-4 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Cadastrar novo pastor</p>
                  <button type="button" onClick={() => setShowCadastrarPastor(false)}
                    className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Nome completo *</Label>
                    <Input placeholder="Nome completo" autoFocus
                      value={novoPastorForm.nome_completo}
                      onChange={(e) => setNovoPastorForm(p => ({ ...p, nome_completo: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input type="tel" placeholder="(11) 99999-9999"
                        value={novoPastorForm.telefone_celular}
                        onChange={(e) => setNovoPastorForm(p => ({ ...p, telefone_celular: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" placeholder="pastor@email.com"
                        value={novoPastorForm.email}
                        onChange={(e) => setNovoPastorForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Data de nascimento</Label>
                      <Input type="date"
                        value={novoPastorForm.data_nascimento}
                        onChange={(e) => setNovoPastorForm(p => ({ ...p, data_nascimento: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Sexo</Label>
                      <Select value={novoPastorForm.sexo} onValueChange={(v) => setNovoPastorForm(p => ({ ...p, sexo: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculino</SelectItem>
                          <SelectItem value="F">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1"
                    onClick={() => { setShowCadastrarPastor(false); setNovoPastorForm({ nome_completo: "", telefone_celular: "", email: "", data_nascimento: "", sexo: "" }); }}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" className="flex-1 gap-1.5" onClick={cadastrarNovoPastor} disabled={salvandoPastor}>
                    {salvandoPastor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {salvandoPastor ? "Salvando…" : "Cadastrar e vincular"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── 5. Identidade Digital ── */}
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
                Canais oficiais da igreja usados em relatórios e comunicados.
              </p>
            </div>

            {/* Slug + Logo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Slug (URL amigável)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="minha-igreja" />
              </div>
              <div>
                <Label>URL do Logo</Label>
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
              </div>
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
                      <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATAFORMAS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input className="flex-1" value={r.url}
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
              <Button type="button" variant="outline" className="w-full border-dashed gap-2 mt-2" onClick={addRede}>
                <Plus className="w-4 h-4" /> Adicionar rede social
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── 6. Vínculos Institucionais ── */}
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
                Convenções, juntas e entidades às quais a igreja é filiada.
                Instituições com <Zap className="inline w-3 h-3 text-amber-500" /> permitem integração futura com agenda.
              </p>
            </div>

            {instOficiais.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Oficiais</p>
                {instOficiais.map((inst) => (
                  <label key={inst.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox checked={vinculadas.has(inst.id)} onCheckedChange={() => toggleInst(inst.id)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium leading-tight">{inst.nome}</p>
                        {inst.sigla && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{inst.sigla}</span>}
                        {inst.permite_integracao && <Zap className="w-3 h-3 text-amber-500" title="Permite integração com agenda" />}
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {TIPOS_INSTITUICAO[inst.tipo_instituicao] ?? inst.tipo_instituicao}
                        </Badge>
                      </div>
                      {inst.site_oficial && (
                        <a href={inst.site_oficial} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
                          onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="w-3 h-3" /> Visitar site
                        </a>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {instPersonaliz.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Personalizadas</p>
                {instPersonaliz.map((inst) => (
                  <label key={inst.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                    <Checkbox checked={vinculadas.has(inst.id)} onCheckedChange={() => toggleInst(inst.id)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium leading-tight">{inst.nome}</p>
                        {inst.sigla && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{inst.sigla}</span>}
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                          {TIPOS_INSTITUICAO[inst.tipo_instituicao] ?? inst.tipo_instituicao}
                        </Badge>
                      </div>
                      {inst.site_oficial && (
                        <a href={inst.site_oficial} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
                          onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="w-3 h-3" /> Visitar site
                        </a>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {isAdmin && (
              adicionandoInst ? (
                <div className="rounded-md border p-4 space-y-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nova instituição personalizada</p>

                  {sugestoes.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" /> Encontramos instituições similares:
                      </div>
                      {sugestoes.map((s) => (
                        <button key={s.id} type="button" onClick={() => selecionarSugestao(s)}
                          className="w-full flex items-center gap-2 text-left rounded-md border bg-background px-3 py-2 hover:bg-muted/60 transition-colors">
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{s.nome}</p>
                            {s.site_oficial && <p className="text-[11px] text-muted-foreground truncate">{s.site_oficial}</p>}
                          </div>
                        </button>
                      ))}
                      <p className="text-[11px] text-muted-foreground">Ou continue abaixo para criar uma nova.</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Nome da instituição *</Label>
                    <Input value={novaInst.nome} onChange={(e) => handleNovaInstNome(e.target.value)}
                      placeholder="Ex: Convenção Batista Brasileira" className="mt-1" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Sigla</Label>
                      <Input value={novaInst.sigla} onChange={(e) => setNovaInst((p) => ({ ...p, sigla: e.target.value }))}
                        placeholder="Ex: CBB" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={novaInst.tipo_instituicao} onValueChange={(v) => setNovaInst((p) => ({ ...p, tipo_instituicao: v }))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPOS_INSTITUICAO).map(([val, lbl]) => (
                            <SelectItem key={val} value={val}>{lbl}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Site oficial (recomendado)</Label>
                    <Input value={novaInst.site_oficial} onChange={(e) => handleNovaInstSite(e.target.value)}
                      placeholder="https://convencaobatista.com.br"
                      className={`mt-1 ${erroSiteInst ? "border-destructive" : ""}`} />
                    {erroSiteInst && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {erroSiteInst}
                      </p>
                    )}
                    {buscandoSugestoes && (
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Verificando duplicidade…
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={criarInstPersonalizada} disabled={!novaInst.nome.trim()}>Adicionar</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setAdicionandoInst(false);
                      setNovaInst({ nome: "", sigla: "", site_oficial: "", tipo_instituicao: "outro" });
                      setSugestoes([]);
                      setErroSiteInst("");
                    }}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full border-dashed gap-2"
                  onClick={() => setAdicionandoInst(true)}>
                  <Plus className="w-4 h-4" /> Adicionar instituição personalizada
                </Button>
              )
            )}
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
