import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Wallet, TrendingUp, TrendingDown, AlertTriangle, Loader2,
  Plus, ChevronRight, Building2, CreditCard, PiggyBank, Mail, Coins,
} from "lucide-react";
import {
  listarContas, resumoFinanceiroMes, brl, CONTA_TIPO_LABEL,
  type FinConta, type FinResumoMes,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { Settings, ArrowRightLeft, RotateCw, Package, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const ICONE_CONTA: Record<string, JSX.Element> = {
  caixa:     <Wallet className="w-4 h-4" />,
  banco:     <Building2 className="w-4 h-4" />,
  cartao:    <CreditCard className="w-4 h-4" />,
  envelope:  <Mail className="w-4 h-4" />,
  aplicacao: <PiggyBank className="w-4 h-4" />,
  cofre:     <Coins className="w-4 h-4" />,
  pix:       <Wallet className="w-4 h-4" />,
};

export default function Financas() {
  const { hasRole } = useAuth();
  const podeUsar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);

  const [contas, setContas] = useState<FinConta[]>([]);
  const [resumo, setResumo] = useState<FinResumoMes | null>(null);
  const [loading, setLoading] = useState(true);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [transfOpen, setTransfOpen] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, r] = await Promise.all([
        listarContas(),
        resumoFinanceiroMes().catch(() => null),
      ]);
      setContas(cs);
      setResumo(r);
    } finally { setLoading(false); }
  }

  if (!podeUsar) {
    return <div className="p-8 text-center text-muted-foreground">
      Acesso restrito à tesouraria.
    </div>;
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando finanças...
    </div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-gold" /> Finanças
          </h1>
          <p className="text-xs text-muted-foreground">
            Tesouraria digital — entradas, saídas, contas e relatórios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/financas/admin">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Configurações
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 text-blue-600 hover:text-blue-700">
            <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
          </Button>
          <Button onClick={() => setLancarOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
            <Plus className="w-4 h-4" /> Novo lançamento
          </Button>
        </div>
      </div>

      {/* Stats do mês */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat icon={<Wallet className="w-4 h-4 text-gold" />}
            label="Saldo total" valor={brl(resumo.saldo_total)} destaque />
          <Stat icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
            label="Entradas do mês" valor={brl(resumo.entradas_mes)} />
          <Stat icon={<TrendingDown className="w-4 h-4 text-rose-600" />}
            label="Saídas do mês" valor={brl(resumo.saidas_mes)} />
          <Stat icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            label="Previstas (mês)" valor={brl(resumo.previstas_mes)} />
        </div>
      )}

      {/* Contas */}
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground px-1 mt-2">
          Contas correntes ({contas.length})
        </h2>

        {contas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma conta cadastrada ainda. Rode a migration de seed do banco.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {contas.map(c => (
              <Link key={c.id} to={`/financas/conta/${c.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-3 px-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        {ICONE_CONTA[c.tipo] ?? <Wallet className="w-3.5 h-3.5" />}
                        {CONTA_TIPO_LABEL[c.tipo]}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-sm truncate">{c.nome}</p>
                    <p className="text-xl font-semibold tabular-nums" style={{ color: c.cor ?? undefined }}>
                      {brl(Number(c.saldo_atual))}
                    </p>
                    {c.tipo === "cartao" && c.limite_credito && (
                      <p className="text-[10px] text-muted-foreground">
                        Limite: {brl(Number(c.limite_credito))}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 pt-2">
        <Atalho to="/financas/agenda?tipo=saida" icon={<TrendingDown className="w-4 h-4 text-rose-600" />} label="Contas a pagar" />
        <Atalho to="/financas/agenda?tipo=entrada" icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} label="Contas a receber" />
        <Atalho to="/financas/recorrencias" icon={<RotateCw className="w-4 h-4 text-gold" />} label="Recorrências" />
        <Atalho to="/financas/estoque" icon={<Package className="w-4 h-4 text-blue-600" />} label="Estoque" />
        <Atalho to="/financas/relatorio" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} label="Malote contábil" />
        <Atalho to="/financas/insights" icon={<Sparkles className="w-4 h-4 text-gold" />} label="Insights" />
      </div>
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        ✨ Sistema financeiro completo · 6 fases entregues · OCR · Recorrências · Estoque · Malote · Insights
      </p>

      <LancamentoForm
        open={lancarOpen}
        onOpenChange={setLancarOpen}
        onSaved={carregar}
      />
      <TransferenciaForm
        open={transfOpen}
        onOpenChange={setTransfOpen}
        onSaved={carregar}
      />
    </div>
  );
}

function Stat({ icon, label, valor, destaque }: { icon: JSX.Element; label: string; valor: string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-gold/40 bg-gold/5" : ""}>
      <CardContent className="py-2.5 px-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </p>
        <p className={`font-semibold tabular-nums mt-0.5 ${destaque ? "text-xl text-gold" : "text-lg"}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

function Atalho({ to, icon, label, disabled }: { to: string; icon: JSX.Element; label: string; disabled?: boolean }) {
  return (
    <div className={`border rounded-md p-3 flex items-center gap-2 ${disabled ? "opacity-50" : "hover:bg-muted/40 cursor-pointer"}`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
      {disabled && <Badge variant="outline" className="text-[9px] ml-auto">Em breve</Badge>}
    </div>
  );
}
