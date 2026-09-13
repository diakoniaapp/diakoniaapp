import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Users, Calculator, Loader2, Plus, Briefcase,
  TrendingUp, AlertCircle, Pencil, PowerOff, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PaginaSkeleton } from "@/components/ListState";
import {
  listarContratados, atualizarContratado, desativarContratado,
  brl, VINCULO_LABEL, VINCULO_COR,
  calcularCLT, calcularRPA, calcularMEI, calcularPrebenda,
  type FinContratado, type FinVinculoTipo,
  type ResultadoCLT, type ResultadoRPA, type ResultadoMEI, type ResultadoPrebenda,
} from "@/services/folhaService";
import { ContratadoForm } from "@/components/financas/ContratadoForm";

export default function FinancasFolha() {
  const [contratados, setContratados] = useState<FinContratado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinContratado | null>(null);
  const [alternando, setAlternando] = useState<FinContratado | null>(null);
  const [busy, setBusy] = useState(false);

  // `loading` só gate o esqueleto da PÁGINA INTEIRA na primeira carga — se
  // `carregar()` o tocasse toda vez (era o bug original), desativar um
  // contratado ou alternar "mostrar inativos" desmontava a árvore toda e a
  // Tabs (não controlada, `defaultValue="calc"`) esquecia que o usuário
  // estava na aba Contratados, jogando de volta pra Calculadoras.
  useEffect(() => {
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (loading) return; // evita a segunda busca durante a carga inicial
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInativos]);

  async function carregar() {
    try {
      setContratados(await listarContratados(mostrarInativos));
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function confirmarAlternar() {
    if (!alternando) return;
    setBusy(true);
    try {
      if (alternando.ativo) {
        await desativarContratado(alternando.id);
        toast.success("Contratado desativado");
      } else {
        await atualizarContratado(alternando.id, { ativo: true });
        toast.success("Contratado reativado");
      }
      setAlternando(null);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-gold" /> Folha & Encargos
          </h1>
          <p className="text-xs text-muted-foreground">
            CLT · MEI · RPA · Prebenda — calculadoras didáticas pra você acompanhar e aprender
          </p>
        </div>
      </div>

      <Tabs defaultValue="calc">
        <TabsList>
          <TabsTrigger value="calc" className="gap-1.5">
            <Calculator className="w-3.5 h-3.5" /> Calculadoras
          </TabsTrigger>
          <TabsTrigger value="contratados" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Contratados ({contratados.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calc" className="space-y-4">
          <CalculadorasGrid />
        </TabsContent>

        <TabsContent value="contratados">
          <ListaContratados
            contratados={contratados}
            mostrarInativos={mostrarInativos}
            onMostrarInativosChange={setMostrarInativos}
            onNovo={() => { setEditando(null); setFormOpen(true); }}
            onEditar={(c) => { setEditando(c); setFormOpen(true); }}
            onAlternar={setAlternando}
          />
        </TabsContent>
      </Tabs>

      <ContratadoForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        contratado={editando} onSaved={carregar} />

      <AlertDialog open={!!alternando} onOpenChange={(v) => !v && setAlternando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alternando?.ativo ? "Desativar contratado?" : "Reativar contratado?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {alternando?.ativo
                ? `"${alternando?.nome}" deixa de aparecer na lista ativa. Nada nos cálculos ou lançamentos já feitos muda.`
                : `"${alternando?.nome}" volta a aparecer na lista ativa.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAlternar} disabled={busy}>
              {busy ? "..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Calculadoras (4 tabs internos)
// ═══════════════════════════════════════════════════════════════════════════
function CalculadorasGrid() {
  return (
    <Tabs defaultValue="clt" className="w-full">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="clt">CLT</TabsTrigger>
        <TabsTrigger value="rpa">RPA</TabsTrigger>
        <TabsTrigger value="mei">MEI</TabsTrigger>
        <TabsTrigger value="prebenda">Prebenda</TabsTrigger>
      </TabsList>

      <TabsContent value="clt"><CalcCLT /></TabsContent>
      <TabsContent value="rpa"><CalcRPA /></TabsContent>
      <TabsContent value="mei"><CalcMEI /></TabsContent>
      <TabsContent value="prebenda"><CalcPrebenda /></TabsContent>
    </Tabs>
  );
}

// ─── Calculadora CLT ─────────────────────────────────────────────────────
function CalcCLT() {
  const [salario, setSalario] = useState<number>(1800);
  const [vaDia, setVaDia] = useState<number>(35);
  const [vtDia, setVtDia] = useState<number>(4.80);
  const [dependentes, setDependentes] = useState<number>(0);
  const [cebas, setCebas] = useState<boolean>(false);
  const [res, setRes] = useState<ResultadoCLT | null>(null);
  const [busy, setBusy] = useState(false);

  async function calcular() {
    setBusy(true);
    try {
      const r = await calcularCLT({
        salario, vaPorDia: vaDia, vtPorDia: vtDia,
        dependentes, temCebas: cebas,
      });
      setRes(r);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <h3 className="font-serif text-base">Calculadora CLT</h3>
        <p className="text-xs text-muted-foreground">
          Salário líquido + custo total (encargos da igreja). Tabelas INSS/IRRF vigentes.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Salário base</Label>
            <Input type="number" step="0.01" value={salario} onChange={(e) => setSalario(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">VR/dia (R$)</Label>
            <Input type="number" step="0.01" value={vaDia} onChange={(e) => setVaDia(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">VT/dia/sentido</Label>
            <Input type="number" step="0.01" value={vtDia} onChange={(e) => setVtDia(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Dependentes IR</Label>
            <Input type="number" min={0} value={dependentes} onChange={(e) => setDependentes(Number(e.target.value))} />
          </div>
          <div className="md:col-span-2 flex items-end">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={cebas} onChange={(e) => setCebas(e.target.checked)} />
              Igreja tem CEBAS (isenta INSS Patronal/RAT/Terceiros)
            </label>
          </div>
        </div>

        <Button onClick={calcular} disabled={busy} className="bg-gold hover:bg-gold/90 text-white">
          <Calculator className="w-3.5 h-3.5 mr-1.5" /> {busy ? "..." : "Calcular"}
        </Button>

        {res && (
          <div className="space-y-3 pt-2">
            {/* Empregado recebe */}
            <div className="border rounded-md p-3 bg-success-soft/30 border-success-line">
              <p className="text-xs uppercase tracking-wide text-success-text mb-1">Empregado recebe</p>
              {res.passos.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-border/30 last:border-0">
                  <span className={i === res.passos.length - 1 ? "font-semibold" : ""}>
                    {p.titulo}
                    {p.descricao && <span className="text-xs text-muted-foreground ml-1">({p.descricao})</span>}
                  </span>
                  <span className={`tabular-nums ${i === res.passos.length - 1 ? "font-semibold text-success-text text-base" : p.valor < 0 ? "text-destructive-text" : ""}`}>
                    {brl(p.valor)}
                  </span>
                </div>
              ))}
            </div>

            {/* Igreja paga */}
            <div className="border rounded-md p-3 bg-destructive-soft/30 border-destructive-line">
              <p className="text-xs uppercase tracking-wide text-destructive-text mb-1">Igreja paga</p>
              <div className="space-y-0.5 text-xs">
                <Linha label="Salário base" valor={res.salario_base} />
                <Linha label="+ FGTS 8%" valor={res.fgts} />
                <Linha label="+ INSS Patronal 20%" valor={res.inss_patronal} hint={cebas ? "isento" : ""} />
                <Linha label="+ RAT 3%" valor={res.rat} hint={cebas ? "isento" : ""} />
                <Linha label="+ Terceiros 5,8%" valor={res.terceiros} hint={cebas ? "isento" : ""} />
                <Linha label="+ VA pago" valor={res.va_total} />
                <Linha label="+ VT pago" valor={res.vt_total} />
                <Linha label="+ Provisão 13º (1/12)" valor={res.decimo_provisao} />
                <Linha label="+ Provisão Férias +1/3" valor={res.ferias_provisao} />
                <div className="flex items-center justify-between text-sm font-semibold pt-1.5 border-t border-destructive-line mt-1">
                  <span>💰 CUSTO TOTAL MENSAL</span>
                  <span className="tabular-nums text-destructive-text">{brl(res.custo_total)}</span>
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {Math.round((res.custo_total / res.salario_base) * 100)}% do salário base
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Calculadora RPA ─────────────────────────────────────────────────────
function CalcRPA() {
  const [bruto, setBruto] = useState<number>(800);
  const [dependentes, setDependentes] = useState<number>(0);
  const [reterIss, setReterIss] = useState(false);
  const [alqIss, setAlqIss] = useState<number>(5);
  const [cebas, setCebas] = useState(false);
  const [res, setRes] = useState<ResultadoRPA | null>(null);
  const [busy, setBusy] = useState(false);

  async function calcular() {
    setBusy(true);
    try {
      const r = await calcularRPA({
        valorBruto: bruto, dependentes,
        reterIss, alqIss, temCebas: cebas,
      });
      setRes(r);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <h3 className="font-serif text-base">Calculadora RPA (Autônomo)</h3>
        <p className="text-xs text-muted-foreground">
          Para músico de evento, palestrante, conserto pontual.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Valor bruto</Label>
            <Input type="number" step="0.01" value={bruto} onChange={(e) => setBruto(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Dependentes</Label>
            <Input type="number" min={0} value={dependentes} onChange={(e) => setDependentes(Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">% ISS</Label>
            <Input type="number" step="0.1" value={alqIss} onChange={(e) => setAlqIss(Number(e.target.value))} disabled={!reterIss} />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={reterIss} onChange={(e) => setReterIss(e.target.checked)} />
            Reter ISS na fonte
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer md:col-span-2">
            <input type="checkbox" checked={cebas} onChange={(e) => setCebas(e.target.checked)} />
            Igreja tem CEBAS (isenta INSS patronal 20%)
          </label>
        </div>

        <Button onClick={calcular} disabled={busy} className="bg-gold hover:bg-gold/90 text-white">
          <Calculator className="w-3.5 h-3.5 mr-1.5" /> {busy ? "..." : "Calcular"}
        </Button>

        {res && (
          <div className="space-y-3 pt-2">
            <div className="border rounded-md p-3 bg-success-soft/30 border-success-line">
              <p className="text-xs uppercase tracking-wide text-success-text mb-1">Autônomo recebe</p>
              {res.passos.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-border/30 last:border-0">
                  <span className={i === res.passos.length - 1 ? "font-semibold" : ""}>
                    {p.titulo}{p.descricao && <span className="text-xs text-muted-foreground ml-1">({p.descricao})</span>}
                  </span>
                  <span className={`tabular-nums ${i === res.passos.length - 1 ? "font-semibold text-success-text text-base" : p.valor < 0 ? "text-destructive-text" : ""}`}>
                    {brl(p.valor)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border rounded-md p-3 bg-destructive-soft/30 border-destructive-line">
              <p className="text-xs uppercase tracking-wide text-destructive-text mb-1">Igreja paga</p>
              <Linha label="Valor bruto" valor={res.bruto} />
              <Linha label="+ INSS Patronal 20%" valor={res.inss_patronal} hint={cebas ? "isento" : ""} />
              <div className="flex items-center justify-between text-sm font-semibold pt-1.5 border-t border-destructive-line mt-1">
                <span>💰 CUSTO TOTAL</span>
                <span className="tabular-nums text-destructive-text">{brl(res.custo_total)}</span>
              </div>
            </div>
            <div className="border rounded-md p-2 bg-info-soft/30 border-info-line text-xs text-info-text space-y-0.5">
              <p className="font-medium">📋 Obrigações:</p>
              <p>• Emitir RPA · Recolher INSS (GPS) até dia 20 · IRRF (DARF 0588) se aplicável</p>
              <p>• Informar na GFIP / eSocial</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Calculadora MEI ─────────────────────────────────────────────────────
function CalcMEI() {
  const [valor, setValor] = useState<number>(1500);
  const [sub, setSub] = useState(false);
  const [exc, setExc] = useState(false);
  const [hab, setHab] = useState(false);
  const [hora, setHora] = useState(false);
  const [res, setRes] = useState<ResultadoMEI | null>(null);

  function calcular() {
    const r = calcularMEI({
      valorNF: valor,
      haSubordinacao: sub,
      haExclusividade: exc,
      haHabitualidade: hab,
      pagaPorHora: hora,
    });
    setRes(r);
  }

  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <h3 className="font-serif text-base">Calculadora MEI (Prestador PJ)</h3>
        <p className="text-xs text-muted-foreground">
          Pra prestador recorrente. <strong>Atenção ao risco trabalhista.</strong>
        </p>

        <div className="space-y-2">
          <div>
            <Label className="text-xs">Valor mensal da NF</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </div>
          <div className="border rounded-md p-2 bg-warning-soft/30 border-warning-line space-y-1">
            <p className="text-xs font-medium text-warning-text">⚠ Check de risco trabalhista:</p>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} />
              Há subordinação direta (horário fixo, regras)?
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={exc} onChange={(e) => setExc(e.target.checked)} />
              Há exclusividade (só presta pra igreja)?
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={hab} onChange={(e) => setHab(e.target.checked)} />
              Há habitualidade (presta há +1 ano)?
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={hora} onChange={(e) => setHora(e.target.checked)} />
              Pagam por hora trabalhada?
            </label>
          </div>
        </div>

        <Button onClick={calcular} className="bg-gold hover:bg-gold/90 text-white">
          <Calculator className="w-3.5 h-3.5 mr-1.5" /> Calcular
        </Button>

        {res && (
          <div className="space-y-2 pt-2">
            <div className="border rounded-md p-3 bg-success-soft/30 border-success-line">
              <p className="text-xs uppercase tracking-wide text-success-text mb-1">Resultado</p>
              <Linha label="Valor NF" valor={res.valor_nf} />
              <Linha label="💰 Custo total pra igreja" valor={res.custo_total} bold />
              <p className="text-xs text-muted-foreground mt-1">Sem encargos da contratante — MEI emite a própria NF.</p>
            </div>

            {res.alertas.length > 0 && (
              <div className="border rounded-md p-3 bg-destructive-soft/30 border-destructive-line space-y-1">
                <p className="text-xs font-medium text-destructive-text flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Avisos
                </p>
                {res.alertas.map((a, i) => (
                  <p key={i} className="text-xs text-destructive-text">• {a}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Calculadora Prebenda ────────────────────────────────────────────────
function CalcPrebenda() {
  const [prebenda, setPrebenda] = useState<number>(5500);
  const [aluguel, setAluguel] = useState<number>(1500);
  const [outros, setOutros] = useState<number>(0);
  const [dep, setDep] = useState<number>(0);
  const [inss, setInss] = useState(true);
  const [res, setRes] = useState<ResultadoPrebenda | null>(null);
  const [busy, setBusy] = useState(false);

  async function calcular() {
    setBusy(true);
    try {
      const r = await calcularPrebenda({
        prebenda, auxAluguel: aluguel, auxOutros: outros,
        dependentes: dep, contribuiInss: inss,
      });
      setRes(r);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="py-3 space-y-3">
        <h3 className="font-serif text-base">Calculadora Prebenda (Pastor)</h3>
        <p className="text-xs text-muted-foreground">
          Lei 10.170/2000 — pastor é contribuinte individual. Sem INSS patronal pela igreja.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">Prebenda mensal</Label>
            <Input type="number" step="0.01" value={prebenda} onChange={(e) => setPrebenda(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">+ Auxílio aluguel</Label>
            <Input type="number" step="0.01" value={aluguel} onChange={(e) => setAluguel(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">+ Outros</Label>
            <Input type="number" step="0.01" value={outros} onChange={(e) => setOutros(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Dependentes</Label>
            <Input type="number" min={0} value={dep} onChange={(e) => setDep(Number(e.target.value))} />
          </div>
          <label className="md:col-span-4 flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={inss} onChange={(e) => setInss(e.target.checked)} />
            Pastor contribui INSS individual 20% (recomendado)
          </label>
        </div>

        <Button onClick={calcular} disabled={busy} className="bg-gold hover:bg-gold/90 text-white">
          <Calculator className="w-3.5 h-3.5 mr-1.5" /> {busy ? "..." : "Calcular"}
        </Button>

        {res && (
          <div className="space-y-3 pt-2">
            <div className="border rounded-md p-3 bg-success-soft/30 border-success-line">
              <p className="text-xs uppercase tracking-wide text-success-text mb-1">Pastor recebe</p>
              {res.passos.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-border/30 last:border-0">
                  <span className={i === res.passos.length - 1 ? "font-semibold" : ""}>
                    {p.titulo}{p.descricao && <span className="text-xs text-muted-foreground ml-1">({p.descricao})</span>}
                  </span>
                  <span className={`tabular-nums ${i === res.passos.length - 1 ? "font-semibold text-success-text text-base" : p.valor < 0 ? "text-destructive-text" : ""}`}>
                    {brl(p.valor)}
                  </span>
                </div>
              ))}
            </div>
            <div className="border rounded-md p-3 bg-destructive-soft/30 border-destructive-line">
              <p className="text-xs uppercase tracking-wide text-destructive-text mb-1">Igreja paga</p>
              <Linha label="Bruto total" valor={res.bruto_total} bold />
              <p className="text-xs text-muted-foreground mt-1">Sem INSS Patronal · sem FGTS · sem 13º · sem férias</p>
            </div>
            <div className="border rounded-md p-2 bg-info-soft/30 border-info-line text-xs text-info-text space-y-0.5">
              <p className="font-medium">📋 Obrigações:</p>
              <p>• Reter IRRF (DARF 0561) · Emitir Recibo de Prebenda</p>
              <p>• Pastor declara no IRPF (carnê-leão ou completo)</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Componente Linha auxiliar ───────────────────────────────────────────
function Linha({ label, valor, hint, bold }: { label: string; valor: number; hint?: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={bold ? "font-semibold" : ""}>
        {label}
        {hint && <span className="text-xs text-muted-foreground ml-1">({hint})</span>}
      </span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${valor < 0 ? "text-destructive-text" : ""}`}>
        {brl(valor)}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Lista de contratados
// ═══════════════════════════════════════════════════════════════════════════
function ListaContratados({ contratados, mostrarInativos, onMostrarInativosChange, onNovo, onEditar, onAlternar }: {
  contratados: FinContratado[];
  mostrarInativos: boolean;
  onMostrarInativosChange: (v: boolean) => void;
  onNovo: () => void;
  onEditar: (c: FinContratado) => void;
  onAlternar: (c: FinContratado) => void;
}) {
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-serif text-base">Contratados ({contratados.length})</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => onMostrarInativosChange(e.target.checked)} />
              Mostrar inativos
            </label>
            <Button size="sm" onClick={onNovo} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Plus className="w-3.5 h-3.5" /> Novo
            </Button>
          </div>
        </div>
        {contratados.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">
            Nenhum contratado cadastrado ainda.
            Use as <strong>calculadoras</strong> para conferir valores antes de cada pagamento.
          </p>
        ) : (
          <div className="space-y-1">
            {contratados.map(c => (
              <div key={c.id} className={`border rounded-md px-3 py-2 flex items-center justify-between gap-2 ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                <div className="min-w-0 flex-1">
                  {/* `<div>`, não `<p>`: `Badge` é sempre um `<div>` (ver
                      `components/ui/badge.tsx`) — mesmo bug já corrigido
                      em `FinancasRecorrencias.tsx`. */}
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {c.nome}
                    {!c.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>
                </div>
                <Badge variant="outline" className={`text-xs shrink-0 ${VINCULO_COR[c.vinculo]}`}>
                  {VINCULO_LABEL[c.vinculo]}
                </Badge>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => onEditar(c)} title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => onAlternar(c)} title={c.ativo ? "Desativar" : "Reativar"}>
                    {c.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
