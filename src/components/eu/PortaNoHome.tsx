// ─── A porta da frente, na primeira tela ─────────────────────────────────────
//
// A bancada do acolhimento mora no painel da Comunhão, e quem a abre já foi
// procurá-la. O que está atrasado ali não espera por isso: em 03/09/2026 havia
// doze tarefas de boas-vindas vencidas, a mais antiga com 32 dias, de três
// pessoas que visitaram a igreja em agosto.
//
// Um visitante procurado 32 dias depois já não é um visitante procurado. Por
// isso a porta ganha um lugar na Home — não a bancada inteira, só o que tem
// prazo e para quem pode agir.
//
// ── QUEM VÊ ──────────────────────────────────────────────────────────────────
//
// Quem responde pelo ministério de acolhimento, e a pastoral. Para o resto da
// igreja isto seria a lista de tarefas de outra pessoa na própria primeira
// tela — exatamente o que a Home deixou de ser.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { DoorOpen, AlarmClock, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { carregarBancadaAcolhimento, type BancadaAcolhimento } from "@/services/bancadaAcolhimentoService";

export function PortaNoHome({ pessoaId }: { pessoaId: string | null }) {
  const { hasRole } = useAuth();
  const [ministerioId, setMinisterioId] = useState<string | null>(null);
  const [ac, setAc] = useState<BancadaAcolhimento | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("ministerios")
        .select("id, lider_id, vice_lider_id, co_lider_id")
        .eq("modulo", "acolhimento").eq("ativo", true).maybeSingle();

      if (cancelado) return;
      if (!data) { setCarregando(false); return; }

      const lidero = !!pessoaId &&
        [data.lider_id, (data as any).vice_lider_id, (data as any).co_lider_id].includes(pessoaId);
      const pastoral = hasRole(["admin", "pastor", "diakonia"]);
      if (!lidero && !pastoral) { setCarregando(false); return; }

      setMinisterioId(data.id);
      const b = await carregarBancadaAcolhimento();
      if (cancelado) return;
      setAc(b);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [pessoaId, hasRole]);

  if (carregando) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </CardContent></Card>
    );
  }

  // Sem ministério de acolhimento, sem permissão, ou sem nada atrasado e sem
  // ninguém esperando: a seção some inteira. Um cartão que diz "está tudo bem"
  // ocupa a primeira tela sem pedir nada de ninguém.
  if (!ac || !ministerioId) return null;
  if (ac.tarefasVencidas === 0 && ac.visitantesAtivos === 0) return null;

  const piorAtraso = ac.tarefas[0]?.atraso ?? 0;

  return (
    <Card className={ac.tarefasVencidas > 0 ? "border-destructive-line" : undefined}>
      <CardContent className="p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <DoorOpen className="w-4 h-4 shrink-0 text-gold" />
          A porta da frente
        </p>

        {ac.tarefasVencidas > 0 ? (
          <p className="flex items-start gap-2 text-sm text-destructive-text">
            <AlarmClock className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>
                {ac.tarefasVencidas === 1
                  ? "1 tarefa de acolhimento venceu"
                  : `${ac.tarefasVencidas} tarefas de acolhimento venceram`}
              </strong>
              {piorAtraso > 0 && <> — a mais antiga há {piorAtraso} dias</>}.{" "}
              Quem visitou a igreja está esperando ser procurado.
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {ac.visitantesAtivos} {ac.visitantesAtivos === 1 ? "visitante" : "visitantes"} em
            acompanhamento, sem nada atrasado.
          </p>
        )}

        {ac.tarefas.slice(0, 3).map(t => (
          <p key={t.id} className="text-xs text-muted-foreground">
            {t.titulo}
            {t.atraso > 0 && <span className="text-destructive-text"> · {t.atraso} dias</span>}
          </p>
        ))}

        <Link
          to={`/ministerios/${ministerioId}/painel#acolhimento`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Abrir a porta da frente <ArrowRight className="w-3 h-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
