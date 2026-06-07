import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  FileText, Plus, Pencil, CheckCircle2, Clock, Loader2, Upload, X, FileCheck2,
  BookOpen, ChevronDown, ChevronUp, Trash2, Network, Info, History, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import SyncEstruturaModal from "@/components/documentos/SyncEstruturaModal";
import {
  ingerirDocumento, validarArquivo, formatarTamanho,
  type ProgressoIngestao,
} from "@/services/documentoIngestaoService";
type TipoDoc = "estatuto" | "regimento" | "manual" | "ata" | "circular" | "outro";

interface Documento {
  id: string;
  tipo: TipoDoc;
  titulo: string;
  conteudo: string;
  versao: string;
  vigente: boolean;
  aprovado_em: string | null;
  aprovado_por: string | null;
  arquivo_url: string | null;
  created_at: string;
}

interface Secao {
  id: string;
  documento_id: string;
  titulo: string;
  conteudo: string;
  tipo_secao: string | null;
  ministerio_ref: string | null;
  palavras_chave: string[];
  tags_conceituais: string[];   // ← Camada 1: conexão semântica com Identidade
  nivel_hierarquico: number | null;
  ordem: number;
}

// Tags conceituais pré-definidas (conectam Documentos → Identidade → Campanhas)
const TAGS_CONCEITUAIS = [
  { value: "missao",       label: "Missão",       color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "visao",        label: "Visão",        color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "valores",      label: "Valores",      color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "doutrina",     label: "Doutrina",     color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { value: "liderança",    label: "Liderança",    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "oração",       label: "Oração",       color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  { value: "discipulado",  label: "Discipulado",  color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  { value: "evangelismo",  label: "Evangelismo",  color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { value: "adoração",     label: "Adoração",     color: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "família",      label: "Família",      color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "ministério",   label: "Ministério",   color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { value: "outro",        label: "Outro",        color: "bg-muted text-muted-foreground" },
];

interface HistoricoItem {
  id: string;
  acao: string;
  usuario_email: string | null;
  versao_de: string | null;
  versao_para: string | null;
  titulo_doc: string | null;
  observacao: string | null;
  created_at: string;
}

const TIPOS: { value: TipoDoc; label: string; color: string }[] = [
  { value: "estatuto",   label: "Estatuto",    color: "bg-purple-500/10 text-purple-700 border-purple-500/30" },
  { value: "regimento",  label: "Regimento",   color: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  { value: "manual",     label: "Manual",      color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  { value: "ata",        label: "Ata",         color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  { value: "circular",   label: "Circular",    color: "bg-sky-500/10 text-sky-700 border-sky-500/30" },
  { value: "outro",      label: "Outro",       color: "bg-muted text-muted-foreground" },
];

const tipoMeta = (tipo: TipoDoc) => TIPOS.find(t => t.value === tipo) ?? TIPOS[5];

const TIPOS_SECAO = [
  { value: "ministerio",  label: "Ministério" },
  { value: "diretoria",   label: "Diretoria" },
  { value: "conselho",    label: "Conselho" },
  { value: "assembleia",  label: "Assembleia" },
  { value: "geral",       label: "Geral" },
  { value: "outro",       label: "Outro" },
];

// ── Estrutura Derivada ─────────────────────────────────────────
interface EstruturaItem {
  id: string;
  tipo: string;
  nome: string;
  descricao: string | null;
  responsabilidades: string | null;
  base_institucional: string | null;
  referencia_documento: string | null;
  nivel: string;
  ordem: number;
  ativo: boolean;
}

const TIPOS_ESTRUTURA = [
  { value: "ministerio", label: "Ministério",  icon: "⛪" },
  { value: "area",       label: "Área",        icon: "📂" },
  { value: "diretoria",  label: "Diretoria",   icon: "👔" },
  { value: "conselho",   label: "Conselho",    icon: "🤝" },
  { value: "cargo",      label: "Cargo",       icon: "🏅" },
  { value: "regra",      label: "Regra",       icon: "📋" },
  { value: "outro",      label: "Outro",       icon: "🔖" },
];

const NIVEIS_ESTRUTURA = [
  { value: "institucional", label: "Institucional" },
  { value: "ministerial",   label: "Ministerial" },
  { value: "area",          label: "Área" },
];

const ACAO_LABELS: Record<string, string> = {
  criado:          "Criado",
  atualizado:      "Atualizado",
  substituido:     "Substituído",
  marcado_vigente: "Marcado como Vigente",
  desativado:      "Desativado",
};

export default function DocumentosAdmin() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<TipoDoc | "todos">("todos");

  // Dialog documento
  const [docOpen, setDocOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const emptyDoc = { tipo: "outro" as TipoDoc, titulo: "", conteudo: "", versao: "1.0", vigente: false, aprovado_em: "", aprovado_por: "", arquivo_url: "" };
  const [formDoc, setFormDoc] = useState<any>(emptyDoc);
const [arquivo, setArquivo] = useState<File | null>(null);
const [uploadProgresso, setUploadProgresso] = useState<ProgressoIngestao | null>(null);
const [uploadando, setUploadando] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);

  // Aba ativa (documentos | estrutura)
  const [abaAtiva, setAbaAtiva] = useState<"documentos" | "estrutura">("documentos");

  // Estrutura derivada
  const [estruturas, setEstruturas] = useState<EstruturaItem[]>([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [estOpen, setEstOpen] = useState(false);
  const [editingEstId, setEditingEstId] = useState<string | null>(null);
  const emptyEst = {
    tipo: "ministerio", nome: "", descricao: "", responsabilidades: "",
    base_institucional: "", referencia_documento: "", nivel: "ministerial", ordem: 0,
  };
  const [formEst, setFormEst] = useState<any>(emptyEst);
  const [savingEst, setSavingEst] = useState(false);
  const [filtroTipoEst, setFiltroTipoEst] = useState<string>("todos");
  const [syncOpen, setSyncOpen] = useState(false);

  // Painel de seções
  const [secaoDocId, setSecaoDocId] = useState<string | null>(null);
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [loadingSecoes, setLoadingSecoes] = useState(false);
  const [secaoOpen, setSecaoOpen] = useState(false);
  const [editingSecaoId, setEditingSecaoId] = useState<string | null>(null);
  const emptySecao = { titulo: "", conteudo: "", tipo_secao: "geral", ministerio_ref: "", palavras_chave: "", tags_conceituais: [] as string[], nivel_hierarquico: "", ordem: 0 };
  const [formSecao, setFormSecao] = useState<any>(emptySecao);

  // Histórico de documento
  const [histDoc, setHistDoc] = useState<Documento | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    if (!hasRole(["admin", "secretaria"])) navigate("/", { replace: true });
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("documentos")
      .select("*")
      .order("tipo")
      .order("titulo");
    if (error) toast.error(error.message);
    setDocs((data ?? []) as Documento[]);
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, []);
  useEffect(() => { if (abaAtiva === "estrutura") loadEstruturas(); }, [abaAtiva]);

  const loadSecoes = async (docId: string) => {
    setLoadingSecoes(true);
    const { data } = await supabase
      .from("secoes_documento")
      .select("*")
      .eq("documento_id", docId)
      .order("ordem");
    setSecoes((data ?? []) as Secao[]);
    setLoadingSecoes(false);
  };

  const abrirHistorico = async (doc: Documento) => {
    setHistDoc(doc);
    setLoadingHist(true);
    const { data, error } = await supabase
      .from("documentos_historico")
      .select("*")
      .eq("documento_id", doc.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setHistorico((data ?? []) as HistoricoItem[]);
    setLoadingHist(false);
  };

  // ── Salvar documento ──
  const salvarDoc = async (e: React.FormEvent) => {
  e.preventDefault();
  setSavingDoc(true);
  const payload: any = { ...formDoc };
  Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
  let error;
  if (editingDocId) {
    ({ error } = await supabase.from("documentos").update(payload).eq("id", editingDocId));
  } else {
    ({ error } = await supabase.from("documentos").insert(payload));
  }
  if (error) { setSavingDoc(false); return toast.error(error.message); }

  // Ingestao de arquivo se selecionado
  if (arquivo) {
    let docId = editingDocId;
    if (!docId) {
      const { data: nd } = await supabase.from("documentos").select("id")
        .eq("titulo", formDoc.titulo).order("created_at", { ascending: false }).limit(1).maybeSingle();
      docId = nd?.id ?? null;
    }
    if (docId) {
      setUploadando(true);
      try {
        await ingerirDocumento(arquivo, docId, setUploadProgresso);
        toast.success(editingDocId ? "Documento atualizado e arquivo ingerido!" : "Documento criado e arquivo ingerido!");
      } catch (err) {
        toast.error("Salvo, mas falha na ingestao: " + (err as Error).message);
      } finally {
        setUploadando(false);
        setArquivo(null);
        setUploadProgresso(null);
      }
    } else {
      toast.success(editingDocId ? "Documento atualizado" : "Documento criado");
    }
  } else {
    toast.success(editingDocId ? "Documento atualizado" : "Documento criado");
  }

  setSavingDoc(false);
  setDocOpen(false);
  setEditingDocId(null);
  setFormDoc(emptyDoc);
  setArquivo(null);
  loadDocs();
  };

  const startEditDoc = (d: Documento) => {
    setEditingDocId(d.id);
    setFormDoc({
      tipo: d.tipo,
      titulo: d.titulo,
      conteudo: d.conteudo,
      versao: d.versao,
      vigente: d.vigente,
      aprovado_em: d.aprovado_em ?? "",
      aprovado_por: d.aprovado_por ?? "",
      arquivo_url: d.arquivo_url ?? "",
      arquivo_storage_path: d.arquivo_storage_path ?? "",
      arquivo_nome: d.arquivo_nome ?? "",
      arquivo_tamanho_bytes: d.arquivo_tamanho_bytes ?? 0,
    });
    setDocOpen(true);
  };

  const marcarVigente = async (d: Documento) => {
    await supabase.from("documentos").update({ vigente: false }).eq("tipo", d.tipo);
    const { error } = await supabase.from("documentos").update({ vigente: true }).eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success(`"${d.titulo}" marcado como vigente`);
    loadDocs();
  };

  // ── Salvar seção ──
  const salvarSecao = async (e: React.FormEvent) => {
    e.preventDefault();
    const kw = (formSecao.palavras_chave as string)
      .split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    const payload: any = {
      documento_id: secaoDocId,
      titulo: formSecao.titulo,
      conteudo: formSecao.conteudo,
      tipo_secao: formSecao.tipo_secao || null,
      ministerio_ref: formSecao.ministerio_ref || null,
      palavras_chave: kw,
      tags_conceituais: (formSecao.tags_conceituais as string[]) ?? [],
      nivel_hierarquico: formSecao.nivel_hierarquico ? Number(formSecao.nivel_hierarquico) : null,
      ordem: Number(formSecao.ordem),
    };
    let error;
    if (editingSecaoId) {
      ({ error } = await supabase.from("secoes_documento").update(payload).eq("id", editingSecaoId));
    } else {
      ({ error } = await supabase.from("secoes_documento").insert(payload));
    }
    if (error) return toast.error(error.message);
    toast.success(editingSecaoId ? "Seção atualizada" : "Seção adicionada");
    setSecaoOpen(false);
    setEditingSecaoId(null);
    setFormSecao(emptySecao);
    loadSecoes(secaoDocId!);
  };

  const startEditSecao = (s: Secao) => {
    setEditingSecaoId(s.id);
    setFormSecao({
      titulo: s.titulo,
      conteudo: s.conteudo,
      tipo_secao: s.tipo_secao ?? "geral",
      ministerio_ref: s.ministerio_ref ?? "",
      palavras_chave: (s.palavras_chave ?? []).join(", "),
      tags_conceituais: s.tags_conceituais ?? [],
      nivel_hierarquico: s.nivel_hierarquico?.toString() ?? "",
      ordem: s.ordem,
    });
    setSecaoOpen(true);
  };

  const excluirSecao = async (id: string) => {
    const { error } = await supabase.from("secoes_documento").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Seção removida");
    loadSecoes(secaoDocId!);
  };

  // ── Estrutura derivada ──
  const loadEstruturas = async () => {
    setLoadingEst(true);
    const { data, error } = await supabase
      .from("documento_estrutura")
      .select("*")
      .eq("ativo", true)
      .order("nivel")
      .order("ordem")
      .order("nome");
    if (error) toast.error(error.message);
    setEstruturas((data ?? []) as EstruturaItem[]);
    setLoadingEst(false);
  };

  const salvarEstrutura = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEst(true);
    const payload: any = { ...formEst };
    Object.keys(payload).forEach(k => { if (payload[k] === "") payload[k] = null; });
    const { data: igr } = await supabase
      .from("identidade_igreja").select("id").eq("ativa", true).maybeSingle();
    if (!igr?.id) { toast.error("Nenhuma identidade da igreja configurada."); setSavingEst(false); return; }
    payload.igreja_id = igr.id;
    let error;
    if (editingEstId) {
      ({ error } = await supabase.from("documento_estrutura").update(payload).eq("id", editingEstId));
    } else {
      ({ error } = await supabase.from("documento_estrutura").insert(payload));
    }
    setSavingEst(false);
    if (error) return toast.error(error.message);
    toast.success(editingEstId ? "Item atualizado" : "Item adicionado à estrutura");
    setEstOpen(false);
    setEditingEstId(null);
    setFormEst(emptyEst);
    loadEstruturas();
  };

  const excluirEstrutura = async (id: string) => {
    if (!confirm("Remover este item da estrutura?")) return;
    const { error } = await supabase.from("documento_estrutura").update({ ativo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item removido");
    setEstruturas(prev => prev.filter(e => e.id !== id));
  };

  const startEditEstrutura = (item: EstruturaItem) => {
    setEditingEstId(item.id);
    setFormEst({
      tipo: item.tipo,
      nome: item.nome,
      descricao: item.descricao ?? "",
      responsabilidades: item.responsabilidades ?? "",
      base_institucional: item.base_institucional ?? "",
      referencia_documento: item.referencia_documento ?? "",
      nivel: item.nivel,
      ordem: item.ordem,
    });
    setEstOpen(true);
  };

  const abrirSecoes = (docId: string) => {
    setSecaoDocId(docId);
    loadSecoes(docId);
  };

  const docAtual = docs.find(d => d.id === secaoDocId);

  const docsFiltrados = tipoFiltro === "todos"
    ? docs
    : docs.filter(d => d.tipo === tipoFiltro);

  const countsPorTipo = TIPOS.reduce((acc, t) => {
    acc[t.value] = docs.filter(d => d.tipo === t.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <PageHeader
        title="Documentos Institucionais"
        description={`${docs.length} documento${docs.length !== 1 ? "s" : ""} cadastrado${docs.length !== 1 ? "s" : ""}`}
        actions={
          <Button onClick={() => { setEditingDocId(null); setFormDoc(emptyDoc); setDocOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo documento
          </Button>
        }
      />

      <div className="p-4 md:p-8">
        <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as any)} className="mb-6">
          <TabsList>
            <TabsTrigger value="documentos" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Documentos ({docs.length})
            </TabsTrigger>
            <TabsTrigger value="estrutura" className="gap-1.5">
              <Network className="w-3.5 h-3.5" /> Estrutura Derivada ({estruturas.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ─── Aba: Estrutura Derivada ─── */}
        {abaAtiva === "estrutura" && (
          <div>
            <div className="rounded-md border border-gold/30 bg-gold/5 px-4 py-3 mb-5 flex items-start gap-2">
              <Info className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gold">Estrutura Derivada dos Documentos Institucionais</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Ministérios, áreas e cargos extraídos do estatuto/regimento. Usados como base para autocompletar
                  cadastros e gerar o organograma automaticamente.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setFiltroTipoEst("todos")}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filtroTipoEst === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"
                }`}>
                Todos ({estruturas.length})
              </button>
              {TIPOS_ESTRUTURA.map(t => {
                const cnt = estruturas.filter(e => e.tipo === t.value).length;
                if (!cnt) return null;
                return (
                  <button key={t.value} onClick={() => setFiltroTipoEst(t.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      filtroTipoEst === t.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}>
                    {t.icon} {t.label} ({cnt})
                  </button>
                );
              })}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setSyncOpen(true)}>
              <RefreshCw className="w-3 h-3" /> Sincronizar
            </Button>
            <Button size="sm" className="ml-auto h-7 text-xs"
                onClick={() => { setEditingEstId(null); setFormEst(emptyEst); setEstOpen(true); }}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar item
              </Button>
            </div>

            {loadingEst ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
              </div>
            ) : estruturas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum item cadastrado ainda.</p>
                <p className="text-xs mt-1">Adicione ministérios, áreas e cargos derivados do estatuto.</p>
                <Button className="mt-4" onClick={() => { setEditingEstId(null); setFormEst(emptyEst); setEstOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar primeiro item
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {estruturas
                  .filter(e => filtroTipoEst === "todos" || e.tipo === filtroTipoEst)
                  .map(item => {
                    const meta = TIPOS_ESTRUTURA.find(t => t.value === item.tipo) ?? TIPOS_ESTRUTURA[6];
                    return (
                      <Card key={item.id} className="shadow-card-soft">
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-base shrink-0">
                            {meta.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">{meta.label}</span>
                              <span className="text-[10px] text-muted-foreground">{NIVEIS_ESTRUTURA.find(n => n.value === item.nivel)?.label ?? item.nivel}</span>
                            </div>
                            <p className="font-medium text-sm leading-tight">{item.nome}</p>
                            {item.descricao && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.descricao}</p>
                            )}
                            {item.base_institucional && (
                              <p className="text-[10px] text-gold/80 mt-1">📄 {item.base_institucional}</p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => startEditEstrutura(item)}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted">
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button onClick={() => excluirEstrutura(item.id)}
                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ─── Aba: Documentos ─── */}
        {abaAtiva === "documentos" && (
          <>
          {/* Filtros por tipo */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setTipoFiltro("todos")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                tipoFiltro === "todos"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              Todos ({docs.length})
            </button>
            {TIPOS.filter(t => countsPorTipo[t.value] > 0).map(t => (
              <button
                key={t.value}
                onClick={() => setTipoFiltro(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  tipoFiltro === t.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label} ({countsPorTipo[t.value]})
              </button>
            ))}
          </div>

          {/* Lista de documentos */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum documento encontrado.</p>
              <Button className="mt-3" onClick={() => { setEditingDocId(null); setFormDoc(emptyDoc); setDocOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Criar primeiro documento
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {docsFiltrados.map(d => {
                const meta = tipoMeta(d.tipo);
                const isOpen = secaoDocId === d.id;
                return (
                  <Card key={d.id} className="shadow-card-soft overflow-hidden">
                    <CardContent className="p-0">
                      {/* Cabeçalho do documento */}
                      <div className="p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
                            <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">v{d.versao}</span>
                            {d.vigente && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Vigente
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-medium leading-tight">{d.titulo}</h3>
                          {d.aprovado_por && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Aprovado por {d.aprovado_por}
                              {d.aprovado_em && ` em ${new Date(d.aprovado_em).toLocaleDateString("pt-BR")}`}
                            </p>
                          )}
                          {d.conteudo && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.conteudo}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!d.vigente && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => marcarVigente(d)}>
                              <Clock className="w-3 h-3 mr-1" /> Marcar vigente
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver histórico" onClick={() => abrirHistorico(d)}>
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditDoc(d)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => isOpen ? setSecaoDocId(null) : abrirSecoes(d.id)}
                          >
                            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Painel de seções (expansível) */}
                      {isOpen && (
                        <div className="border-t bg-muted/30 px-4 py-3">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              <BookOpen className="w-3.5 h-3.5 inline mr-1" />
                              Seções de "{docAtual?.titulo}"
                            </p>
                            <Button size="sm" className="h-7 text-xs"
                              onClick={() => { setEditingSecaoId(null); setFormSecao(emptySecao); setSecaoOpen(true); }}>
                              <Plus className="w-3 h-3 mr-1" /> Adicionar seção
                            </Button>
                          </div>
                          {loadingSecoes ? (
                            <div className="flex items-center text-muted-foreground text-xs py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Carregando seções…
                            </div>
                          ) : secoes.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2 text-center">
                              Nenhuma seção cadastrada. Adicione trechos do documento para busca inteligente.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {secoes.map(s => (
                                <div key={s.id} className="flex items-start gap-2 bg-background rounded-md border px-3 py-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-medium truncate">{s.titulo}</span>
                                      {s.tipo_secao && (
                                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded border shrink-0">
                                          {TIPOS_SECAO.find(t => t.value === s.tipo_secao)?.label ?? s.tipo_secao}
                                        </span>
                                      )}
                                    </div>
                                    {s.conteudo && (
                                      <p className="text-[11px] text-muted-foreground line-clamp-2">{s.conteudo}</p>
                                    )}
                                    {/* Tags conceituais — conexão com Identidade */}
                                    {s.tags_conceituais?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {s.tags_conceituais.map((tag, i) => {
                                          const tc = TAGS_CONCEITUAIS.find(t => t.value === tag);
                                          return (
                                            <span key={i} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 ${tc?.color ?? "bg-muted text-muted-foreground"}`}>
                                              🏷 {tc?.label ?? tag}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {s.palavras_chave?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {s.palavras_chave.map((kw, i) => (
                                          <span key={i} className="text-[10px] bg-primary/5 border border-primary/20 rounded px-1">{kw}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => startEditSecao(s)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted">
                                      <Pencil className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                    <button onClick={() => excluirSecao(s.id)}
                                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10">
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </>
        )}
      </div>

      {/* ─── Dialog: Documento ─── */}
      <Dialog open={docOpen} onOpenChange={(o) => { setDocOpen(o); if (!o) { setEditingDocId(null); setFormDoc(emptyDoc); setArquivo(null); setUploadProgresso(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingDocId ? "Editar documento" : "Novo documento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarDoc} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={formDoc.tipo} onValueChange={v => setFormDoc({ ...formDoc, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Versão *</Label>
                <Input required value={formDoc.versao} onChange={e => setFormDoc({ ...formDoc, versao: e.target.value })} placeholder="1.0" />
              </div>
            </div>
            <div>
              <Label>Título *</Label>
              <Input required value={formDoc.titulo} onChange={e => setFormDoc({ ...formDoc, titulo: e.target.value })} />
            </div>
            <div>
              <Label>Descrição / Ementa</Label>
              <Textarea rows={3} value={formDoc.conteudo} onChange={e => setFormDoc({ ...formDoc, conteudo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aprovado por</Label>
                <Input value={formDoc.aprovado_por} onChange={e => setFormDoc({ ...formDoc, aprovado_por: e.target.value })} />
              </div>
              <div>
                <Label>Data de aprovação</Label>
                <Input type="date" value={formDoc.aprovado_em} onChange={e => setFormDoc({ ...formDoc, aprovado_em: e.target.value })} />
              </div>
            </div>
            <div className="space-y-3">
                <Label>Arquivo do documento</Label>

                {/* Upload de arquivo */}
                <div className={[
                  "relative flex flex-col items-center justify-center gap-2",
                  "border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors",
                  arquivo ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/30",
                ].join(" ")}>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f) {
                        const err = validarArquivo(f);
                        if (err) { toast.error(err); return; }
                        setArquivo(f);
                        setFormDoc({ ...formDoc, arquivo_url: null });
                      }
                    }}
                  />
                  {arquivo ? (
                    <div className="flex items-center gap-2 pointer-events-none">
                      <FileCheck2 className="w-5 h-5 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium truncate max-w-[220px]">{arquivo.name}</p>
                        <p className="text-xs text-muted-foreground">{formatarTamanho(arquivo.size)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="pointer-events-none space-y-1">
                      <Upload className="w-6 h-6 mx-auto text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">Clique ou arraste o arquivo aqui</p>
                      <p className="text-xs text-muted-foreground/70">PDF ou DOCX · máx. 20 MB</p>
                    </div>
                  )}
                </div>

                {/* Progresso de upload */}
                {uploadProgresso && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span>{uploadProgresso.mensagem}</span>
                    {uploadProgresso.progresso != null && (
                      <span className="ml-auto font-mono">{uploadProgresso.progresso}%</span>
                    )}
                  </div>
                )}

                {/* URL alternativa (Google Drive, etc) */}
                {!arquivo && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">Ou informe URL externa (Google Drive, etc):</p>
                    <Input value={formDoc.arquivo_url ?? ""} onChange={e => setFormDoc({ ...formDoc, arquivo_url: e.target.value })} placeholder="https://drive.google.com/..." />
                  </div>
                )}

                {/* Badge do arquivo já existente no storage */}
                {formDoc.arquivo_storage_path && !arquivo && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                    <FileCheck2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-primary font-medium truncate">{formDoc.arquivo_nome ?? "Arquivo existente"}</span>
                    <span className="text-muted-foreground ml-auto">{formDoc.arquivo_tamanho_bytes ? formatarTamanho(formDoc.arquivo_tamanho_bytes) : ""}</span>
                  </div>
                )}
              </div>
            <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <div>
                <Label className="text-sm">Documento Vigente</Label>
                <p className="text-xs text-muted-foreground">Marcar como versão oficial atual deste tipo</p>
              </div>
              <Switch checked={formDoc.vigente} onCheckedChange={v => setFormDoc({ ...formDoc, vigente: v })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDocOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingDoc}>
                {savingDoc ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Salvando…</> : (editingDocId ? "Atualizar" : "Salvar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Seção ─── */}
      <Dialog open={secaoOpen} onOpenChange={(o) => { setSecaoOpen(o); if (!o) { setEditingSecaoId(null); setFormSecao(emptySecao); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingSecaoId ? "Editar seção" : "Nova seção"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarSecao} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input required value={formSecao.titulo} onChange={e => setFormSecao({ ...formSecao, titulo: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de seção</Label>
                <Select value={formSecao.tipo_secao} onValueChange={v => setFormSecao({ ...formSecao, tipo_secao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_SECAO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={formSecao.ordem} onChange={e => setFormSecao({ ...formSecao, ordem: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea rows={4} value={formSecao.conteudo} onChange={e => setFormSecao({ ...formSecao, conteudo: e.target.value })} />
            </div>
            <div>
              <Label>Referência a ministério</Label>
              <Input value={formSecao.ministerio_ref} onChange={e => setFormSecao({ ...formSecao, ministerio_ref: e.target.value })} placeholder="Nome do ministério mencionado" />
            </div>
            <div>
              <Label>Palavras-chave <span className="text-xs text-muted-foreground font-normal">(separadas por vírgula)</span></Label>
              <Input value={formSecao.palavras_chave} onChange={e => setFormSecao({ ...formSecao, palavras_chave: e.target.value })} placeholder="louvor, jovens, missões…" />
            </div>

            {/* Tags conceituais — conecta esta seção à Camada de Identidade */}
            <div>
              <Label className="flex items-center gap-1.5">
                🏷 Tags conceituais
                <span className="text-xs text-muted-foreground font-normal">(conectam aos campos de Identidade)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TAGS_CONCEITUAIS.map(tag => {
                  const ativa = (formSecao.tags_conceituais as string[]).includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => {
                        const atual = formSecao.tags_conceituais as string[];
                        setFormSecao({
                          ...formSecao,
                          tags_conceituais: ativa
                            ? atual.filter(t => t !== tag.value)
                            : [...atual, tag.value],
                        });
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full transition-all border ${
                        ativa
                          ? `${tag.color} border-transparent font-medium`
                          : "bg-background border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {ativa ? "✓ " : ""}{tag.label}
                    </button>
                  );
                })}
              </div>
              {(formSecao.tags_conceituais as string[]).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  💡 Esta seção ficará disponível para sugestão automática de Missão/Visão/Valores na tela de Identidade.
                </p>
              )}
            </div>
            <div>
              <Label>Nível hierárquico</Label>
              <Input type="number" value={formSecao.nivel_hierarquico} onChange={e => setFormSecao({ ...formSecao, nivel_hierarquico: e.target.value })} placeholder="1, 2, 3…" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSecaoOpen(false)}>Cancelar</Button>
              <Button type="submit">{editingSecaoId ? "Atualizar" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Estrutura ─── */}
      <Dialog open={estOpen} onOpenChange={(o) => { setEstOpen(o); if (!o) { setEditingEstId(null); setFormEst(emptyEst); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">{editingEstId ? "Editar item" : "Novo item da estrutura"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarEstrutura} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={formEst.tipo} onValueChange={v => setFormEst({ ...formEst, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_ESTRUTURA.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nível *</Label>
                <Select value={formEst.nivel} onValueChange={v => setFormEst({ ...formEst, nivel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NIVEIS_ESTRUTURA.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input required value={formEst.nome} onChange={e => setFormEst({ ...formEst, nome: e.target.value })} />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={formEst.ordem} onChange={e => setFormEst({ ...formEst, ordem: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={formEst.descricao} onChange={e => setFormEst({ ...formEst, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Responsabilidades</Label>
              <Textarea rows={2} value={formEst.responsabilidades} onChange={e => setFormEst({ ...formEst, responsabilidades: e.target.value })} />
            </div>
            <div>
              <Label>Base institucional (ex: Art. 15 do Regimento)</Label>
              <Input value={formEst.base_institucional} onChange={e => setFormEst({ ...formEst, base_institucional: e.target.value })} />
            </div>
            <div>
              <Label>Referência no documento</Label>
              <Input value={formEst.referencia_documento} onChange={e => setFormEst({ ...formEst, referencia_documento: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEstOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingEst}>
                {savingEst ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Salvando…</> : (editingEstId ? "Atualizar" : "Salvar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Histórico ─── */}
      <Dialog open={!!histDoc} onOpenChange={(o) => { if (!o) { setHistDoc(null); setHistorico([]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Histórico — {histDoc?.titulo}
            </DialogTitle>
          </DialogHeader>
          {loadingHist ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum registro de histórico ainda.</p>
              <p className="text-xs mt-1">As alterações futuras serão registradas aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map(h => (
                <div key={h.id} className="rounded-md border bg-background px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        {ACAO_LABELS[h.acao] ?? h.acao}
                      </span>
                      {(h.versao_de || h.versao_para) && (
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {h.versao_de && <>v{h.versao_de}</>}
                          {h.versao_de && h.versao_para && " → "}
                          {h.versao_para && <>v{h.versao_para}</>}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(h.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {h.usuario_email && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">por {h.usuario_email}</p>
                  )}
                  {h.observacao && (
                    <p className="text-xs text-muted-foreground mt-1 italic">"{h.observacao}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHistDoc(null); setHistorico([]); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SyncEstruturaModal
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onConcluido={() => { setSyncOpen(false); loadEstruturas(); }}
      />
    </div>
  );
}
