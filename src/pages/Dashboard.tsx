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
import { getWidgetsDivididos } from "@/dashboard/widgetRegistry";
import { getAcoesParaUsuario } from "@/dashboard/quickActionsRegistry";


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

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor", pastor: "Pastor",
  lideranca: "Liderança", voluntario: "Voluntário",
};

const ROLE_VALORES = [
  "Administrador","Secretaria","Pastor","Lideranca","Liderança",
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
        <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div className="min-w-0 space-y-1">
            {/* Rotulo de perfil sem escudo e sem dourado. Quem usa o sistema
                todo dia sabe que e administrador; a informacao serve no maximo
                como referencia, nao como destaque no alto da tela. Cinza
                resolve, e devolve o dourado ao que de fato pede acao. */}
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {ROLE_LABEL[principalRole] ?? principalRole}
            </span>
            <h1 className="font-serif text-2xl md:text-4xl text-foreground">
              {getSaudacao()}, {nome}! 🙏
            </h1>
            {/* O versiculo do dia vem logo abaixo da saudacao, no lugar onde
                antes havia uma frase de incentivo por perfil.
                Eram duas frases devocionais em sequencia, uma sobre a outra, e
                a segunda enfraquecia a primeira: a Escritura disputava atencao
                com um texto escrito para acompanha-la. Ficou a Escritura. */}
            <p className="font-serif text-sm md:text-base leading-snug text-foreground/95">
              &ldquo;{verse.texto}&rdquo;
            </p>
            <div className="text-muted-foreground text-xs">{verse.ref}</div>
          </div>
          <div className="flex gap-2 shrink-0 self-end md:self-auto">
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


        {/* ── ZONA 2 — AÇÃO: atalhos rápidos do perfil (registry) ───── */}
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

        {/* ── ZONA 3 — CONTEXTO: widgets essenciais (P0-P2 até limite) ─ */}
        <WidgetsDinamicos permissoes={permissoes} />

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
function WidgetsDinamicos({ permissoes }: { permissoes: Set<string> }) {
  const [verTodos, setVerTodos] = useState(false);
  const { essenciais, secundarios } = getWidgetsDivididos({ permissoes }, { limiteEssencial: 5 });
  const lista = verTodos ? [...essenciais, ...secundarios] : essenciais;

  return (
    <>
      {lista.map(w => {
        const Icon = w.icone;
        const Comp = w.component;
        return (
          <BlocoSecao key={w.id} titulo={w.label} icon={Icon} subtitulo={w.subtitulo}>
            <Suspense fallback={
              <div className="py-4 text-center text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Carregando...
              </div>
            }>
              <Comp />
            </Suspense>
          </BlocoSecao>
        );
      })}
      {!verTodos && secundarios.length > 0 && (
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
