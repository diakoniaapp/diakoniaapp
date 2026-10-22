// ─── CalendarioDeVencimentos — a visão "Calendário" da Mesa do Tesoureiro ───────────────────────────────────────────────────────────────────────────────
// Substitui a Agenda Financeira (Fase A, 20/10/2026). O mês numa grade: cada dia mostra o total e um tom (o pior que há nele: atrasado/possível falha, aguardando confirmação do banco, em aberto,
// quitada por terceiro, tudo pago). Clicar num dia abre as obrigações dele COM as mesmas linhas e ações do Livro de Obrigações (`DiaDoExtratoBloco` + `useAcoesDeObrigacao`): pagar, editar,
// documentação, corrigir quitação — nada de uma segunda lista com outras ações. A fonte é a do Livro (`carregarExtratoDeObrigacoes`), por isso entram também os débitos automáticos (com o chip).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEstadoNaUrl } from "@/hooks/useEstadoNaUrl";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiaDoExtratoBloco } from "@/components/financas/extrato/DiasDoExtrato";
import { useAcoesDeObrigacao } from "@/components/financas/extrato/AcoesDeObrigacao";
import { agruparPorDia, resumoDoExtrato, type LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";
import {
  DIAS_CURTOS, NOMES_DOS_MESES, alertasDoDia, ROTULO_DO_TOM, gradeDoMes, limitesDoMesDoCalendario, mesDe, somarMeses, tomDoDia, type MesDoCalendario, type TomDoDia,
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

/**
 * O total do dia na grade (21/10/2026, opção B): na tela larga, completo e arredondado ao real ("R$ 12.400" — antes "12,4 mil" perdia ~R$ 50); abaixo de `lg` a célula não comporta
 * "R$ 12.400" e o total vai compacto ("12,4 mil"). Os centavos continuam na lista do dia, logo abaixo.
 */
const compacto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR"));
const completo = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function CalendarioDeVencimentos({ hoje, podeOperar, chaveDeAtualizacao, onMudou }: {
  hoje: string; podeOperar: boolean; chaveDeAtualizacao: number; onMudou?: () => void;
}) {
  // O mês e o dia escolhidos moram na URL (`?cal=2026-09&dia=2026-09-15`): abrir uma obrigação e voltar devolve o calendário onde estava (decisão dela, 22/10/2026). Sem parâmetros =
  // o mês de hoje com hoje escolhido — é o que o menu abre. `dia=-` é "nenhum dia escolhido".
  const [naUrl, mudarNaUrl] = useEstadoNaUrl({ cal: "", dia: "" });
  // memoizado: `carregar` depende do mês, e um objeto novo a cada renderização o refaria em laço
  const mes: MesDoCalendario = useMemo(() => (/^\d{4}-(0[1-9]|1[0-2])$/.test(naUrl.cal) ? mesDe(`${naUrl.cal}-01`) : mesDe(hoje)), [naUrl.cal, hoje]);
  const textoDoMes = (m: MesDoCalendario) => { const t = `${m.ano}-${String(m.mes).padStart(2, "0")}`; return t === hoje.slice(0, 7) ? "" : t; };
  const escolhido: string | null = naUrl.dia === "-" ? null : /^\d{4}-\d{2}-\d{2}$/.test(naUrl.dia) ? naUrl.dia : hoje;
  const setEscolhido = (d: string | null) => mudarNaUrl({ dia: d === null ? "-" : d === hoje ? "" : d });
  const [linhas, setLinhas] = useState<LinhaDoExtrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
  const navegar = (n: number) => mudarNaUrl({ cal: textoDoMes(somarMeses(mes, n)), dia: "-" });
  const irParaHoje = () => mudarNaUrl({ cal: "", dia: "" });

  return (
    <div data-calendario>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <p className="min-w-[9.5rem] text-center text-base font-semibold capitalize" aria-live="polite">{NOMES_DOS_MESES[mes.mes - 1]} de {mes.ano}</p>
        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={irParaHoje}>Hoje</Button>
        {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Carregando" />}
        <p className="ml-auto text-xs text-muted-foreground tabular-nums">
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
          const al = alertasDoDia(d, hoje);
          const textoDoAlerta = [
            al.vencidas > 0 && `${al.vencidas} ${plural(al.vencidas, "vencida", "vencidas")}`,
            al.possivelFalha > 0 && `${al.possivelFalha} ${plural(al.possivelFalha, "possível falha no débito", "possíveis falhas no débito")}`,
            al.aConferir > 0 && `${al.aConferir} a conferir`,
          ].filter(Boolean).join(", ");
          return (
            <button key={c.data} type="button" role="gridcell" data-dia={c.data} data-tom={tom} aria-selected={selecionado}
              aria-label={`${c.dia} de ${NOMES_DOS_MESES[mes.mes - 1]}${n > 0 && d ? `: ${n} ${n === 1 ? "obrigação" : "obrigações"}, ${brl(d.total)} — ${ROTULO_DO_TOM[tom]}${textoDoAlerta ? `; ${textoDoAlerta}` : ""}` : ": sem obrigações"}`}
              onClick={() => setEscolhido(selecionado ? null : c.data)}
              className={`flex min-h-[4.25rem] min-w-0 flex-col items-stretch gap-0.5 rounded-md border px-1.5 py-1 text-left lg:min-h-[5rem] transition-colors hover:bg-muted ${CLASSE_DO_TOM[tom]} ${selecionado ? "ring-2 ring-gold" : ""} ${c.data === hoje ? "outline outline-1 outline-offset-0 outline-gold-text" : ""}`}>
              <span className="flex items-center justify-between text-xs font-semibold text-foreground"><span>{c.dia}</span><span aria-hidden className="text-[11px]">{FORMA_DO_TOM[tom]}</span></span>
              {/* hierarquia da Tesouraria: 1º o valor do dia (o maior da célula), 2º quantas obrigações, 3º o que pede atenção (escrito, só nos dias que precisam) */}
              {d && n > 0 && (
                <span className="truncate text-[13px] font-bold tabular-nums leading-tight lg:text-[15px]">
                  <span className="lg:hidden">{compacto(d.total)}</span><span className="hidden lg:inline">{completo(d.total)}</span>
                </span>
              )}
              {d && n > 0 && (
                <span className="truncate text-xs leading-tight opacity-90">
                  <span className="lg:hidden">{n} obrig.</span><span className="hidden lg:inline">{n} {plural(n, "obrigação", "obrigações")}</span>
                </span>
              )}
              {textoDoAlerta && (
                <span data-alerta className="mt-auto flex flex-col text-[11px] font-semibold leading-tight">
                  {al.vencidas > 0 && <span className="truncate text-destructive-text" title={textoDoAlerta}>▲ {al.vencidas} <span className="lg:hidden">venc.</span><span className="hidden lg:inline">{plural(al.vencidas, "vencida", "vencidas")}</span></span>}
                  {al.possivelFalha > 0 && <span className="truncate text-destructive-text" title={textoDoAlerta}>▲ {al.possivelFalha} <span className="lg:hidden">falha</span><span className="hidden lg:inline">{plural(al.possivelFalha, "possível falha", "possíveis falhas")}</span></span>}
                  {al.aConferir > 0 && <span className="truncate text-warning-text" title={textoDoAlerta}>◐ {al.aConferir} <span className="lg:hidden">conferir</span><span className="hidden lg:inline">a conferir</span></span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground" aria-label="Legenda">
        {(["atraso", "aguardando", "aberto", "terceiro", "pago"] as const).map(t => (
          <li key={t} className="flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded-sm border ${CLASSE_DO_TOM[t]}`} />{FORMA_DO_TOM[t]} {ROTULO_DO_TOM[t]}</li>
        ))}
      </ul>

      <div className="mt-3" data-dia-aberto={escolhido ?? ""}>
        {diaEscolhido ? (
          <DiaDoExtratoBloco estilo="operacional" dia={diaEscolhido} campos={CAMPOS_DA_TELA} onAbrir={abrirLinha} renderAcoes={acoesDaLinha} />
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">{escolhido ? "Nenhuma obrigação neste dia." : "Escolha um dia para ver as obrigações dele."}</p>
        )}
      </div>
      {dialogos}
    </div>
  );
}
