// ============================================================
// VisitanteTimeline.tsx
// Linha do tempo pastoral — histórico de contatos e marcos
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HISTORICO_CONFIG } from "@/lib/historicoFluxo";
import type { TipoHistorico } from "@/lib/historicoFluxo";

// ── Tipos ─────────────────────────────────────────────────────

interface HistoricoItem {
  id: string;
  tipo: TipoHistorico;
  observacao: string | null;
  created_at: string;
}

interface Props {
  pessoaId: string;
  /** Data de cadastro — para o item "primeiro culto" se não houver registro */
  dataCadastro: string;
  /** Datas estáticas de promoção (opcional — já podem estar no log) */
  dataCongregado?: string | null;
  dataMembro?: string | null;
  /**
   * Esconde os registros de contato e deixa só os marcos de caminhada.
   *
   * Esta mesma linha do tempo serve a ficha de visitante e a de membro, e as
   * duas guardam coisas diferentes. Para um visitante, "ligaram", "mandaram
   * WhatsApp", "voltou ao culto" é a história inteira do acolhimento. Para
   * quem já é da casa, acompanhamento por contato deixou de existir — mas
   * "primeiro culto", "tornou-se congregado" e "tornou-se membro" continuam
   * sendo a história da pessoa com a igreja, e apagar isso junto jogaria
   * fora justamente a parte que importa numa ficha de membro.
   */
  somenteMarcos?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Componente ────────────────────────────────────────────────

/** Os três que contam a caminhada, e não o acompanhamento. */
const MARCOS: TipoHistorico[] = ["cadastro", "promocao_congregado", "promocao_membro"];

export default function VisitanteTimeline({
  pessoaId, dataCadastro, dataCongregado, dataMembro, somenteMarcos = false,
}: Props) {
  const [itens, setItens]     = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("visita_historico")
      .select("id, tipo, observacao, created_at")
      .eq("visitante_id", pessoaId)
      .order("created_at", { ascending: false });
    setItens((data ?? []) as HistoricoItem[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [pessoaId]);

  // Marcos estáticos (promoções) que podem não estar no log ainda
  const marcosExtras: HistoricoItem[] = [];
  if (dataMembro && !itens.find(i => i.tipo === "promocao_membro")) {
    marcosExtras.push({
      id: "static-membro",
      tipo: "promocao_membro",
      observacao: "Tornou-se Membro",
      created_at: dataMembro,
    });
  }
  if (dataCongregado && !itens.find(i => i.tipo === "promocao_congregado")) {
    marcosExtras.push({
      id: "static-congregado",
      tipo: "promocao_congregado",
      observacao: "Tornou-se Congregado",
      created_at: dataCongregado,
    });
  }
  // Garantir que haja ao menos o cadastro
  const temCadastro = itens.find(i => i.tipo === "cadastro");
  if (!temCadastro) {
    marcosExtras.push({
      id: "static-cadastro",
      tipo: "cadastro",
      observacao: "Primeiro culto — cadastro inicial",
      created_at: dataCadastro,
    });
  }

  const todos = [...itens, ...marcosExtras]
    .filter(i => !somenteMarcos || MARCOS.includes(i.tipo))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Carregando histórico…</span>
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground italic">
        {somenteMarcos ? "Sem marcos registrados ainda." : "Nenhum registro de contato ainda."}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" translate="no">
          {somenteMarcos ? "Linha do tempo" : "Histórico de contatos"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-xs gap-1 text-muted-foreground"
          onClick={carregar}
          disabled={loading}
        >
          <RefreshCw className="w-3 h-3" />
          Atualizar
        </Button>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {todos.map((item, idx) => {
          const cfg   = HISTORICO_CONFIG[item.tipo] ?? HISTORICO_CONFIG.observacao;
          const isLast = idx === todos.length - 1;

          return (
            <div key={item.id} className="flex gap-3">
              {/* Linha vertical + ponto */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
                {/* Ponto colorido */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm border shrink-0 ${cfg.cor}`}>
                  {cfg.emoji}
                </div>
                {/* Linha para o próximo */}
                {!isLast && (
                  <div className="w-px flex-1 bg-border mt-1 mb-1" style={{ minHeight: 16 }} />
                )}
              </div>

              {/* Conteúdo */}
              <div className={`pb-4 flex-1 min-w-0 ${isLast ? "" : ""}`}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-medium leading-tight" translate="no">
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground" translate="no">
                    {formatarData(item.created_at)} · {formatarHora(item.created_at)}
                  </span>
                </div>
                {item.observacao && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed" translate="no">
                    {item.observacao}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
