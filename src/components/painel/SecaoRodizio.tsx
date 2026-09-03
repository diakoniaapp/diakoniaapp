// ─── A escala do mês, no painel de quem a monta ──────────────────────────────
//
// A igreja cria o culto na agenda e marca que ele precisa do apoio deste
// ministério. O evento aparece aqui, e um botão monta o rodízio do mês.
//
// ── RASCUNHO, SEMPRE ─────────────────────────────────────────────────────────
//
// O plano aparece na tela antes de existir no banco. Quem lidera lê, e só
// então grava — como `planejada`, que é o rascunho que este sistema já tinha.
// Gerar direto para o que as pessoas veem no telemóvel é como se perde a
// confiança no botão logo na primeira escala esquisita.
//
// ── E CADA NOME VEM COM A RAZÃO ──────────────────────────────────────────────
//
// "não serve há 47 dias · 0 de 2 no mês". Sem a frase, quem lidera não confia
// e refaz tudo à mão — e aí o gerador não poupou nada. Com ela, a conversa
// deixa de ser "por que ela?" e passa a ser "esta semana não, ela viajou".

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Shuffle, CalendarPlus, Loader2, Save, AlertTriangle, CalendarClock } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import { carregarMes, gravarRascunho, type MesDoRodizio } from "@/services/escalaDoMes";
import { montarRodizio, type PlanoDoMes } from "@/services/rodizio";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function diaEHora(data: string, hora: string | null): string {
  const [, m, d] = data.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}` +
    (hora ? ` · ${hora.slice(0, 5)}` : "");
}

export function SecaoRodizio({ ministerioId }: { ministerioId: string }) {
  const agora = new Date();
  // O mês que interessa é o PRÓXIMO: escala se monta antes, não durante.
  const [quando, setQuando] = useState(() => {
    const d = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  });

  const [mes, setMes] = useState<MesDoRodizio | null>(null);
  const [plano, setPlano] = useState<PlanoDoMes | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    setPlano(null);
    setMes(null);
    carregarMes(ministerioId, quando.ano, quando.mes).then(setMes);
  }, [ministerioId, quando.ano, quando.mes]);

  function gerar() {
    if (!mes) return;
    // A semente muda a cada clique: quem não gostou do sorteio pode pedir
    // outro. O rodízio não muda — só o desempate entre iguais.
    setPlano(montarRodizio(mes.eventos, mes.candidatos, Date.now() % 100000));
  }

  async function gravar() {
    if (!plano) return;
    setGravando(true);
    const r = await gravarRascunho(ministerioId, plano);
    setGravando(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Rascunho salvo: ${r.pessoas} ${r.pessoas === 1 ? "pessoa" : "pessoas"} em ${r.escalas} ${r.escalas === 1 ? "escala" : "escalas"}.`);
  }

  function mover(passo: number) {
    const d = new Date(quando.ano, quando.mes - 1 + passo, 1);
    setQuando({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  }

  return (
    <section id="rodizio" className="scroll-mt-[240px]">
      <TituloDaSecao icone={Shuffle} tom="info" contagem={mes?.eventos.length}>
        Escala do mês
      </TituloDaSecao>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
          onClick={() => mover(-1)}>←</Button>
        {/* `capitalize` do Tailwind põe maiúscula em CADA palavra, e saía
            "Outubro De 2026". A maiúscula é uma só, na primeira letra. */}
        <span className="text-sm font-medium min-w-[9rem]">
          {MESES[quando.mes - 1][0].toUpperCase() + MESES[quando.mes - 1].slice(1)} de {quando.ano}
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
          onClick={() => mover(1)}>→</Button>
      </div>

      {!mes ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Procurando os eventos do mês…
        </p>
      ) : mes.eventos.length === 0 ? (
        /* Não inventa domingos. Se a agenda não tem o culto, a escala não tem
           o que preencher — e o caminho é a agenda, não este botão. */
        <div className="rounded-md border border-warning-line bg-warning-soft px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-text">
            <CalendarPlus className="w-4 h-4 shrink-0" />
            Nenhum evento deste mês pede o apoio deste ministério
          </p>
          <p className="text-xs text-warning-text/90 mt-1">
            A escala sai da agenda: ao criar o culto, marque que ele precisa deste ministério —
            ou de uma área dele. Os eventos aparecem aqui, e o rodízio preenche.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">
            {mes.eventos.length} {mes.eventos.length === 1 ? "evento pede" : "eventos pedem"} este
            ministério · {mes.candidatos.length} {mes.candidatos.length === 1 ? "voluntário" : "voluntários"} na urna
          </p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            <Button type="button" size="sm" className="gap-1.5" onClick={gerar}>
              <Shuffle className="w-3.5 h-3.5" />
              {plano ? "Sortear de novo" : "Montar o rodízio"}
            </Button>
            {plano && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5"
                disabled={gravando} onClick={gravar}>
                {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar como rascunho
              </Button>
            )}
          </div>

          {plano && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {plano.pessoasUsadas} {plano.pessoasUsadas === 1 ? "pessoa" : "pessoas"} no mês
                {plano.incompletas > 0 && (
                  <> · <span className="text-warning-text">{plano.incompletas} {plano.incompletas === 1 ? "vaga incompleta" : "vagas incompletas"}</span></>
                )}
                {" "}· nada foi gravado ainda
              </p>

              {plano.vagas.map(v => (
                <div key={`${v.evento_id}-${v.area_id}`} className="rounded-md border bg-card px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{v.area_nome}</span>
                    <span className="text-xs text-muted-foreground">{v.titulo}</span>
                    <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                      {diaEHora(v.data, mes.eventos.find(e => e.evento_id === v.evento_id)?.hora_inicio ?? null)}
                    </span>
                  </div>

                  {v.escalados.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {v.escalados.map(e => (
                        <li key={e.pessoa_id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                          <span className="font-medium">{e.nome}</span>
                          {/* Presumido tem cor: a escala não esconde que
                              aquele nome entrou por palpite, e não por
                              resposta. */}
                          <span className={e.presumido ? "text-warning-text" : "text-muted-foreground"}>
                            {e.porque}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {v.faltam > 0 && (
                    <p className="flex items-start gap-1.5 mt-1.5 text-xs text-warning-text">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      {v.faltam === 1 ? "Falta 1" : `Faltam ${v.faltam}`} de {v.minimo} — {v.motivoDaFalta}.
                    </p>
                  )}
                </div>
              ))}

              {/* ── A COBRANÇA DA FICHA ────────────────────────────────
                  Silêncio não é recusa: quem não informou entra na urna. Mas
                  presumir para sempre transforma a lacuna em regra, e a
                  escala passa a ser palpite com cara de decisão. Por isso a
                  lista é de TODA a equipe sem disponibilidade, e não só de
                  quem calhou de ser sorteado. */}
              {plano.semDisponibilidade.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-medium text-warning-text">
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    {plano.semDisponibilidade.length === 1
                      ? "1 pessoa da equipe não disse quando pode servir"
                      : `${plano.semDisponibilidade.length} pessoas da equipe não disseram quando podem servir`}
                  </p>
                  <p className="text-xs text-warning-text/90 mt-0.5">
                    Elas entram no rodízio como disponíveis — o silêncio não é recusa —, mas isso é
                    palpite. O passo <strong>Quando serve</strong>, na ficha de cada uma, troca o
                    palpite por resposta.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {plano.semDisponibilidade.slice(0, 15).map(p => (
                      <span key={p.pessoa_id}
                        className="rounded-full border border-warning-line bg-background px-2.5 py-0.5 text-xs">
                        {p.nome}
                      </span>
                    ))}
                    {plano.semDisponibilidade.length > 15 && (
                      <span className="text-xs text-warning-text/80 self-center">
                        e mais {plano.semDisponibilidade.length - 15}
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/ministerios/${ministerioId}/voluntarios`}
                    className="inline-block mt-2 text-xs text-warning-text underline underline-offset-2 hover:text-foreground"
                  >
                    Abrir a equipe e informar
                  </Link>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Salvo como rascunho, ninguém é avisado: o estado é <Badge variant="outline" className="text-xs h-4 px-1 font-normal">planejada</Badge>{" "}
                até alguém confirmar a escala.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
