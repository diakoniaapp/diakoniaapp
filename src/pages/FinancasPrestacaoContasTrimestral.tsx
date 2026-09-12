// ─── FinancasPrestacaoContasTrimestral.tsx ───────────────────────────────
//
// Fase 5 do projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
// §8.3) — a grade que a tesouraria hoje monta à mão no Excel todo
// trimestre, gerada ao vivo de `fin_lancamentos` por `prestacaoContasService.
// gerarPrestacaoContas()`. Somente leitura por enquanto: sem fechamento,
// sem exportação em PDF (isso é Fase 6 e 7) — o objetivo desta fase é
// rodar em paralelo com a planilha real por um trimestre e conferir que os
// números batem, antes de qualquer coisa passar a depender só do sistema.
//
// `?ano=` e `?trimestre=` na URL, não parâmetro de rota — mesmo padrão que
// `Financas.tsx` já usa pra `?lancar=true`, evita a fragilidade de rota
// com parâmetro opcional no react-router 6.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, MessageSquarePlus,
  AlertTriangle, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/services/finService";
import {
  gerarPrestacaoContas, type PrestacaoContasResultado, type PrestacaoContasGrupo,
} from "@/services/prestacaoContasService";
import { NotaRelatorioModal } from "@/components/financas/NotaRelatorioModal";
import { PaginaSkeleton } from "@/components/ListState";
import { hojeLocal } from "@/lib/data";

function trimestreAtual(): { ano: number; trimestre: number } {
  const [ano, mes] = hojeLocal().split("-").map(Number);
  return { ano, trimestre: Math.ceil(mes / 3) };
}

export default function FinancasPrestacaoContasTrimestral() {
  const [searchParams, setSearchParams] = useSearchParams();
  const padrao = trimestreAtual();
  const ano = Number(searchParams.get("ano")) || padrao.ano;
  const trimestre = Number(searchParams.get("trimestre")) || padrao.trimestre;

  const [dados, setDados] = useState<PrestacaoContasResultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [nota, setNota] = useState<{
    aberto: boolean; titulo: string; categoriaId: string; centroCustoId: string | null;
  }>({ aberto: false, titulo: "", categoriaId: "", centroCustoId: null });

  async function carregar() {
    setLoading(true);
    try {
      setDados(await gerarPrestacaoContas(ano, trimestre));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar a prestação de contas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ano, trimestre]);

  function irPara(novoAno: number, novoTrimestre: number) {
    let a = novoAno, t = novoTrimestre;
    if (t < 1) { t = 4; a -= 1; }
    if (t > 4) { t = 1; a += 1; }
    setSearchParams({ ano: String(a), trimestre: String(t) });
  }

  function abrirNota(titulo: string, categoriaId: string, centroCustoId: string | null) {
    setNota({ aberto: true, titulo, categoriaId, centroCustoId });
  }

  if (loading) return <PaginaSkeleton />;
  if (!dados) return <div className="p-8 text-center text-muted-foreground">Não foi possível carregar.</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-gold" /> Prestação de Contas Trimestral
          </h1>
          <p className="text-xs text-muted-foreground">
            Gerado ao vivo dos lançamentos — mesma estrutura da planilha apresentada à diretoria.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/financas"><ArrowLeft className="w-3.5 h-3.5" /> Contas correntes</Link>
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button size="sm" variant="outline" onClick={() => irPara(ano, trimestre - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <span className="text-sm font-medium px-2 min-w-32 text-center">
          {trimestre}º Trimestre · {ano}
        </span>
        <Button size="sm" variant="outline" onClick={() => irPara(ano, trimestre + 1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {dados.qtdForaDoPlanoOficial > 0 && (
        <Card className="border-warning-line bg-warning-soft">
          <CardContent className="py-2.5 px-4 flex items-center gap-2 text-xs text-warning-text">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {dados.qtdForaDoPlanoOficial} lançamento{dados.qtdForaDoPlanoOficial !== 1 ? "s" : ""} do
            trimestre não {dados.qtdForaDoPlanoOficial !== 1 ? "entraram" : "entrou"} neste relatório —
            sem categoria do Plano de Contas Oficial, ou é transferência entre contas próprias.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 md:p-6 overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left font-medium py-1.5 text-muted-foreground">
                  {dados.qtdLancamentos} lançamento{dados.qtdLancamentos !== 1 ? "s" : ""} realizado{dados.qtdLancamentos !== 1 ? "s" : ""}/conciliado{dados.qtdLancamentos !== 1 ? "s" : ""}
                </th>
                {dados.meses.map(m => (
                  <th key={m.numero} className="text-right font-medium py-1.5 uppercase tracking-wide text-muted-foreground">{m.nome}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LinhaTotal titulo="Saldo Anterior" valores={dados.saldoAnterior} />

              <LinhaSecao titulo="Receitas" />
              {dados.gruposReceita.length === 0 ? (
                <LinhaVazia texto="Sem receitas oficiais no período." />
              ) : dados.gruposReceita.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={null} onNota={abrirNota} corTotal="text-success-text" />
              ))}
              <LinhaTotal titulo="Total Receitas" valores={dados.totalReceitas} destaque cor="text-success-text" />

              <LinhaSecao titulo="Despesas" />
              {dados.gruposDespesaPorCentro.length === 0 ? (
                <LinhaVazia texto="Sem despesas oficiais no período." />
              ) : dados.gruposDespesaPorCentro.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={g.chave === "__sem_centro__" ? null : g.chave} onNota={abrirNota} corTotal="text-destructive-text" />
              ))}
              <LinhaTotal titulo="Total Despesas" valores={dados.totalDespesas} destaque cor="text-destructive-text" />

              {dados.grupoDespesasFinanceiras && (
                <>
                  <LinhaSecao titulo="Despesas Financeiras" />
                  <Bloco grupo={dados.grupoDespesasFinanceiras} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}
              {dados.grupoOutrasDespesas && (
                <>
                  <LinhaSecao titulo="Outras Despesas" />
                  <Bloco grupo={dados.grupoOutrasDespesas} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}

              <LinhaTotal titulo="Resultado do Período" valores={dados.resultado} destaque forte
                cor={dados.resultado.every(v => v >= 0) ? "text-success-text" : undefined} />
              <LinhaTotal titulo="Saldo Final" valores={dados.saldoFinal} destaque />
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NotaRelatorioModal
        open={nota.aberto}
        onOpenChange={(v) => setNota(n => ({ ...n, aberto: v }))}
        titulo={nota.titulo}
        ano={ano}
        mes={dados.mesAncoraNota}
        categoriaId={nota.categoriaId}
        centroCustoId={nota.centroCustoId}
        onSalvo={carregar}
      />
    </div>
  );
}

function LinhaSecao({ titulo }: { titulo: string }) {
  return (
    <tr>
      <td colSpan={4} className="pt-4 pb-1">
        <h3 className="font-serif text-sm text-gold uppercase tracking-wide">{titulo}</h3>
      </td>
    </tr>
  );
}

function LinhaVazia({ texto }: { texto: string }) {
  return <tr><td colSpan={4} className="py-1.5 text-muted-foreground italic">{texto}</td></tr>;
}

function LinhaTotal({ titulo, valores, destaque, forte, cor }: {
  titulo: string; valores: number[]; destaque?: boolean; forte?: boolean; cor?: string;
}) {
  return (
    <tr className={destaque ? `border-t-2 border-gold/40 font-semibold ${forte ? "text-sm" : ""}` : "text-muted-foreground"}>
      <td className={`py-1.5 ${destaque ? "uppercase tracking-wide" : ""}`}>{titulo}</td>
      {valores.map((v, i) => (
        <td key={i} className={`py-1.5 text-right tabular-nums ${cor ?? ""}`}>{brl(v)}</td>
      ))}
    </tr>
  );
}

function Bloco({ grupo, centroCustoId, onNota, corTotal, semSubtotalProprio }: {
  grupo: PrestacaoContasGrupo;
  centroCustoId: string | null;
  onNota: (titulo: string, categoriaId: string, centroCustoId: string | null) => void;
  corTotal: string;
  semSubtotalProprio?: boolean;
}) {
  return (
    <>
      {!semSubtotalProprio && (
        <tr className="border-b border-border/40">
          <td className="py-1 font-medium">{grupo.titulo}</td>
          {grupo.valores.map((v, i) => (
            <td key={i} className={`py-1 text-right tabular-nums font-medium ${corTotal}`}>{brl(v)}</td>
          ))}
        </tr>
      )}
      {grupo.linhas.map(l => (
        <tr key={l.categoriaId} className="border-b border-border/20 text-muted-foreground group">
          <td className="py-0.5 pl-4">
            <button
              type="button"
              onClick={() => onNota(`${l.nome} · ${grupo.titulo}`, l.categoriaId, centroCustoId)}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              title={l.temNota ? "Ver/editar nota" : "Adicionar nota"}
            >
              {l.nome}
              {l.temNota
                ? <MessageSquare className="w-3 h-3 text-gold shrink-0" />
                : <MessageSquarePlus className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />}
            </button>
          </td>
          {l.valores.map((v, i) => (
            <td key={i} className="py-0.5 text-right tabular-nums">{v === 0 ? "—" : brl(v)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
