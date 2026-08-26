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
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sprout, Users, AlertCircle, CalendarX, Loader2, HeartHandshake, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarPainelPgm, quandoSeReune,
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

  const { resumo, grupos, alertas, reunioesUltimos30d } = dados;
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <Numero label="Grupos ativos" valor={resumo.grupos_ativos} cor="bg-success-soft text-success-text border-success-line" />
        <Numero label="Pessoas" valor={resumo.total_membros} cor="bg-info-soft text-info-text border-info-line" />
        <Numero label="Reuniões (semana)" valor={resumo.reunioes_semana} cor="bg-celebracao-soft text-celebracao-text border-celebracao-line" />
        <Numero
          label="Presença (30d)"
          valor={temFrequencia ? `${resumo.presenca_media_pct}%` : "—"}
          cor="bg-muted text-muted-foreground border-border"
        />
        <Numero label="Pedidos de oração" valor={resumo.pedidos_ativos} cor="bg-violeta-soft text-violeta-text border-violeta-line" />
      </div>

      {/* Quem está faltando seguido — a razão pastoral do bloco existir */}
      {alertas.length > 0 && (
        <Card className="border-warning-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-warning-text" />
              Faltando seguido
              <Badge variant="outline" className="text-xs bg-warning-soft border-warning-line">
                {alertas.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertas.map(a => (
              <div key={`${a.grupo_id}-${a.pessoa_id}`} className="flex items-center justify-between border rounded-md px-3 py-2 bg-warning-soft/30 gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.nome}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.grupo_nome}
                    {a.ultima_presenca && ` · última presença ${formatarData(a.ultima_presenca)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-warning-text tabular-nums">
                    {a.faltas_seguidas} falta{a.faltas_seguidas > 1 ? "s" : ""}
                  </span>
                  <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                    <Link to={`/membros?abrir=${a.pessoa_id}`}>Ficha</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Os grupos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sprout className="w-4 h-4 text-muted-foreground" />
            Grupos
            <Badge variant="outline" className="text-xs">{grupos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum pequeno grupo cadastrado.</p>
          ) : (
            grupos.map(g => {
              const quando = quandoSeReune(g);
              return (
                <div key={g.id} className="flex items-center justify-between border rounded-md px-3 py-2 gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate flex items-center gap-1.5">
                      {g.nome}
                      {!g.ativo && (
                        <Badge variant="outline" className="text-xs font-normal shrink-0">inativo</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {g.lider_nome ?? "sem líder"}
                      {g.co_lider_nome && ` e ${g.co_lider_nome}`}
                      {quando && ` · ${quando}`}
                    </p>
                    {g.bairro && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {g.bairro}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold tabular-nums leading-none">{g.qtd_membros}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.qtd_membros === 1 ? "pessoa" : "pessoas"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div className="pt-1">
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
              <Link to="/pgm"><HeartHandshake className="w-3.5 h-3.5" /> Abrir Pequenos Grupos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  return new Date(iso + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Numero({ label, valor, cor }: { label: string; valor: number | string; cor: string }) {
  return (
    <div className={`rounded-md border p-2 text-center min-w-0 ${cor}`}>
      <p className="text-2xl font-semibold leading-none tabular-nums">{valor}</p>
      <p className="text-xs uppercase tracking-wide mt-1 leading-tight">{label}</p>
    </div>
  );
}
