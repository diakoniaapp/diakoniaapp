// ─── ComunicacaoERelatorios.tsx — a Central de Comunicação e Relatórios (27/10/2026, Fase 2) ───────────────────────────────────────────────────────────────────────────────────────────
// Antes: "Resumos por E-mail" (`/admin/resumo-semanal`), uma página longa de cartões empilhados, escondida no menu do avatar. Agora: CINCO abas — Agendamentos · Modelos · Relatórios · Histórico ·
// Configurações — em `/comunicacao`, com a aba na URL (voltar devolve a aba). Nesta fase só se REORGANIZA o que já existia; o histórico completo de envios, o editor de modelo e o envio sob demanda de
// relatórios são as fases seguintes (docs/ANALISE_CENTRAL_DE_COMUNICACAO_E_RELATORIOS_2026-10-27.md §15). Restrita a admin + diakonia, como a tela que ela substitui (`ROLES_DONO_SISTEMA`).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEstadoNaUrl } from "@/hooks/useEstadoNaUrl";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight, HeartHandshake, Loader2 } from "lucide-react";
import { ConteudoDoResumoSemanal } from "@/components/sistema/ConteudoDoResumoSemanal";
import { ResumoDiarioDaTesouraria } from "@/components/sistema/ResumoDiarioDaTesouraria";
import { AgendamentoSemanal } from "@/components/comunicacao/AgendamentoSemanal";
import { CatalogoDeRelatorios } from "@/components/comunicacao/CatalogoDeRelatorios";
import { HistoricoDeExecucoes } from "@/components/comunicacao/HistoricoDeExecucoes";
import { ConfiguracoesDeComunicacao } from "@/components/comunicacao/ConfiguracoesDeComunicacao";
import { carregarStatusResumoSemanal, type ResumoSemanalStatus } from "@/services/sistemaService";
import { ABAS_DA_COMUNICACAO, ABA_PADRAO, abaValida } from "@/lib/comunicacao";

export default function ComunicacaoERelatorios() {
  const { hasRole, rolesCarregados } = useAuth();
  const navigate = useNavigate();
  const [estado, mudar] = useEstadoNaUrl({ aba: ABA_PADRAO as string });
  const aba = abaValida(estado.aba);

  const [status, setStatus] = useState<ResumoSemanalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rolesCarregados && !hasRole(["admin", "diakonia"])) navigate("/", { replace: true });
  }, [rolesCarregados]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    try {
      setStatus(await carregarStatusResumoSemanal());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Comunicação e Relatórios"
        description="Os e-mails que o sistema envia: quando saem, o que levam, para quem vão e para onde vai a resposta"
      />

      <div className="p-4 md:p-8 max-w-3xl">
        <Tabs value={aba} onValueChange={v => mudar({ aba: v })}>
          <TabsList className="w-full justify-start overflow-x-auto" data-abas="comunicacao">
            {ABAS_DA_COMUNICACAO.map(a => (<TabsTrigger key={a.id} value={a.id}>{a.rotulo}</TabsTrigger>))}
          </TabsList>

          <TabsContent value="agendamentos" className="space-y-6 mt-6">
            <AgendamentoSemanal status={status} aoMudar={carregar} />
            <ResumoDiarioDaTesouraria />
          </TabsContent>

          <TabsContent value="modelos" className="space-y-6 mt-6">
            <ConteudoDoResumoSemanal />
            <Card className="shadow-card-soft" data-cartao="mensagens-visitante">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif flex items-center gap-2 text-lg"><HeartHandshake className="w-4 h-4 text-gold" /> Mensagens ao visitante</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Os modelos de boas-vindas, próximos passos e como chegar até a igreja — para WhatsApp e e-mail — têm a sua própria tela de edição, com prévia e teste.
                </p>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/admin/mensagens-visitante">Editar mensagens ao visitante <ArrowRight className="w-3.5 h-3.5" /></Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="relatorios" className="mt-6"><CatalogoDeRelatorios /></TabsContent>
          <TabsContent value="historico" className="mt-6"><HistoricoDeExecucoes status={status} /></TabsContent>
          <TabsContent value="configuracoes" className="mt-6"><ConfiguracoesDeComunicacao /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
