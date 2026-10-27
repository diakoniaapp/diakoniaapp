// ─── HistoricoDeEnvios — quem enviou o quê, para quem e com que resultado (aba Histórico da Central) ───────────────────────────────────────────────────────────────────────────────────────────
// Lê `comunicacao_envios` (só admin e diakonia leem; o banco manda). Mostra os destinatários porque o relatório enviado é agregado — nenhum nome de membro passa por aqui. Antes da migration
// 20261027180000 a tabela não existe: a aba avisa em vez de parecer vazia.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Info, Loader2, Mail, XCircle } from "lucide-react";
import { listarEnviosDaComunicacao, type HistoricoDosEnvios } from "@/services/comunicacaoService";

export interface ServicoDoHistorico { listar: (limite?: number) => Promise<HistoricoDosEnvios> }
const SERVICO_REAL: ServicoDoHistorico = { listar: listarEnviosDaComunicacao };
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const ROTULO_DA_ORIGEM = { sob_demanda: "Relatório de contribuições", teste: "Teste do relatório de contribuições" } as const;
const ROTULO_DO_RESULTADO = { enviado: "Enviado", parcial: "Enviado em parte", falhou: "Falhou" } as const;

export function HistoricoDeEnvios({ servico = SERVICO_REAL, recarregar = 0 }: { servico?: ServicoDoHistorico; recarregar?: number }) {
  const [dados, setDados] = useState<HistoricoDosEnvios | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setErro("");
    servico.listar(30).then(d => { if (vivo) setDados(d); }).catch(e => { if (vivo) { setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico"); setDados({ envios: [], indisponivel: false }); } });
    return () => { vivo = false; };
  }, [servico, recarregar]);

  return (
    <Card className="shadow-card-soft" data-cartao="historico-envios">
      <CardHeader className="pb-3"><CardTitle className="font-serif flex items-center gap-2 text-lg"><Mail className="w-4 h-4 text-gold" /> Relatórios enviados por e-mail</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!dados ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : erro ? (
          <p className="text-sm text-destructive-text" data-erro="historico">{erro}</p>
        ) : dados.indisponivel ? (
          <div className="flex items-start gap-2 text-xs text-warning-text" data-aviso="historico-indisponivel"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /><p>O histórico de envios ainda não está ativo no banco (migration pendente). Os envios saem normalmente, mas não ficam registrados aqui.</p></div>
        ) : dados.envios.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3" data-vazio>Nenhum relatório foi enviado por e-mail ainda.</p>
        ) : (
          dados.envios.map(e => {
            const ok = e.resultado !== "falhou";
            return (
              <div key={e.id} data-envio={e.id} className="rounded-md border px-3 py-2 text-sm min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  {ok ? <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" /> : <XCircle className="w-4 h-4 text-destructive-text shrink-0" />}
                  <span className="font-medium truncate min-w-0">{ROTULO_DA_ORIGEM[e.origem] ?? e.tipo}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{ROTULO_DO_RESULTADO[e.resultado]}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{quando(e.em)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.parametros?.ini && e.parametros?.fim ? `Período ${dataBr(e.parametros.ini)} a ${dataBr(e.parametros.fim)} · ` : ""}
                  {e.solicitante_nome ? `pedido por ${e.solicitante_nome}` : "pedido por usuário do sistema"}
                </p>
                <p className="text-xs text-muted-foreground break-words">Para: {e.destinatarios.map(d => `${d.email}${d.ok ? "" : " (falhou)"}`).join(", ") || "—"}</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
