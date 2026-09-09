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
import { TIPO_DE_ENTRADA } from "@/services/rolDeMembrosService";
import { parseLocalDate } from "@/lib/data";

// ── Tipos ─────────────────────────────────────────────────────

interface HistoricoItem {
  id: string;
  tipo: TipoHistorico;
  observacao: string | null;
  created_at: string;
  /**
   * `membros.data_entrada` é `date`, sem hora — ao contrário de todo outro
   * marco desta linha do tempo, que vem de `timestamptz` de verdade.
   * `new Date("2019-07-07")` é interpretado como meia-noite UTC pela
   * especificação, e convertido de volta pro fuso local na exibição vira
   * "06/07 · 21:00" num navegador em Brasília — a mesma classe de bug do
   * arquivo `lib/data.ts` (ver o cabeçalho de lá). A DATA já sai corrigida
   * por `parseLocalDate`; esta flag esconde a HORA, que nunca existiu.
   */
  semHora?: boolean;
}

interface Props {
  pessoaId: string;
  /** Data de cadastro — para o item "primeiro culto" se não houver registro */
  dataCadastro: string;
  /** Datas estáticas de promoção (opcional — já podem estar no log) */
  dataCongregado?: string | null;
  dataMembro?: string | null;
  /**
   * Data real de entrada no rol (`membros.data_entrada`) — só faz sentido
   * quando `somenteMarcos` é true. Existindo, ela substitui o "Primeiro
   * culto" fabricado a partir de `dataCadastro`: pedido dela em 09/09/2026,
   * vendo a ficha de um membro importado dizer "Primeiro culto" na data em
   * que a secretaria digitou o cadastro, não a data em que ele de fato
   * entrou. Ver `entrada_rol` e `cadastro_sistema` em `historicoFluxo.ts`.
   */
  dataEntrada?: string | null;
  tipoEntrada?: string | null;
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

/**
 * Os que contam a caminhada de quem já é da casa — e não o acompanhamento.
 *
 * `"cadastro"` (rótulo "Primeiro culto") de propósito NÃO está aqui: só se
 * aplica quando `somenteMarcos` é true (membro/congregado), e "Primeiro
 * culto" é conceito de visitante. Sem essa exclusão, um "cadastro" real
 * gravado em `visita_historico` durante uma importação (como o de Raquel,
 * achado em 09/09/2026) continuava aparecendo do lado do marco certo —
 * "Entrada no rol" e "Primeiro culto" juntos, dizendo coisas diferentes
 * sobre a mesma pessoa.
 */
const MARCOS: TipoHistorico[] = [
  "entrada_rol", "cadastro_sistema", "promocao_congregado", "promocao_membro",
];

export default function VisitanteTimeline({
  pessoaId, dataCadastro, dataCongregado, dataMembro,
  dataEntrada, tipoEntrada, somenteMarcos = false,
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
  // ── O marco de chegada: "Primeiro culto" só é verdade pra visitante ──────
  //
  // Para VISITANTE, `dataCadastro` (created_at) é confiável: alguém apareceu
  // e foi cadastrado ali, na hora. "Primeiro culto" é exatamente o que
  // aconteceu.
  //
  // Para MEMBRO/CONGREGADO (`somenteMarcos`), `dataCadastro` não é isso —
  // é só quando a LINHA nasceu no banco, que pode ser anos depois da pessoa
  // ter entrado (o caso comum: importação do sistema anterior). Chamar
  // aquilo de "Primeiro culto" inventa um fato. Com `dataEntrada` real
  // (`membros.data_entrada`), o marco vira `entrada_rol`, na data certa; sem
  // ela, vira `cadastro_sistema` — mesma data de antes, mas dizendo o que
  // ela É, não o que não é.
  if (somenteMarcos) {
    const temMarcoDeEntrada = itens.find(i => i.tipo === "entrada_rol" || i.tipo === "cadastro_sistema");
    if (!temMarcoDeEntrada) {
      if (dataEntrada) {
        const rotulo = tipoEntrada ? TIPO_DE_ENTRADA[tipoEntrada] : null;
        marcosExtras.push({
          id: "static-entrada-rol",
          tipo: "entrada_rol",
          observacao: rotulo ? `Entrada por ${rotulo}` : null,
          // `parseLocalDate`, não `new Date(dataEntrada)` direto: ver o
          // comentário de `semHora` em `HistoricoItem`.
          created_at: parseLocalDate(dataEntrada).toISOString(),
          semHora: true,
        });
      } else {
        marcosExtras.push({
          id: "static-cadastro-sistema",
          tipo: "cadastro_sistema",
          observacao: "Data de entrada não registrada — esta é só a data em que o cadastro entrou no sistema.",
          created_at: dataCadastro,
        });
      }
    }
  } else {
    const temCadastro = itens.find(i => i.tipo === "cadastro");
    if (!temCadastro) {
      marcosExtras.push({
        id: "static-cadastro",
        tipo: "cadastro",
        observacao: "Primeiro culto — cadastro inicial",
        created_at: dataCadastro,
      });
    }
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
                    {formatarData(item.created_at)}
                    {!item.semHora && <> · {formatarHora(item.created_at)}</>}
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
