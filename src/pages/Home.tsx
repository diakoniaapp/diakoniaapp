// ─── Home — a tela de quem acabou de entrar ───────────────────────────────
//
// ── O QUE ESTA TELA SUBSTITUI ──────────────────────────────────────────────
//
// Um painel de trabalho: dezesseis widgets de acolhimento, alertas, pendências
// e resumos, montados a partir da permissão de quem olha. Ele funcionava — e
// era a tela errada para o primeiro momento.
//
// A razão é que ele respondia sempre pelos OUTROS. Quem não foi procurado,
// quem passou da faixa da EBD, quem está sobrecarregado. Para as três contas
// de hoje isso faz sentido: as três são da liderança. Para as 297 pessoas do
// cadastro, no dia em que cada uma tiver acesso, a primeira tela do sistema da
// própria igreja não pode ser a lista de tarefas de outra pessoa.
//
// Agora:
//
//   Home      quem eu sou aqui, e o que a igreja espera de mim
//   Painéis   o que eu faço — Pastoral, Secretaria, Tesouraria
//
// Crescimento não vira cartão: ele já é uma aba do Painel Pastoral, e o
// `App.tsx` registra que foi embutido lá para não haver dois caminhos
// disputando o mesmo conteúdo.
//
// Os widgets não sumiram: foram para os painéis, pelo campo `paineis` do
// registry. Ver `dashboard/widgetRegistry.tsx`.
//
// ── A ORDEM DOS BLOCOS ─────────────────────────────────────────────────────
//
// Não é a ordem em que as ideias apareceram; é a de quem tem pressa.
//
//   1. A minha semana     o único bloco que pede algo de quem lê. Some
//                         sozinho quando não há nada marcado.
//   2. Meus painéis       o destino de quem entrou para trabalhar. Vem antes
//                         dos dados porque é o motivo de a maioria entrar.
//   3. Agenda             sete dias com a tira do Painel Pastoral: o que a
//                         igreja celebra e o que ela faz, com a felicitação e
//                         o convite prontos. Nasceu de dois blocos separados
//                         — "Para celebrar" e "Convide alguém" — que
//                         respondiam à mesma pergunta com dois recortes de
//                         tempo diferentes.
//   4. Minha ficha        consulta e correção. Não tem pressa, mas é o
//                         bloco que a pessoa procura quando vem por isso.
//   5. Minha vida         classe da EBD e Pequeno Grupo.
//
// Cada seção se apaga sozinha quando o bloco de dentro avisa que não tem o
// que mostrar — o canal `VazioCtx`, que já existia. Uma Home com sete títulos
// e três blocos vazios diria a quem chega que ele está perdendo alguma coisa.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  UserPlus, Search, CalendarClock, LayoutGrid, CalendarDays, IdCard, BookOpen,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { verseOfTheDay } from "@/lib/agenda/verses";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";
import { openCommandPalette } from "@/lib/commandPalette";
import { Secao } from "@/components/eu/Secao";
import { FaixaDeIndicadores, Indicador, irParaSecao } from "@/components/painel/blocos";
import { MeusPaineis } from "@/components/eu/MeusPaineis";
import { MinhaFicha } from "@/components/eu/MinhaFicha";
import { MinhaSemana, MinhaEbdCard, MeuPgmCard } from "@/components/eu/MinhaVida";
import { AgendaDaSemana } from "@/components/eu/AgendaDaSemana";
import { minhaFicha, type MinhaFicha as Ficha } from "@/services/meuEspacoService";

function saudacao(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// QUINTA cópia deste mapa no repositório — as outras estão em types/usuario.ts,
// AppLayout.tsx, UserMenuButton.tsx e (até ser aposentado) Dashboard.tsx. Ao
// trocar um rótulo, trocar em todas: em 26/08/2026 "Pastor titular" mudou em
// três e a tela do painel continuou dizendo "Pastor".
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor titular", pastor: "Pastor",
  lideranca: "Liderança", voluntario: "Voluntário",
};

/**
 * Os atalhos da tira, NA ORDEM EM QUE AS SEÇÕES APARECEM ABAIXO.
 *
 * ── A ORDEM É CONTRATO, E JÁ QUEBROU UMA VEZ ───────────────────────────────
 *
 * Ao fundir "Para celebrar" e "Convide alguém" numa Agenda só, a seção nova
 * herdou o lugar da segunda — o último — enquanto esta lista continuou
 * anunciando-a em terceiro. A tira dizia uma coisa e a página fazia outra, e
 * nada reclamou: o salto funcionava, só levava a um lugar inesperado.
 *
 * Uma tira fixa é uma promessa sobre a forma da página. Quem lê "Agenda" em
 * terceiro espera encontrá-la em terceiro ao rolar — e é justamente quem rola
 * em vez de clicar que descobre a mentira.
 *
 * Por isso a ordem virou dado conferível: `ORDEM_DAS_SECOES` é lida pelo
 * teste `Home.test.ts`, que compara com a ordem dos `id`s no JSX.
 *
 * Rótulos curtos: a tira tem até seis colunas e o rótulo é o único texto de
 * cada célula. "A sua semana" vira "SEMANA" — quem lê a tira já está na Home
 * e não precisa da frase inteira, que continua no título da seção.
 */
export const ATALHOS: { id: string; rotulo: string; icone: LucideIcon }[] = [
  { id: "minha-semana", rotulo: "Semana",   icone: CalendarClock },
  { id: "meus-paineis", rotulo: "Painéis",  icone: LayoutGrid },
  { id: "agenda",       rotulo: "Agenda",   icone: CalendarDays },
  { id: "meus-dados",   rotulo: "Meus dados", icone: IdCard },
  { id: "minha-vida",   rotulo: "Minha vida", icone: BookOpen },
];

export default function Home() {
  const { roles, pessoaId, pessoaCarregada } = useAuth();
  const { permissoes } = usePermissoes();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [abrirVisitante, setAbrirVisitante] = useState(false);
  const verse = verseOfTheDay();

  // A ficha é carregada UMA vez aqui e emprestada aos blocos que precisam
  // dela: o nome na saudação, a assinatura do convite e o bairro que orienta
  // a sugestão de Pequeno Grupo. Três consultas iguais seriam três.
  useEffect(() => {
    if (!pessoaId) { setFicha(null); return; }
    minhaFicha(pessoaId).then(setFicha).catch(() => setFicha(null));
  }, [pessoaId]);

  // O primeiro nome sai da FICHA, e não de `profiles.nome`. Este último é
  // mantido por cópia e diverge: em produção há conta cujo `profiles.nome` é
  // "Telma Souza" e cuja ficha diz "Telma Rodrigues de Souza". Quem a igreja
  // conhece é a ficha.
  const primeiroNome = (() => {
    const n = (ficha?.nome_social || ficha?.nome_completo || "").trim();
    if (!n) return null;
    const p = n.split(/\s+/)[0];
    return p.charAt(0).toUpperCase() + p.slice(1);
  })();

  const papel = ROLE_LABEL[roles[0] ?? ""] ?? null;

  // ── A tira de atalhos ────────────────────────────────────────────────
  //
  // Cada seção avisa se tem ou não o que mostrar, e a tira monta a partir
  // disso. "Meus dados" não avisa nada: ela nunca está vazia — ou traz a
  // ficha, ou explica por que não há ficha ligada — então nasce presente.
  const [vazias, setVazias] = useState<Record<string, boolean>>({});
  const marcarVazio = useCallback((id: string, vazio: boolean) => {
    setVazias(v => (v[id] === vazio ? v : { ...v, [id]: vazio }));
  }, []);
  const atalhos = ATALHOS.filter(a => !vazias[a.id]);

  return (
    <div>
      {/* ── O cabeçalho fixo: saudação E tira, juntas ───────────────────

          `sticky` e não `fixed`: quem rola é o `<main>` do AppLayout, não a
          janela — o mesmo motivo que o Painel Pastoral registra no cabeçalho
          dele. Por isso funciona sem cálculo de posição.

          As duas grudam JUNTAS, num invólucro só. Fixar apenas a tira faria
          a saudação enrolar por baixo dela e sumir: quem abre o sistema
          perderia o próprio nome ao primeiro gesto de rolagem.

          O `top` sai de uma variável medida, e não de um número. Quando a
          administradora entra em "Ver como", a faixa dourada ocupa o topo —
          e ela tem uma linha no desktop e duas no celular. A própria faixa
          publica a altura dela em `--altura-ver-como`. */}
      <div
        className="sticky z-30"
        style={{ top: "var(--altura-ver-como, 0px)" }}
      >
      <div className="border-b bg-card">
        <div className="px-4 md:px-8 py-3 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
          <div className="min-w-0 space-y-0.5 md:space-y-1">
            {papel && (
              <span className="hidden md:block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {papel}
              </span>
            )}
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-serif text-xl md:text-4xl text-foreground min-w-0">
                {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ""}! 🙏
              </h1>
              {permissoes.has("criar_pessoa") && (
                <Button size="sm" onClick={() => setAbrirVisitante(true)}
                  className="md:hidden gap-1.5 shrink-0 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
                  <UserPlus className="w-4 h-4" />
                  <span translate="no">Visitante</span>
                </Button>
              )}
            </div>
            <p className="font-serif text-sm md:text-base leading-snug text-foreground/95">
              &ldquo;{verse.texto}&rdquo;
              <span className="text-muted-foreground text-xs font-sans whitespace-nowrap">
                {" "}— {verse.ref}
              </span>
            </p>
          </div>
          {/* O atalho de visitante é trabalho de quem recebe, não de todo
              mundo: para quem não cadastra ninguém ele seria um botão dourado
              no alto da tela levando a uma porta fechada. */}
          {permissoes.has("criar_pessoa") && (
            <div className="hidden md:flex gap-2 shrink-0 self-end md:self-auto">
              <Button onClick={() => setAbrirVisitante(true)}
                className="gap-2 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
                <UserPlus className="w-4 h-4" />
                <span translate="no">Visitante Rápido</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── A tira de atalhos ────────────────────────────────────────────

          O mesmo mecanismo do Painel Pastoral, e os mesmos componentes:
          `FaixaDeIndicadores` + `Indicador` + `irParaSecao`. Ele mede o
          cabeçalho fixo na hora do salto, em vez de confiar num `scroll-mt`
          escrito à mão — e o comentário de `irParaSecao` conta por quê: o
          número fixo envelheceu na primeira vez que o cabeçalho mudou.

          Só entram as seções que ESTA pessoa tem. Um atalho para uma seção
          escondida rolaria a tela até nada, e prometeria conteúdo que ela
          não tem — que é o oposto de um atalho. */}
      {/* ── Fixa, e por isso opaca e de largura inteira ─────────────────

          `sticky` gruda dentro do PRÓPRIO rolador, e aqui quem rola é o
          `<main>` do AppLayout — não a janela. Por isso funciona sem `fixed`
          e sem cálculo de posição.

          O `top` sai de uma variável medida, e não de um número: quando a
          administradora entra em "Ver como", a faixa dourada ocupa o topo, e
          ela tem uma linha no desktop e duas no celular. A própria faixa
          publica a altura dela em `--altura-ver-como`.

          A moldura externa vai de ponta a ponta e é opaca de propósito: com
          `max-w-5xl` só no que está fixo, o conteúdo passaria por baixo pelas
          laterais ao rolar. A largura de leitura fica na camada de dentro. */}
      <div className="bg-background border-b">
        <div className="px-4 md:px-8 py-2 max-w-5xl mx-auto">
          <FaixaDeIndicadores colunas={Math.min(Math.max(atalhos.length, 3), 6)}>
            {atalhos.map(a => (
              <Indicador key={a.id} rotulo={a.rotulo} icone={a.icone}
                onClick={() => irParaSecao(a.id)}
                descricao={`Ir para ${a.rotulo}`} />
            ))}
          </FaixaDeIndicadores>
        </div>
      </div>
      </div>{/* fim do cabeçalho fixo */}

      <div className="p-4 md:p-8 space-y-10 max-w-5xl mx-auto">
        <Secao id="minha-semana" onVazio={marcarVazio}
          titulo="A sua semana" subtitulo="O que a igreja espera de você nos próximos dias">
          {pessoaId && <MinhaSemana pessoaId={pessoaId} />}
        </Secao>

        <Secao id="meus-paineis" onVazio={marcarVazio}
          titulo="Seus painéis" subtitulo="Onde você trabalha neste sistema">
          <MeusPaineis permissoes={permissoes} pessoaId={pessoaId} />
        </Secao>

        <Secao id="agenda" onVazio={marcarVazio}
          titulo="Agenda" subtitulo="Sete dias — o que a igreja celebra e o que ela faz">
          <AgendaDaSemana eu={ficha} />
        </Secao>

        {/* Sem `Secao`: este bloco nunca está vazio — ou mostra a ficha, ou
            explica por que não há ficha ligada à conta. Envolvê-lo no canal
            do vazio seria dar a ele a chance de sumir sem explicar. */}
        <section id="meus-dados" className="space-y-2 scroll-mt-24">
          <div className="px-1">
            <h2 className="font-serif text-lg">Meus dados</h2>
            <p className="text-xs text-muted-foreground">
              Você corrige o que é seu; vínculo e funções são com a secretaria
            </p>
          </div>
          {pessoaCarregada && pessoaId
            ? <MinhaFicha pessoaId={pessoaId} />
            : pessoaCarregada
              ? <SemFicha />
              : null}
        </section>

        <Secao id="minha-vida" onVazio={marcarVazio}
          titulo="Minha vida na igreja" subtitulo="Escola Bíblica e Pequeno Grupo">
          {pessoaId && (
            <div className="grid gap-2 md:grid-cols-2">
              <MinhaEbdCard
                pessoaId={pessoaId}
                nascimento={ficha?.data_nascimento}
                sexo={ficha?.sexo}
              />
              <MeuPgmCard pessoaId={pessoaId} bairro={ficha?.bairro} />
            </div>
          )}
        </Secao>

        <div className="text-center">
          <button type="button" onClick={openCommandPalette}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span>Buscar qualquer página ou ação</span>
            <kbd className="hidden md:inline px-1 py-0.5 rounded bg-muted text-xs">Ctrl K</kbd>
          </button>
        </div>
      </div>

      <VisitanteRapidoDialog open={abrirVisitante} onOpenChange={setAbrirVisitante} onSaved={() => {}} />
    </div>
  );
}

function SemFicha() {
  return (
    <div className="rounded-lg border border-dashed p-4">
      <p className="text-sm">Sua conta ainda não está ligada a uma ficha de cadastro.</p>
      <p className="text-xs text-muted-foreground mt-1">
        Fale com a secretaria para que ela faça a ligação — depois disso seus dados aparecem aqui.
      </p>
    </div>
  );
}
