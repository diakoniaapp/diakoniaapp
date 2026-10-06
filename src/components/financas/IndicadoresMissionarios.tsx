// ─── IndicadoresMissionarios.tsx — missões em áreas que não se misturam ───
//
// Modelagem aprovada por ela em 06/10/2026 (docs/INDICADORES_MISSIONARIOS_MODELAGEM.md). Antes, o
// painel misturava Fundo Missionário, campanhas, sustento e envios, e dava conclusões erradas.
//
//   1. FLUXO DO PERÍODO     — segue o filtro: entradas, saídas (Envio Oficial), resultado, gráfico;
//   2. FUNDO MISSIONÁRIO    — NUNCA segue o filtro: saldo registrado × saldo ajustado, histórico;
//   3. MISSÕES PERMANENTES  — investimento próprio da igreja (sustento), FORA do fundo;
//   4. CAMPANHAS            — meta, arrecadado e % por campanha; o ano vem da data (fim do período);
//   5. PROJETOS             — só o que é temporário (ex.: templo missionário);
//   +  ENVIOS               — Envio Oficial × Esforço Total;
//   +  OFERTAS SEM CLASSIFICAÇÃO — nada é classificado sozinho.
//
// O filtro mora aqui dentro (não é o do resto de "Indicadores Eclesiásticos"): a tesouraria abre o
// restante da tela em "Hoje" por decisão dela de 23/09/2026. As contas ficam em `lib/`, com teste.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CampoData } from "@/components/CampoData";
import { AjustesDoFundoDialog } from "@/components/financas/AjustesDoFundoDialog";
import { MetasDeCampanhaDialog } from "@/components/financas/MetasDeCampanhaDialog";
import { ClassificarOfertasDialog } from "@/components/financas/ClassificarOfertasDialog";
import { brl, nomeExtrato, type FinLancamentoExtenso } from "@/services/finService";
import type { DadosDeMissoes } from "@/services/missoesService";
import {
  diaDoLancamento, ehRealizado, periodoAnterior, periodoDoPreset, resumoDoPeriodo, serieDoPeriodo,
  variacaoPercentual, type PontoDaSerie,
} from "@/lib/indicadoresMissionarios";
import {
  ROTULO_DA_CAMPANHA, enviosDoPeriodo, fundoComAjustes, ofertasSemClassificacao, resumoDasCampanhas,
  resumoPermanentes, sugerirCampanhasPorCiclo,
} from "@/lib/missoesModelo";

interface Props {
  dados: DadosDeMissoes | null;
  carregando: boolean;
  /** Categoria "Ofertas para Missões" não existe no plano de contas. */
  semCategoriaDeEntrada: boolean;
  /** Nenhuma categoria de repasse missionário no plano de contas. */
  semCategoriaDeRepasse: boolean;
  hoje: string;
  onRegistrarRemessa: () => void;
  onAbrirRemessa: (l: FinLancamentoExtenso) => void;
  onVerDetalheDasOfertas: () => void;
  /** Recarrega os dados depois de gravar (ajuste, meta, classificação). */
  onRecarregar: () => void;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">{children}</p>;
}

export function IndicadoresMissionarios({
  dados, carregando, semCategoriaDeEntrada, semCategoriaDeRepasse, hoje,
  onRegistrarRemessa, onAbrirRemessa, onVerDetalheDasOfertas, onRecarregar,
}: Props) {
  // Só o período personalizado (pedido dela, 06/10/2026): De/Até sempre à vista, abrindo no mês atual.
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const [customInicio, setCustomInicio] = useState(primeiroDoMes);
  const [customFim, setCustomFim] = useState(hoje);
  const [ajustesAberto, setAjustesAberto] = useState(false);
  const [metasAberto, setMetasAberto] = useState(false);
  const [loteAberto, setLoteAberto] = useState(false);

  // Data apagada ou incompleta no meio da digitação não pode virar período inválido: volta ao padrão.
  const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const { inicio, fim } = periodoDoPreset("custom", hoje, {
    inicio: dataValida(customInicio) ? customInicio : primeiroDoMes,
    fim: dataValida(customFim) ? customFim : hoje,
  });
  const ant = periodoAnterior(inicio, fim);
  const ano = Number(fim.slice(0, 4));
  const pronto = !carregando && dados !== null;

  const calc = useMemo(() => {
    if (!dados) return null;
    const { entradas, envios, sustento, mobilizacao, ajustes, metas, recorrenciasDeSustento } = dados;
    const subcentros = { campanhas: dados.campanhasSaidas, projetos: dados.projetosSaidas, ofertas: dados.ofertasSaidas };
    return {
      periodo: resumoDoPeriodo(entradas, envios, inicio, fim),
      anterior: resumoDoPeriodo(entradas, envios, ant.inicio, ant.fim),
      fundo: fundoComAjustes(entradas, envios, ajustes),
      serie: serieDoPeriodo(entradas, envios, inicio, fim),
      remessas: envios
        .filter(l => ehRealizado(l) && diaDoLancamento(l) >= inicio && diaDoLancamento(l) <= fim)
        .sort((a, b) => diaDoLancamento(b).localeCompare(diaDoLancamento(a))),
      permanentes: resumoPermanentes(sustento, inicio, fim, recorrenciasDeSustento),
      campanhas: resumoDasCampanhas(entradas, envios, metas, ano),
      enviosPeriodo: enviosDoPeriodo(envios, sustento, mobilizacao, inicio, fim, subcentros),
      enviosTotal: enviosDoPeriodo(envios, sustento, mobilizacao, undefined, undefined, subcentros),
      pendentes: ofertasSemClassificacao(entradas),
      grupos: sugerirCampanhasPorCiclo(entradas, envios),
      ajustesAtivos: ajustes.filter(a => a.ativo).length,
    };
  }, [dados, inicio, fim, ant.inicio, ant.fim, ano]);

  const periodo = calc?.periodo;
  const tendencia = periodo && calc ? variacaoPercentual(periodo.entradas, calc.anterior.entradas) : 0;
  const tomDoResultado = periodo?.situacao === "superavit" ? "text-success-text"
    : periodo?.situacao === "deficit" ? "text-destructive-text" : "text-muted-foreground";
  const rotuloDoResultado = periodo?.situacao === "superavit" ? "Superávit"
    : periodo?.situacao === "deficit" ? "Déficit" : "Equilibrado";
  const recursos = dados?.recursos;
  const tomDoSaldo = (v: number) => (v >= 0 ? "text-success-text" : "text-destructive-text");

  return (
    <div className="space-y-3 mb-3">
      {/* ── Filtro: vale para as áreas 1, 3 e Envios (o Fundo fica de fora de propósito) ─ */}
      <div className="flex flex-wrap items-end gap-2">
        <span>
          <label className="text-xs text-muted-foreground block">De</label>
          <CampoData value={customInicio} onChange={setCustomInicio} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
        </span>
        <span>
          <label className="text-xs text-muted-foreground block">Até</label>
          <CampoData value={customFim} onChange={setCustomFim} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
        </span>
      </div>

      {/* ── 1. Fluxo missionário do período ────────────────────────────────── */}
      <section className="rounded-lg border-2 border-violeta bg-violeta-soft/40 overflow-hidden" aria-labelledby="mis-fluxo">
        <div className="p-4 pb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="mis-fluxo" className="text-sm font-bold text-violeta-text">Fluxo missionário do período</h3>
            <p className="text-[11px] text-muted-foreground">
              {inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`}
            </p>
          </div>
          {pronto && !semCategoriaDeEntrada && (
            <button type="button" onClick={onVerDetalheDasOfertas}
              className="text-xs font-semibold text-violeta-text hover:underline shrink-0">
              Ver detalhe das ofertas →
            </button>
          )}
        </div>
        {!pronto || !periodo || !calc ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">Carregando…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 px-4 pb-3">
              <div className="min-w-0">
                <Rotulo>Entradas missionárias</Rotulo>
                <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(periodo.entradas)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {periodo.qtdEntradas} contribuiç{periodo.qtdEntradas === 1 ? "ão" : "ões"}
                  {calc.anterior.entradas > 0 || periodo.entradas > 0 ? ` · ${tendencia >= 0 ? "▲" : "▼"} ${Math.abs(tendencia).toFixed(0)}% vs. período anterior` : ""}
                </p>
              </div>
              <div className="min-w-0">
                <Rotulo>Saídas missionárias</Rotulo>
                <p className="text-lg font-extrabold tabular-nums text-destructive-text">{brl(periodo.saidas)}</p>
                <p className="text-[11px] text-muted-foreground">{periodo.qtdSaidas} remessa{periodo.qtdSaidas === 1 ? "" : "s"} (Envio Oficial)</p>
              </div>
              <div className="min-w-0">
                <Rotulo>Resultado líquido</Rotulo>
                <p className={`text-lg font-extrabold tabular-nums ${tomDoResultado}`}>{brl(periodo.resultado)}</p>
                <p className={`text-[11px] font-semibold ${tomDoResultado}`}>{rotuloDoResultado}</p>
              </div>
            </div>
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {periodo.qtdEntradas === 0 && periodo.qtdSaidas === 0
                ? "Nenhuma oferta nem remessa missionária neste período. Escolha um período maior para comparar."
                : `Neste período entraram ${brl(periodo.entradas)} e saíram ${brl(periodo.saidas)} em remessas — ${
                  periodo.situacao === "superavit" ? `superávit de ${brl(periodo.resultado)}.`
                    : periodo.situacao === "deficit" ? `déficit de ${brl(-periodo.resultado)}.` : "resultado equilibrado."}`}
            </p>
            <div className="px-4 pb-4"><GraficoMissionario serie={calc.serie} /></div>
            {calc.remessas.length > 0 && (
              <ul className="divide-y border-t bg-card" aria-label="Remessas do período">
                {calc.remessas.map(l => (
                  <li key={l.id}>
                    <button type="button" onClick={() => onAbrirRemessa(l)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs text-left hover:bg-muted/40 transition-colors">
                      <span className="min-w-0 truncate">
                        {diaDoLancamento(l).slice(8, 10)}/{diaDoLancamento(l).slice(5, 7)}{" · "}{nomeExtrato(l).principal}
                      </span>
                      <span className="font-medium tabular-nums shrink-0">{brl(Number(l.valor))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── 2. Fundo Missionário (acumulado — não segue o filtro) ─────────────── */}
      {!semCategoriaDeRepasse && (
        <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-fundo">
          <div className="p-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 id="mis-fundo" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fundo Missionário</h3>
              <p className="text-[11px] text-muted-foreground">Acumulado desde o início dos registros — não muda com o período escolhido.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setAjustesAberto(true)}>
                Ajustes
              </Button>
              <Button type="button" size="sm" variant="violeta" className="h-6 px-2 text-[11px]" onClick={onRegistrarRemessa}>
                + Registrar remessa
              </Button>
            </div>
          </div>
          {!pronto || !calc ? (
            <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 pb-3">
                <div className="min-w-0">
                  <Rotulo>Saldo registrado</Rotulo>
                  <p className={`text-lg font-extrabold tabular-nums ${tomDoSaldo(calc.fundo.saldo)}`}>{brl(calc.fundo.saldo)}</p>
                  <p className="text-[11px] text-muted-foreground">só o que está no banco</p>
                </div>
                <div className="min-w-0">
                  <Rotulo>Saldo ajustado</Rotulo>
                  <p className={`text-lg font-extrabold tabular-nums ${tomDoSaldo(calc.fundo.saldoAjustado)}`}>{brl(calc.fundo.saldoAjustado)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {calc.ajustesAtivos > 0 ? `com ${calc.ajustesAtivos} ajuste${calc.ajustesAtivos === 1 ? "" : "s"} histórico${calc.ajustesAtivos === 1 ? "" : "s"}` : "sem ajustes"}
                  </p>
                </div>
                <div className="min-w-0">
                  <Rotulo>Histórico arrecadado</Rotulo>
                  <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(calc.fundo.arrecadado)}</p>
                </div>
                <div className="min-w-0">
                  <Rotulo>Histórico enviado</Rotulo>
                  <p className="text-lg font-extrabold tabular-nums text-destructive-text">{brl(calc.fundo.enviado)}</p>
                </div>
              </div>
              {calc.ajustesAtivos > 0 && (
                <p role="note" className="mx-3 mb-3 rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-text">
                  <strong>⚠ Histórico parcialmente incompleto.</strong> Parte dos envios realizados em 2024 refere-se a campanhas
                  arrecadadas antes da implantação do Omie. O saldo registrado pode não refletir integralmente o histórico
                  missionário da igreja.
                </p>
              )}
              {calc.fundo.saldoAjustado < 0 && (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  {calc.ajustesAtivos > 0 ? "Mesmo com os ajustes, a" : "A"} igreja enviou {brl(-calc.fundo.saldoAjustado)} a mais do que as ofertas registradas —
                  a diferença saiu do caixa geral ou de ofertas não lançadas como "Ofertas para Missões".
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ── 3. Missões permanentes (sustento — investimento próprio, fora do fundo) ── */}
      <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-perm">
        <div className="p-3 pb-2">
          <h3 id="mis-perm" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Missões permanentes</h3>
          <p className="text-[11px] text-muted-foreground">Sustento missionário: investimento próprio da igreja, <strong>fora do Fundo Missionário</strong>.</p>
        </div>
        {!pronto || !calc ? (
          <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-3 pb-3">
            <div className="min-w-0">
              <Rotulo>Sustentados (12 meses)</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{calc.permanentes.sustentados}</p>
            </div>
            <div className="min-w-0">
              <Rotulo>Pastor missionário</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.permanentes.pastor)}</p>
            </div>
            <div className="min-w-0">
              <Rotulo>Parcerias missionárias</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.permanentes.parcerias)}</p>
            </div>
            <div className="min-w-0">
              <Rotulo>Compromisso mensal</Rotulo>
              {calc.permanentes.compromissoMensal === null ? (
                <p className="text-xs text-muted-foreground pt-1">Não cadastrado — crie recorrências no subcentro Sustento Missionário.</p>
              ) : (
                <p className="text-lg font-extrabold tabular-nums">{brl(calc.permanentes.compromissoMensal)}</p>
              )}
            </div>
            <div className="min-w-0">
              <Rotulo>Investido no período</Rotulo>
              <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(calc.permanentes.total)}</p>
            </div>
          </div>
        )}
      </section>

      {/* ── 4. Campanhas missionárias ───────────────────────────────────────── */}
      <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-camp">
        <div className="p-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h3 id="mis-camp" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Campanhas missionárias — {ano}</h3>
            <p className="text-[11px] text-muted-foreground">O ano vem da data do lançamento; não há cadastro por exercício.</p>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setMetasAberto(true)}>
            Metas
          </Button>
        </div>
        {!pronto || !calc ? (
          <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
        ) : recursos && !recursos.campanha ? (
          <p className="mx-3 mb-3 text-xs border border-dashed rounded-md p-3 text-muted-foreground">
            O campo "Campanha missionária" ainda não existe no banco: falta aplicar as migrations de missões
            (20261006180000 a 20261006200000). Até lá não é possível medir as campanhas.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {calc.campanhas.map(c => (
              <li key={c.campanha} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{ROTULO_DA_CAMPANHA[c.campanha]}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Meta: {c.meta !== null ? brl(c.meta) : "não definida"}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(c.arrecadado)}</span>
                  <span className="text-sm font-bold tabular-nums">
                    {c.percentual !== null ? `${c.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%` : "—"}
                  </span>
                </div>
                {c.percentual !== null && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, c.percentual)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-violeta" style={{ width: `${Math.min(100, c.percentual)}%` }} />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {c.qtdOfertas} oferta{c.qtdOfertas === 1 ? "" : "s"} · enviado {brl(c.enviado)} em {c.ano}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 5. Projetos missionários ────────────────────────────────────────── */}
      <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-proj">
        <div className="p-3 pb-2">
          <h3 id="mis-proj" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Projetos missionários</h3>
          <p className="text-[11px] text-muted-foreground">Só o que é temporário (ex.: construção de um templo missionário). Campanhas não são projetos.</p>
        </div>
        {!pronto || !dados ? (
          <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
        ) : dados.projetos.length === 0 ? (
          <p className="mx-3 mb-3 text-xs border border-dashed rounded-md p-3 text-muted-foreground">
            Nenhum projeto missionário cadastrado. Para criar um, cadastre o projeto em Financeiro → Projetos e marque-o como missionário.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {dados.projetos.map(({ projeto, arrecadado, gasto }) => (
              <li key={projeto.id} className="px-3 py-2.5 text-sm space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold min-w-0 truncate">{projeto.nome}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{projeto.status === "ativo" ? "ativo" : "encerrado"}</span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Meta {projeto.meta_valor ? brl(projeto.meta_valor) : "não definida"} · arrecadado {brl(arrecadado)}
                  {projeto.meta_valor ? ` (${((arrecadado / projeto.meta_valor) * 100).toFixed(1).replace(".", ",")}%)` : ""} · execução (gasto) {brl(gasto)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Envios: oficial × esforço total ─────────────────────────────────── */}
      <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-envios">
        <div className="p-3 pb-2">
          <h3 id="mis-envios" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Envios missionários</h3>
          <p className="text-[11px] text-muted-foreground">
            <strong>Envio Oficial</strong> = Repasses Missionários. <strong>Esforço Total</strong> = tudo que sai do centro de Missões
            (Envio Oficial + custo das campanhas + Sustento + Projetos + Ofertas diretas).
          </p>
        </div>
        {!pronto || !calc ? (
          <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 px-3 pb-3">
            {/* As 4 perguntas, uma por subcentro. Antes da migration dos 4 subcentros, Projetos/Ofertas aparecem zerados. */}
            <div className="rounded-md border p-3 min-w-0">
              <Rotulo>Sustento missionário</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.enviosTotal.sustento)}</p>
              <p className="text-[11px] text-muted-foreground">histórico · no período {brl(calc.enviosPeriodo.sustento)}</p>
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <Rotulo>Campanhas: enviado</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.enviosTotal.oficial + calc.enviosTotal.custoDeCampanhas)}</p>
              <p className="text-[11px] text-muted-foreground">
                histórico · no período {brl(calc.enviosPeriodo.oficial + calc.enviosPeriodo.custoDeCampanhas)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                Envio Oficial {brl(calc.enviosTotal.oficial)} + custo de arrecadar {brl(calc.enviosTotal.custoDeCampanhas)} · arrecadado {brl(calc.fundo.arrecadado)}
              </p>
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <Rotulo>Projetos missionários</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.enviosTotal.projetos)}</p>
              <p className="text-[11px] text-muted-foreground">histórico · no período {brl(calc.enviosPeriodo.projetos)}</p>
            </div>
            <div className="rounded-md border p-3 min-w-0">
              <Rotulo>Entregue direto a missionários</Rotulo>
              <p className="text-lg font-extrabold tabular-nums">{brl(calc.enviosTotal.ofertas)}</p>
              <p className="text-[11px] text-muted-foreground">histórico · no período {brl(calc.enviosPeriodo.ofertas)}</p>
            </div>
            <div className="rounded-md border p-3 min-w-0 min-[420px]:col-span-2">
              <Rotulo>Esforço Missionário Total</Rotulo>
              <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(calc.enviosTotal.esforcoTotal)}</p>
              <p className="text-[11px] text-muted-foreground">
                histórico · no período {brl(calc.enviosPeriodo.esforcoTotal)}
              </p>
              {calc.enviosTotal.mobilizacao > 0 && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  inclui {brl(calc.enviosTotal.mobilizacao)} do subcentro antigo Mobilização Missionária.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Ofertas missionárias sem classificação ──────────────────────────── */}
      {pronto && calc && calc.pendentes.quantidade > 0 && (
        <section className="rounded-lg border border-dashed bg-card p-3 space-y-2" aria-labelledby="mis-pend">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 id="mis-pend" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ofertas missionárias sem classificação
              </h3>
              <p className="text-sm tabular-nums">
                <strong>{calc.pendentes.quantidade}</strong> registros · <strong>{brl(calc.pendentes.total)}</strong> sem campanha
              </p>
              {calc.pendentes.semCentro > 0 && (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  dos quais {calc.pendentes.semCentro} também sem centro de custo ({brl(calc.pendentes.totalSemCentro)}).
                  Receita não precisa de subcentro: categoria + centro já classificam.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">Nada é classificado sozinho: você confere a sugestão antes de gravar.</p>
            </div>
            <Button type="button" size="sm" variant="violeta" onClick={() => setLoteAberto(true)}>Classificar em lote</Button>
          </div>
        </section>
      )}

      <AjustesDoFundoDialog open={ajustesAberto} onOpenChange={setAjustesAberto}
        ajustes={dados?.ajustes ?? []} disponivel={recursos?.ajustes ?? false} onMudou={onRecarregar} />
      <MetasDeCampanhaDialog open={metasAberto} onOpenChange={setMetasAberto} ano={ano}
        metas={dados?.metas ?? []} disponivel={recursos?.metas ?? false} onMudou={onRecarregar} />
      <ClassificarOfertasDialog open={loteAberto} onOpenChange={setLoteAberto}
        grupos={calc?.grupos ?? []} disponivel={recursos?.campanha ?? false} onAplicado={onRecarregar} />
    </div>
  );
}

// ─── Gráfico: barras de entrada/saída + linha do resultado acumulado ──────────
// SVG puro: o gráfico é pequeno e o `recharts` só existe em 2 telas (CLAUDE.md §3.4).
function GraficoMissionario({ serie }: { serie: PontoDaSerie[] }) {
  const W = 600, H = 150, PAD_T = 8, PAD_B = 22, PAD_X = 4;
  const maxBarra = Math.max(0, ...serie.flatMap(p => [p.entradas, p.saidas]));
  const acums = serie.map(p => p.acumulado);
  const topo = Math.max(maxBarra, ...acums, 1);
  const base = Math.min(0, ...acums);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - base) / (topo - base || 1));
  const slot = (W - PAD_X * 2) / Math.max(serie.length, 1);
  const larguraBarra = Math.min(slot * 0.36, 22);
  const cx = (i: number) => PAD_X + slot * i + slot / 2;
  const semMovimento = maxBarra === 0;
  const indicesDosRotulos = new Set([0, Math.floor((serie.length - 1) / 2), serie.length - 1]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label="Gráfico de entradas, saídas e resultado acumulado de missões no período">
        <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} stroke="hsl(var(--border))" strokeWidth="1" />
        {serie.map((p, i) => (
          <g key={p.inicio}>
            <title>{`${p.rotulo}: entrou ${brl(p.entradas)} · saiu ${brl(p.saidas)} · resultado ${brl(p.saldo)}`}</title>
            <rect x={cx(i) - larguraBarra - 0.5} width={larguraBarra} y={Math.min(y(p.entradas), y(0))}
              height={Math.max(Math.abs(y(0) - y(p.entradas)), p.entradas > 0 ? 1 : 0)} fill="hsl(var(--violeta))" rx="1.5" />
            <rect x={cx(i) + 0.5} width={larguraBarra} y={Math.min(y(p.saidas), y(0))}
              height={Math.max(Math.abs(y(0) - y(p.saidas)), p.saidas > 0 ? 1 : 0)} fill="hsl(var(--destructive))" rx="1.5" />
            {indicesDosRotulos.has(i) && (
              <text x={cx(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}
                fontSize="10" fill="hsl(var(--muted-foreground))">{p.rotulo}</text>
            )}
          </g>
        ))}
        {serie.length > 1 && (
          <polyline fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeLinejoin="round"
            points={serie.map((p, i) => `${cx(i)},${y(p.acumulado)}`).join(" ")} />
        )}
        {serie.length > 0 && (
          <circle cx={cx(serie.length - 1)} cy={y(serie[serie.length - 1].acumulado)} r="3" fill="hsl(var(--foreground))" />
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violeta" />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-destructive" />Saídas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-foreground" />Resultado acumulado no período</span>
      </div>
      {semMovimento && <p className="text-xs text-muted-foreground mt-2">Sem movimento missionário neste período.</p>}
    </div>
  );
}
