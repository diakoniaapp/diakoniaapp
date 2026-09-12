// ─── FinancasDoacoes.tsx ────────────────────────────────────────────────
//
// Item 3 da missão do ERP financeiro: "Gestão de Doações — PIX, Dinheiro,
// Cartão, Transferência, Recorrente". Não é uma entidade nova: uma doação
// já É um `fin_lancamentos` de entrada — `forma_pagamento` (pix, dinheiro,
// cartao_debito, cartao_credito, transferencia, boleto, envelope, outro)
// já existe em todo lançamento, e recorrência já existe em
// `fin_recorrencias`. O que faltava era uma TELA que olhasse só para esse
// recorte — hoje "quanto entrou, de que jeito, e o que é recorrente" só
// dava para ver espalhado (relatório mensal geral, ou lançamento por
// lançamento). Esta tela junta as três perguntas num lugar só.
//
// Estilo "bancada de trabalho" (como Agenda Financeira, Insights) — não o
// padrão de relatório imprimível de `FinancasRelatorio.tsx`: esta é uma
// tela de acompanhar o mês, não um documento formal para entregar a
// alguém (isso já existe, é a Prestação de Contas por centro de custo).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, HandCoins, ChevronLeft, ChevronRight, RotateCw, Users,
  Smartphone, Banknote, CreditCard, Landmark, FileText, Mail, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarLancamentos, listarRecorrencias, brl,
  FORMA_LABEL, FREQUENCIA_LABEL,
  type FinLancamentoExtenso, type FinRecorrencia, type FinFormaPagamento,
} from "@/services/finService";
import { hojeLocal } from "@/lib/data";
import { PaginaSkeleton } from "@/components/ListState";
import { useAuth } from "@/hooks/useAuth";
import { ROLES_DOADORES } from "@/components/layout/navConfig";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

// Ícone por forma de pagamento — o mesmo vocabulário visual de sempre
// (nada de cor crua: `text-*-text` são tokens já usados no resto do
// financeiro).
const FORMA_ICONE: Record<FinFormaPagamento, any> = {
  pix: Smartphone, dinheiro: Banknote,
  cartao_debito: CreditCard, cartao_credito: CreditCard,
  transferencia: Landmark, boleto: FileText,
  envelope: Mail, outro: HelpCircle,
};

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function FinancasDoacoes() {
  const { hasRole } = useAuth();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1-12

  const [lancs, setLancs] = useState<FinLancamentoExtenso[]>([]);
  const [recorrencias, setRecorrencias] = useState<FinRecorrencia[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, [ano, mes]);

  async function carregar() {
    setLoading(true);
    try {
      const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fim = new Date(ano, mes, 0).toISOString().slice(0, 10); // último dia do mês
      const [ls, recs] = await Promise.all([
        listarLancamentos({ tipo: "entrada", dataInicio: ini, dataFim: fim }),
        listarRecorrencias(),
      ]);
      // Só realizado/conciliado é dinheiro que já entrou de verdade —
      // mesma regra do malote mensal e da prestação de contas.
      setLancs(ls.filter(l => l.status === "realizado" || l.status === "conciliado"));
      setRecorrencias(recs.filter(r => r.tipo === "entrada"));
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  function navegarMes(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    setMes(m); setAno(a);
  }

  const total = useMemo(() => lancs.reduce((s, l) => s + Number(l.valor), 0), [lancs]);

  const porForma = useMemo(() => {
    const map = new Map<FinFormaPagamento | "_sem", number>();
    lancs.forEach(l => {
      const key = l.forma_pagamento ?? "_sem";
      map.set(key, (map.get(key) ?? 0) + Number(l.valor));
    });
    return Array.from(map.entries())
      .map(([forma, valor]) => ({ forma, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [lancs]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; cor: string | null }>();
    lancs.forEach(l => {
      const key = l.categoria_id ?? "_sem";
      const ex = map.get(key);
      if (ex) ex.total += Number(l.valor);
      else map.set(key, { nome: l.categoria_nome ?? "Sem categoria", total: Number(l.valor), cor: l.categoria_cor ?? null });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [lancs]);

  const maxForma = Math.max(...porForma.map(f => f.valor), 1);

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-gold" /> Doações
          </h1>
          <p className="text-xs text-muted-foreground">
            Dízimos, ofertas, campanhas e missões — por forma de pagamento e recorrência
          </p>
        </div>
        {hasRole(ROLES_DOADORES) && (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/financas/doadores"><Users className="w-3.5 h-3.5" /> Por doador</Link>
          </Button>
        )}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => navegarMes(-1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
          <span className="text-sm font-medium px-2 whitespace-nowrap">{MESES[mes - 1]} {ano}</span>
          <Button size="sm" variant="outline" onClick={() => navegarMes(1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Total do mês */}
      <Card className="bg-success-soft/30 border-success-line">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-success-text">Total recebido em {MESES[mes - 1]}</p>
            <p className="text-2xl font-serif font-semibold text-success-text tabular-nums">{brl(total)}</p>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {lancs.length} lançamento{lancs.length !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Por forma de pagamento */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="font-serif text-base">Por forma de pagamento</h3>
          {porForma.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">Nenhuma doação registrada neste mês.</p>
          ) : (
            <div className="space-y-2">
              {porForma.map(({ forma, valor }) => {
                const Icone = forma === "_sem" ? HelpCircle : FORMA_ICONE[forma];
                const label = forma === "_sem" ? "Não informado" : FORMA_LABEL[forma];
                const pct = (valor / maxForma) * 100;
                return (
                  <div key={forma} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icone className="w-3.5 h-3.5 text-gold" /> {label}
                      </span>
                      <span className="tabular-nums font-semibold">{brl(valor)}</span>
                    </div>
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por categoria */}
      {porCategoria.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base">Por categoria</h3>
            <div className="space-y-1.5">
              {porCategoria.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5 last:border-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {c.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor }} />}
                    <span className="truncate">{c.nome}</span>
                  </span>
                  <span className="tabular-nums font-medium shrink-0">{brl(c.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recorrentes ativas */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="font-serif text-base flex items-center gap-2">
            <RotateCw className="w-4 h-4 text-gold" /> Recorrentes ativas
          </h3>
          {recorrencias.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              Nenhuma entrada recorrente cadastrada.{" "}
              <Link to="/financas/recorrencias" className="text-primary underline">Cadastrar</Link>
            </p>
          ) : (
            <div className="space-y-1.5">
              {recorrencias.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {FREQUENCIA_LABEL[r.frequencia]} · todo dia {r.dia_vencimento}
                      {r.valor_variavel && " · valor variável"}
                    </p>
                  </div>
                  {!r.valor_variavel && (
                    <span className="tabular-nums font-medium text-success-text shrink-0 ml-2">{brl(Number(r.valor))}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lançamentos do mês */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Lançamentos de {MESES[mes - 1]} ({lancs.length})
        </h3>
        {lancs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground italic">
              Nenhuma doação registrada neste mês.
            </CardContent>
          </Card>
        ) : (
          lancs.slice().sort((a, b) => b.data.localeCompare(a.data)).map(l => {
            const Icone = l.forma_pagamento ? FORMA_ICONE[l.forma_pagamento] : HelpCircle;
            return (
              <div key={l.id} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Icone className="w-3.5 h-3.5 text-gold shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{l.descricao ?? l.categoria_nome ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {dataBr(l.data)}
                      {l.categoria_nome && ` · ${l.categoria_nome}`}
                      {l.conta_nome && ` · ${l.conta_nome}`}
                      {l.pessoa_nome && ` · ${l.pessoa_nome}`}
                    </p>
                  </div>
                </div>
                {l.forma_pagamento && (
                  <Badge variant="outline" className="text-xs mr-2 shrink-0">{FORMA_LABEL[l.forma_pagamento]}</Badge>
                )}
                <p className="text-sm font-semibold tabular-nums text-success-text shrink-0">{brl(Number(l.valor))}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
