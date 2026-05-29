import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle,
  Loader2, Users, SkipForward, RefreshCw, Download, History,
  ChevronRight, Eye, Check, Trash2, Lock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Etapa = "upload" | "mapeamento" | "revisao" | "importando" | "concluido";
type EtapaExclusao = "opcoes" | "senha" | "confirmacao";

interface LinhaImport {
  _idx: number;
  nome: string;
  email: string;
  telefone: string;
  ministerio: string;
  tipo_pessoa: string;
  _erros: string[];
  _duplicado: boolean;
  _ignorar: boolean;
}

interface ImportHistorico {
  id: string;
  nome_arquivo: string;
  status: string;
  total_linhas: number;
  importados: number;
  ignorados: number;
  duplicados: number;
  erros: number;
  created_at: string;
  enviado_por_email: string | null;
}

const CAMPOS_SISTEMA = [
  { value: "nome",        label: "Nome completo *" },
  { value: "email",       label: "E-mail" },
  { value: "telefone",    label: "Telefone / Celular" },
  { value: "ministerio",  label: "Ministério" },
  { value: "tipo_pessoa", label: "Tipo (membro/congregado)" },
  { value: "_ignorar",    label: "— Ignorar coluna —" },
];

const detectarCampo = (col: string): string => {
  const c = col.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  if (/^nome|name|completo/.test(c)) return "nome";
  if (/email|e.mail/.test(c)) return "email";
  if (/tel|fone|celular|whats/.test(c)) return "telefone";
  if (/minist|ministerio|area/.test(c)) return "ministerio";
  if (/tipo|categoria|perfil|status/.test(c)) return "tipo_pessoa";
  return "_ignorar";
};

const normalizarTipo = (v: string): string => {
  const s = (v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  if (/membro/.test(s)) return "membro";
  if (/congreg/.test(s)) return "congregado";
  if (/visit/.test(s)) return "visitante";
  return "congregado";
};

const carregarXLSX = (): Promise<any> => {
  if ((window as any).XLSX) return Promise.resolve((window as any).XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve((window as any).XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

// ── Componente Principal ───────────────────────────────────────────────────────

export default function ImportacaoMembros() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [colunas, setColunas] = useState<string[]>([]);
  const [mapeamento, setMapeamento] = useState<Record<string,string>>({});
  const [linhas, setLinhas] = useState<LinhaImport[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [historico, setHistorico] = useState<ImportHistorico[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const [emailsExistentes, setEmailsExistentes] = useState<Set<string>>(new Set());
  const [telefonesExistentes, setTelefonesExistentes] = useState<Set<string>>(new Set());
  const fileRef  = useRef<HTMLInputElement>(null);
  const rowsRef  = useRef<Record<string, any>[]>([]); // substitui window.__importRows

  // ── Estado: fluxo de exclusão ──────────────────────────────────────────────
  const [excluirAlvo, setExcluirAlvo] = useState<ImportHistorico | null>(null);
  const [etapaExclusao, setEtapaExclusao] = useState<EtapaExclusao>("opcoes");
  const [opcaoExclusao, setOpcaoExclusao] = useState<"somente_historico" | "completa">("somente_historico");
  const [senhaExclusao, setSenhaExclusao] = useState("");
  const [erroSenha, setErroSenha] = useState("");
  const [executandoExclusao, setExecutandoExclusao] = useState(false);

  useEffect(() => {
    if (!hasRole(["admin", "secretaria"])) navigate("/", { replace: true });
    carregarDuplicidadeBase();
    carregarHistorico();
  }, []);

  const carregarDuplicidadeBase = async () => {
    const { data } = await supabase.from("membros").select("email, telefone");
    const emails = new Set<string>();
    const fones  = new Set<string>();
    (data ?? []).forEach((m: any) => {
      if (m.email)    emails.add(m.email.toLowerCase().trim());
      if (m.telefone) fones.add(m.telefone.replace(/\D/g,""));
    });
    setEmailsExistentes(emails);
    setTelefonesExistentes(fones);
  };

  const carregarHistorico = async () => {
    setLoadingHist(true);
    const { data } = await supabase
      .from("v_importacoes_resumo")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistorico((data ?? []) as ImportHistorico[]);
    setLoadingHist(false);
  };

  // ── Etapa 1: Processar arquivo ─────────────────────────────────────────────

  const processarArquivo = async (file: File) => {
    setCarregando(true);
    setArquivo(file);
    try {
      let rows: Record<string,any>[] = [];
      if (file.name.endsWith(".csv")) {
        rows = await parseCsv(file);
      } else {
        const XLSX = await carregarXLSX();
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      }
      if (rows.length === 0) { toast.error("Arquivo vazio ou sem dados."); setCarregando(false); return; }
      const cols = Object.keys(rows[0]);
      const map: Record<string,string> = {};
      cols.forEach(c => { map[c] = detectarCampo(c); });
      setColunas(cols);
      setMapeamento(map);
      setCarregando(false);
      setEtapa("mapeamento");
      rowsRef.current = rows;
    } catch (err: any) {
      toast.error("Erro ao processar arquivo: " + (err.message ?? "formato inválido"));
      setCarregando(false);
    }
  };

  const parseCsv = (file: File): Promise<Record<string,any>[]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text   = e.target?.result as string;
          const linhas = text.split(/\r?\n/).filter(l => l.trim());
          if (linhas.length < 2) { resolve([]); return; }
          const sep = linhas[0].includes(";") ? ";" : ",";
          const headers = linhas[0].split(sep).map(h => h.trim().replace(/^"|"$/g,""));
          const rows = linhas.slice(1).map(l => {
            const vals = l.split(sep).map(v => v.trim().replace(/^"|"$/g,""));
            const obj: Record<string,any> = {};
            headers.forEach((h,i) => { obj[h] = vals[i] ?? ""; });
            return obj;
          });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file, "UTF-8");
    });

  // ── Etapa 2 → 3: Processar com mapeamento ─────────────────────────────────

  const processarComMapeamento = () => {
    const rows: Record<string,any>[] = rowsRef.current;
    const processadas: LinhaImport[] = rows.map((row, idx) => {
      const get = (campo: string) => {
        const col = Object.keys(mapeamento).find(k => mapeamento[k] === campo);
        return col ? String(row[col] ?? "").trim() : "";
      };
      const nome      = get("nome");
      const email     = get("email").toLowerCase();
      const telefone  = get("telefone").replace(/\D/g,"");
      const ministerio= get("ministerio");
      const tipo_raw  = get("tipo_pessoa");
      const tipo_pessoa = normalizarTipo(tipo_raw);
      const erros: string[] = [];
      if (!nome) erros.push("Nome obrigatório");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push("E-mail inválido");
      const dupEmail = email ? emailsExistentes.has(email) : false;
      const dupFone  = telefone ? telefonesExistentes.has(telefone) : false;
      const duplicado = dupEmail || dupFone;
      return { _idx: idx + 2, nome, email, telefone, ministerio, tipo_pessoa, _erros: erros, _duplicado: duplicado, _ignorar: false };
    });
    setLinhas(processadas);
    setEtapa("revisao");
  };

  // ── Etapa 4: Importar ─────────────────────────────────────────────────────

  const importar = async () => {
    setEtapa("importando");
    const paraImportar = linhas.filter(l => !l._ignorar && l._erros.length === 0);
    const ignoradas    = linhas.filter(l => l._ignorar || l._erros.length > 0);
    let importados = 0;
    let erros      = 0;

    const { data: impRec } = await supabase.from("importacoes_membros").insert({
      nome_arquivo: arquivo?.name ?? "importacao",
      status: "processando",
      total_linhas: linhas.length,
      mapeamento,
      preview_dados: linhas.slice(0,5),
      enviado_por: user?.id,
    }).select("id").single();

    for (let i = 0; i < paraImportar.length; i++) {
      const l = paraImportar[i];
      setProgresso(Math.round((i / paraImportar.length) * 100));
      try {
        const payload: any = {
          nome_completo: l.nome,
          tipo_pessoa:   l.tipo_pessoa,
          status:        "ativo",
          perfil_acesso: "membro",
          importacao_id: impRec?.id ?? null,
        };
        if (l.email)    payload.email    = l.email;
        if (l.telefone) payload.telefone = l.telefone;
        await supabase.from("membros").insert(payload);
        importados++;
      } catch { erros++; }
    }

    const duplicados = linhas.filter(l => l._duplicado && !l._ignorar).length;

    if (impRec?.id) {
      await supabase.from("importacoes_membros").update({
        status: "concluido",
        importados,
        ignorados: ignoradas.length,
        duplicados,
        erros,
        concluido_em: new Date().toISOString(),
      }).eq("id", impRec.id);
    }

    setProgresso(100);
    setEtapa("concluido");
    carregarHistorico();
    toast.success(`${importados} membros importados com sucesso!`);
  };

  const toggleIgnorar = (idx: number) =>
    setLinhas(prev => prev.map(l => l._idx === idx ? { ...l, _ignorar: !l._ignorar } : l));

  const editarCampo = (idx: number, campo: keyof LinhaImport, valor: string) =>
    setLinhas(prev => prev.map(l => {
      if (l._idx !== idx) return l;
      const updated: any = { ...l, [campo]: valor };
      const erros: string[] = [];
      if (!updated.nome) erros.push("Nome obrigatório");
      if (updated.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated.email)) erros.push("E-mail inválido");
      updated._erros = erros;
      return updated;
    }));

  // ── Exclusão segura ────────────────────────────────────────────────────────

  const iniciarExclusao = (h: ImportHistorico) => {
    setExcluirAlvo(h);
    setEtapaExclusao("opcoes");
    setOpcaoExclusao("somente_historico");
    setSenhaExclusao("");
    setErroSenha("");
  };

  const fecharModalExclusao = () => {
    setExcluirAlvo(null);
    setSenhaExclusao("");
    setErroSenha("");
  };

  const validarSenhaExclusao = async () => {
    if (!senhaExclusao.trim()) { setErroSenha("Digite sua senha."); return; }
    setExecutandoExclusao(true);
    setErroSenha("");
    const { error } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: senhaExclusao,
    });
    setExecutandoExclusao(false);
    if (error) { setErroSenha("Senha incorreta. Tente novamente."); return; }
    setEtapaExclusao("confirmacao");
  };

  const confirmarExclusao = async () => {
    if (!excluirAlvo) return;
    setExecutandoExclusao(true);
    try {
      const { data, error } = await supabase.rpc("excluir_importacao", {
        p_importacao_id: excluirAlvo.id,
        p_deletar_dados: opcaoExclusao === "completa",
      });
      if (error) throw error;
      const resultado = data as any;
      const msg = opcaoExclusao === "completa"
        ? `Importação excluída — ${resultado.membros_excluidos ?? 0} membro(s) removido(s)`
        : "Histórico removido (dados dos membros mantidos)";
      toast.success(msg);
      fecharModalExclusao();
      carregarHistorico();
    } catch (err: any) {
      const msg = err?.message ?? "Erro ao excluir";
      if (msg.includes("PERMISSAO_NEGADA")) toast.error("Permissão negada: somente administradores.");
      else toast.error(msg);
    } finally {
      setExecutandoExclusao(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const total     = linhas.length;
  const validos   = linhas.filter(l => !l._ignorar && l._erros.length === 0).length;
  const comErro   = linhas.filter(l => l._erros.length > 0 && !l._ignorar).length;
  const duplicados= linhas.filter(l => l._duplicado && !l._ignorar).length;
  const ignorados = linhas.filter(l => l._ignorar).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Importação de Membros"
        description="Importe dados de planilhas Excel ou CSV"
        actions={
          <Button variant="outline" size="sm" onClick={() => setVerHistorico(!verHistorico)}>
            <History className="w-4 h-4 mr-2" />
            {verHistorico ? "Fechar histórico" : "Histórico de importações"}
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6">

        {/* Histórico */}
        {verHistorico && (
          <Card className="shadow-card-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="w-4 h-4" /> Histórico de Importações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHist ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
              ) : historico.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma importação realizada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {historico.map(h => (
                    <div key={h.id} className="rounded-lg border px-4 py-3 flex items-center gap-4 bg-background">
                      <FileSpreadsheet className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{h.nome_arquivo}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("pt-BR")}
                          {h.enviado_por_email ? ` · ${h.enviado_por_email}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs shrink-0">
                        <span className="text-emerald-600">✓ {h.importados}</span>
                        {h.ignorados > 0 && <span className="text-muted-foreground">⊘ {h.ignorados}</span>}
                        {h.erros > 0 && <span className="text-destructive">✗ {h.erros}</span>}
                      </div>
                      <Badge variant="outline" className={
                        h.status === "concluido" ? "text-emerald-600 border-emerald-300" :
                        h.status === "cancelado" ? "text-destructive border-destructive/30" :
                        "text-amber-600"
                      }>{h.status}</Badge>
                      {hasRole(["admin"]) && h.status !== "cancelado" && (
                        <button
                          title="Excluir importação"
                          onClick={() => iniciarExclusao(h)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/10 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── ETAPA 1: Upload ── */}
        {etapa === "upload" && (
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif text-xl">1. Selecionar planilha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) processarArquivo(f);
                }}
              >
                {carregando ? (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-sm">Processando arquivo…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileSpreadsheet className="w-12 h-12 opacity-40" />
                    <div>
                      <p className="font-medium text-foreground">Arraste o arquivo aqui ou clique para selecionar</p>
                      <p className="text-sm mt-1">Aceita: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong></p>
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }}
              />
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Formato esperado da planilha:</p>
                <p>• Primeira linha deve conter os cabeçalhos (nome das colunas)</p>
                <p>• Campos reconhecidos automaticamente: <em>nome, email, telefone, ministério, tipo</em></p>
                <p>• Dados desorganizados ou com nomes diferentes serão mapeados manualmente</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── ETAPA 2: Mapeamento ── */}
        {etapa === "mapeamento" && (
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif text-xl">2. Mapear colunas</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Arquivo: <strong>{arquivo?.name}</strong>. Confirme o que cada coluna representa.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {colunas.map(col => (
                  <div key={col} className="flex items-center gap-3">
                    <div className="w-48 shrink-0">
                      <p className="text-sm font-medium truncate" title={col}>{col}</p>
                      <p className="text-[10px] text-muted-foreground">Coluna da planilha</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Select
                      value={mapeamento[col] ?? "_ignorar"}
                      onValueChange={(v) => setMapeamento(prev => ({ ...prev, [col]: v }))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPOS_SISTEMA.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!Object.values(mapeamento).includes("nome") && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  A coluna <strong>Nome completo</strong> deve ser mapeada para prosseguir.
                </div>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setEtapa("upload")}>Voltar</Button>
                <Button
                  onClick={processarComMapeamento}
                  disabled={!Object.values(mapeamento).includes("nome")}
                >
                  Continuar → Revisar dados
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── ETAPA 3: Revisão ── */}
        {etapa === "revisao" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total", value: total, icon: <Users className="w-4 h-4"/>, cor: "text-primary" },
                { label: "Prontos", value: validos, icon: <CheckCircle2 className="w-4 h-4"/>, cor: "text-emerald-600" },
                { label: "Duplicados", value: duplicados, icon: <AlertTriangle className="w-4 h-4"/>, cor: "text-amber-600" },
                { label: "Erros", value: comErro, icon: <XCircle className="w-4 h-4"/>, cor: "text-destructive" },
              ].map(s => (
                <Card key={s.label} className="shadow-card-soft">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={s.cor}>{s.icon}</div>
                    <div>
                      <div className="text-xl font-bold">{s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="shadow-card-soft">
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-base">3. Revisar e corrigir registros</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() =>
                    setLinhas(prev => prev.map(l => ({ ...l, _ignorar: l._duplicado })))
                  }>
                    <SkipForward className="w-3.5 h-3.5 mr-1" /> Ignorar duplicados
                  </Button>
                  <Button variant="outline" size="sm" onClick={() =>
                    setLinhas(prev => prev.map(l => ({ ...l, _ignorar: l._erros.length > 0 })))
                  }>
                    <SkipForward className="w-3.5 h-3.5 mr-1" /> Ignorar com erro
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-2 w-6">#</th>
                        <th className="pb-2 pr-3">Nome</th>
                        <th className="pb-2 pr-3">E-mail</th>
                        <th className="pb-2 pr-3">Telefone</th>
                        <th className="pb-2 pr-3">Tipo</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {linhas.map(l => (
                        <tr key={l._idx} className={`${l._ignorar ? "opacity-40" : ""} hover:bg-muted/30`}>
                          <td className="py-2 pr-2 text-muted-foreground">{l._idx}</td>
                          <td className="py-2 pr-3">
                            <Input
                              className="h-7 text-xs w-36"
                              value={l.nome}
                              onChange={(e) => editarCampo(l._idx, "nome", e.target.value)}
                              disabled={l._ignorar}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <Input
                              className="h-7 text-xs w-36"
                              value={l.email}
                              onChange={(e) => editarCampo(l._idx, "email", e.target.value)}
                              disabled={l._ignorar}
                            />
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{l.telefone || "—"}</td>
                          <td className="py-2 pr-3">
                            <Select
                              value={l.tipo_pessoa}
                              onValueChange={(v) => editarCampo(l._idx, "tipo_pessoa", v)}
                              disabled={l._ignorar}
                            >
                              <SelectTrigger className="h-7 text-xs w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="membro">Membro</SelectItem>
                                <SelectItem value="congregado">Congregado</SelectItem>
                                <SelectItem value="visitante">Visitante</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 pr-3">
                            {l._ignorar ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">ignorado</Badge>
                            ) : l._erros.length > 0 ? (
                              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                {l._erros[0]}
                              </Badge>
                            ) : l._duplicado ? (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">duplicado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                                <Check className="w-2.5 h-2.5 mr-1" /> ok
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => toggleIgnorar(l._idx)}
                              className="text-[10px] underline text-muted-foreground hover:text-foreground"
                            >
                              {l._ignorar ? "Incluir" : "Ignorar"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setEtapa("mapeamento")}>Voltar</Button>
              <Button
                onClick={importar}
                disabled={validos === 0}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Importar {validos} registro{validos !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 4: Importando ── */}
        {etapa === "importando" && (
          <Card className="shadow-card-soft">
            <CardContent className="py-16 flex flex-col items-center gap-6">
              <div className="relative w-20 h-20">
                <Loader2 className="w-20 h-20 animate-spin text-primary/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{progresso}%</span>
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold">Importando membros…</p>
                <p className="text-sm text-muted-foreground mt-1">Não feche esta janela.</p>
              </div>
              <div className="w-full max-w-sm bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── ETAPA 5: Concluído ── */}
        {etapa === "concluido" && (
          <Card className="shadow-card-soft">
            <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-500" />
              <div>
                <h2 className="text-xl font-serif font-semibold">Importação concluída!</h2>
                <p className="text-muted-foreground mt-2">
                  {validos} membro{validos !== 1 ? "s" : ""} importado{validos !== 1 ? "s" : ""} com sucesso.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => {
                  setEtapa("upload"); setArquivo(null); setColunas([]); setMapeamento({}); setLinhas([]); setProgresso(0);
                }}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Nova importação
                </Button>
                <Button onClick={() => navigate("/membros")}>
                  <Users className="w-4 h-4 mr-2" /> Ver membros
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Modal: Exclusão de Importação ─────────────────────────────────────── */}
      <Dialog open={!!excluirAlvo} onOpenChange={(o) => { if (!o) fecharModalExclusao(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir importação
            </DialogTitle>
          </DialogHeader>

          {/* ── Etapa 1: Opções ── */}
          {etapaExclusao === "opcoes" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Importação: <strong className="text-foreground">{excluirAlvo?.nome_arquivo}</strong>
                <br />
                <span className="text-xs">{excluirAlvo?.importados ?? 0} membro(s) importado(s) neste lote.</span>
              </p>

              {/* Alerta para volume alto */}
              {(excluirAlvo?.importados ?? 0) > 100 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                    Atenção: você está excluindo um <strong>grande volume de dados</strong> ({excluirAlvo?.importados} registros).
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">O que deseja excluir?</Label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    opcaoExclusao === "somente_historico" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}>
                    <input
                      type="radio"
                      name="opcao_exclusao"
                      checked={opcaoExclusao === "somente_historico"}
                      onChange={() => setOpcaoExclusao("somente_historico")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">Somente o histórico</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Remove o registro desta importação do histórico, mas mantém os membros cadastrados no sistema.
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    opcaoExclusao === "completa" ? "border-destructive bg-destructive/5" : "border-border hover:bg-muted/40"
                  }`}>
                    <input
                      type="radio"
                      name="opcao_exclusao"
                      checked={opcaoExclusao === "completa"}
                      onChange={() => setOpcaoExclusao("completa")}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-destructive">Histórico + dados importados</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Remove o histórico <strong>e</strong> todos os {excluirAlvo?.importados ?? 0} membros importados neste lote. Um backup será criado automaticamente.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={fecharModalExclusao}>Cancelar</Button>
                <Button
                  variant={opcaoExclusao === "completa" ? "destructive" : "default"}
                  onClick={() => setEtapaExclusao("senha")}
                >
                  Continuar
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Etapa 2: Senha ── */}
          {etapaExclusao === "senha" && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Por segurança, confirme sua senha de administrador antes de prosseguir.
                </p>
              </div>
              <div>
                <Label htmlFor="senha-exclusao">Senha de administrador</Label>
                <Input
                  id="senha-exclusao"
                  type="password"
                  autoFocus
                  className={`mt-1.5 ${erroSenha ? "border-destructive" : ""}`}
                  value={senhaExclusao}
                  onChange={(e) => { setSenhaExclusao(e.target.value); setErroSenha(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") validarSenhaExclusao(); }}
                  placeholder="Digite sua senha"
                />
                {erroSenha && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {erroSenha}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEtapaExclusao("opcoes")}>Voltar</Button>
                <Button
                  variant="destructive"
                  onClick={validarSenhaExclusao}
                  disabled={executandoExclusao}
                >
                  {executandoExclusao
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Verificando…</>
                    : "Confirmar senha"
                  }
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Etapa 3: Confirmação final ── */}
          {etapaExclusao === "confirmacao" && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-center">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm font-semibold text-destructive">Esta ação não pode ser desfeita</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {opcaoExclusao === "completa"
                    ? `Você está prestes a excluir o histórico e ${excluirAlvo?.importados ?? 0} membro(s) importado(s). Um backup JSONB será gerado automaticamente para fins de auditoria.`
                    : "Você está prestes a remover apenas o histórico desta importação. Os membros continuarão no sistema."
                  }
                </p>
              </div>
              <p className="text-sm text-center">
                Tem certeza que deseja excluir <strong>"{excluirAlvo?.nome_arquivo}"</strong>?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEtapaExclusao("senha")}>Voltar</Button>
                <Button
                  variant="destructive"
                  onClick={confirmarExclusao}
                  disabled={executandoExclusao}
                >
                  {executandoExclusao
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Excluindo…</>
                    : "Sim, excluir definitivamente"
                  }
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
