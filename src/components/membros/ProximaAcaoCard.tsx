// ─── ProximaAcaoCard.tsx — Sugestão contextualizada da próxima ação pastoral ──
// Exibido na ficha do visitante, acima do AcolhimentoPanel.
// Mostra a ação sugerida com base no status atual + botão de registro rápido.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logHistorico } from "@/lib/historicoFluxo";
import type { StatusAcolhimento } from "@/types/visitante";

// ── Mapeamento de sugestões por status ───────────────────────────────────────

const SUGESTAO: Record<string, { acao: string; descricao: string; cor: string }> = {
    novo: {
          acao: "Enviar mensagem de boas-vindas",
          descricao: "Primeiro contato — presente na memória enquanto a visita é recente.",
          cor: "border-info-line bg-info-soft/10",
    },
    contatar: {
          acao: "Entrar em contato agora",
          descricao: "Este visitante ainda aguarda o primeiro contato da equipe.",
          cor: "border-warning-line bg-warning-soft/10",
    },
    contatado: {
          acao: "Realizar visita presencial",
          descricao: "Contato feito — próximo passo é uma visita ou convite para evento.",
          cor: "border-warning-line bg-warning-soft/10",
    },
    retornou: {
          acao: "Iniciar acompanhamento semanal",
          descricao: "Visitante retornou — hora de estabelecer um relacionamento contínuo.",
          cor: "border-success-line bg-success-soft/10",
    },
    em_relacionamento: {
          acao: "Convidar para grupo de integração",
          descricao: "Momento de conectar com a comunidade de forma mais profunda.",
          cor: "border-success-line bg-success-soft/10",
    },
    em_acompanhamento: {
          acao: "Verificar necessidades e evolução",
          descricao: "Acompanhamento ativo — checar como a pessoa está se sentindo integrada.",
          cor: "border-teal-200 bg-teal-50 dark:bg-teal-900/10 dark:border-teal-800/40",
    },
    congregado: {
          acao: "Apresentar ao grupo de membros",
          descricao: "Congregado — próximo passo é a jornada rumo à membresia.",
          // Congregado tem cor definida em lib/tipoPessoa.ts, e é dourado
          // desde o catálogo. Aqui estava roxo — a quinta cor para a mesma
          // palavra.
          cor: "border-gold/30 bg-gold/10",
    },
    membro: {
          acao: "Integrar em ministério ou serviço",
          descricao: "Membro — hora de descobrir e ativar seus dons na comunidade.",
          cor: "border-info-line bg-info-soft/10",
    },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    pessoaId: string;
    nomeCompleto: string;
    statusAtual: StatusAcolhimento | null;
    onRegistrado?: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ProximaAcaoCard({ pessoaId, nomeCompleto, statusAtual, onRegistrado }: Props) {
    const [expandido, setExpandido] = useState(false);
    const [descricao, setDescricao] = useState("");
    const [salvando, setSalvando] = useState(false);

  const status = statusAtual ?? "novo";
    const sugestao = SUGESTAO[status] ?? SUGESTAO.novo;

  async function handleRegistrar() {
        const texto = descricao.trim() || sugestao.acao;
        setSalvando(true);
        try {
                // Registra na tabela de acompanhamentos
          const { error } = await supabase.from("acompanhamentos_visitante").insert({
                    membro_id: pessoaId,
                    status: "concluido",
                    contato_feito: true,
                    proximo_passo: texto,
                    observacoes: `Ação registrada via Próxima Ação: ${texto}`,
                    data_contato: new Date().toISOString().split("T")[0],
          });

          if (error) throw error;

          // Atualiza updated_at do membro (sinalizando atividade recente)
          // Sem conferência aqui de propósito: este update só carimba
          // `updated_at` para sinalizar atividade recente. Se a política
          // barrar, nada de substantivo se perde — e falhar a ação inteira
          // por causa de um carimbo seria pior que não carimbar.
          // O que importa (o histórico, logo abaixo) tem política própria.
          await supabase
                  .from("membros")
                  .update({ updated_at: new Date().toISOString() })
                  .eq("id", pessoaId);

          // Log no histórico pastoral
          await logHistorico(pessoaId, "observacao", `✓ Ação realizada: ${texto}`);

          toast.success("✓ Ação registrada com sucesso!");
                setDescricao("");
                setExpandido(false);
                onRegistrado?.();
        } catch (e: any) {
                toast.error("Erro ao registrar: " + e.message);
        } finally {
                setSalvando(false);
        }
  }

  return (
        <Card className={`rounded-2xl border ${sugestao.cor}`}>
                <CardContent className="py-4 px-4">
                        <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-full bg-white/70 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                              <Zap className="w-4 h-4 text-warning-text" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                                                            Próxima ação sugerida
                                              </p>
                                              <p className="text-sm font-semibold text-foreground leading-snug">
                                                {sugestao.acao}
                                              </p>
                                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                                {sugestao.descricao}
                                              </p>
                                  </div>
                                  <Button
                                                size="sm"
                                                variant="outline"
                                                className="shrink-0 gap-1.5 text-xs bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20"
                                                onClick={() => setExpandido(!expandido)}
                                              >
                                              <CheckCircle2 className="w-3.5 h-3.5 text-success-text" />
                                              Registrar
                                  </Button>
                        </div>
                
                  {/* Formulário de registro rápido */}
                  {expandido && (
                    <div className="mt-3 flex gap-2 pt-3 border-t border-current/10">
                                <Input
                                                value={descricao}
                                                onChange={(e) => setDescricao(e.target.value)}
                                                placeholder={`Ex: ${sugestao.acao}...`}
                                                className="text-sm h-8 bg-white/80 dark:bg-white/10"
                                                onKeyDown={(e) => e.key === "Enter" && handleRegistrar()}
                                                autoFocus
                                              />
                                <Button
                                                size="sm"
                                                onClick={handleRegistrar}
                                                disabled={salvando}
                                                className="h-8 px-3 text-xs bg-success hover:bg-success text-white shrink-0"
                                              >
                                  {salvando ? "..." : "Salvar"}
                                </Button>
                    </div>
                        )}
                </CardContent>
        </Card>
      );
}
