// ─── PainelAcompanhamentoPgm.tsx — Pequenos Grupos, como bloco ─────────────
//
// Vive dentro da seção "Discipulado" do Painel Pastoral, ao lado do
// acompanhamento da EBD. As duas medem a mesma coisa por caminhos
// diferentes: onde a pessoa está sendo cuidada durante a semana.
//
// **Nada foi criado no banco.** As três fontes já existiam e estavam entre os
// objetos dormentes — `pgm_resumo_geral`, `pgm_alertas_ausencia` e
// `vw_pgm_grupos_resumo`. Ver `services/pgmPainelService.ts`.
//
// Carrega os próprios dados, com estado próprio, pelo mesmo motivo do bloco
// da EBD: não fazer os blocos pastorais esperarem por agregações.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, CalendarX, Loader2,
} from "lucide-react";
import { toast } from "sonner";
// O cartao de numero vivia aqui, duplicado do PainelPastoral e do PGM.
import { Indicador, FaixaDeIndicadores } from "@/components/painel/blocos";
import {
  carregarPainelPgm,
  type PgmPainel,
} from "@/services/pgmPainelService";

export function PainelAcompanhamentoPgm() {
  const [dados, setDados] = useState<PgmPainel | null>(null);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      setDados(await carregarPainelPgm());
      setFalhou(false);
    } catch (e: any) {
      setFalhou(true);
      toast.error(e?.message ?? "Erro ao carregar os pequenos grupos");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando os pequenos grupos…
        </CardContent>
      </Card>
    );
  }

  if (falhou || !dados?.resumo) {
    return (
      <Card className="border-warning-line">
        <CardContent className="py-4 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-warning-text flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Não foi possível carregar os pequenos grupos.
          </p>
          <Button size="sm" variant="outline" onClick={carregar}>Tentar de novo</Button>
        </CardContent>
      </Card>
    );
  }

  const { resumo, reunioesUltimos30d } = dados;
  // Sem reunião na janela, `presenca_media_pct` é o `coalesce(...,0)` da
  // função, não uma frequência. Ver o cabeçalho do serviço.
  const temFrequencia = reunioesUltimos30d > 0;

  return (
    <div className="space-y-4">
      {!temFrequencia && (
        <div className="rounded-md border border-warning-line bg-warning-soft/50 px-3 py-2">
          <p className="text-sm text-warning-text flex items-start gap-2">
            <CalendarX className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Nenhuma reunião registrada nos últimos 30 dias.</strong>{" "}
              Sem reunião não há frequência a calcular — o campo abaixo fica vazio
              em vez de mostrar 0%, que leria como "ninguém foi".
            </span>
          </p>
        </div>
      )}

      <FaixaDeIndicadores colunas={5}>
        <Indicador rotulo="Grupos ativos" valor={resumo.grupos_ativos} tom="success" />
        <Indicador rotulo="Pessoas" valor={resumo.total_membros} tom="info" />
        <Indicador rotulo="Reuniões (7d)" valor={resumo.reunioes_semana} tom="celebracao" />
        <Indicador rotulo="Presença (30d)"
          valor={temFrequencia ? `${resumo.presenca_media_pct}%` : "—"}
          tom="success"
        />
        <Indicador rotulo="Pedidos de oração" valor={resumo.pedidos_ativos} tom="violeta" />
      </FaixaDeIndicadores>

      {/*
        "Faltando seguido" e "Grupos" foram desativados em 26/08/2026, pelo
        mesmo critério aplicado à EBD: o Painel Pastoral serve para ver o
        contexto geral — quantos grupos estão de pé, quantas pessoas, se
        houve reunião. A lista dos quatro grupos com líder, bairro e horário,
        e a de quem está faltando seguido, são o detalhe.

        Nada foi apagado no banco: `pgm_alertas_ausencia` e
        `vw_pgm_grupos_resumo` continuam lá, entre os objetos que já existiam
        antes deste painel. O que saiu foram as duas buscas em
        `carregarPainelPgm()`, junto dos blocos — buscar o que ninguém vê é
        ida ao banco por nada. O serviço diz como restaurar.
      */}
    </div>
  );
}

