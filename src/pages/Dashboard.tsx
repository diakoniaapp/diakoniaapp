// ─── Dashboard — refatoração FASE 1 ──────────────────────────────────────
// Mantém: saudação + versículo + visitante rápido (já existiam)
// Acrescenta: estrutura modular dos 9 blocos com shells e Bloco 1 (Ações Rápidas)
// Fases seguintes vão preencher cada Bloco como widget próprio.

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Quote, ShieldCheck, UserPlus, Sparkles, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { verseOfTheDay } from "@/lib/agenda/verses";
import { usePermissoes } from "@/hooks/usePermissoes";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";
import { openCommandPalette } from "@/lib/commandPalette";
import { VazioCtx, type ReportarVazio } from "@/components/hoje/vazio";
import { Suspense } from "react";
import { getWidgetsParaUsuario } from "@/dashboard/widgetRegistry";
import { getAcoesParaUsuario } from "@/dashboard/quickActionsRegistry";
import { ListSkeleton } from "@/components/ListState";


// A frase de incentivo por perfil ("Servir com fidelidade é adorar ao
// SENHOR" e as demais) saiu junto com o lugar que ela ocupava: o versículo
// do dia passou a vir logo abaixo da saudação.

// ─── Saudação por horário ────────────────────────────────────────────────
function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// QUARTA copia deste mapa no repositorio — as outras estao em types/usuario.ts,
// AppLayout.tsx e UserMenuButton.tsx. Ao trocar um rotulo, trocar nos quatro:
// em 26/08/2026 "Pastor titular" foi alterado em tres e a tela do painel
// continuou dizendo "Pastor", porque esta aqui ficou para tras.
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor titular", pastor: "Pastor",
  lideranca: "Liderança", voluntario: "Voluntário",
};

const ROLE_VALORES = [
  "Administrador","Secretaria","Pastor","Pastor titular","Lideranca","Liderança",
  "admin","secretaria","diakonia","lideranca","pastor","voluntario",
];

export default function Dashboard() {
  const { user, roles } = useAuth();
  const { permissoes } = usePermissoes();
  const principalRole = roles[0] ?? "lideranca";
  const [nome, setNome] = useState<string>("Visitante");
  const [openVisitanteRapido, setOpenVisitanteRapido] = useState(false);
  const verse = verseOfTheDay();

  // Nome bonito do usuário (vinda de profiles.nome)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles").select("nome").eq("id", user.id).maybeSingle();
      const valor = prof?.nome?.trim() ?? "";
      const invalido = !valor || valor.includes("@") || /^\d+$/.test(valor) || ROLE_VALORES.includes(valor);
      if (!invalido) {
        const p = valor.split(" ")[0];
        setNome(p.charAt(0).toUpperCase() + p.slice(1));
      } else {
        setNome("Visitante");
      }
    })();
  }, [user]);

  return (
    <div>
      {/* ── HEADER: Saudação ─────────────────────────────────────────────── */}
      <div className="border-b bg-card">
        {/* ── No celular este cabeçalho comia meia tela ───────────────────

            Medido: 398px dos 812 de um telefone antes do primeiro conteúdo.
            Metade da primeira tela para dizer bom dia.

            O que saiu no celular, e por quê:

            · O rótulo do perfil. O comentário abaixo já dizia que "quem usa o
              sistema todo dia sabe que é administrador" — e o que é
              dispensável no desktop é caro no telefone. Volta no md.
            · O botão deixou de ter linha própria: subiu para a mesma altura
              da saudação, onde havia espaço vazio à direita.
            · A referência do salmo entrou na mesma linha do versículo.

            O versículo FICOU, e em tamanho legível. Ele é o motivo de o
            cabeçalho existir; encolher tudo e sacrificar justamente a
            Escritura seria resolver o número errado. */}
        <div className="px-4 md:px-8 py-3 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
          <div className="min-w-0 space-y-0.5 md:space-y-1">
            {/* Rotulo de perfil sem escudo e sem dourado. Quem usa o sistema
                todo dia sabe que e administrador; a informacao serve no maximo
                como referencia, nao como destaque no alto da tela. Cinza
                resolve, e devolve o dourado ao que de fato pede acao. */}
            <span className="hidden md:block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {ROLE_LABEL[principalRole] ?? principalRole}
            </span>
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif text-xl md:text-4xl text-foreground min-w-0">
                {getSaudacao()}, {nome}! 🙏
              </h1>
              {/* O mesmo botão do bloco de baixo, aqui só no celular: lá ele
                  ocupava uma linha inteira só para si. */}
              <Button size="sm" onClick={() => setOpenVisitanteRapido(true)}
                className="md:hidden gap-1.5 shrink-0 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
                <UserPlus className="w-4 h-4" />
                <span translate="no">Visitante</span>
              </Button>
            </div>
            {/* O versiculo do dia vem logo abaixo da saudacao, no lugar onde
                antes havia uma frase de incentivo por perfil.
                Eram duas frases devocionais em sequencia, uma sobre a outra, e
                a segunda enfraquecia a primeira: a Escritura disputava atencao
                com um texto escrito para acompanha-la. Ficou a Escritura. */}
            <p className="font-serif text-sm md:text-base leading-snug text-foreground/95">
              &ldquo;{verse.texto}&rdquo;
              {/* A referência entra na mesma linha no celular: sozinha numa
                  linha própria custava 18px para dizer três palavras. */}
              <span className="text-muted-foreground text-xs font-sans whitespace-nowrap">
                {" "}— {verse.ref}
              </span>
            </p>
          </div>
          <div className="hidden md:flex gap-2 shrink-0 self-end md:self-auto">
            <Button onClick={() => setOpenVisitanteRapido(true)}
              className="gap-2 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
              <UserPlus className="w-4 h-4" />
              <span translate="no">Visitante Rápido</span>
            </Button>
          </div>
        </div>
      </div>

      {/* A faixa separada do versiculo saiu: ele agora vive dentro do
          cabecalho, junto da saudacao. Eram duas faixas coladas dizendo a
          mesma coisa em tons diferentes, e a segunda so existia para
          emoldurar um texto que ja tinha onde morar. */}

      {/* ── CORPO ───────────────────────────────────────────────────────── */}
      {/* Ritmo: 40px ENTRE secoes, 8px entre titulo e conteudo.
          Antes tudo era 24px — o vao que separava duas secoes era o mesmo que
          separava um titulo do seu proprio bloco, entao nada agrupava nada e a
          pagina lia como uma lista continua. Hierarquia se faz com a razao
          entre os espacos, nao com linha, cor ou moldura. */}
      <div className="p-4 md:p-8 space-y-10 max-w-7xl mx-auto">


        {/* ── O DIA, e depois as ferramentas ──────────────────────────────

            Esta tela abria com "Ações rápidas": seis atalhos genéricos —
            Cadastrar pessoa, Lançamento, Solicitar membresia — que são os
            mesmos todo santo dia, tenha ou não algo a fazer. Abaixo deles
            vinha a agenda, e só em terceiro lugar o aniversário de alguém.

            Um bloco que diz a mesma coisa todo dia não informa nada; ele só
            ocupa o lugar mais valioso da tela. E o lugar mais valioso é o
            primeiro, porque é o único que todo mundo vê.

            Invertido: primeiro o que HOJE pede (prioridade 0 do registry),
            depois as ferramentas. Os atalhos não sumiram nem ficaram longe
            — continuam acima da dobra na maioria das telas, e agora
            convivem com a barra lateral, que desde o menu que aprende leva
            aos destinos mais usados da própria pessoa. */}
        <WidgetsDinamicos permissoes={permissoes} apenas="hoje" />

        <BlocoSecao titulo="Ações rápidas" icon={Sparkles} subtitulo="Atalhos relevantes para você">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {getAcoesParaUsuario({ permissoes }, { limite: 6 }).map(a => (
              <AcaoRapida key={a.id} to={a.to} icon={a.icon} label={a.label} />
            ))}
          </div>
          {/* Busca global: clicável em qualquer aparelho — o Ctrl+K só existe no desktop */}
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={openCommandPalette}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mr-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar qualquer página ou ação</span>
              <kbd className="hidden md:inline px-1 py-0.5 rounded bg-muted text-xs">Ctrl K</kbd>
            </button>
          </div>
        </BlocoSecao>

        {/* A seção "Sua tarefa" saiu daqui. Ela mostrava UMA ação resolvida
            pelo perfil, e para a maioria dos perfis essa ação era um atalho
            permanente — "Lançamento financeiro" aparecia todo dia, tivesse ou
            não algo a lançar. Um bloco no alto da tela que diz a mesma coisa
            todo dia não informa nada, e "Ações rápidas" logo acima já leva ao
            mesmo lugar.
            O resolvedor continua vivo e com um consumidor: a aba adaptativa da
            barra inferior do celular, onde ele resolve um problema real — o de
            caber um atalho de contexto num espaço de cinco alvos. */}

        {/* ── O resto: contexto, não convocação ─────────────────────── */}
        <WidgetsDinamicos permissoes={permissoes} apenas="resto" />

      </div>

      <VisitanteRapidoDialog open={openVisitanteRapido} onOpenChange={setOpenVisitanteRapido} onSaved={() => {}} />
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────

interface BlocoSecaoProps {
  titulo: string;
  subtitulo?: string;
  /** Aceita ícones Lucide e os do widgetRegistry, tipados como ComponentType. */
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}
function BlocoSecao({ titulo, subtitulo, icon: Icon, children }: BlocoSecaoProps) {
  // Secao que se apaga sozinha quando o widget avisa que nao tem o que
  // mostrar. O canal (VazioCtx) e os avisos ja existiam: onze widgets do
  // painel chamam useReportarVazio ha tempos. So que o provider morava
  // apenas na tela HOJE — e o proprio arquivo do canal registrava isso:
  // "fora do HOJE nao ha provider e o hook e inerte".
  //
  // Era por isso que o painel gastava uma secao inteira, com titulo e
  // subtitulo, para dizer "Tudo em ordem — nada fiscal pendente". O widget
  // vinha avisando que estava vazio, e nao havia quem escutasse.
  //
  // `hidden` em vez de devolver null, pelo mesmo motivo do BlocoHoje: com
  // null o filho desmonta, o aviso se perde, a secao reaparece e o ciclo
  // recomeca. Escondido, o filho segue montado e segue reportando.
  const [vazio, setVazio] = useState(false);
  const reportar = useCallback<ReportarVazio>((v) => setVazio(v), []);

  return (
    <VazioCtx.Provider value={reportar}>
      <section className="space-y-2" hidden={vazio} aria-hidden={vazio || undefined}>
        <div className="flex items-baseline justify-between gap-2 px-1">
          <div>
            {/* Sem icone no titulo de secao. "Ações rápidas", "Alertas
                inteligentes", "Agenda fiscal" — o titulo ja diz o que a secao e;
                o icone dourado ao lado nao acrescenta e coloca uma mancha de cor
                em cada cabecalho da tela. Hierarquia se faz com tamanho e
                espaco, nao com enfeite. */}
            <h2 className="font-serif text-lg">{titulo}</h2>
            {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
          </div>
        </div>
        <div>{children}</div>
      </section>
    </VazioCtx.Provider>
  );
}

interface AcaoRapidaProps {
  to: string;
  icon: typeof Sparkles;
  label: string;
}
function AcaoRapida({ to, icon: Icon, label }: AcaoRapidaProps) {
  return (
    <Link to={to}>
      {/* O quadrado dourado com anel saiu de tras do icone. Eram seis
          atalhos, e portanto seis blocos de cor mais seis aneis, logo abaixo
          do versiculo que ja e dourado. O icone fica — num painel de seis
          atalhos ele ajuda a mirar sem ler — mas em cinza, do peso de um
          rotulo, nao de um destaque. */}
      <Card className="hover:border-gold/40 transition-colors cursor-pointer">
        <CardContent className="p-3 flex flex-col items-center gap-1.5 text-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium leading-tight">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── Sub-componente: lista de widgets com "Ver mais" ────────────────────
/**
 * `apenas="hoje"`  — só o que exige alguém hoje (prioridade 0).
 * `apenas="resto"` — o contexto, que se lê quando sobra tempo.
 *
 * A divisão é a mesma do registry; o que mudou foi a tela deixar de tratar
 * as duas metades como uma lista contínua. "Ações de hoje" e "Resumo da
 * EBD" não são o mesmo tipo de coisa e não podiam ficar empilhados com o
 * mesmo peso.
 */
function WidgetsDinamicos({ permissoes, apenas }: { permissoes: Set<string>; apenas: "hoje" | "resto" }) {
  const [verTodos, setVerTodos] = useState(false);

  // ── O corte vem DEPOIS da separação, e não antes ────────────────────
  //
  // `getWidgetsDivididos` cortava os 5 primeiros da lista inteira. Como os 5
  // primeiros são todos prioridade 0, a metade de baixo nascia VAZIA: dez
  // widgets iam para trás de "Ver mais", inclusive os que pedem decisão.
  //
  // Percebido ao testar os sinais de voluntariado da Sprint 5, que nasceram
  // invisíveis. Um sinal pastoral escondido atrás de um botão não é muito
  // melhor que um sinal inexistente.
  //
  // Agora cada metade tem seu próprio limite: tudo o que é de HOJE aparece
  // (é pouco, e é o assunto da tela), e o resto mostra quatro, com o botão
  // para o que sobrar.
  const todos = getWidgetsParaUsuario({ permissoes });
  const doDia = todos.filter(w => w.prioridade === 0);
  const resto = todos.filter(w => w.prioridade !== 0);
  const RESTO_VISIVEL = 4;
  const secundarios = resto.slice(RESTO_VISIVEL);
  const lista = apenas === "hoje"
    ? doDia
    : (verTodos ? resto : resto.slice(0, RESTO_VISIVEL));

  return (
    <>
      {lista.map(w => {
        const Icon = w.icone;
        const Comp = w.component;
        return (
          <BlocoSecao key={w.id} titulo={w.label} icon={Icon} subtitulo={w.subtitulo}>
            {/* Esqueleto, e não roda: o bloco já tem título e altura
                conhecida, então dá para desenhar a forma do que vem. */}
            <Suspense fallback={<ListSkeleton count={2} className="grid gap-2" />}>
              <Comp />
            </Suspense>
          </BlocoSecao>
        );
      })}
      {apenas === "resto" && !verTodos && secundarios.length > 0 && (
        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
            onClick={() => setVerTodos(true)}>
            Ver mais {secundarios.length} widget{secundarios.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </>
  );
}
