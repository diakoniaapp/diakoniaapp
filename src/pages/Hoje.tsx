// ─── Hoje.tsx — Centro de Trabalho (DA-016) ─────────────────────────────
//
// Responde a uma pergunta só: "o que preciso fazer agora?".
//
// Quatro faixas, nesta ordem, e nenhuma aparece vazia:
//   1. Travas   — o que impede alguém de seguir
//   2. Sua tarefa — a acao recorrente do perfil, com botao que executa
//   3. Sua gente  — o lado humano do dia
//   4. Hoje       — compromissos
//
// Reaproveita o widgetRegistry existente (campo `faixa`) e o sistema de
// permissoes. A unica peca nova e o resolvedor de tarefa principal, que
// nao e um bloco informativo e por isso nao cabia no registry.

import { Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ChevronDown, Quote, AlertTriangle, Heart, CalendarDays, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { verseOfTheDay } from "@/lib/agenda/verses";
import { getWidgetsDaFaixa, type Widget } from "@/dashboard/widgetRegistry";
import { BlocoHoje } from "@/components/hoje/BlocoHoje";
import { Button } from "@/components/ui/button";
import {
  resolverTarefaPrincipal, type TarefaPrincipal,
} from "@/hoje/tarefaPrincipal";

function saudacao(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Renderiza os widgets de uma faixa, cada um na sua própria caixa. */
function Faixa({
  widgets, titulo, tom, icon,
}: {
  widgets: Widget[];
  titulo: string;
  tom: "trava" | "gente" | "agenda";
  icon: typeof AlertTriangle;
}) {
  if (widgets.length === 0) return null;
  return (
    <>
      {widgets.map(w => (
        <BlocoHoje
          key={w.id}
          tom={tom}
          titulo={widgets.length === 1 ? titulo : w.label}
          subtitulo={widgets.length === 1 ? undefined : w.subtitulo}
          icon={icon}
        >
          <Suspense fallback={
            <div className="py-3 text-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
              Carregando...
            </div>
          }>
            <w.component />
          </Suspense>
        </BlocoHoje>
      ))}
    </>
  );
}

export default function Hoje() {
  const { user } = useAuth();
  const { permissoes } = usePermissoes();

  const [nome, setNome] = useState("");
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [tarefa, setTarefa] = useState<TarefaPrincipal | null>(null);
  const [verVersiculo, setVerVersiculo] = useState(false);
  const verse = verseOfTheDay();

  // Nome e vínculo com `membros` — o vínculo é o que permite descobrir a
  // classe que a pessoa leciona ou o grupo que ela lidera.
  useEffect(() => {
    if (!user?.id) return;
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("profiles").select("nome, pessoa_id").eq("id", user.id).maybeSingle();
      if (cancelado) return;
      const primeiro = (data?.nome ?? "").trim().split(" ")[0];
      if (primeiro && !primeiro.includes("@")) {
        setNome(primeiro.charAt(0).toUpperCase() + primeiro.slice(1));
      }
      setPessoaId(data?.pessoa_id ?? null);
    })();
    return () => { cancelado = true; };
  }, [user?.id]);

  useEffect(() => {
    if (permissoes.size === 0) return;
    let cancelado = false;
    resolverTarefaPrincipal({ pessoaId, permissoes }).then(t => {
      if (!cancelado) setTarefa(t);
    });
    return () => { cancelado = true; };
  }, [pessoaId, permissoes]);

  // Travas podem ser até 3: num dia saudável todas se escondem, e quando
  // aparecem são justamente o que a pessoa veio resolver.
  //
  // Gente e Agenda ficam em 1. Os widgets herdados do painel foram
  // desenhados para um dashboard largo — medidos aqui, ocupam de 450 a
  // 590px cada, contra 109px da faixa "Sua tarefa", que foi feita para esta
  // tela. Três deles juntos passariam de 1.500px e a tela deixaria de
  // responder "o que preciso fazer agora".
  const ctx = { permissoes };
  const travas = getWidgetsDaFaixa(ctx, "trava", 3);
  const gente  = getWidgetsDaFaixa(ctx, "gente", 1);
  const agenda = getWidgetsDaFaixa(ctx, "agenda", 1);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 space-y-3">
      {/* Saudação — uma linha, sem ocupar a tela */}
      <h1 className="font-serif text-2xl leading-tight">
        {saudacao()}{nome && `, ${nome}`}
      </h1>

      <Faixa widgets={travas} titulo="Precisa da sua decisão" tom="trava" icon={AlertTriangle} />

      {tarefa && (
        <BlocoHoje tom="tarefa" titulo="Sua tarefa" icon={Star}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium leading-snug">{tarefa.titulo}</p>
              {tarefa.subtitulo && (
                <p className="text-xs text-muted-foreground mt-0.5">{tarefa.subtitulo}</p>
              )}
            </div>
            <Button asChild className="gap-2 shrink-0 min-h-[44px] bg-gold hover:bg-gold/90 text-white border-0">
              <Link to={tarefa.to}>
                <tarefa.icon className="w-4 h-4" />
                {tarefa.acao}
              </Link>
            </Button>
          </div>
        </BlocoHoje>
      )}

      <Faixa widgets={gente}  titulo="Sua gente" tom="gente"  icon={Heart} />
      <Faixa widgets={agenda} titulo="Hoje"      tom="agenda" icon={CalendarDays} />

      {/* Versículo — recolhido por padrão, no fim, sem disputar atenção */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setVerVersiculo(v => !v)}
          aria-expanded={verVersiculo}
          className="w-full flex items-center gap-2 min-h-[44px] px-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Quote className="w-3.5 h-3.5 text-gold shrink-0" />
          <span className="flex-1 text-left">Versículo do dia</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${verVersiculo ? "rotate-180" : ""}`} />
        </button>
        {verVersiculo && (
          <blockquote className="px-1 pb-2">
            <p className="font-serif text-sm leading-snug text-foreground/95">
              &ldquo;{verse.texto}&rdquo;
            </p>
            <cite className="text-xs text-gold not-italic">{verse.ref}</cite>
          </blockquote>
        )}
      </div>
    </div>
  );
}
