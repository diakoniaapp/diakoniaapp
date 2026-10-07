// ─── FilaPastoralQr — "Novos visitantes aguardando contato" (prioridade: oração, depois contato pastoral) ────
//
// Vem de `vw_visitantes_aguardando_contato`: todo visitante com check-in do QR que ainda não recebeu retorno. Sai da fila
// quando a equipe marca como tratado OU quando já há contato registrado na ficha depois do check-in. Os pedidos de oração
// (sensíveis, LGPD art. 11) só aparecem aqui — a leitura é restrita a quem acompanha visitantes (RLS).

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, HeartHandshake, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { conferir } from "@/lib/escritaConferida";
import { montarLinkWhatsApp } from "@/lib/whatsapp";
import { preferenciaDeContato, rotulosDaOracao } from "@/lib/autocadastroVisitante";

interface Item {
  checkin_id: string; membro_id: string; nome_completo: string; whatsapp: string | null; numero_visitas: number | null;
  data_visita: string; culto: string | null; prioridade: number; deseja_contato: boolean; deseja_informacoes: boolean;
  oracao_familia: boolean; oracao_saude: boolean; oracao_trabalho: boolean; oracao_outro: string | null; primeira_visita: boolean | null;
  canal_contato: string | null; horario_contato: string | null; email: string | null;
}

const ROTULO: Record<number, { texto: string; classe: string }> = {
  1: { texto: "Pediu oração", classe: "border-destructive-line bg-destructive-soft text-destructive-text" },
  2: { texto: "Quer contato pastoral", classe: "border-warning-line bg-warning-soft text-warning-text" },
  3: { texto: "Novo visitante", classe: "border-info-line bg-info-soft text-info-text" },
};
const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function FilaPastoralQr({ onAbrirVisitante }: { onAbrirVisitante?: (membroId: string) => void }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [disponivel, setDisponivel] = useState(true);
  const [tratando, setTratando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("vw_visitantes_aguardando_contato" as never).select("*");
    if (error) { setDisponivel(false); return; }
    setItens((data ?? []) as unknown as Item[]);
  }, []);
  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, 30_000);
    return () => window.clearInterval(id);
  }, [carregar]);

  async function tratar(i: Item) {
    setTratando(i.checkin_id);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const r = conferir(
        await supabase.from("visitante_checkins" as never)
          .update({ tratado_em: new Date().toISOString(), tratado_por: uid } as never).eq("id" as never, i.checkin_id as never).select("id"),
        "O retorno ao visitante",
      );
      if (!r.ok) throw new Error(r.erro);
      toast.success(`${i.nome_completo.split(" ")[0]} saiu da fila`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Não foi possível marcar"); }
    finally { setTratando(null); }
  }

  if (!disponivel || itens === null || itens.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-2" aria-labelledby="fila-qr">
      <div className="flex items-center justify-between gap-2">
        <h2 id="fila-qr" className="text-sm font-bold flex items-center gap-1.5">
          <HeartHandshake className="w-4 h-4" /> Aguardando contato · {itens.length}
        </h2>
        <p className="text-[11px] text-muted-foreground">Primeiro quem pediu oração, depois quem pediu contato.</p>
      </div>
      <ul className="divide-y">
        {itens.map(i => {
          const r = ROTULO[i.prioridade] ?? ROTULO[3];
          const oracao = rotulosDaOracao(i);
          const link = i.whatsapp ? montarLinkWhatsApp({ telefone: i.whatsapp, texto: `Olá, ${i.nome_completo.split(" ")[0]}! Foi uma alegria receber você na Quarta Igreja Batista do Rio de Janeiro.` }) : null;
          return (
            <li key={i.checkin_id} className="py-2 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                  onClick={() => onAbrirVisitante?.(i.membro_id)}>{i.nome_completo}</button>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${r.classe}`}>{r.texto}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {dataCurta(i.data_visita)}{i.culto ? ` · ${i.culto}` : ""} · visita {i.numero_visitas ?? 1}
                {oracao.length > 0 && <> · oração: <strong className="text-foreground">{oracao.join(", ")}</strong></>}
                {i.oracao_outro && <> · “{i.oracao_outro}”</>}
                {i.deseja_contato && ` · quer contato pastoral${preferenciaDeContato(i) ? ` (${preferenciaDeContato(i)})` : ""}`}
                {i.deseja_informacoes && " · aceita receber informações"}
              </p>
              <div className="flex gap-1.5">
                {link && (
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                    <a href={link} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-3 h-3" /> WhatsApp</a>
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={tratando === i.checkin_id} onClick={() => tratar(i)}>
                  {tratando === i.checkin_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />} Retorno feito
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
