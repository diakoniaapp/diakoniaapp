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
  GraduationCap, UserCheck, CalendarClock, Sprout, BarChart2, PartyPopper,
  Users2,
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
import {
  indicadoresMembresia,
  type IndicadoresMembresia,
} from "@/services/rolDeMembrosService";
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
// A pirâmide etária e as entradas por ano. Os quadros confessam as próprias
// lacunas — ver o cabeçalho do arquivo.
import { BlocoRebanho } from "@/components/painel/BlocoRebanho";

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
  /** Aba aberta em Discipulado. Controlada por causa da rolagem — ver o JSX. */
  const [abaDiscipulado, setAbaDiscipulado] = useState("ebd");

  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [resumo, setResumo] = useState<ResumoPastoral | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatosMembresia | null>(null);
  const [visitantes, setVisitantes] = useState<ResumoVisitantes | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresMembresia | null>(null);

  /**
   * O rebanho inteiro: membros + congregados + visitantes, todos ativos.
   *
   * **Não confundir com o rol.** O rol são só os 225 membros — quem passou
   * por assembleia. O rebanho é quem a igreja acompanha, e inclui os 65
   * congregados e os 3 visitantes que ainda não entraram no rol.
   *
   * A seção se chamava "A membresia" e o nome estava errado justamente por
   * apagar essa diferença; ver o comentário da seção lá embaixo.
   */
  const totalDoRebanho = indicadores
    ? indicadores.rol.membros + indicadores.rol.congregados + indicadores.rol.visitantes
    : 0;
  /** Compromissos por dia, para a tira. Vem do proprio AgendaDoDia. */
  const [agendaPorDia, setAgendaPorDia] = useState<Record<string, number>>({});
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
      const [ev, r, cm, vs, mb] = await Promise.all([
        proximosDias(DIAS_A_FRENTE),
        resumoPainel(),
        candidatosMembresia(),
        getResumoVisitantes(),
        indicadoresMembresia(),
      ]);
      setEventos(ev);
      setResumo(r);
      setCandidatos(cm);
      setVisitantes(vs);
      setIndicadores(mb);
      setAtualizadoEm(new Date());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar painel");
    } finally {
      setLoading(false);
    }
  }

  // ── Une as duas fontes de data e agrupa por dia ──────────────────────────
  /**
   * As celebrações de HOJE — e só de hoje.
   *
   * Aniversário, bodas, anos de membresia e anos de pastorado: quatro jeitos
   * de a igreja ter algo a dizer a alguém neste dia. Felicitar é coisa do
   * dia; uma lista de sete dias transformava isso numa agenda de lembretes.
   *
   * **Feriados e calendário da CBB saíram daqui.** Eles não são celebração
   * de ninguém — são contexto do calendário — e já apareciam na Agenda, que
   * lê `eventosExternos` por dentro. Ficavam nas duas listas ao mesmo tempo:
   * a Semana de Oração da JMN em 1º de setembro era contada aqui E lá.
   */
  const celebracoesPorDia = useMemo(() => {
    const mapa: Record<string, ItemData[]> = {};
    for (let i = 0; i <= DIAS_A_FRENTE; i++) {
      const d = new Date(hoje + "T00:00");
      d.setDate(d.getDate() + i);
      mapa[isoLocal(d)] = [];
    }
    for (const ev of eventos) {
      const data = ev.data_evento ?? ev.proxima_data;
      if (!data || !(data in mapa)) continue;
      mapa[data].push({
        chave: `${ev.tipo}-${ev.ref_id}-${data}`,
        data,
        categoria: ev.tipo as Categoria,
        titulo: ev.titulo,
        detalhe: detalheEfemeride(ev),
        evento: ev,
      });
    }
    for (const iso of Object.keys(mapa)) {
      mapa[iso].sort((a, b) =>
        a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo));
    }
    return mapa;
  }, [eventos, hoje]);

  /**
   * Os sete dias da tira, com TUDO que cada um tem.
   *
   * Compromissos e celebrações somados. A tira filtra a seção inteira, e um
   * contador que ignorasse metade do que ela abre voltaria ao problema de
   * antes: números na tira sem relação com a lista logo abaixo.
   */
  const dias = useMemo(
    () => Array.from({ length: DIAS_A_FRENTE + 1 }, (_, i) => {
      const d = new Date(hoje + "T00:00");
      d.setDate(d.getDate() + i);
      const iso = isoLocal(d);
      return {
        data: iso,
        total: (agendaPorDia[iso] ?? 0) + (celebracoesPorDia[iso]?.length ?? 0),
      };
    }),
    [hoje, agendaPorDia, celebracoesPorDia],
  );

  if (loading) return <PaginaSkeleton />;

  return (
    // ── A largura ──────────────────────────────────────────────────────
    //
    // Era `max-w-5xl` fixo — 1024px. Numa tela de 1920 sobravam mais de
    // 600px vazios de cada lado, e o conteúdo ficava espremido no meio:
    // gráficos estreitos e a impressão geral de letra pequena que motivou
    // este ajuste.
    //
    // Cresce em dois degraus e para em 1280px. **Não vai até a borda de
    // propósito**: esta tela tem parágrafos, e linha de texto muito larga
    // cansa de ler — a régua clássica são 60 a 80 caracteres. 1280px
    // acomoda os gráficos sem esticar a prosa além disso.
    <div className="p-6 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto space-y-6">
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
              <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                · {formatarAtualizadoHa(atualizadoEm)}
              </span>
            )}
          </span>
        </p>
      )}

      {/* ── A faixa de indicadores ──────────────────────────────────────
          **É um índice, não um painel de números.** Cada bloco leva à sua
          seção, e nenhum mostra contagem — só ícone, rótulo e a seta.

          Os números saíram a pedido da Telma em 27/08/2026. O motivo é bom:
          eles competiam com o conteúdo. Cinco algarismos grandes no alto da
          tela pedem leitura e prometem significado, mas cada um só repetia
          algo que a seção logo abaixo diz melhor e com contexto — "292" não
          quer dizer nada sozinho, e "292 pessoas ativas: 261 membros, 28
          congregados e 3 visitantes" quer.

          "Discipulado" já era assim desde o começo, porque são quatro abas
          e não havia número honesto a exibir. Agora os cinco se leem igual.

          Ver `Indicador` em components/painel/blocos.tsx: sem `valor`, o
          bloco vira atalho e uma seta ocupa o lugar do algarismo. */}
      {resumo && (
        <FaixaDeIndicadores colunas={5}>
          {/* "Celebrações hoje" era um indicador aqui. Saiu: levava ao MESMO
              lugar que "Agenda" — a seção passou a ser uma só —, e a frase
              logo acima já abre com "Hoje: 3 aniversariantes". */}
          <Indicador
            rotulo="Agenda (7d)"
            tom="gold" icone={CalendarCheck}
            onClick={() => irParaSecao("agenda")} descricao="Ir para a Agenda"
          />
          {/* "Cand. batismo" truncava para "CAND. BATIS…" a 375px depois
              que a fonte da faixa cresceu. Abreviação cortada não diz nada;
              palavra inteira diz, e o destino — "Candidatos à membresia" —
              completa o sentido. */}
          <Indicador
            rotulo="Candidatos" tom="info" icone={Droplets}
            onClick={() => irParaSecao("candidatos")} descricao="Ir para Candidatos à membresia"
          />
          {/* Fica colado em "Cand. batismo" porque os dois falam da mesma
              coisa vista de dois lados: quem está para entrar e quem já
              entrou.

              Rótulo de uma palavra: "Rol de membros" truncava para
              "ROL DE ME…" a 375px, que não diz nada. E "Rebanho" é o certo
              — a seção abre membros, congregados e visitantes, não só o
              rol. */}
          <Indicador
            rotulo="Rebanho" tom="violeta" icone={Users2}
            onClick={() => irParaSecao("rebanho")} descricao="Ir para O rebanho"
          />
          {/* Chamou-se "Visit. sem contato" e depois "Em acompanhamento".
              Virou "Visitantes" a pedido, em 27/08/2026: sem número ao lado,
              "Em acompanhamento" descrevia um recorte que o bloco já não
              mostrava, e ainda era o rótulo mais comprido da faixa — o único
              que truncava no celular.

              O tom continua sendo o de celebração, e não o de alerta: quem
              está sendo acompanhado é boa notícia. Quem está SEM contato
              aparece dentro da seção, onde tem contexto. */}
          <Indicador
            rotulo="Visitantes" tom="celebracao" icone={Users}
            onClick={() => irParaSecao("visitantes")} descricao="Ir para Acompanhamento de visitantes"
          />
          {/* O atalho para a seção mais ao fundo do painel — a que mais custa
              alcançar rolando. */}
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
      {/* ── Celebrações de hoje ─────────────────────────────────────────
      {/* ── A semana ────────────────────────────────────────────────────
          Uma seção só, e a tira filtra tudo o que há no dia: as celebrações
          das pessoas e os compromissos da igreja.

          "Celebrações de hoje" era uma seção separada logo acima. Saiu para
          ganhar espaço — eram dois títulos, dois blocos e duas listas para
          responder a mesma pergunta ("o que tem neste dia?"), e a de cima
          só sabia falar de hoje.

          A ORDEM DENTRO DO DIA. As celebrações vêm primeiro, apesar de a
          agenda ter hora marcada: quem abre o painel de manhã abre para
          saber de quem precisa lembrar, e felicitar é o que se faz assim
          que se lê. O culto das 19h a liderança já sabe de cor.

          POR QUE AS DUAS LISTAS CONTINUAM SEPARADAS. Uma celebração não é
          um compromisso: não tem hora, não tem lugar, e o que se faz com
          ela é mandar uma mensagem — a linha inteira é o link do WhatsApp,
          com a felicitação já escrita. Empurrá-la para dentro da lista de
          horários a transformaria numa linha "dia todo" sem ação nenhuma.

          Feriados e calendário da CBB ficam só na agenda. Não são
          celebração de ninguém, e já vêm de `eventosExternos` lá dentro —
          repeti-los aqui era a duplicação que a JMN de 1º de setembro
          expôs. */}
      <section id="agenda" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
        <TituloDaSecao icone={CalendarClock}>
          {diaAberto === hoje
            ? "Acontecendo hoje"
            : `Agenda · ${rotuloDoDia(diaAberto, hoje)}`}
        </TituloDaSecao>

        {/* A tira vem antes da lista: é o filtro, e o que ele pede abre
            logo abaixo. Um controle depois do resultado obrigaria a rolar
            de volta para trocar de dia. */}
        <TiraDaSemana
          dias={dias}
          hojeIso={hoje}
          aberto={diaAberto}
          onAbrir={setDiaAberto}
        />

        {(celebracoesPorDia[diaAberto] ?? []).length > 0 && (
          <div className="mt-3 grid sm:grid-cols-2 gap-1.5">
            {(celebracoesPorDia[diaAberto] ?? []).map(item => (
              <LinhaData key={item.chave} item={item} />
            ))}
          </div>
        )}

        <div className="mt-3">
          <AgendaDoDia
            dia={diaAberto}
            // Só o mapa por dia: o total sai da soma da tira, para o
            // indicador e a tira nunca discordarem. Ver a nota no indicador.
            onJanela={({ porDia }) => setAgendaPorDia(porDia)}
          />
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

          </div>
        </section>
      )}


      {/* ── O rebanho ───────────────────────────────────────────────────
          **Chamava-se "A membresia", e o nome estava errado.** Membresia é
          o rol — só os membros. O que a seção abre é o conjunto de quem
          frequenta: membros, congregados e visitantes ativos. Corrigido a
          pedido da Telma em 26/08/2026.

          Fica logo abaixo de "Candidatos à membresia" de propósito: um
          quadro mostra quem está na porta, o outro mostra a casa. Ler os
          dois em sequência é a leitura que a seção quer provocar — seis
          candidatos entrando num rol com este formato etário.

          **Não some quando está vazio**, ao contrário das seções acima. O
          canal de "estou vazio" existe para trabalho pendente: um bloco de
          acolhimento sem ninguém para acolher é ruído. Aqui é o oposto —
          um rol de zero membros seria a notícia mais importante da tela, e
          esconder o quadro justamente nesse caso o tornaria inútil como
          indicador. Só a ausência de DADO o esconde. */}
      {indicadores && (
        <section id="rebanho" className="scroll-mt-[280px] sm:scroll-mt-[230px]">
          <TituloDaSecao icone={Users2} tom="violeta" contagem={totalDoRebanho}>
            O rebanho
          </TituloDaSecao>
          <BlocoRebanho dados={indicadores} />
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
        {/* Controlado, e não `defaultValue`, por causa da rolagem.

            As quatro abas têm alturas muito diferentes — Crescimento traz
            gráficos, Campanhas traz a tela inteira de campanhas, e o PGM
            cabe em meia dúzia de linhas. Trocando de uma alta para uma
            baixa, o conteúdo encolhe embaixo do leitor e a página fica
            parada onde estava: a tela some para cima e sobra rodapé.

            Levar a seção de volta ao topo a cada troca resolve, e usa o
            mesmo caminho do indicador lá em cima — `irParaSecao` respeita
            `prefers-reduced-motion`. Só dispara em troca feita por gente:
            `onValueChange` não roda na montagem. */}
        <Tabs
          value={abaDiscipulado}
          onValueChange={(v) => {
            setAbaDiscipulado(v);
            // Dois quadros de espera, e não `irParaSecao` direto.
            //
            // Medido: trocando de EBD para Pequenos Grupos a página inteira
            // encolhe de 1955px para 1181px. Rolando ANTES disso, o navegador
            // grampeia a posição quando o conteúdo some embaixo — a seção
            // acabava a 723px do topo em vez de 230.
            //
            // O primeiro quadro deixa o React aplicar a troca; o segundo,
            // deixa o layout assentar. Os dados que cada aba busca chegam
            // depois e só fazem o bloco CRESCER abaixo do título, o que não
            // move nada do que já está no topo.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => irParaSecao("discipulado")));
          }}
        >
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
          {/* ── `min-h` nas abas, e não é enfeite ──────────────────────────
              Discipulado é a ÚLTIMA seção da página. Quando a aba aberta é
              curta — Pequenos Grupos cabe em meia dúzia de linhas — não há
              página abaixo dela para o navegador rolar, e o título nunca
              chega ao topo por mais que se peça: ele para onde a rolagem
              acaba. Foi o que a Telma viu como "a tela fica lá embaixo".

              70vh garante que a seção sempre tenha para onde subir. O custo é
              algum espaço em branco nas abas curtas, que é bem menos ruim que
              um título que não obedece ao próprio atalho. */}
          <TabsContent value="ebd" className="mt-0 min-h-[70vh]">
            <PainelAcompanhamentoEbd />
          </TabsContent>
          <TabsContent value="pgm" className="mt-0 min-h-[70vh]">
            <PainelAcompanhamentoPgm />
          </TabsContent>
          <TabsContent value="campanhas" className="mt-0 min-h-[70vh]">
            {/* A tela inteira de campanhas, em modo embutido — inclusive o
                assistente de criação. Ver o cabeçalho de CampanhasAdmin. */}
            <CampanhasAdmin embutido />
          </TabsContent>
          <TabsContent value="crescimento" className="mt-0 min-h-[70vh]">
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
  dias: { data: string; total: number }[];
  hojeIso: string;
  aberto: string;
  onAbrir: (iso: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Dias da semana">
      {dias.map(d => {
        const ehHoje = d.data === hojeIso;
        const ehAberto = d.data === aberto;
        const n = d.total;
        const dia = new Date(d.data + "T00:00").getDate();
        return (
          <button
            key={d.data}
            type="button"
            role="tab"
            aria-selected={ehAberto}
            onClick={() => onAbrir(d.data)}
            title={`${rotuloDoDia(d.data, hojeIso)} — ${n === 0 ? "nada marcado" : n === 1 ? "1 item" : `${n} itens`}`}
            className={`rounded-md border px-1 py-1.5 text-center min-w-0 transition-colors
              hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              ${ehAberto ? "border-gold bg-muted ring-1 ring-gold/40" : n === 0 ? "border-dashed opacity-60" : ""}`}
          >
            {/* ── Quem é o número grande ────────────────────────────────
                Era a QUANTIDADE de itens, com o dia do mês miúdo embaixo.
                Invertido a pedido, e a inversão tem razão de ser: esta
                tira é o SELETOR do dia. O que se escolhe aqui é uma data,
                não uma contagem — então a data é a identidade do ladrilho
                e a contagem é a anotação sobre ela.

                O sinal disso estava na própria tela: para saber que dia
                era "SÁB" era preciso ler o número miúdo, enquanto o número
                grande respondia a uma pergunta que ninguém tinha feito
                ainda. Agora o ladrilho diz "sábado, dia 29" e, em voz
                baixa, "tem 1 coisa". */}
            <p className={`text-[10px] uppercase tracking-wide truncate ${ehHoje ? "text-gold-text" : "text-muted-foreground"}`}>
              {rotuloCurto(d.data, hojeIso)}
            </p>
            <p className="text-base font-semibold leading-none tabular-nums mt-0.5">
              {dia}
            </p>
            {/* O traço, e não "0", quando o dia está vazio: zero é um
                número e entra na leitura como se fosse contagem de algo.
                E a linha existe sempre, mesmo vazia, para os sete
                ladrilhos manterem a mesma altura. */}
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {n === 0 ? <span className="text-muted-foreground/50">–</span> : n}
            </p>
          </button>
        );
      })}
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
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
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

