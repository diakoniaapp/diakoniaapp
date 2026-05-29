import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Flame, Plus, Upload, Loader2, Trash2, ChevronRight, ChevronLeft,
  CalendarDays, FileText, Image, Video, Music, File, Bell,
  CheckCircle2, AlertTriangle, Edit2, Star, X,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Campanha {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  prioridade: number;
  data_inicio: string;
  data_fim: string;
  status: string;
  cor_tema: string;
  ministerio_id: string | null;
  created_at: string;
}

interface Material {
  id?: string;         // existe após upload
  arquivo?: File;      // ainda local (pré-upload)
  nome_arquivo: string;
  storage_path: string;
  url_publica: string;
  tipo_arquivo: string;
  dia_numero: number | null;
  tema: string;
  ordem: number;
}

interface DiaEstrutura {
  dia: number;
  data: string;
  tema: string;
  materiais: Material[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORES = [
  "#6366f1","#8b5cf6","#ec4899","#f97316","#eab308",
  "#22c55e","#06b6d4","#3b82f6","#ef4444","#14b8a6",
];

const tipoIcon = (tipo: string) => {
  if (tipo === "pdf")    return <FileText className="w-4 h-4 text-red-500" />;
  if (tipo === "imagem") return <Image className="w-4 h-4 text-blue-500" />;
  if (tipo === "video")  return <Video className="w-4 h-4 text-purple-500" />;
  if (tipo === "audio")  return <Music className="w-4 h-4 text-green-500" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
};

const detectarTipo = (nome: string): string => {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf"].includes(ext))                           return "pdf";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return "imagem";
  if (["mp4","mov","avi","mkv","webm"].includes(ext))  return "video";
  if (["mp3","wav","ogg","m4a"].includes(ext))         return "audio";
  return "outro";
};

/** Tenta extrair número do dia do nome do arquivo: "dia-1-tema.pdf" → 1 */
const extrairDia = (nome: string): number | null => {
  const m = nome.match(/dia[-_\s]?(\d+)/i);
  return m ? parseInt(m[1]) : null;
};

/** Tenta extrair tema do nome do arquivo */
const extrairTema = (nome: string): string => {
  return nome
    .replace(/\.\w+$/, "")
    .replace(/dia[-_\s]?\d+[-_\s]?/i, "")
    .replace(/[-_]/g, " ")
    .trim();
};

const statusColor: Record<string, string> = {
  rascunho:  "bg-muted text-muted-foreground",
  ativa:     "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  encerrada: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  cancelada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const tipoLabel: Record<string,string> = {
  igreja: "Igreja", ministerio: "Ministério", denominacao: "Denominação",
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CampanhasAdmin() {
  const { hasRole } = useAuth();
  const navigate    = useNavigate();

  const [campanhas, setCampanhas]   = useState<Campanha[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editando, setEditando]     = useState<Campanha | null>(null);

  // ── Guarda de acesso ──
  useEffect(() => {
    if (!hasRole(["admin","secretaria"])) navigate("/", { replace: true });
  }, []);

  const carregarCampanhas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campanhas")
      .select("*")
      .order("prioridade", { ascending: false })
      .order("data_inicio");
    setCampanhas((data ?? []) as Campanha[]);
    setLoading(false);
  };

  useEffect(() => { carregarCampanhas(); }, []);

  const excluirCampanha = async (id: string) => {
    if (!confirm("Excluir esta campanha? Todos os materiais e eventos vinculados serão desvinculados.")) return;
    await supabase.from("campanhas").delete().eq("id", id);
    toast.success("Campanha removida.");
    carregarCampanhas();
  };

  const alterarStatus = async (id: string, status: string) => {
    await supabase.from("campanhas").update({ status }).eq("id", id);
    if (status === "ativa") {
      await supabase.rpc("gerar_notificacoes_campanha", { p_campanha_id: id });
    }
    toast.success("Status atualizado.");
    carregarCampanhas();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  const ativas    = campanhas.filter((c) => c.status === "ativa");
  const rascunhos = campanhas.filter((c) => c.status === "rascunho");
  const historico = campanhas.filter((c) => ["encerrada","cancelada"].includes(c.status));

  return (
    <div>
      <PageHeader
        title="Campanhas Espirituais"
        description="Organize campanhas, devocionais e séries temáticas"
        actions={
          hasRole(["admin","secretaria"]) && (
            <Button onClick={() => { setEditando(null); setShowWizard(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Nova Campanha
            </Button>
          )
        }
      />

      <div className="p-4 md:p-8 space-y-6 max-w-4xl">

        {/* Campanhas ativas */}
        {ativas.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Ativas ({ativas.length})
            </h2>
            <div className="space-y-3">
              {ativas.map((c) => (
                <CampanhaCard key={c.id} campanha={c}
                  onEditar={() => { setEditando(c); setShowWizard(true); }}
                  onExcluir={() => excluirCampanha(c.id)}
                  onStatus={(s) => alterarStatus(c.id, s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Rascunhos */}
        {rascunhos.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Edit2 className="w-4 h-4" /> Rascunhos ({rascunhos.length})
            </h2>
            <div className="space-y-3">
              {rascunhos.map((c) => (
                <CampanhaCard key={c.id} campanha={c}
                  onEditar={() => { setEditando(c); setShowWizard(true); }}
                  onExcluir={() => excluirCampanha(c.id)}
                  onStatus={(s) => alterarStatus(c.id, s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Histórico */}
        {historico.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" /> Histórico ({historico.length})
            </h2>
            <div className="space-y-3">
              {historico.map((c) => (
                <CampanhaCard key={c.id} campanha={c}
                  onEditar={() => { setEditando(c); setShowWizard(true); }}
                  onExcluir={() => excluirCampanha(c.id)}
                  onStatus={(s) => alterarStatus(c.id, s)}
                />
              ))}
            </div>
          </section>
        )}

        {campanhas.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma campanha cadastrada ainda.</p>
            <p className="text-sm mt-1">Clique em "Nova Campanha" para começar.</p>
          </div>
        )}
      </div>

      {/* Wizard */}
      {showWizard && (
        <WizardCampanha
          campanha={editando}
          onClose={() => { setShowWizard(false); setEditando(null); }}
          onSalvo={() => { setShowWizard(false); setEditando(null); carregarCampanhas(); }}
        />
      )}
    </div>
  );
}

// ─── Card de Campanha ─────────────────────────────────────────────────────────

function CampanhaCard({ campanha: c, onEditar, onExcluir, onStatus }: {
  campanha: Campanha;
  onEditar: () => void;
  onExcluir: () => void;
  onStatus: (s: string) => void;
}) {
  const diasTotal = differenceInDays(parseISO(c.data_fim), parseISO(c.data_inicio)) + 1;
  const hoje      = new Date();
  const inicio    = parseISO(c.data_inicio);
  const fim       = parseISO(c.data_fim);
  const diasPassados = c.status === "ativa"
    ? Math.max(0, Math.min(differenceInDays(hoje, inicio) + 1, diasTotal))
    : 0;

  return (
    <Card className="shadow-card-soft overflow-hidden">
      <div className="h-1" style={{ backgroundColor: c.cor_tema }} />
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{c.nome}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[c.status]}`}>
                {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
              </span>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {tipoLabel[c.tipo]}
              </Badge>
              <span className="flex items-center gap-0.5" title={`Prioridade ${c.prioridade}`}>
                {Array.from({ length: c.prioridade }).map((_, i) => (
                  <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                ))}
              </span>
            </div>

            {c.descricao && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descricao}</p>
            )}

            {/* Camada 3: base espiritual da campanha */}
            {(c as any).origem_identidade && (
              <div className="flex items-center gap-1 mt-1.5">
                <span className="text-[10px] bg-gold/10 text-gold border border-gold/25 rounded-full px-2 py-0.5 font-medium">
                  🔥 {
                    (c as any).origem_identidade === "missao" ? "Missão" :
                    (c as any).origem_identidade === "visao"  ? "Visão"  :
                    (c as any).origem_identidade === "valor"  ? "Valor"  : "Princípio"
                  }
                </span>
                {(c as any).contexto_espiritual && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{(c as any).contexto_espiritual}</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {format(parseISO(c.data_inicio), "dd/MM/yy", { locale: ptBR })} →{" "}
                {format(parseISO(c.data_fim), "dd/MM/yy", { locale: ptBR })}
              </span>
              <span>{diasTotal} dias</span>
            </div>

            {/* Barra de progresso (campanhas ativas) */}
            {c.status === "ativa" && diasTotal > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>Dia {diasPassados} de {diasTotal}</span>
                  <span>{Math.round((diasPassados / diasTotal) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(diasPassados / diasTotal) * 100}%`, backgroundColor: c.cor_tema }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEditar}>
              <Edit2 className="w-3 h-3" />
            </Button>
            {c.status === "rascunho" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600" onClick={() => onStatus("ativa")}>
                <Flame className="w-3 h-3" />
              </Button>
            )}
            {c.status === "ativa" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onStatus("encerrada")}>
                <CheckCircle2 className="w-3 h-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={onExcluir}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Wizard de Criação/Edição ─────────────────────────────────────────────────

function WizardCampanha({ campanha, onClose, onSalvo }: {
  campanha: Campanha | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const { user } = useAuth();
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
  const [salvando, setSalvando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Formulário base
  const [form, setForm] = useState({
    nome:                campanha?.nome         ?? "",
    descricao:           campanha?.descricao    ?? "",
    tipo:                campanha?.tipo         ?? "igreja",
    prioridade:          String(campanha?.prioridade ?? "1"),
    data_inicio:         campanha?.data_inicio  ?? "",
    data_fim:            campanha?.data_fim     ?? "",
    cor_tema:            campanha?.cor_tema     ?? "#6366f1",
    criar_eventos:       true,
    // Camada 3: vínculo com a Identidade da Igreja
    origem_identidade:   (campanha as any)?.origem_identidade   ?? "",
    origem_valor_id:     (campanha as any)?.origem_valor_id     ?? "",
    contexto_espiritual: (campanha as any)?.contexto_espiritual ?? "",
  });

  // Camada 3: carregar identidade para sugestões
  const [valoresIdentidade, setValoresIdentidade] = useState<{ id: string; valor: string; descricao: string; icone: string }[]>([]);
  const [missaoIgreja, setMissaoIgreja] = useState("");
  const [visaoIgreja,  setVisaoIgreja]  = useState("");

  useEffect(() => {
    supabase.from("identidade_igreja").select("missao, visao").eq("ativa", true).maybeSingle()
      .then(({ data }) => {
        if (data) { setMissaoIgreja((data as any).missao ?? ""); setVisaoIgreja((data as any).visao ?? ""); }
      });
    supabase.from("identidade_valores").select("id, valor, descricao, icone").eq("ativo", true).order("ordem")
      .then(({ data }) => setValoresIdentidade((data ?? []) as any[]));
  }, []);

  // Materiais e estrutura de dias
  const [materiais, setMateriais]   = useState<Material[]>([]);
  const [estrutura, setEstrutura]   = useState<DiaEstrutura[]>([]);
  const [processando, setProcessando] = useState(false);

  // ── Construir estrutura de dias ──
  const construirEstrutura = (mats: Material[]) => {
    if (!form.data_inicio || !form.data_fim) return;
    const ini  = parseISO(form.data_inicio);
    const dias = differenceInDays(parseISO(form.data_fim), ini) + 1;

    const dias_arr: DiaEstrutura[] = Array.from({ length: dias }, (_, i) => ({
      dia:  i + 1,
      data: format(addDays(ini, i), "yyyy-MM-dd"),
      tema: "",
      materiais: [],
    }));

    // Alocar materiais com dia_numero detectado
    for (const m of mats) {
      if (m.dia_numero && m.dia_numero >= 1 && m.dia_numero <= dias) {
        dias_arr[m.dia_numero - 1].materiais.push(m);
        if (m.tema && !dias_arr[m.dia_numero - 1].tema) {
          dias_arr[m.dia_numero - 1].tema = m.tema;
        }
      }
    }

    // Materiais sem dia → primeiro dia
    const semDia = mats.filter((m) => !m.dia_numero);
    if (semDia.length > 0 && dias_arr.length > 0) {
      dias_arr[0].materiais.push(...semDia);
    }

    setEstrutura(dias_arr);
  };

  // ── Upload de arquivos ──
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadando(true);

    const novos: Material[] = [];
    for (const arquivo of Array.from(files)) {
      const tipo = detectarTipo(arquivo.name);
      const dia  = extrairDia(arquivo.name);
      const tema = extrairTema(arquivo.name);
      novos.push({
        arquivo,
        nome_arquivo: arquivo.name,
        storage_path: "",   // preenchido ao salvar
        url_publica:  "",
        tipo_arquivo: tipo,
        dia_numero:   dia,
        tema,
        ordem: materiais.length + novos.length,
      });
    }

    setMateriais((p) => [...p, ...novos]);
    setUploadando(false);
    toast.success(`${novos.length} arquivo(s) adicionado(s).`);
  };

  // ── Processar: construir estrutura ──
  const processar = () => {
    if (!form.data_inicio || !form.data_fim) {
      toast.error("Defina o período da campanha antes de processar.");
      return;
    }
    setProcessando(true);
    setTimeout(() => {
      construirEstrutura(materiais);
      setProcessando(false);
      setEtapa(2);
    }, 800);
  };

  const removerMaterial = (idx: number) =>
    setMateriais((p) => p.filter((_, i) => i !== idx));

  const updateEstrutura = (diaIdx: number, field: "tema", value: string) =>
    setEstrutura((p) => p.map((d, i) => (i === diaIdx ? { ...d, [field]: value } : d)));

  // ── Salvar campanha completa ──
  const salvar = async () => {
    if (!form.nome.trim())       { toast.error("Nome é obrigatório"); return; }
    if (!form.data_inicio)       { toast.error("Data de início é obrigatória"); return; }
    if (!form.data_fim)          { toast.error("Data de fim é obrigatória"); return; }
    if (form.data_fim < form.data_inicio) { toast.error("Data de fim deve ser após o início"); return; }

    setSalvando(true);

    try {
      // 1. Criar/atualizar campanha
      let campanhaId = campanha?.id ?? null;
      const payload = {
        nome:                form.nome.trim(),
        descricao:           form.descricao.trim() || null,
        tipo:                form.tipo,
        prioridade:          parseInt(form.prioridade),
        data_inicio:         form.data_inicio,
        data_fim:            form.data_fim,
        cor_tema:            form.cor_tema,
        origem_identidade:   form.origem_identidade   || null,
        origem_valor_id:     form.origem_valor_id      || null,
        contexto_espiritual: form.contexto_espiritual.trim() || null,
        criado_por:  user?.id ?? null,
      };

      if (campanhaId) {
        await supabase.from("campanhas").update(payload).eq("id", campanhaId);
      } else {
        const { data, error } = await supabase
          .from("campanhas").insert(payload).select("id").single();
        if (error) throw error;
        campanhaId = (data as any).id;
      }

      // 2. Upload dos arquivos novos para storage
    const materiaisSalvos: Material[] = [];
    const BUCKET = "campanhas-materiais";

    if (materiais.some((m) => m.arquivo)) {
      // Verificar se bucket existe; se não, criar automaticamente
      try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExiste = (buckets ?? []).some((b: any) => b.name === BUCKET);
        if (!bucketExiste) {
          const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
          if (createErr && !createErr.message?.includes("already exists")) {
            console.warn("Aviso ao criar bucket:", createErr.message);
          }
        }
      } catch (bucketCheckErr) {
        console.warn("Não foi possível verificar bucket:", bucketCheckErr);
      }
    }

    for (const m of materiais) {
      if (!m.arquivo) continue; // já estava salvo

      // Nome único com UUID para evitar colisões
      const ext = m.nome_arquivo.split(".").pop() ?? "bin";
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      const path = `${campanhaId}/${uniqueName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, m.arquivo, { upsert: true, cacheControl: "3600" });

      if (upErr) {
        console.error("Upload falhou para", m.nome_arquivo, ":", upErr.message);
        toast.error(`Erro ao enviar "${m.nome_arquivo}": ${upErr.message}`);
        continue;
      }

      // URL pública (bucket público) — fallback para signed URL se privado
      let urlFinal = "";
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      urlFinal = urlData.publicUrl;

      materiaisSalvos.push({
        ...m,
        nome_arquivo: m.nome_arquivo,
        storage_path: path,
        url_publica: urlFinal,
      });
    }

      // 3. Inserir materiais
      if (materiaisSalvos.length > 0) {
        await supabase.from("campanha_materiais").insert(
          materiaisSalvos.map((m) => ({
            campanha_id:  campanhaId,
            nome_arquivo: m.nome_arquivo,
            storage_path: m.storage_path,
            url_publica:  m.url_publica,
            tipo_arquivo: m.tipo_arquivo,
            dia_numero:   m.dia_numero,
            tema:         m.tema || null,
            ordem:        m.ordem,
          }))
        );
      }

      // 4. Criar eventos na agenda
      if (form.criar_eventos && estrutura.length > 0) {
        const eventosPayload = estrutura
          .filter((d) => d.tema.trim())
          .map((d) => ({
            titulo:      `${form.nome} — Dia ${d.dia}: ${d.tema}`,
            descricao:   `Campanha: ${form.nome}`,
            data_inicio: `${d.data}T08:00:00`,
            data_fim:    `${d.data}T09:00:00`,
            campanha_id: campanhaId,
          }));

        if (eventosPayload.length > 0) {
          await supabase.from("eventos").insert(eventosPayload);
        }
      }

      toast.success(campanha ? "Campanha atualizada!" : "Campanha criada com sucesso!");
      onSalvo();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar campanha.");
    } finally {
      setSalvando(false);
    }
  };

  const dias = form.data_inicio && form.data_fim
    ? differenceInDays(parseISO(form.data_fim), parseISO(form.data_inicio)) + 1
    : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            {campanha ? "Editar Campanha" : "Nova Campanha"}
          </DialogTitle>
        </DialogHeader>

        {/* Indicador de etapas */}
        <div className="flex items-center gap-2 py-2">
          {[1,2,3].map((e) => (
            <div key={e} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${etapa >= e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {e}
              </div>
              {e < 3 && <div className={`h-px w-8 ${etapa > e ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {etapa === 1 && "Configurar + Upload"}
            {etapa === 2 && "Revisar estrutura"}
            {etapa === 3 && "Confirmar"}
          </span>
        </div>

        {/* ── ETAPA 1: Configuração + Upload ── */}
        {etapa === 1 && (
          <div className="space-y-4">

            {/* Nome */}
            <div>
              <Label>Nome da Campanha *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: 21 Dias de Oração e Jejum" className="mt-1" />
            </div>

            {/* Descrição */}
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Objetivo e contexto da campanha…" className="mt-1 resize-none" />
            </div>

            {/* Tipo + Prioridade */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="igreja">Igreja</SelectItem>
                    <SelectItem value="ministerio">Ministério</SelectItem>
                    <SelectItem value="denominacao">Denominação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {"⭐".repeat(n)} — {["Baixa","Normal","Média","Alta","Urgente"][n-1]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Período */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início *</Label>
                <Input type="date" value={form.data_inicio}
                  onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Fim *</Label>
                <Input type="date" value={form.data_fim}
                  onChange={(e) => setForm({ ...form, data_fim: e.target.value })} className="mt-1" />
              </div>
            </div>
            {dias > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Duração: {dias} dias
              </p>
            )}

            {/* Cor do tema */}
            <div>
              <Label>Cor do Tema</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {CORES.map((cor) => (
                  <button key={cor} type="button"
                    onClick={() => setForm({ ...form, cor_tema: cor })}
                    className={`w-7 h-7 rounded-full transition-transform ${form.cor_tema === cor ? "scale-125 ring-2 ring-offset-2 ring-foreground" : ""}`}
                    style={{ backgroundColor: cor }} />
                ))}
              </div>
            </div>

            {/* ── Camada 3: Origem na Identidade da Igreja ── */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-gold" />
                Base espiritual desta campanha
                <span className="text-muted-foreground font-normal">(opcional — conecta com a Identidade)</span>
              </p>

              {/* Origem: missão, visão ou valor */}
              <div>
                <Label className="text-xs">Esta campanha está baseada em…</Label>
                <Select value={form.origem_identidade} onValueChange={(v) => setForm({ ...form, origem_identidade: v === "none" ? "" : v, origem_valor_id: "" })}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Selecionar origem (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não definir —</SelectItem>
                    <SelectItem value="missao">🎯 Missão da Igreja</SelectItem>
                    <SelectItem value="visao">👁 Visão da Igreja</SelectItem>
                    <SelectItem value="valor">💎 Valor Institucional</SelectItem>
                    <SelectItem value="outro">✨ Outro princípio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mostrar missão ou visão como referência */}
              {form.origem_identidade === "missao" && missaoIgreja && (
                <div className="rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
                  <span className="font-medium">Missão: </span>{missaoIgreja}
                </div>
              )}
              {form.origem_identidade === "visao" && visaoIgreja && (
                <div className="rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 px-3 py-2 text-xs text-purple-800 dark:text-purple-300">
                  <span className="font-medium">Visão: </span>{visaoIgreja}
                </div>
              )}

              {/* Seleção de valor específico */}
              {form.origem_identidade === "valor" && valoresIdentidade.length > 0 && (
                <div>
                  <Label className="text-xs">Qual valor?</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {valoresIdentidade.map((v) => (
                      <button
                        key={v.id} type="button"
                        onClick={() => setForm({ ...form, origem_valor_id: v.id })}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                          form.origem_valor_id === v.id
                            ? "bg-gold/20 border-gold/50 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:border-gold/30"
                        }`}
                      >
                        {v.icone && <span className="mr-1">{v.icone}</span>}{v.valor}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sugestões baseadas nos valores */}
              {form.origem_identidade === "valor" && valoresIdentidade.length > 0 && !form.nome.trim() && (
                <div className="rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">💡 Sugestões de campanha baseadas nos valores:</p>
                  {valoresIdentidade.slice(0, 3).map((v) => (
                    <button key={v.id} type="button"
                      className="block text-left text-xs text-amber-700 dark:text-amber-400 hover:underline"
                      onClick={() => setForm({ ...form, nome: `Campanha: ${v.valor}`, origem_valor_id: v.id })}>
                      → Campanha sobre "{v.valor}"
                    </button>
                  ))}
                </div>
              )}

              {/* Contexto espiritual */}
              {form.origem_identidade && (
                <div>
                  <Label className="text-xs">Contexto espiritual / propósito</Label>
                  <Textarea
                    rows={2}
                    className="mt-1 text-sm resize-none"
                    placeholder="Descreva como esta campanha se conecta com a identidade da igreja…"
                    value={form.contexto_espiritual}
                    onChange={(e) => setForm({ ...form, contexto_espiritual: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Upload de materiais */}
            <div>
              <Label>Materiais (PDF, imagem, vídeo)</Label>
              <div
                className="mt-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              >
                {uploadando
                  ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  : <>
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Nomeie como <code className="bg-muted px-1 rounded">dia-1-tema.pdf</code> para organização automática
                    </p>
                  </>
                }
              </div>
              <input ref={fileRef} type="file" multiple className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.mp3,.wav"
                onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {/* Lista de arquivos adicionados */}
            {materiais.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {materiais.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    {tipoIcon(m.tipo_arquivo)}
                    <span className="flex-1 truncate">{m.nome_arquivo}</span>
                    {m.dia_numero && (
                      <Badge variant="outline" className="text-[10px] shrink-0">Dia {m.dia_numero}</Badge>
                    )}
                    <button type="button" onClick={() => removerMaterial(idx)}
                      className="shrink-0 hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ETAPA 2: Revisão da estrutura ── */}
        {etapa === 2 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Revise a estrutura gerada. Edite os temas de cada dia e mova materiais se necessário.
              </p>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {estrutura.map((d, idx) => (
                <div key={d.dia} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: form.cor_tema, color: "#fff" }}>
                      {d.dia}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground">
                        {format(parseISO(d.data), "EEEE, dd/MM", { locale: ptBR })}
                      </p>
                      <Input
                        value={d.tema}
                        onChange={(e) => updateEstrutura(idx, "tema", e.target.value)}
                        placeholder="Tema do dia…"
                        className="h-7 text-sm mt-0.5"
                      />
                    </div>
                  </div>
                  {d.materiais.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-9">
                      {d.materiais.map((m, mi) => (
                        <span key={mi} className="flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full">
                          {tipoIcon(m.tipo_arquivo)}
                          <span className="truncate max-w-[120px]">{m.nome_arquivo}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {d.materiais.length === 0 && (
                    <p className="text-[10px] text-muted-foreground pl-9">Sem materiais para este dia</p>
                  )}
                </div>
              ))}

              {estrutura.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dia estruturado. Verifique o período da campanha.
                </p>
              )}
            </div>

            {/* Opção de criar eventos */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.criar_eventos}
                onChange={(e) => setForm({ ...form, criar_eventos: e.target.checked })}
                className="rounded" />
              <span className="text-sm">
                Criar automaticamente na agenda (apenas dias com tema definido)
              </span>
            </label>
          </div>
        )}

        {/* ── ETAPA 3: Confirmação ── */}
        {etapa === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: form.cor_tema }} />
                <h3 className="font-semibold">{form.nome}</h3>
                <Badge variant="outline">{tipoLabel[form.tipo]}</Badge>
              </div>
              {form.descricao && <p className="text-sm text-muted-foreground">{form.descricao}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {format(parseISO(form.data_inicio), "dd/MM/yyyy")} → {format(parseISO(form.data_fim), "dd/MM/yyyy")}
                </span>
                <span>{dias} dias</span>
                <span>{materiais.length} material(is)</span>
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>Campanha criada com status <strong>Rascunho</strong></span>
              </div>
              {materiais.length > 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{materiais.length} arquivo(s) serão enviados para o storage</span>
                </div>
              )}
              {form.criar_eventos && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{estrutura.filter((d) => d.tema.trim()).length} evento(s) criados na agenda</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <span>Notificações geradas ao ativar a campanha</span>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé do wizard */}
        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          {etapa > 1 && (
            <Button variant="outline" onClick={() => setEtapa((e) => (e - 1) as 1|2|3)} disabled={salvando}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex-1" />
          {etapa === 1 && (
            <Button onClick={processar} disabled={!form.nome.trim() || !form.data_inicio || !form.data_fim || processando}>
              {processando
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processando…</>
                : <><ChevronRight className="w-4 h-4 mr-1" /> Processar e Revisar</>
              }
            </Button>
          )}
          {etapa === 2 && (
            <Button onClick={() => setEtapa(3)}>
              <ChevronRight className="w-4 h-4 mr-1" /> Confirmar
            </Button>
          )}
          {etapa === 3 && (
            <Button onClick={salvar} disabled={salvando}>
              {salvando
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando…</>
                : <><CheckCircle2 className="w-4 h-4 mr-1" /> Criar Campanha</>
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
