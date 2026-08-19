import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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
  Download, ShieldCheck, Users, AlertTriangle, Loader2,
  History, FileText, Eye, EyeOff, Filter, Lock,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ExportLog {
  id: string;
  usuario_email: string | null;
  filtro_tipo: string;
  filtro_valor: string | null;
  total_registros: number;
  formato: string;
  created_at: string;
}

interface Ministerio { id: string; nome: string; }

// Campos que podem ser exportados — controle granular LGPD
const CAMPOS_DISPONIVEIS = [
  { value: "nome_completo",   label: "Nome completo",    sensivel: false },
  { value: "email",           label: "E-mail",           sensivel: true  },
  { value: "telefone",        label: "Telefone",         sensivel: true  },
  { value: "tipo_pessoa",     label: "Tipo",             sensivel: false },
  { value: "status",          label: "Status",           sensivel: false },
  { value: "data_nascimento", label: "Data de nascimento", sensivel: true },
  { value: "cpf",             label: "CPF",              sensivel: true  },
  { value: "endereco",        label: "Endereço",         sensivel: true  },
  { value: "created_at",      label: "Data de cadastro", sensivel: false },
];

// Gera CSV a partir de um array de objetos
const gerarCsv = (dados: Record<string,any>[], campos: string[]): string => {
  const header = campos.join(";");
  const rows   = dados.map(d =>
    campos.map(c => {
      const v = d[c] ?? "";
      const s = String(v).replace(/"/g,'""');
      return /[;\n\r"]/.test(s) ? `"${s}"` : s;
    }).join(";")
  );
  return "﻿" + [header, ...rows].join("\r\n"); // BOM para Excel PT-BR
};

const baixarArquivo = (conteudo: string, nome: string, tipo: string) => {
  const blob = new Blob([conteudo], { type: tipo });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Componente ─────────────────────────────────────────────────────────────────

export default function ExportacaoAdmin() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();

  // Filtros de exportação
  // Tipado a partir do enum real: `string` deixava passar valores que a
  // coluna tipo_pessoa rejeita.
  const [filtroTipo, setFiltroTipo] =
    useState<Database["public"]["Enums"]["tipo_pessoa"] | "todos">("todos");
  const [filtroMinist, setFiltroMinist] = useState<string>("todos");
  const [camposSel, setCamposSel] = useState<string[]>(["nome_completo","email","telefone","tipo_pessoa","status"]);
  const [ministerios, setMinerios] = useState<Ministerio[]>([]);

  // Modal de confirmação de senha
  const [senhaOpen, setSenhaOpen] = useState(false);
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [verificando, setVerificando] = useState(false);

  // Log de exportações
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  // Preview
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!hasRole(["admin"])) { navigate("/", { replace: true }); return; }
    carregarMinist();
    carregarLogs();
  }, []);

  useEffect(() => {
    if (filtroTipo || filtroMinist) contarRegistros();
  }, [filtroTipo, filtroMinist]);

  const carregarMinist = async () => {
    const { data } = await supabase.from("ministerios").select("id,nome").order("nome");
    setMinerios((data ?? []) as Ministerio[]);
  };

  const carregarLogs = async () => {
    setLoadingLog(true);
    const { data } = await supabase
      .from("exportacoes_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs((data ?? []) as ExportLog[]);
    setLoadingLog(false);
  };

  const contarRegistros = async () => {
    setLoadingPreview(true);
    let q = supabase.from("membros").select("id", { count: "exact", head: true });
    if (filtroTipo !== "todos") q = q.eq("tipo_pessoa", filtroTipo);
    const { count } = await q;
    setPreviewCount(count ?? 0);
    setLoadingPreview(false);
  };

  const toggleCampo = (campo: string) => {
    setCamposSel(prev =>
      prev.includes(campo) ? prev.filter(c => c !== campo) : [...prev, campo]
    );
  };

  // ── Exportar (depois da confirmação de senha) ─────────────────────────────

  const confirmarExportacao = async () => {
    if (!senha) { toast.error("Digite sua senha para confirmar."); return; }
    setVerificando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: user?.email ?? "",
      password: senha,
    });
    setVerificando(false);
    if (error) {
      toast.error("Senha incorreta. Tente novamente.");
      return;
    }
    setSenhaOpen(false);
    setSenha("");
    await executarExportacao();
  };

  const executarExportacao = async () => {
    try {
      // Busca dados com filtros
      let q = supabase.from("membros").select(camposSel.join(","));
      if (filtroTipo !== "todos") q = q.eq("tipo_pessoa", filtroTipo);

      // Se filtrando por ministério, busca os IDs dos membros
      if (filtroMinist !== "todos") {
        const { data: mids } = await supabase
          .from("ministerio_membros")
          .select("membro_id")
          .eq("ministerio_id", filtroMinist);
        const ids = (mids ?? []).map((m: any) => m.membro_id);
        if (ids.length === 0) { toast.warning("Nenhum membro neste ministério."); return; }
        q = q.in("id", ids);
      }

      const { data, error } = await q;
      if (error) { toast.error(error.message); return; }

      const registros = data ?? [];
      if (registros.length === 0) { toast.warning("Nenhum registro encontrado com esses filtros."); return; }

      // Gera e baixa o CSV
      const csv       = gerarCsv(registros as Record<string,any>[], camposSel);
      const dataStr   = new Date().toISOString().slice(0,10);
      const nomeArq   = `diakonia_membros_${dataStr}.csv`;
      baixarArquivo(csv, nomeArq, "text/csv;charset=utf-8;");

      // Registra no log LGPD
      const ministNome = ministerios.find(m => m.id === filtroMinist)?.nome;
      await supabase.rpc("registrar_exportacao", {
        p_filtro_tipo:  filtroTipo,
        p_filtro_valor: filtroMinist !== "todos" ? ministNome : null,
        p_total:        registros.length,
        p_formato:      "csv",
        p_campos:       camposSel,
      });

      toast.success(`${registros.length} registros exportados e log LGPD registrado.`);
      carregarLogs();
    } catch (err: any) {
      toast.error("Erro na exportação: " + (err.message ?? ""));
    }
  };

  return (
    <div>
      <PageHeader
        title="Exportação de Dados"
        description="Exportação segura com controle LGPD — apenas administradores"
      />

      <div className="p-4 md:p-8 space-y-6">

        {/* Aviso LGPD */}
        <div className="rounded-md border border-gold/30 bg-gold/5 px-4 py-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-gold mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-gold">Área protegida — LGPD</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Toda exportação exige confirmação de senha e é registrada em log auditável.
              Dados sensíveis estão marcados com 🔒.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* ── Configuração da exportação ── */}
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tipo de pessoa</Label>
                <Select
                  value={filtroTipo}
                  onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="membro">Apenas membros</SelectItem>
                    <SelectItem value="congregado">Apenas congregados</SelectItem>
                    <SelectItem value="visitante">Apenas visitantes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Filtrar por ministério</Label>
                <Select value={filtroMinist} onValueChange={setFiltroMinist}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os ministérios</SelectItem>
                    {ministerios.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview da contagem */}
              <div className="rounded-md border bg-muted/30 px-3 py-3 flex items-center gap-3">
                <Users className="w-4 h-4 text-primary shrink-0" />
                {loadingPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-sm">
                    <strong>{previewCount ?? "—"}</strong> registros serão exportados
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Seleção de campos ── */}
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" /> Campos a exportar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CAMPOS_DISPONIVEIS.map(c => (
                <label key={c.value} className="flex items-center gap-3 cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={camposSel.includes(c.value)}
                    onChange={() => toggleCampo(c.value)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm flex-1">{c.label}</span>
                  {c.sensivel && (
                    <span title="Dado sensível — LGPD">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    </span>
                  )}
                </label>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Botão de exportar */}
        <div className="flex justify-end">
          <Button
            size="lg"
            className="gap-2 min-w-[200px]"
            disabled={camposSel.length === 0 || (previewCount ?? 0) === 0}
            onClick={() => setSenhaOpen(true)}
          >
            <Download className="w-5 h-5" />
            Exportar CSV
          </Button>
        </div>

        {/* ── Log de exportações ── */}
        <Card className="shadow-card-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" /> Log de Exportações (LGPD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLog ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhuma exportação realizada ainda.</p>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="rounded-lg border px-4 py-3 flex items-center gap-4 bg-background">
                    <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {log.filtro_tipo === "todos" ? "Todos os registros" : log.filtro_tipo}
                        {log.filtro_valor ? ` · ${log.filtro_valor}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                        {log.usuario_email ? ` · ${log.usuario_email}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span>{log.total_registros} registros</span>
                      <Badge variant="outline" className="text-xs">{log.formato}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Modal de confirmação de senha ── */}
      <Dialog open={senhaOpen} onOpenChange={(o) => { setSenhaOpen(o); if (!o) setSenha(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif text-xl">
              <ShieldCheck className="w-5 h-5 text-gold" />
              Confirmar exportação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p>Você está prestes a exportar:</p>
              <p>• <strong>{previewCount}</strong> registros</p>
              <p>• Campos: {camposSel.map(c => CAMPOS_DISPONIVEIS.find(f => f.value === c)?.label).join(", ")}</p>
              <p className="text-amber-700 dark:text-amber-400">• Esta ação será registrada no log LGPD</p>
            </div>
            <div className="space-y-1">
              <Label>Sua senha para confirmar</Label>
              <div className="relative">
                <Input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmarExportacao(); }}
                  placeholder="Digite sua senha"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSenhaOpen(false); setSenha(""); }}>
              Cancelar
            </Button>
            <Button onClick={confirmarExportacao} disabled={verificando || !senha}>
              {verificando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Confirmar e exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
