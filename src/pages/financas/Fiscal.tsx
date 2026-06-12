import { useEffect, useState } from "react";
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
  AlertCircle, Clock, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConfig, atualizarConfig,
  listarTiposObrigacao, listarObrigacoesAtivas, definirObrigacaoAtiva,
  gerarAgenda, listarAgenda, darBaixaObrigacao, criarLancamentoFiscal,
  type FiscalConfig, type FiscalTipoObrigacao, type FiscalObrigacaoAtiva,
  type FiscalAgendaItem,
} from "@/services/fiscalService";

const COR_CHIP: Record<string, string> = {
  blue:    "bg-blue-50 text-blue-700 border-blue-200",
  rose:    "bg-rose-50 text-rose-700 border-rose-200",
  amber:   "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  purple:  "bg-purple-50 text-purple-700 border-purple-200",
};

export default function Fiscal() {
  const [tab, setTab] = useState<"agenda" | "config" | "obrigacoes">("agenda");
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
        <TabsList>
          <TabsTrigger value="agenda"><CalendarDays className="w-3.5 h-3.5 mr-1.5" />Agenda</TabsTrigger>
          <TabsTrigger value="obrigacoes"><Receipt className="w-3.5 h-3.5 mr-1.5" />Obrigações</TabsTrigger>
          <TabsTrigger value="config"><Settings className="w-3.5 h-3.5 mr-1.5" />Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="mt-4">
          <AbaAgenda />
        </TabsContent>
        <TabsContent value="obrigacoes" className="mt-4">
          <AbaObrigacoes />
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
        <p className="text-[10px] text-muted-foreground">Ative as obrigações que se aplicam à igreja</p>
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
                  <Badge variant="outline" className={`text-[9px] ${COR_CHIP[t.cor] ?? ""}`}>
                    {t.esfera}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">
                    {t.periodicidade}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{t.descricao}</p>
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

  async function baixar(it: FiscalAgendaItem) {
    const valor = Number(prompt(`Valor pago para ${it.tipo?.nome}:`)?.replace(",", ".") ?? "");
    if (isNaN(valor) || valor <= 0) return;
    try {
      await darBaixaObrigacao(it.id, {
        valor_pago: valor,
        data_pagamento: new Date().toISOString().slice(0,10),
      });
      toast.success("Baixa registrada");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  if (loading) return <Loading />;

  const fmtData = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR");
  const hoje = new Date().toISOString().slice(0,10);
  const isAtrasado = (it: FiscalAgendaItem) => it.status === "pendente" && it.vencimento < hoje;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Próximos vencimentos</CardTitle>
        <Button size="sm" onClick={gerar12} disabled={gerando} className="gap-2">
          {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Gerar próximos 12 meses
        </Button>
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
              (atrasado ? "border-rose-200 bg-rose-50/30" :
               it.status === "pago" ? "border-emerald-200 bg-emerald-50/20 opacity-70" : "")
            }>
              <span className="text-base shrink-0">{it.tipo?.icone}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">{it.tipo?.nome}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {new Date(it.competencia + "T00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                  </Badge>
                  {it.status === "pago" && <Badge className="text-[9px] bg-emerald-100 text-emerald-700">Pago</Badge>}
                  {atrasado && <Badge className="text-[9px] bg-rose-100 text-rose-700">Atrasado</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Vence em {fmtData(it.vencimento)}
                  {it.valor_pago && ` · pago R$ ${it.valor_pago.toFixed(2).replace(".", ",")}`}
                </p>
              </div>
              {it.status === "pendente" && !it.lancamento_id && (
                <Button size="sm" variant="outline" className="text-[10px] gap-1" onClick={() => gerarLancamentoPagar(it)}>
                  <Wallet className="w-3 h-3" /> Gerar lançamento
                </Button>
              )}
              {it.status === "pendente" && (
                <Button size="sm" variant="outline" className="text-[10px] gap-1" onClick={() => baixar(it)}>
                  <CheckCircle2 className="w-3 h-3" /> Baixar
                </Button>
              )}
              {it.lancamento_id && it.status === "pendente" && (
                <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Em contas a pagar
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Auxiliares ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
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
