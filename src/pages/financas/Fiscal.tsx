import { useEffect, useState } from "react";
import { hojeLocal } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Receipt, Settings, CalendarDays, Loader2, RefreshCw, Save, CheckCircle2,
  AlertCircle, Clock, Wallet, Paperclip, Download, FileArchive, Sparkles, TrendingUp, TrendingDown, Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentosFiscaisDialog } from "@/components/fiscal/DocumentosFiscaisDialog";
import { AnalisarGuiaDialog } from "@/components/fiscal/AnalisarGuiaDialog";
import {
  carregarConfig, atualizarConfig,
  listarTiposObrigacao, listarObrigacoesAtivas, definirObrigacaoAtiva,
  gerarAgenda, listarAgenda, darBaixaObrigacao, criarLancamentoFiscal, exportarMaloteFiscalZip,
  listarInconsistencias, carregarInsightsFiscais,
  type InconsistenciaFiscal, type InsightsFiscais,
  type FiscalConfig, type FiscalTipoObrigacao, type FiscalObrigacaoAtiva,
  type FiscalAgendaItem,
} from "@/services/fiscalService";

const COR_CHIP: Record<string, string> = {
  blue:    "bg-info-soft text-info-text border-info-line",
  rose:    "bg-destructive-soft text-destructive-text border-destructive-line",
  amber:   "bg-warning-soft text-warning-text border-warning-line",
  emerald: "bg-success-soft text-success-text border-success-line",
  purple:  "bg-violeta-soft text-violeta-text border-violeta-line",
};

export default function Fiscal() {
  const [tab, setTab] = useState<"agenda" | "config" | "obrigacoes" | "insights">("agenda");
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl md:text-2xl">Módulo Fiscal</h1>
      </header>
      <p className="text-xs text-muted-foreground">
        Configuração, agenda fiscal automática e baixa de obrigações.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        {/* As quatro abas somavam 457px numa tela de 375px e saiam pela borda.
            Como o <main> e overflow-x-hidden, "Configuração" nao ficava atras
            de uma barra de rolagem: sumia. Em grade de quatro colunas cada aba
            recebe a mesma fatia, o rotulo trunca em vez de empurrar, e o icone
            so aparece a partir de sm — no celular ele custava 22px por aba
            para repetir o que o rotulo ja diz. */}
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="agenda" className="h-11 px-1.5 min-w-0 text-xs sm:text-sm">
            <CalendarDays className="w-3.5 h-3.5 mr-1.5 hidden sm:inline-block shrink-0" />
            <span className="truncate">Agenda</span>
          </TabsTrigger>
          <TabsTrigger value="obrigacoes" className="h-11 px-1.5 min-w-0 text-xs sm:text-sm">
            <Receipt className="w-3.5 h-3.5 mr-1.5 hidden sm:inline-block shrink-0" />
            <span className="truncate">Obrigações</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="h-11 px-1.5 min-w-0 text-xs sm:text-sm">
            <Lightbulb className="w-3.5 h-3.5 mr-1.5 hidden sm:inline-block shrink-0" />
            <span className="truncate">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="h-11 px-1.5 min-w-0 text-xs sm:text-sm">
            <Settings className="w-3.5 h-3.5 mr-1.5 hidden sm:inline-block shrink-0" />
            <span className="truncate">Config.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="mt-4">
          <AbaAgenda />
        </TabsContent>
        <TabsContent value="obrigacoes" className="mt-4">
          <AbaObrigacoes />
        </TabsContent>
        <TabsContent value="insights" className="mt-4">
          <AbaInsights />
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <AbaConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Aba Configuração ─────────────────────────────────────────────────
function AbaConfig() {
  const [config, setConfig] = useState<FiscalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarConfig().then(setConfig).finally(() => setLoading(false));
  }, []);

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    try {
      await atualizarConfig(config);
      toast.success("Configuração salva");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <Loading />;
  if (!config) return <p className="text-xs text-muted-foreground">Configuração não disponível.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identificação fiscal da igreja</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Município">
            <Input value={config.municipio ?? ""}
              onChange={(e) => setConfig({ ...config, municipio: e.target.value })} />
          </Field>
          <Field label="UF">
            <Input maxLength={2} value={config.uf ?? ""}
              onChange={(e) => setConfig({ ...config, uf: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Inscrição Municipal">
            <Input value={config.inscricao_municipal ?? ""}
              onChange={(e) => setConfig({ ...config, inscricao_municipal: e.target.value })} />
          </Field>
          <Field label="CNAE Principal">
            <Input value={config.cnae_principal ?? ""}
              onChange={(e) => setConfig({ ...config, cnae_principal: e.target.value })} />
          </Field>
          <Field label="Dia de vencimento do ISS">
            <Input type="number" min={1} max={31} value={config.dia_iss_municipal}
              onChange={(e) => setConfig({ ...config, dia_iss_municipal: Number(e.target.value) })} />
          </Field>
          <Field label="Alertar quantos dias antes do vencimento?">
            <Input type="number" min={1} max={30} value={config.alerta_dias_antes}
              onChange={(e) => setConfig({ ...config, alerta_dias_antes: Number(e.target.value) })} />
          </Field>
          <Field label="WhatsApp da Tesouraria (alertas)">
            <Input placeholder="(21) 99999-9999" value={config.whatsapp_tesouraria ?? ""}
              onChange={(e) => setConfig({ ...config, whatsapp_tesouraria: e.target.value })} />
          </Field>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t">
          <Switch
            checked={config.possui_funcionarios}
            onCheckedChange={(v) => setConfig({ ...config, possui_funcionarios: v })}
          />
          <span className="text-xs">Possui funcionários CLT (ativa eSocial, FGTS, DCTFWeb)</span>
        </div>
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Aba Obrigações ───────────────────────────────────────────────────
function AbaObrigacoes() {
  const [tipos, setTipos] = useState<FiscalTipoObrigacao[]>([]);
  const [ativas, setAtivas] = useState<FiscalObrigacaoAtiva[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const [t, a] = await Promise.all([listarTiposObrigacao(), listarObrigacoesAtivas()]);
    setTipos(t); setAtivas(a);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function toggle(codigo: string, atual: boolean) {
    try {
      await definirObrigacaoAtiva(codigo, !atual);
      toast.success(!atual ? "Obrigação ativada" : "Obrigação desativada");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  if (loading) return <Loading />;
  const ativasMap = new Map(ativas.map(a => [a.codigo_obrigacao, a]));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Obrigações fiscais</CardTitle>
        <p className="text-xs text-muted-foreground">Ative as obrigações que se aplicam à igreja</p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {tipos.map(t => {
          const a = ativasMap.get(t.codigo);
          const isAtiva = a?.ativa ?? false;
          return (
            <div key={t.codigo} className="flex items-center gap-3 p-2 border rounded-md">
              <span className="text-xl">{t.icone}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{t.nome}</span>
                  <Badge variant="outline" className={`text-xs ${COR_CHIP[t.cor] ?? ""}`}>
                    {t.esfera}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t.periodicidade}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t.descricao}</p>
              </div>
              <Switch checked={isAtiva} onCheckedChange={() => toggle(t.codigo, isAtiva)} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Aba Agenda ───────────────────────────────────────────────────────
function AbaAgenda() {
  const [items, setItems] = useState<FiscalAgendaItem[]>([]);
  const [docDialog, setDocDialog] = useState<{ id: string; nome: string } | null>(null);
  const [ocrDialog, setOcrDialog] = useState<{ id: string; nome: string } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);

  async function carregar() {
    setLoading(true);
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), 0, 1).toISOString().slice(0,10);
    const fim    = new Date(hoje.getFullYear() + 1, 11, 31).toISOString().slice(0,10);
    setItems(await listarAgenda({ inicio, fim }));
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function gerar12() {
    setGerando(true);
    try {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0,10);
      const fim    = new Date(hoje.getFullYear() + 1, hoje.getMonth(), 0).toISOString().slice(0,10);
      const result = await gerarAgenda(inicio, fim);
      const novos = result.filter((r: any) => r.novo).length;
      toast.success(`Agenda gerada — ${novos} novo(s) vencimento(s) criado(s)`);
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao gerar agenda");
    } finally {
      setGerando(false);
    }
  }

  async function gerarLancamentoPagar(it: FiscalAgendaItem) {
    if (it.lancamento_id) {
      toast.info("Esta obrigação já tem lançamento vinculado");
      return;
    }
    const valor = Number(prompt(`Valor estimado para ${it.tipo?.nome}:`)?.replace(",", ".") ?? "");
    if (isNaN(valor) || valor <= 0) return;
    try {
      await criarLancamentoFiscal(it.id, valor);
      toast.success("Lançamento criado em 'Contas a pagar'");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar lançamento");
    }
  }

  async function exportarMaloteMes() {
    setExportando(true);
    try {
      const hoje = new Date();
      await exportarMaloteFiscalZip(hoje.getFullYear(), hoje.getMonth() + 1);
      toast.success("Malote ZIP gerado e baixado");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao gerar malote");
    } finally {
      setExportando(false);
    }
  }

  async function baixar(it: FiscalAgendaItem) {
    const valor = Number(prompt(`Valor pago para ${it.tipo?.nome}:`)?.replace(",", ".") ?? "");
    if (isNaN(valor) || valor <= 0) return;
    try {
      await darBaixaObrigacao(it.id, {
        valor_pago: valor,
        data_pagamento: hojeLocal(),
      });
      toast.success("Baixa registrada");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  if (loading) return <Loading />;

  const fmtData = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR");
  const hoje = hojeLocal();
  const isAtrasado = (it: FiscalAgendaItem) => it.status === "pendente" && it.vencimento < hoje;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">Próximos vencimentos</CardTitle>
        {/* flex-wrap: os dois botoes somavam 399px numa tela de 375px. O pai
            ja tinha flex-wrap, mas este bloco interno nao, entao os dois
            desciam juntos e continuavam estourando a largura. */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={exportarMaloteMes} disabled={exportando} className="gap-2">
            {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
            Malote ZIP do mês
          </Button>
          <Button size="sm" onClick={gerar12} disabled={gerando} className="gap-2">
            {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Gerar próximos 12 meses
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma obrigação na agenda. Clique em "Gerar" pra criar.
          </p>
        ) : items.map(it => {
          const atrasado = isAtrasado(it);
          return (
            <div key={it.id} className={
              "flex items-center gap-2 p-2 border rounded-md text-xs " +
              (atrasado ? "border-destructive-line bg-destructive-soft/30" :
               it.status === "pago" ? "border-success-line bg-success-soft/20 opacity-70" : "")
            }>
              <span className="text-base shrink-0">{it.tipo?.icone}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">{it.tipo?.nome}</span>
                  <Badge variant="outline" className="text-xs">
                    {new Date(it.competencia + "T00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                  </Badge>
                  {it.status === "pago" && <Badge className="text-xs bg-success-soft text-success-text">Pago</Badge>}
                  {atrasado && <Badge className="text-xs bg-destructive-soft text-destructive-text">Atrasado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vence em {fmtData(it.vencimento)}
                  {it.valor_pago && ` · pago R$ ${it.valor_pago.toFixed(2).replace(".", ",")}`}
                </p>
              </div>
              <Button
                size="sm" variant="ghost"
                className="text-xs gap-1 h-7 px-2"
                onClick={() => setOcrDialog({ id: it.id, nome: it.tipo?.nome ?? "Obrigação" })}
                title="Analisar guia com OCR">
                <Sparkles className="w-3 h-3 text-gold" />
              </Button>
              <Button
                size="sm" variant="ghost"
                className="text-xs gap-1 h-7 px-2"
                onClick={() => setDocDialog({ id: it.id, nome: it.tipo?.nome ?? "Obrigação" })}
                title="Documentos anexados">
                <Paperclip className="w-3 h-3 text-info-text" />
              </Button>
              {it.status === "pendente" && !it.lancamento_id && (
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => gerarLancamentoPagar(it)}>
                  <Wallet className="w-3 h-3" /> Gerar lançamento
                </Button>
              )}
              {it.status === "pendente" && (
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => baixar(it)}>
                  <CheckCircle2 className="w-3 h-3" /> Baixar
                </Button>
              )}
              {it.lancamento_id && it.status === "pendente" && (
                <span className="text-xs text-info-text bg-info-soft px-1.5 py-0.5 rounded border border-info-line">
                  Em contas a pagar
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
      {docDialog && (
        <DocumentosFiscaisDialog
          open={!!docDialog}
          onOpenChange={(v) => { if (!v) setDocDialog(null); }}
          agendaId={docDialog.id}
          nomeObrigacao={docDialog.nome}
        />
      )}
      {ocrDialog && (
        <AnalisarGuiaDialog
          open={!!ocrDialog}
          onOpenChange={(v) => { if (!v) setOcrDialog(null); }}
          agendaId={ocrDialog.id}
          nomeObrigacao={ocrDialog.nome}
          onAplicado={carregar}
        />
      )}
    </Card>
  );
}


// ─── Aba Insights ─────────────────────────────────────────────────────
function AbaInsights() {
  const [insights, setInsights] = useState<InsightsFiscais | null>(null);
  const [inc, setInc] = useState<InconsistenciaFiscal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([carregarInsightsFiscais(), listarInconsistencias()])
      .then(([i, c]) => { setInsights(i); setInc(c); })
      .finally(() => setLoading(false));
  }, []);

  const fmtBR = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      {/* Métricas */}
      {insights && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metrica titulo={"Pago em " + insights.ano} valor={fmtBR(insights.total_pago_ytd)} />
          <Metrica titulo="Mês atual" valor={fmtBR(insights.total_pago_mes_atual)}
            variacao={insights.variacao_mes_pct} />
          <Metrica titulo="Mês anterior" valor={fmtBR(insights.total_pago_mes_anterior)} />
          <Metrica titulo={"Mais cara: " + (insights.obrigacao_mais_cara ?? "—")}
            valor={fmtBR(insights.obrigacao_mais_cara_total)} />
        </div>
      )}

      {/* Inconsistências */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-gold" /> Inconsistências detectadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {inc.length === 0 ? (
            <p className="text-xs text-success-text text-center py-3">
              ✓ Nenhuma inconsistência detectada
            </p>
          ) : inc.map((x, idx) => (
            <div key={idx} className={
              "border rounded-md p-2 text-xs " +
              (x.severidade === "alta" ? "border-destructive-line bg-destructive-soft/30" :
               x.severidade === "media" ? "border-warning-line bg-warning-soft/30" : "border-info-line bg-info-soft/30")
            }>
              <div className="flex items-center gap-1.5 mb-1">
                <Badge variant="outline" className="text-xs">
                  {x.tipo.replace("_", " ")}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {x.severidade}
                </Badge>
                <span className="font-medium">{x.nome_obrigacao}</span>
              </div>
              <p className="text-muted-foreground">{x.mensagem}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metrica({ titulo, valor, variacao }: { titulo: string; valor: string; variacao?: number | null }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
        <div className="text-base font-medium font-serif">{valor}</div>
        {variacao != null && (
          <div className={"flex items-center gap-1 text-xs " + (variacao >= 0 ? "text-success-text" : "text-destructive-text")}>
            {variacao >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {variacao.toFixed(1)}% vs mês anterior
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Loading() {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" /> Carregando...
    </div>
  );
}
