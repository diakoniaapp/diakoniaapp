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
import { HeartHandshake, ChevronRight, ClipboardList, UserX, CalendarClock, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { TituloDaSecao } from "@/components/painel/blocos";
import {
  carregarIndicadoresDiaconia, carregarLimitesPerCapita, ROTULO_CLASSIFICACAO,
  carregarPendenciasAcompanhamento, carregarFichasRevisaoVencida,
  type BancadaDiaconia, type IndicadoresDiaconia, type PendenciaAcompanhamento,
  type FichaRevisaoVencida,
} from "@/services/diaconiaService";
import { hojeLocal } from "@/lib/data";
import { montarLinkWhatsApp } from "@/lib/whatsapp";

// Épico 5 do roadmap "90 Dias" (22/09/2026): "levar o card de Visitante —
// prioridade, status e ação num objeto só — pra dentro da Diakonia Care".
// Antes, "quem parou de vir" era uma lista de texto sem cor nem ação:
// clicava no nome, saía da tela, procurava a pessoa de novo na lista de
// "Pessoas" pra então achar o telefone. Reaproveita `PRIORIDADE_STYLE`
// (mesma paleta de `lib/visitantesFluxo.ts`, usada no card de Visitante)
// — não inventa uma segunda linguagem visual pra "urgência" no sistema.
const PRIORIDADE_FALTAS: { min: number; border: string; badge: string }[] = [
  { min: 4, border: "border-l-destructive", badge: "bg-destructive/10 text-destructive-text border-destructive/30" },
  { min: 3, border: "border-l-warning",     badge: "bg-warning/15 text-warning-text border-warning/30" },
  { min: 0, border: "border-l-success",     badge: "bg-success/15 text-success-text border-success/30" },
];
function prioridadePorFaltas(n: number) {
  return PRIORIDADE_FALTAS.find(p => n >= p.min)!;
}

function hojeISO(): string {
  return hojeLocal();
}

function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SecaoDiaconia({ dc, ministerioId }: { dc: BancadaDiaconia; ministerioId: string }) {
  const [ind, setInd] = useState<IndicadoresDiaconia | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaAcompanhamento[] | null>(null);
  const [revisaoVencida, setRevisaoVencida] = useState<FichaRevisaoVencida[] | null>(null);

  useEffect(() => {
    carregarLimitesPerCapita()
      .then(limites => carregarIndicadoresDiaconia(ministerioId, limites))
      .then(setInd)
      .catch(() => setInd(null));
    carregarPendenciasAcompanhamento(ministerioId).then(setPendencias).catch(() => setPendencias(null));
    carregarFichasRevisaoVencida(ministerioId).then(setRevisaoVencida).catch(() => setRevisaoVencida(null));
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
        <div className="mb-2 space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-text px-0.5">
            <UserX className="w-4 h-4 shrink-0" />
            {pendencias.length === 1 ? "1 pessoa parou de vir" : `${pendencias.length} pessoas pararam de vir`}
          </p>
          <p className="text-xs text-muted-foreground px-0.5">
            Não confirmadas nas últimas vezes que a área abriu chamada — reavalie se ainda precisam,
            ou encerre o acompanhamento.
          </p>
          {pendencias.slice(0, 8).map(p => {
            const prio = prioridadePorFaltas(p.faltasSeguidas);
            return (
              <Card key={p.vinculo_id} className={`min-w-0 border-l-4 ${prio.border}`}>
                <CardContent className="p-2.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link to={`/ministerios/${ministerioId}/diaconia/${p.area_id}/pessoas`}
                        className="text-sm font-medium truncate hover:underline">
                        {p.nome}
                      </Link>
                      <Badge variant="outline" className={`text-xs h-4 px-1.5 ${prio.badge}`}>
                        {p.faltasSeguidas} {p.faltasSeguidas === 1 ? "falta" : "faltas"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.area_nome}</p>
                  </div>
                  <Button
                    size="sm" className="h-9 px-3 gap-1.5 text-xs shrink-0 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                    disabled={!p.telefone}
                    onClick={() => {
                      if (!p.telefone) { toast.error("Telefone não cadastrado"); return; }
                      window.open(
                        montarLinkWhatsApp({
                          telefone: p.telefone,
                          texto: `Olá, ${p.nome.split(" ")[0]}! Sentimos sua falta por aqui. Está tudo bem com você? 💙`,
                        }),
                        "_blank", "noopener,noreferrer",
                      );
                    }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {pendencias.length > 8 && (
            <p className="text-xs text-warning-text/80 px-0.5">e mais {pendencias.length - 8}.</p>
          )}
        </div>
      )}

      {/* Bússola (22/09/2026): "próxima revisão", não "faltou na chamada" —
          diferente do bloco acima, este olha a FICHA (quem tinha data
          marcada e ela já passou), não a presença. Só aparece pra quem
          alguém agendou revisão de propósito. */}
      {revisaoVencida && revisaoVencida.length > 0 && (
        <div className="mb-2 space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-text px-0.5">
            <CalendarClock className="w-4 h-4 shrink-0" />
            {revisaoVencida.length === 1
              ? "1 ficha com revisão vencida"
              : `${revisaoVencida.length} fichas com revisão vencida`}
          </p>
          {revisaoVencida.slice(0, 8).map(r => (
            <Card key={r.pessoaId} className="min-w-0 border-l-4 border-l-warning">
              <CardContent className="p-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium truncate">{r.nome}</span>
                    <Badge variant="outline" className="text-xs h-4 px-1.5 bg-warning/15 text-warning-text border-warning/30">
                      {r.diasVencidos === 1 ? "1 dia vencida" : `${r.diasVencidos} dias vencida`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Revisão marcada para {r.proximaRevisaoEm.split("-").reverse().join("/")}
                  </p>
                </div>
                <Button
                  size="sm" className="h-9 px-3 gap-1.5 text-xs shrink-0 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                  disabled={!r.telefone}
                  onClick={() => {
                    if (!r.telefone) { toast.error("Telefone não cadastrado"); return; }
                    window.open(
                      montarLinkWhatsApp({
                        telefone: r.telefone,
                        texto: `Olá, ${r.nome.split(" ")[0]}! Está na hora de revermos sua situação por aqui. Podemos conversar? 💙`,
                      }),
                      "_blank", "noopener,noreferrer",
                    );
                  }}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </Button>
              </CardContent>
            </Card>
          ))}
          {revisaoVencida.length > 8 && (
            <p className="text-xs text-warning-text/80 px-0.5">e mais {revisaoVencida.length - 8}.</p>
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
