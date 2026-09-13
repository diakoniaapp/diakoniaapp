import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign, Wallet, TrendingUp, TrendingDown, AlertTriangle,
  Plus, ChevronRight, Building2, CreditCard, PiggyBank, Mail, Coins,
  Settings, ArrowRightLeft,
} from "lucide-react";
import {
  listarContas, resumoFinanceiroMes, indicadoresEclesiasticosMensais, brl, CONTA_TIPO_LABEL,
  type FinConta, type FinResumoMes, type FinMovimentoTipo, type IndicadorEclesiasticoMes,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";
import { WidgetsDoPainel } from "@/dashboard/WidgetsDoPainel";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";

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
  // Era `["admin", "secretaria", "pastor", "diakonia"]` — a mesma lista
  // genérica copiada em EBD e PGM, sem relação com quem de fato mexe em
  // dinheiro. Ela deixava `pastor` entrar (fora do recorte financeiro desde
  // 02/09/2026, ver `ROLES_FINANCEIRO`) e barrava `tesouraria` — a própria
  // rota (`ROUTE_ROLES["/financas"]`) já usa `ROLES_FINANCEIRO` e deixava
  // passar; só esta checagem interna, redundante, discordava e devolvia
  // "Acesso restrito à tesouraria" para quem tem exatamente esse papel.
  // Achado ao construir o Painel da Tesouraria (08/09/2026): o atalho "Ir
  // para Tesouraria" de lá levaria a essa mesma parede.
  const podeUsar = hasRole(ROLES_FINANCEIRO);

  const [contas, setContas] = useState<FinConta[]>([]);
  const [resumo, setResumo] = useState<FinResumoMes | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadorEclesiasticoMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [tipoPadraoLancamento, setTipoPadraoLancamento] = useState<FinMovimentoTipo>("entrada");
  const [transfOpen, setTransfOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { carregar(); }, []);

  // ── ?lancar=true (e opcionalmente ?tipo=) abre o formulário sozinho ──────
  //
  // Achado ao construir o Painel da Tesouraria (Sprint 3, 09/09/2026): três
  // lugares do sistema já prometiam isto — o atalho "Lançamento" da tela
  // HOJE (`tarefaPrincipal.ts`), a ação rápida do mesmo nome
  // (`quickActionsRegistry.tsx`) e a paleta Ctrl+K — e nenhum funcionava.
  // Todos navegavam para `/financas?lancar=true`, e esta tela nunca lia a
  // query string: `lancarOpen` só virava `true` pelo clique no botão "Novo
  // lançamento". O link chegava, a URL mudava, e o diálogo continuava
  // fechado — sem erro nenhum, porque não havia nada para falhar.
  //
  // Mesmo padrão de `Membros.tsx`/`Visitantes.tsx`: lê uma vez, aplica, e
  // limpa da URL com `replace: true` — senão um F5 reabriria o formulário
  // sozinho.
  useEffect(() => {
    if (searchParams.get("lancar") !== "true") return;
    const tipo = searchParams.get("tipo");
    if (tipo === "entrada" || tipo === "saida") setTipoPadraoLancamento(tipo);
    setLancarOpen(true);
    searchParams.delete("lancar");
    searchParams.delete("tipo");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, r, ind] = await Promise.all([
        listarContas(),
        resumoFinanceiroMes().catch(() => null),
        indicadoresEclesiasticosMensais(6).catch(() => []),
      ]);
      setContas(cs);
      setResumo(r);
      setIndicadores(ind);
    } finally { setLoading(false); }
  }

  if (!podeUsar) {
    return <div className="p-8 text-center text-muted-foreground">
      Acesso restrito à tesouraria.
    </div>;
  }

  if (loading) {
    return <PaginaSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-gold" /> Contas correntes
          </h1>
          {/* Unificação de 12/09/2026: esta tela era hub + extrato de contas
              ao mesmo tempo, com uma grade de 15 atalhos que duplicava o menu
              lateral inteiro — e foi exatamente essa grade que quebrou
              silenciosamente sem ninguém notar (`Atalho` recebia `to` e
              nunca virava link). Agora é só o extrato: saldo por conta,
              lançar, transferir. O resto do módulo — Doações, DRE, Fiscal,
              Reuniões, Centros, Orçamento etc. — mora no menu lateral e no
              Painel da Tesouraria ("Ir para"), que é a bancada de trabalho
              diária de quem tem o papel tesouraria. */}
          <p className="text-xs text-muted-foreground">
            Saldo e extrato de cada conta. Para o resto do módulo, veja o menu ao lado.
          </p>
        </div>
        {/* flex-wrap: as tres acoes somavam 447px numa linha so, numa tela de
            375px. Como o <main> tem overflow-x-hidden, nada rolava de lado —
            "Novo lançamento" simplesmente sumia na borda, que e a acao mais
            usada da tela. Encontrado pela varredura de transbordo. */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to="/financas/admin">
              <Settings className="w-3.5 h-3.5" /> Configurações
            </Link></Button>
          <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 text-info-text hover:text-info-text">
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
          <Stat icon={<TrendingUp className="w-4 h-4 text-success-text" />}
            label="Entradas do mês" valor={brl(resumo.entradas_mes)} />
          <Stat icon={<TrendingDown className="w-4 h-4 text-destructive-text" />}
            label="Saídas do mês" valor={brl(resumo.saidas_mes)} />
          <Stat icon={<AlertTriangle className="w-4 h-4 text-warning-text" />}
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
                      <p className="text-xs text-muted-foreground">
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

      {/* Indicadores eclesiásticos — pedido da Telma em 13/09/2026 no lugar
          de "Campanhas em andamento" (widget de EBD, agora só dentro do
          próprio módulo de EBD, ver /ebd). Soma todas as contas juntas,
          mês a mês — mesma classificação de nome de categoria que a Visão
          Executiva usa, só que em série (6 meses) e não presa a
          ROLES_PASTORAL_SEM_TITULAR, porque quem acompanha isso no dia a
          dia é a tesouraria. */}
      {indicadores.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground px-1 mt-2">
            Indicadores eclesiásticos — últimos {indicadores.length} meses
          </h2>
          <Card>
            <CardContent className="py-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-3">Categoria</th>
                    {indicadores.map(i => (
                      <th key={`${i.ano}-${i.mes}`} className="text-right text-xs font-medium text-muted-foreground pb-2 px-2 whitespace-nowrap">
                        {i.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["dizimos", "Dízimos"],
                    ["ofertas", "Ofertas"],
                    ["missoes", "Missões"],
                  ] as const).map(([chave, rotulo]) => (
                    <tr key={chave} className="border-t border-border/40">
                      <td className="py-1.5 pr-3 font-medium">{rotulo}</td>
                      {indicadores.map(i => (
                        <td key={`${i.ano}-${i.mes}`} className="py-1.5 px-2 text-right tabular-nums">
                          {i[chave] > 0 ? brl(i[chave]) : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <LancamentoForm
        open={lancarOpen}
        onOpenChange={(v) => { setLancarOpen(v); if (!v) setTipoPadraoLancamento("entrada"); }}
        tipoPadrao={tipoPadraoLancamento}
        onSaved={carregar}
      />
      <TransferenciaForm
        open={transfOpen}
        onOpenChange={setTransfOpen}
        onSaved={carregar}
      />

      {/* Os blocos que a Home devolveu ao virar tela pessoal — aqui, a agenda
          fiscal e a manutencao de Bazar/Cantina. Ver `widgetRegistry.paineis`. */}
      <WidgetsDoPainel painel="financas" />
    </div>
  );
}

function Stat({ icon, label, valor, destaque }: { icon: JSX.Element; label: string; valor: string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-gold/40 bg-gold/5" : ""}>
      <CardContent className="py-2.5 px-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </p>
        <p className={`font-semibold tabular-nums mt-0.5 ${destaque ? "text-xl text-gold" : "text-lg"}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}
