// ─── A porta de entrada, dentro do painel da Diaconia ─────────────────────
//
// Uma linha por área — cestas básicas, e o que vier depois (culto de rua,
// jantar) quando a igreja criar as áreas. Cada linha leva à chamada de hoje
// e à lista de quem é atendido ali.
//
// ── OS INDICADORES (04/09) ───────────────────────────────────────────────
//
// Ela perguntou se a ficha, do jeito que estava, "ajuda com informações,
// para termos essa medição" — e a resposta honesta era não: a ficha gerava
// dado cru, ninguém somava. Isto soma. Cobertura vem primeiro — sem saber
// quantos NÃO têm ficha, a distribuição por vulnerabilidade mentiria por
// omissão (contaria só quem já foi triado, como se fosse todo mundo).
//
// ── QUEM PAROU DE VIR (04/09, ainda) ──────────────────────────────────────
//
// A origem do problema, nas palavras dela: as cestas nasceram na pandemia
// para durar 3 meses, e desde então nunca houve acompanhamento — "até pra
// saber se pode continuar ou se já não precisa de ajuda". O critério é
// dela: "não veio 2 meses seguidos". Não pede ficha nem data marcada —
// só olha a chamada, que já existe.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, ChevronRight, ClipboardList, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TituloDaSecao } from "@/components/painel/blocos";
import {
  carregarIndicadoresDiaconia, carregarLimitesPerCapita, ROTULO_CLASSIFICACAO,
  carregarPendenciasAcompanhamento,
  type BancadaDiaconia, type IndicadoresDiaconia, type PendenciaAcompanhamento,
} from "@/services/diaconiaService";
import { hojeLocal } from "@/lib/data";

function hojeISO(): string {
  return hojeLocal();
}

function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SecaoDiaconia({ dc, ministerioId }: { dc: BancadaDiaconia; ministerioId: string }) {
  const [ind, setInd] = useState<IndicadoresDiaconia | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaAcompanhamento[] | null>(null);

  useEffect(() => {
    carregarLimitesPerCapita()
      .then(limites => carregarIndicadoresDiaconia(ministerioId, limites))
      .then(setInd)
      .catch(() => setInd(null));
    carregarPendenciasAcompanhamento(ministerioId).then(setPendencias).catch(() => setPendencias(null));
  }, [ministerioId]);

  return (
    <section id="diaconia" className="scroll-mt-[240px]">
      <TituloDaSecao icone={HeartHandshake} tom="success" contagem={dc.totalPessoas}>
        Quem é assistido
      </TituloDaSecao>

      <p className="text-sm text-muted-foreground mb-2">
        {dc.totalPessoas === 0
          ? "Ninguém cadastrado ainda."
          : `${dc.totalPessoas} ${dc.totalPessoas === 1 ? "pessoa assistida" : "pessoas assistidas"}`}
        {dc.atendimentosMes > 0 && ` · ${dc.atendimentosMes} ${dc.atendimentosMes === 1 ? "confirmação" : "confirmações"} este mês`}
      </p>

      {dc.areas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Este ministério ainda não tem área cadastrada.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card mb-2">
          {dc.areas.map(a => (
            <li key={a.area_id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate min-w-0">{a.area_nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.pessoas} {a.pessoas === 1 ? "pessoa" : "pessoas"}
                </p>
              </div>
              <Link to={`/ministerios/${ministerioId}/diaconia/${a.area_id}/pessoas`}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                Pessoas <ChevronRight className="w-3 h-3" />
              </Link>
              <Link to={`/ministerios/${ministerioId}/diaconia/${a.area_id}/chamada?data=${hojeISO()}`}
                className="shrink-0 text-xs text-gold-text hover:underline inline-flex items-center gap-0.5">
                Chamada de hoje <ChevronRight className="w-3 h-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pendencias && pendencias.length > 0 && (
        <div className="rounded-md border border-warning-line bg-warning-soft px-3 py-2.5 mb-2">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-text">
            <UserX className="w-4 h-4 shrink-0" />
            {pendencias.length === 1 ? "1 pessoa parou de vir" : `${pendencias.length} pessoas pararam de vir`}
          </p>
          <p className="text-xs text-warning-text/90 mt-0.5">
            Não confirmadas nas últimas {pendencias[0]?.faltasSeguidas ?? 2}+ vezes que a área abriu chamada —
            reavalie se ainda precisam, ou encerre o acompanhamento.
          </p>
          <ul className="mt-2 space-y-1">
            {pendencias.slice(0, 8).map(p => (
              <li key={p.vinculo_id} className="flex items-baseline justify-between gap-2 text-xs">
                <Link to={`/ministerios/${ministerioId}/diaconia/${p.area_id}/pessoas`}
                  className="text-foreground hover:underline min-w-0 truncate">
                  {p.nome} <span className="text-muted-foreground">· {p.area_nome}</span>
                </Link>
                <span className="text-warning-text tabular-nums shrink-0">
                  {p.faltasSeguidas} faltas
                </span>
              </li>
            ))}
          </ul>
          {pendencias.length > 8 && (
            <p className="text-xs text-warning-text/80 mt-1.5">e mais {pendencias.length - 8}.</p>
          )}
        </div>
      )}

      {ind && dc.totalPessoas > 0 && (
        <div className="rounded-md border bg-card px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="w-4 h-4 shrink-0 text-muted-foreground" />
            O que a ficha diz
          </p>

          {ind.semFicha > 0 && (
            <p className="text-xs text-warning-text mt-1.5">
              {ind.semFicha} {ind.semFicha === 1 ? "pessoa ainda sem ficha" : "pessoas ainda sem ficha"} —
              {" "}{ind.comFicha} de {ind.comFicha + ind.semFicha} triadas.
            </p>
          )}

          {(ind.distribuicao.extrema_pobreza + ind.distribuicao.pobreza + ind.distribuicao.acima_da_linha) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ind.distribuicao.extrema_pobreza > 0 && (
                <Badge variant="outline" className="text-xs text-destructive-text border-destructive-line bg-destructive-soft">
                  {ROTULO_CLASSIFICACAO.extrema_pobreza} · {ind.distribuicao.extrema_pobreza}
                </Badge>
              )}
              {ind.distribuicao.pobreza > 0 && (
                <Badge variant="outline" className="text-xs text-warning-text border-warning-line bg-warning-soft">
                  {ROTULO_CLASSIFICACAO.pobreza} · {ind.distribuicao.pobreza}
                </Badge>
              )}
              {ind.distribuicao.acima_da_linha > 0 && (
                <Badge variant="outline" className="text-xs text-success-text border-success-line bg-success-soft">
                  {ROTULO_CLASSIFICACAO.acima_da_linha} · {ind.distribuicao.acima_da_linha}
                </Badge>
              )}
              {ind.semDadoParaClassificar > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  Sem renda p/ classificar · {ind.semDadoParaClassificar}
                </Badge>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            {ind.perCapitaMedio != null && `Per capita médio de quem tem ficha: ${formatarReais(ind.perCapitaMedio)}. `}
            {ind.criancasAtendidas > 0 && `${ind.criancasAtendidas} ${ind.criancasAtendidas === 1 ? "criança" : "crianças"}`}
            {ind.criancasAtendidas > 0 && ind.idososAtendidos > 0 && " e "}
            {ind.idososAtendidos > 0 && `${ind.idososAtendidos} ${ind.idososAtendidos === 1 ? "idoso" : "idosos"}`}
            {(ind.criancasAtendidas > 0 || ind.idososAtendidos > 0) && " nas casas atendidas."}
          </p>
        </div>
      )}
    </section>
  );
}
