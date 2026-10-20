// ─── CalendarioDeVencimentos — a visão "Calendário" da Mesa do Tesoureiro ───────────────────────────────────────────────────────────────────────────────
// Substitui a Agenda Financeira (Fase A, 20/10/2026). O mês numa grade: cada dia mostra o total e um tom (o pior que há nele: atrasado/possível falha, aguardando confirmação do banco, em aberto,
// quitada por terceiro, tudo pago). Clicar num dia abre as obrigações dele COM as mesmas linhas e ações do Livro de Obrigações (`DiaDoExtratoBloco` + `useAcoesDeObrigacao`): pagar, editar,
// documentação, corrigir quitação — nada de uma segunda lista com outras ações. A fonte é a do Livro (`carregarExtratoDeObrigacoes`), por isso entram também os débitos automáticos (com o chip).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiaDoExtratoBloco } from "@/components/financas/extrato/DiasDoExtrato";
import { useAcoesDeObrigacao } from "@/components/financas/extrato/AcoesDeObrigacao";
import { agruparPorDia, resumoDoExtrato, type LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";
import {
  DIAS_CURTOS, NOMES_DOS_MESES, ROTULO_DO_TOM, gradeDoMes, limitesDoMesDoCalendario, mesDe, somarMeses, tomDoDia, type MesDoCalendario, type TomDoDia,
} from "@/lib/calendarioDeVencimentos";
import { CAMPOS_DA_TELA } from "@/lib/perfilDeImpressaoDoExtrato";
import { carregarExtratoDeObrigacoes } from "@/services/extratoDeObrigacoesService";
import { brl } from "@/services/finService";

/** Cor do tom (token semântico) + forma, para não depender só da cor. */
const CLASSE_DO_TOM: Record<TomDoDia, string> = {
  atraso: "border-destructive-line bg-destructive-soft text-destructive-text",
  aguardando: "border-warning-line bg-warning-soft text-warning-text",
  aberto: "border-info-line bg-info-soft text-info-text",
  terceiro: "border-violeta-line bg-violeta-soft text-violeta-text",
  pago: "border-success-line bg-success-soft/50 text-success-text",
  vazio: "border-transparent text-muted-foreground/50",
};
const FORMA_DO_TOM: Record<TomDoDia, string> = { atraso: "▲", aguardando: "◐", aberto: "○", terceiro: "◆", pago: "✓", vazio: "" };

/** "R$ 8.000" no celular não cabe com centavos: o total do dia vai compacto na grade e completo na lista. */
const compacto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR"));

export function CalendarioDeVencimentos({ hoje, podeOperar, chaveDeAtualizacao, onMudou }: {
  hoje: string; podeOperar: boolean; chaveDeAtualizacao: number; onMudou?: () => void;
}) {
  const [mes, setMes] = useState<MesDoCalendario>(() => mesDe(hoje));
  const [linhas, setLinhas] = useState<LinhaDoExtrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(hoje);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setLinhas(await carregarExtratoDeObrigacoes(limitesDoMesDoCalendario(mes))); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar o mês."); setLinhas([]); }
    finally { setCarregando(false); }
  }, [mes]);
  useEffect(() => { void carregar(); }, [carregar, chaveDeAtualizacao]);

  // uma ação feita no dia (pagar, anexar…) recarrega o mês E avisa a Mesa, que mostra os mesmos números em outros cartões
  const { abrirLinha, acoesDaLinha, dialogos } = useAcoesDeObrigacao({ podeOperar, recarregar: () => { void carregar(); onMudou?.(); } });

  const dias = useMemo(() => agruparPorDia(linhas), [linhas]);
  const porData = useMemo(() => new Map(dias.map(d => [d.data, d])), [dias]);
  const resumo = useMemo(() => resumoDoExtrato(linhas), [linhas]);
  const quantidade = resumo.quantidade - resumo.canceladas.quantidade;   // o calendário não conta as canceladas (não são vencimento)
  const semanas = useMemo(() => gradeDoMes(mes.ano, mes.mes), [mes]);
  const diaEscolhido = escolhido ? porData.get(escolhido) ?? null : null;
  const navegar = (n: number) => { setMes(m => somarMeses(m, n)); setEscolhido(null); };
  const irParaHoje = () => { setMes(mesDe(hoje)); setEscolhido(hoje); };

  return (
    <div data-calendario>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <p className="min-w-[8.5rem] text-center text-sm font-semibold capitalize" aria-live="polite">{NOMES_DOS_MESES[mes.mes - 1]} de {mes.ano}</p>
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={irParaHoje}>Hoje</Button>
        {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Carregando" />}
        <p className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {quantidade} {quantidade === 1 ? "obrigação" : "obrigações"} · total <b className="text-foreground">{brl(resumo.valorTotal)}</b> · em aberto <b className="text-foreground">{brl(resumo.emAberto.valor)}</b>
        </p>
      </div>

      {erro && <p role="alert" className="mb-2 text-xs text-destructive-text">{erro}</p>}

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`Vencimentos de ${NOMES_DOS_MESES[mes.mes - 1]} de ${mes.ano}`}>
        {DIAS_CURTOS.map(d => <div key={d} role="columnheader" className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>)}
        {semanas.flat().map((c, i) => {
          if (!c.data) return <div key={i} aria-hidden />;
          const d = porData.get(c.data) ?? null;
          const tom = tomDoDia(d, hoje);
          const n = d ? d.linhas.filter(l => l.situacao !== "cancelada").length : 0;
          const selecionado = escolhido === c.data;
          return (
            <button key={c.data} type="button" role="gridcell" data-dia={c.data} data-tom={tom} aria-selected={selecionado}
              aria-label={`${c.dia} de ${NOMES_DOS_MESES[mes.mes - 1]}${n > 0 && d ? `: ${n} ${n === 1 ? "obrigação" : "obrigações"}, ${brl(d.total)} — ${ROTULO_DO_TOM[tom]}` : ": sem obrigações"}`}
              onClick={() => setEscolhido(selecionado ? null : c.data)}
              className={`flex min-h-[3.25rem] min-w-0 flex-col items-stretch rounded-md border px-1 py-0.5 text-left transition-colors hover:bg-muted ${CLASSE_DO_TOM[tom]} ${selecionado ? "ring-2 ring-gold" : ""} ${c.data === hoje ? "outline outline-1 outline-offset-0 outline-gold-text" : ""}`}>
              <span className="flex items-center justify-between text-[11px] font-semibold text-foreground"><span>{c.dia}</span><span aria-hidden className="text-[10px]">{FORMA_DO_TOM[tom]}</span></span>
              {d && n > 0 && <span className="truncate text-[10.5px] font-semibold tabular-nums leading-tight">{compacto(d.total)}</span>}
              {d && n > 0 && <span className="text-[9.5px] leading-tight opacity-80">{n}×</span>}
            </button>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground" aria-label="Legenda">
        {(["atraso", "aguardando", "aberto", "terceiro", "pago"] as const).map(t => (
          <li key={t} className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-sm border ${CLASSE_DO_TOM[t]}`} />{FORMA_DO_TOM[t]} {ROTULO_DO_TOM[t]}</li>
        ))}
      </ul>

      <div className="mt-3" data-dia-aberto={escolhido ?? ""}>
        {diaEscolhido ? (
          <DiaDoExtratoBloco dia={diaEscolhido} campos={CAMPOS_DA_TELA} onAbrir={abrirLinha} renderAcoes={acoesDaLinha} />
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">{escolhido ? "Nenhuma obrigação neste dia." : "Escolha um dia para ver as obrigações dele."}</p>
        )}
      </div>
      {dialogos}
    </div>
  );
}
