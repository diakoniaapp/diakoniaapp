// ─── PainelPastoral.tsx — O dia pastoral em uma tela ───────────────────────
//
// Reorganizado em 26/08/2026. O que mudou, e por quê:
//
// 1. **Tudo que é cadastro saiu daqui.**
//
//    "Possíveis vínculos familiares" sugeria família por sobrenome em comum.
//    "Famílias sem responsável" pedia que se definisse o responsável de cada
//    núcleo. E dentro de "Candidatos à membresia" havia a lista dos
//    congregados sem data de nascimento, com botão para abrir cada ficha.
//
//    Os três são **preenchimento de cadastro, e isso é trabalho da
//    secretaria** — não da liderança pastoral, que é quem esta tela serve.
//    Os dois primeiros continuam em `/familias`. Os três atalhos do painel
//    inicial que apontavam para cá foram redirecionados para lá.
//
//    `resumo_painel_pastoral` ainda devolve `familias_sem_resp` e
//    `pessoas_sem_familia_sugerida`; esta tela simplesmente não os lê mais. A
//    função não foi alterada — outras telas a consomem.
//
//    **Consequência a registrar:** os 48 congregados sem data de nascimento
//    deixaram de ter superfície em qualquer tela. Eles não entram em
//    "Candidatos à membresia" porque a regra dos 9 anos não consegue julgá-los
//    sem a data. O lugar certo para isso é uma tela de qualidade de cadastro,
//    que ainda não existe; `candidatosMembresia()` mantém a contagem pronta
//    para quando existir.
//
// 2. **"Datas importantes" passou a ser um bloco só, de hoje + 6 dias**, e
//    junta duas fontes que já existiam e nunca tinham se encontrado:
//    as efemérides das pessoas (`agenda_pastoral_proximos_dias` → aniversário,
//    bodas, anos de membresia e anos de pastorado) e o calendário externo
//    (`lib/agenda/externalEvents` → feriados nacionais e datas da Convenção
//    Batista, incluindo as semanas de oração da JMM e da JMN).
//
//    Nada de novo foi criado para isso: as duas fontes estavam prontas, e a
//    segunda só era lida pela tela da Agenda.
//
// 3. **A tela vira o dia sozinha.** Um relógio de um minuto compara a data
//    local; quando ela muda, recarrega. Sem isso, uma aba deixada aberta na
//    secretaria mostraria "hoje" de ontem indefinidamente.
//
// 4. **Dois blocos novos**: candidatos à membresia e acompanhamento de
//    visitantes.
//
// 5. **A seção "Discipulado" reúne EBD, Pequenos Grupos, Campanhas
//    Espirituais e Crescimento, em abas.** As quatro respondem à mesma
//    pergunta por caminhos diferentes — como está a vida espiritual de quem
//    a igreja acompanha — e por isso moram aqui dentro, e não em telas
//    separadas do menu.
//
//    `/ebd/acompanhamento` existiu por algumas horas como tela própria e
//    virou redirecionamento para cá. `/admin/campanhas` e
//    `/painel-estrategico` continuam servindo a versão de página inteira
//    (link salvo não quebra), mas saíram do menu: `CampanhasAdmin` e
//    `PainelEstrategico` ganharam um modo `embutido` e são as MESMAS telas
//    renderizadas nas abas, com assistente de criação e gráficos e tudo.
//
//    O próprio Painel Pastoral subiu para o topo do menu, fora dos grupos,
//    ao lado de "Home" — ver `ATALHOS_TOPO` em navConfig.ts.
//
//    Em abas porque o painel já tem várias seções acima; as três empilhadas
//    somariam mais de uma tela de rolagem cada. E cada uma busca os próprios
//    dados, com estado próprio: pendurá-las no `Promise.all` abaixo faria os
//    blocos pastorais esperarem por agregações que ninguém pediu para ver
//    primeiro.
//
//    Nada foi criado no banco para o PGM: `pgm_resumo_geral`,
//    `pgm_alertas_ausencia` e `vw_pgm_grupos_resumo` já existiam, entre os
//    objetos que nunca eram consultados.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cake, Heart, MessageCircle, CalendarCheck, Award, Flag, BookMarked,
  Sparkles, AlertCircle, Users, ChevronRight, Crown, Flame, Droplets,
  GraduationCap, UserCheck, CalendarClock, Sprout, BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { PaginaSkeleton } from "@/components/ListState";
import {
  proximosDias, linkWhatsApp,
  resumoPainel,
  type EventoPastoral, type ResumoPastoral,
} from "@/services/agendaPastoralService";
import {
  candidatosMembresia,
  IDADE_MINIMA_BATISMO,
  type CandidatosMembresia,
} from "@/services/painelPastoralService";
import { getResumoVisitantes, type ResumoVisitantes } from "@/services/visitanteService";
import { eventosExternos } from "@/lib/agenda/externalEvents";
// "Acontecendo hoje" — o mesmo bloco do painel inicial, reaproveitado inteiro.
// Ele expande as recorrências e soma as reservas de espaço, que é o que faz o
// culto de domingo e o ensaio de sábado realmente aparecerem. O hook
// `useReportarVazio` que ele usa é inerte fora do HOJE (ver components/hoje/
// vazio.ts), então embutir aqui não exige provider nenhum.
import { AgendaDoDia } from "@/components/dashboard/AgendaDoDia";
// O nome do candidato abre a ficha em modo consulta — sem lapis de edicao.
import { NomePessoa } from "@/components/membros/ficha";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Os dois blocos de discipulado. Cada um busca os próprios dados — ver o
// cabeçalho de cada arquivo.
import { PainelAcompanhamentoEbd } from "@/components/ebd/PainelAcompanhamentoEbd";
import { PainelAcompanhamentoPgm } from "@/components/pgm/PainelAcompanhamentoPgm";
// A tela de campanhas inteira, em modo embutido — inclusive o assistente de
// criação. A rota /admin/campanhas continua servindo a versão de página.
import CampanhasAdmin from "@/pages/CampanhasAdmin";
// "Crescimento" — a jornada visitante → congregado → membro, embutida.
import PainelEstrategico from "@/pages/PainelEstrategico";
// Indicador, faixa e titulo de secao — as pecas visuais compartilhadas.
// O cartao de numero estava escrito tres vezes, em tres arquivos.
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao,
} from "@/components/painel/blocos";

/** Hoje + 6 = uma semana contando o próprio dia. */
const DIAS_A_FRENTE = 6;

/** Data local em ISO. `toISOString()` daria UTC e viraria o dia cedo demais. */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── O item unificado de "datas importantes" ───────────────────────────────
//
// As duas fontes têm formatos diferentes (uma vem do banco, outra é calculada
// no navegador). Ambas são normalizadas para esta forma antes de a tela
// desenhar qualquer coisa — assim a ordenação por dia é uma só.

type Categoria =
  | "aniversario" | "casamento" | "membresia" | "pastorado"
  | "feriado" | "batista";

interface ItemData {
  chave: string;
  data: string;
  categoria: Categoria;
  titulo: string;
  detalhe: string;
  /** Só as efemérides de pessoa têm — é o que permite o botão do WhatsApp. */
  evento?: EventoPastoral;
}

const CATEGORIA_UI: Record<Categoria, { icone: any; cor: string; rotulo: string }> = {
  aniversario: { icone: Cake,       cor: "text-celebracao-text",  rotulo: "Aniversário" },
  casamento:   { icone: Heart,      cor: "text-celebracao-text",  rotulo: "Bodas" },
  membresia:   { icone: Award,      cor: "text-gold-text",        rotulo: "Anos de membresia" },
  pastorado:   { icone: Crown,      cor: "text-gold-text",        rotulo: "Anos de pastorado" },
  feriado:     { icone: Flag,       cor: "text-warning-text",     rotulo: "Feriado nacional" },
  batista:     { icone: BookMarked, cor: "text-info-text",        rotulo: "Calendário batista" },
};

function detalheEfemeride(ev: EventoPastoral): string {
  const anos = ev.anos_vai_completar ?? 0;
  if (anos <= 0) return CATEGORIA_UI[ev.tipo as Categoria]?.rotulo ?? "";
  switch (ev.tipo) {
    case "aniversario": return `${anos} anos`;
    case "casamento":   return `${anos} anos de casados`;
    case "membresia":   return `${anos} anos de membresia`;
    case "pastorado":   return `${anos} anos de pastorado`;
    default:            return `${anos} anos`;
  }
}

export default function PainelPastoral() {
  // A data local vira estado: quando ela muda, o efeito abaixo recarrega tudo.
  const [hoje, setHoje] = useState(() => isoLocal(new Date()));

  /**
   * Qual dia da semana está aberto em "Datas importantes".
   *
   * A tira de sete dias não é só um resumo: é o seletor. Empilhar os sete
   * dias de uma vez era o que obrigava a rolar a tela para ler tudo — agora
   * só o dia escolhido aparece, e trocar de dia é um clique.
   *
   * Começa em hoje, e volta para hoje quando o dia vira (ver o efeito de
   * `hoje` abaixo): uma aba deixada aberta na secretaria não pode amanhecer
   * mostrando o dia de ontem como se fosse o de hoje.
   */
  const [diaAberto, setDiaAberto] = useState(hoje);

  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [resumo, setResumo] = useState<ResumoPastoral | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatosMembresia | null>(null);
  const [visitantes, setVisitantes] = useState<ResumoVisitantes | null>(null);
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  // Um relógio só, de um minuto, com dois papéis: manter fresco o texto
  // "Atualizado há X" e detectar a virada do dia.
  const [, tique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      tique(t => t + 1);
      const agora = isoLocal(new Date());
      setHoje(anterior => (anterior === agora ? anterior : agora));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Recarrega na montagem e a cada virada de dia — e devolve o foco para hoje.
  useEffect(() => { setDiaAberto(hoje); carregar(); /* eslint-disable-next-line */ }, [hoje]);

  async function carregar() {
    setLoading(true);
    try {
      const [ev, r, cm, vs] = await Promise.all([
        proximosDias(DIAS_A_FRENTE),
        resumoPainel(),
        candidatosMembresia(),
        getResumoVisitantes(),
      ]);
      setEventos(ev);
      setResumo(r);
      setCandidatos(cm);
      setVisitantes(vs);
      setAtualizadoEm(new Date());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar painel");
    } finally {
      setLoading(false);
    }
  }

  // ── Une as duas fontes de data e agrupa por dia ──────────────────────────
  const dias = useMemo(() => {
    const inicio = new Date(hoje + "T00:00");
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + DIAS_A_FRENTE);

    const itens: ItemData[] = [];

    for (const ev of eventos) {
      const data = ev.data_evento ?? ev.proxima_data;
      if (!data) continue;
      itens.push({
        chave: `${ev.tipo}-${ev.ref_id}-${data}`,
        data,
        categoria: ev.tipo as Categoria,
        titulo: ev.titulo,
        detalhe: detalheEfemeride(ev),
        evento: ev,
      });
    }

    // Feriados nacionais e datas da Convenção Batista — já existiam em
    // `lib/agenda/externalEvents`, e só a tela da Agenda os lia.
    for (const o of eventosExternos(inicio, fim)) {
      itens.push({
        chave: o.key,
        data: o.data,
        categoria: o.categoria as Categoria,
        titulo: o.evento.titulo,
        detalhe: o.evento.descricao ?? CATEGORIA_UI[o.categoria as Categoria].rotulo,
      });
    }

    // Um balde por dia, inclusive os dias vazios: a semana aparece inteira,
    // e um domingo sem nada é informação, não ausência de informação.
    const baldes: { data: string; itens: ItemData[] }[] = [];
    for (let i = 0; i <= DIAS_A_FRENTE; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const iso = isoLocal(d);
      baldes.push({
        data: iso,
        itens: itens
          .filter(x => x.data === iso)
          .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo)),
      });
    }
    return baldes;
  }, [eventos, hoje]);

  const totalDatas = dias.reduce((s, d) => s + d.itens.length, 0);

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── Cabeçalho fixo ──────────────────────────────────────────────
          Título, data, a frase do dia e a faixa de indicadores acompanham a
          rolagem. O painel é longo — sete seções —, e a faixa é também o
          índice dele: um índice que só funciona no topo obriga a subir para
          voltar a usá-lo.

          `sticky` e não `fixed`: quem rola é o `<main>` do AppLayout, não a
          janela. `fixed` sairia do fluxo e se ancoraria na viewport, passando
          por cima da barra lateral.

          `-mx-6 px-6` porque o container tem `p-6`: sem estender, o conteúdo
          rolaria visível pelas laterais do bloco fixo.

          A data por extenso entrou no lugar da frase que descrevia a tela.
          Um painel cujo assunto é "hoje" — e que se recarrega quando o dia
          vira — precisa dizer que dia é hoje. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-gold shrink-0" />
            Painel Pastoral
          </h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {new Date(hoje + "T00:00").toLocaleDateString("pt-BR", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>

      {/* ── Resumo em linguagem natural ──────────────────────────────────
          Sem caixa e sem fundo. A moldura custava duas linhas de respiro no
          celular para cercar uma frase que já se distingue por ser a única
          em prosa na tela.

          "Atualizado há X" desceu para a mesma linha, em corpo menor: é
          rodapé da frase, não um segundo dado. */}
      {resumo && (
        <p className="text-sm text-muted-foreground flex items-start gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
          <span className="min-w-0">
            {resumoNatural(resumo, candidatos, visitantes)}
            {atualizadoEm && (
              <span className="text-[10px] text-muted-foreground/60 ml-1.5 whitespace-nowrap">
                · {formatarAtualizadoHa(atualizadoEm)}
              </span>
            )}
          </span>
        </p>
      )}

      {/* ── A faixa de indicadores ──────────────────────────────────────
          Cada um leva à seção correspondente: a faixa deixou de ser só um
          resumo e virou o índice da tela. Ver `Indicador` em
          components/painel/blocos.tsx para o porquê do desenho. */}
      {resumo && (
        <FaixaDeIndicadores colunas={6}>
          <Indicador
            rotulo="Aniv. hoje" valor={resumo.aniversarios_hoje} tom="celebracao" icone={Cake}
            onClick={() => irParaSecao("datas")} descricao="Ir para Datas importantes"
          />
          <Indicador
            rotulo="Bodas hoje" valor={resumo.bodas_hoje} tom="celebracao" icone={Heart}
            onClick={() => irParaSecao("datas")} descricao="Ir para Datas importantes"
          />
          <Indicador
            rotulo="Datas (7d)" valor={totalDatas} tom="gold" icone={CalendarCheck}
            onClick={() => irParaSecao("datas")} descricao="Ir para Datas importantes"
          />
          <Indicador
            rotulo="Cand. batismo" valor={candidatos?.elegiveis.length ?? 0} tom="info" icone={Droplets}
            onClick={() => irParaSecao("candidatos")} descricao="Ir para Candidatos à membresia"
          />
          {/* Era "Visit. sem contato", com o número de quem está há mais de
              7 dias sem registro. Trocado a pedido por quem ESTÁ sendo
              acompanhado — contatado, retornou, em relacionamento ou em
              acompanhamento.

              Muda o tom junto: a ausência de contato é alerta, o
              acompanhamento em curso é celebração. O número de quem está sem
              contato continua na seção de visitantes, onde tem contexto. */}
          <Indicador
            rotulo="Em acompanhamento" valor={visitantes?.emAcompanhamento ?? 0} tom="celebracao" icone={Users}
            onClick={() => irParaSecao("visitantes")} descricao="Ir para Acompanhamento de visitantes"
          />
          {/* Sem número, de propósito: Discipulado são quatro abas, e cada
              uma carrega os próprios dados. Ver a nota em `IndicadorProps`.
              É o atalho para a seção mais ao fundo do painel — a que mais
              custa alcançar rolando. */}
          <Indicador
            rotulo="Discipulado" tom="gold" icone={Sprout}
            onClick={() => irParaSecao("discipulado")} descricao="Ir para Acompanhamento do discipulado"
          />
        </FaixaDeIndicadores>
      )}
      </div>{/* fim do cabeçalho fixo */}

      {/* ── Acontecendo hoje ────────────────────────────────────────────
          A agenda do dia com hora e lugar: cultos, ensaios, reuniões e
          reservas de espaço. Fica antes de "Datas importantes" porque é o
          que tem hora marcada — o resto da semana pode esperar a rolagem. */}
      {/* ── A semana: a tira escolhe o dia, e os dois blocos obedecem ────
          Antes eram duas seções independentes. "Acontecendo hoje" mostrava
          sempre hoje, enquanto logo abaixo a tira de sete dias deixava
          escolher a sexta — e a agenda continuava na quarta. Duas leituras
          de dia diferentes, uma ao lado da outra.

          Agora a tira comanda as duas: o compromisso com hora e a celebração
          são o mesmo dia. `AgendaDoDia` recebe `dia`; sem a prop, no painel
          inicial, ele segue exatamente como era. */}
      <section id="datas" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
        <TituloDaSecao icone={CalendarCheck} contagem={totalDatas}>
          A semana
        </TituloDaSecao>
        <div className="space-y-3">
          {/*
            O parágrafo que listava as fontes — aniversários, bodas, membresia,
            pastorado, feriados e calendário da CBB — saiu daqui. Ele custava
            duas linhas em toda visita para explicar uma vez o que os próprios
            ícones e o texto de cada item já dizem: "91 anos" ao lado de um
            bolo não precisa de legenda.
          */}

          {totalDatas === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma data nos próximos 7 dias. Semana tranquila 🙏
            </p>
          ) : (
            <>
              <TiraDaSemana
                dias={dias}
                hojeIso={hoje}
                aberto={diaAberto}
                onAbrir={setDiaAberto}
              />
              {/* As celebrações vêm primeiro — aniversários, bodas, anos de
                  membresia e de pastorado.

                  A agenda tem hora marcada e por isso parecia dever vir
                  antes; mas quem abre este painel de manhã abre para saber
                  de quem precisa lembrar, e felicitar é o que se faz assim
                  que se lê. O culto das 19h a liderança já sabe de cor. */}
              <BlocoDoDia
                data={diaAberto}
                itens={dias.find(d => d.data === diaAberto)?.itens ?? []}
                hojeIso={hoje}
              />
              {/* Os compromissos com hora do dia escolhido — cultos, ensaios,
                  reuniões e reservas de espaço, com recorrências expandidas. */}
              <AgendaDoDia dia={diaAberto} />
            </>
          )}
        </div>
      </section>

      {/* ── Candidatos à membresia ──────────────────────────────────────── */}
      {candidatos && candidatos.elegiveis.length > 0 && (
        <section id="candidatos" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
          <TituloDaSecao icone={Droplets} tom="info" contagem={candidatos.elegiveis.length}>
            Candidatos à membresia
          </TituloDaSecao>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Congregados com {IDADE_MINIMA_BATISMO} anos ou mais — candidatos ao batismo
              e à entrada no rol de membros.
            </p>

            {/*
              Duas colunas e uma linha por pessoa, como em "Datas importantes":
              um nome e uma idade nao precisam da largura inteira do cartao.

              A linha toda abre a ficha — **em modo consulta**. Antes ela
              navegava para `/membros?abrir=`, que tira a pessoa do painel e
              cai numa tela onde se edita. Aqui a ficha e um dialogo por cima,
              sem lapis de edicao: este painel serve a lideranca pastoral, e
              alterar cadastro e trabalho da secretaria.

              O cartao inteiro so monta quando ha elegiveis, entao nao ha caso
              vazio a tratar.
            */}
            <div className="grid sm:grid-cols-2 gap-1.5">
              {candidatos.elegiveis.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 min-w-0 bg-info-soft/40"
                >
                  <Droplets className="w-3.5 h-3.5 shrink-0 text-info-text" />
                  {/* `leading-tight` porque o <button> do NomePessoa entra no
                      fluxo de texto e, sem isso, estica a caixa de linha. */}
                  <p className="text-sm leading-tight truncate min-w-0 flex-1">
                    <NomePessoa
                      id={p.id}
                      nome={p.nome_completo}
                      somenteLeitura
                      className="font-medium align-middle leading-tight"
                    />
                    <span className="text-muted-foreground align-middle">
                      {" · "}{p.idade} anos
                      {p.data_congregado && ` · desde ${formatarData(p.data_congregado)}`}
                    </span>
                  </p>
                </div>
              ))}
            </div>


            {candidatos.abaixoDaIdade > 0 && (
              <p className="text-xs text-muted-foreground">
                {candidatos.abaixoDaIdade} congregado{candidatos.abaixoDaIdade > 1 ? "s" : ""} abaixo
                de {IDADE_MINIMA_BATISMO} anos — fora da lista por idade.
              </p>
            )}
          </div>
        </section>
      )}


      {/* ── Acompanhamento de visitantes ────────────────────────────────── */}
      {visitantes && visitantes.total > 0 && (
        <section id="visitantes" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
          <TituloDaSecao
            icone={Users}
            tom="neutro"
            contagem={visitantes.total}
            acao={
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs h-7">
                <Link to="/visitantes">Acolhimento <ChevronRight className="w-3 h-3" /></Link>
              </Button>
            }
          >
            Acompanhamento de visitantes
          </TituloDaSecao>
          <div className="space-y-3">
            <FaixaDeIndicadores colunas={5}>
              <Indicador rotulo="Novos (7d)"  valor={visitantes.novos}            tom="info" />
              <Indicador rotulo="Em acomp."   valor={visitantes.emAcompanhamento} tom="celebracao" />
              <Indicador rotulo="Sem contato" valor={visitantes.semContato}       tom="warning" />
              <Indicador rotulo="Prontos"     valor={visitantes.prontosCrescer}   tom="success" />
              <Indicador rotulo="Congregaram" valor={visitantes.convertidos}      tom="neutro" />
            </FaixaDeIndicadores>
            {visitantes.semContato > 0 && (
              <p className="text-xs text-warning-text flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>{visitantes.semContato}</strong> {visitantes.semContato === 1 ? "visitante está" : "visitantes estão"} há
                  mais de 7 dias sem contato registrado.
                </span>
              </p>
            )}
          </div>
        </section>
      )}


      {/* ── Discipulado ─────────────────────────────────────────────────
          EBD e Pequenos Grupos medem a mesma coisa por caminhos diferentes:
          onde a pessoa está sendo cuidada durante a semana. Por isso moram
          juntos, e dentro do painel — mandar a liderança para outra tela
          contrariava a ideia de ter a semana num lugar só.

          Em abas, e não empilhados, porque o painel já tem seis seções
          acima; os dois inteiros somariam mais de uma tela de rolagem cada.
          Cada aba carrega os próprios dados, com estado próprio. */}
      <section id="discipulado" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
        <TituloDaSecao icone={Sprout}>Acompanhamento do discipulado</TituloDaSecao>
        <Tabs defaultValue="ebd">
          <TabsList className="mb-3">
            <TabsTrigger value="ebd" className="gap-1.5 text-xs">
              <GraduationCap className="w-3.5 h-3.5" /> EBD
            </TabsTrigger>
            <TabsTrigger value="pgm" className="gap-1.5 text-xs">
              <Sprout className="w-3.5 h-3.5" /> Pequenos Grupos
            </TabsTrigger>
            <TabsTrigger value="campanhas" className="gap-1.5 text-xs">
              <Flame className="w-3.5 h-3.5" /> Campanhas
            </TabsTrigger>
            <TabsTrigger value="crescimento" className="gap-1.5 text-xs">
              <BarChart2 className="w-3.5 h-3.5" /> Crescimento
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ebd" className="mt-0">
            <PainelAcompanhamentoEbd />
          </TabsContent>
          <TabsContent value="pgm" className="mt-0">
            <PainelAcompanhamentoPgm />
          </TabsContent>
          <TabsContent value="campanhas" className="mt-0">
            {/* A tela inteira de campanhas, em modo embutido — inclusive o
                assistente de criação. Ver o cabeçalho de CampanhasAdmin. */}
            <CampanhasAdmin embutido />
          </TabsContent>
          <TabsContent value="crescimento" className="mt-0">
            {/* A jornada visitante → congregado → membro. Mesma tela de
                `/painel-estrategico`, em modo embutido. */}
            <PainelEstrategico embutido />
          </TabsContent>
        </Tabs>
      </section>

      {/*
        O botão "Agenda do mês" saiu daqui.

        Ele levava a `/agenda-pastoral`, que lista os aniversários e bodas do
        mês inteiro — a mesma matéria de "Datas importantes", só que num
        recorte maior e numa outra tela. Tendo a semana aqui, com o seletor de
        dia e o envio da felicitação em um clique, o link oferecia um segundo
        caminho para o que este painel já resolve.

        A rota continua existindo e atendendo quem tem link salvo.
      */}
    </div>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  return new Date(iso + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** "Hoje", "Amanhã" ou "Qui, 28 de ago" — o rótulo do balde de um dia. */
function rotuloDoDia(iso: string, hojeIso: string): string {
  if (iso === hojeIso) return "Hoje";
  const d = new Date(iso + "T00:00");
  const h = new Date(hojeIso + "T00:00");
  const dif = Math.round((d.getTime() - h.getTime()) / 86_400_000);
  if (dif === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

/** Só o dia e o mês — "28/ago". Usado na tira da semana. */
function rotuloCurto(iso: string, hojeIso: string): string {
  if (iso === hojeIso) return "Hoje";
  const d = new Date(iso + "T00:00");
  const h = new Date(hojeIso + "T00:00");
  if (Math.round((d.getTime() - h.getTime()) / 86_400_000) === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}

/**
 * A semana inteira em uma faixa — e o seletor do dia.
 *
 * **Não é só um resumo: é o controle.** Empilhar os sete dias de uma vez era
 * o que obrigava a rolar a tela para ler tudo. Agora a faixa mostra a forma
 * da semana (quantas datas em cada dia) sem rolagem nenhuma, e o dia clicado
 * é o único que se abre embaixo.
 *
 * Dia vazio continua clicável de propósito: "não há nada nesta sexta" é uma
 * resposta, e desabilitar o botão obrigaria a pessoa a deduzi-la do traço.
 */
function TiraDaSemana({
  dias, hojeIso, aberto, onAbrir,
}: {
  dias: { data: string; itens: ItemData[] }[];
  hojeIso: string;
  aberto: string;
  onAbrir: (iso: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dias da semana">
      {dias.map(d => {
        const ehHoje = d.data === hojeIso;
        const ehAberto = d.data === aberto;
        const n = d.itens.length;
        const dia = new Date(d.data + "T00:00").getDate();
        return (
          <button
            key={d.data}
            type="button"
            role="tab"
            aria-selected={ehAberto}
            onClick={() => onAbrir(d.data)}
            title={`${rotuloDoDia(d.data, hojeIso)} — ${n === 0 ? "nada marcado" : n === 1 ? "1 data" : `${n} datas`}`}
            className={`rounded-md border px-1 py-1.5 text-center min-w-0 transition-colors
              hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${ehAberto ? "border-gold bg-muted ring-1 ring-gold/40" : n === 0 ? "border-dashed opacity-60" : ""}`}
          >
            <p className={`text-[10px] uppercase tracking-wide truncate ${ehHoje ? "text-gold-text" : "text-muted-foreground"}`}>
              {rotuloCurto(d.data, hojeIso)}
            </p>
            <p className="text-base font-semibold leading-none tabular-nums mt-0.5">
              {n === 0 ? <span className="text-muted-foreground/50">–</span> : n}
            </p>
            <p className="text-[10px] text-muted-foreground/70 tabular-nums">{dia}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * O dia aberto na tira — um por vez.
 *
 * Antes esta função desenhava os sete dias empilhados e escondia os vazios.
 * Agora só existe o dia que a pessoa clicou, e por isso o vazio **sempre
 * aparece**: quem escolheu a sexta-feira quer a resposta sobre a sexta, e
 * uma tela em branco não é resposta.
 */
function BlocoDoDia({
  data, itens, hojeIso,
}: {
  data: string;
  itens: ItemData[];
  hojeIso: string;

}) {
  const ehHoje = data === hojeIso;

  return (
    <div>
      {/* Cabeçalho do dia numa linha só, com fio até a borda: ocupa ~20px em
          vez de um paragrafo proprio, e separa sem pesar. */}
      <div className="flex items-center gap-2 mb-1.5">
        <p className={`text-xs font-medium uppercase tracking-wide shrink-0 ${ehHoje ? "text-gold-text" : "text-muted-foreground"}`}>
          {rotuloDoDia(data, hojeIso)}
        </p>
        <div className="h-px flex-1 bg-border" />
        {itens.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{itens.length}</span>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          {ehHoje
            ? "Nada marcado para hoje. Bom dia tranquilo 🙏"
            : "Nada marcado para este dia."}
        </p>
      ) : (
        // Duas colunas a partir de `sm`. Cada item e um nome curto e uma
        // idade — esticar isso por 900px era o que fazia as datas virarem
        // uma tela e meia de rolagem.
        <div className="grid sm:grid-cols-2 gap-1.5">
          {itens.map(item => <LinhaData key={item.chave} item={item} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Uma data, uma linha — e, quando há telefone, **a linha inteira é o botão
 * de felicitar**.
 *
 * O nome já chegou a abrir a ficha da pessoa, usando o `NomePessoa` do
 * projeto. Foi retirado: neste painel o que se quer da lista de
 * aniversariantes não é consultar cadastro, é mandar a mensagem. Abrir uma
 * ficha por cima da lista interrompia justamente o gesto que a tela existe
 * para facilitar.
 *
 * A área clicável passou a ser a linha toda, e não o ícone de 28px que
 * havia antes: o mesmo gesto fica muito mais fácil de acertar, sobretudo no
 * celular — e desaparece o problema do `min-h-9`, porque não há mais um
 * botão pequeno disputando altura com o texto.
 *
 * Sem telefone não há o que clicar, e a linha diz isso em vez de ficar
 * silenciosamente inerte. É informação pastoral: essa pessoa faz aniversário
 * hoje e vai precisar de outro caminho para ser alcançada.
 */
function LinhaData({ item }: { item: ItemData }) {
  const ui = CATEGORIA_UI[item.categoria] ?? CATEGORIA_UI.aniversario;
  const Icone = ui.icone;
  const temTelefone = !!(item.evento?.telefone || item.evento?.telefone_secundario);

  // Nome e detalhe no mesmo texto, separados por ponto. Antes eram duas
  // linhas empilhadas, e cada item ocupava o dobro da altura.
  const conteudo = (
    <>
      <Icone className={`w-3.5 h-3.5 shrink-0 ${ui.cor}`} />
      <p className="text-sm leading-tight truncate min-w-0 flex-1 text-left">
        <span className="font-medium">{item.titulo}</span>
        <span className="text-muted-foreground"> · {item.detalhe}</span>
      </p>
    </>
  );

  // Feriados e datas da CBB não pertencem a ninguém: não há quem felicitar.
  if (!item.evento) {
    return (
      <div
        className="flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 min-w-0"
        title={`${item.titulo} · ${item.detalhe}`}
      >
        {conteudo}
      </div>
    );
  }

  if (!temTelefone) {
    return (
      <div
        className="flex items-center gap-1.5 border rounded-md pl-2.5 pr-2 py-1.5 min-w-0"
        title={`${item.titulo} · ${item.detalhe} — sem telefone cadastrado`}
      >
        {conteudo}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
          sem telefone
        </span>
      </div>
    );
  }

  /*
    Âncora de verdade, e não um botão com `window.open`.

    O botão chamava `window.open(url, "_blank")`. O clique disparava e a URL
    saía correta — conferido interceptando a chamada —, mas **nada abria**:
    `window.open` é tratado como pop-up e fica bloqueado por padrão em vários
    navegadores, e no WebView do celular, que é onde a igreja mais usa o
    sistema. É a mesma família do Risco 3 do CLAUDE.md: a chamada "funciona",
    não devolve erro, e não acontece nada.

    Um `<a target="_blank">` é navegação comum, nunca tratada como pop-up. De
    quebra devolve o que um botão não dá: abrir em nova aba pelo meio do
    mouse, copiar o endereço, e o link visível na barra de status.
  */
  return (
    <a
      href={linkWhatsApp(item.evento)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Enviar felicitações para ${item.titulo} no WhatsApp`}
      className="flex items-center gap-1.5 border rounded-md pl-2.5 pr-2 py-1.5 min-w-0 w-full
                 transition-colors hover:bg-success-soft hover:border-success-line
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {conteudo}
      <MessageCircle className="w-4 h-4 shrink-0 text-success-text" />
    </a>
  );
}

/** Resumo do dia em uma frase. */
function resumoNatural(
  r: ResumoPastoral,
  c: CandidatosMembresia | null,
  v: ResumoVisitantes | null,
): string {
  const celebra: string[] = [];
  if (r.aniversarios_hoje > 0) {
    celebra.push(`${r.aniversarios_hoje} ${r.aniversarios_hoje === 1 ? "aniversariante" : "aniversariantes"}`);
  }
  if (r.bodas_hoje > 0) {
    celebra.push(`${r.bodas_hoje} ${r.bodas_hoje === 1 ? "casal em bodas" : "casais em bodas"}`);
  }

  const pendencias: string[] = [];
  if (v && v.semContato > 0) {
    pendencias.push(`${v.semContato} ${v.semContato === 1 ? "visitante" : "visitantes"} sem contato`);
  }
  if (c && c.elegiveis.length > 0) {
    pendencias.push(`${c.elegiveis.length} ${c.elegiveis.length === 1 ? "candidato" : "candidatos"} ao batismo`);
  }
  // `r.familias_sem_resp` continua vindo de `resumo_painel_pastoral` e é
  // deliberadamente ignorado aqui: definir responsável de família é cadastro,
  // trabalho da secretaria, e mora em /familias.

  const partes: string[] = [];
  if (celebra.length > 0) partes.push(`Hoje: ${celebra.join(" e ")}.`);
  if (pendencias.length > 0) partes.push(`Atenção: ${pendencias.join(", ")}.`);

  if (partes.length === 0) return "Nenhuma celebração hoje e nenhuma pendência no momento — tudo em dia! 🙏";
  return partes.join(" ");
}

function formatarAtualizadoHa(data: Date | null): string {
  if (!data) return "";
  const diffMin = Math.floor((Date.now() - data.getTime()) / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin === 1) return "há 1 minuto";
  if (diffMin < 60) return `há ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "há 1 hora";
  return `há ${diffH} horas`;
}

