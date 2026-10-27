// ─── ConfiguracoesDeComunicacao — aba Configurações da Central de Comunicação ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Mostra, em palavras, quem manda os e-mails automáticos, para onde vai a RESPOSTA e qual é a regra do saldo — as três coisas que ela decidiu em 27/10/2026 (Fase 1). Nada aqui grava: o endereço de
// resposta é editado em Identidade da Igreja (fonte única do que é institucional); esta aba só LÊ e leva até lá.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Reply, Scale, ArrowRight } from "lucide-react";
import { carregarEnderecosDeResposta } from "@/services/sistemaService";
import { DIAS_ATE_AVISAR, REMETENTE_AUTOMATICO, REMETENTE_RELATORIOS, TIPOS_DE_ENVIO, enderecoDeResposta, textoDaNotaDeResposta } from "@/lib/comunicacao";

export interface ServicoDasConfiguracoes { carregarEnderecos: typeof carregarEnderecosDeResposta }
const SERVICO_REAL: ServicoDasConfiguracoes = { carregarEnderecos: carregarEnderecosDeResposta };

export function ConfiguracoesDeComunicacao({ servico = SERVICO_REAL }: { servico?: ServicoDasConfiguracoes } = {}) {
  const [enderecos, setEnderecos] = useState<{ email_resposta: string | null; email_contato: string | null } | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    servico.carregarEnderecos().then(e => { if (vivo) setEnderecos(e); }).catch(() => { if (vivo) { setEnderecos({ email_resposta: null, email_contato: null }); setErro(true); } });
    return () => { vivo = false; };
  }, [servico]);

  const respondeA = enderecos ? enderecoDeResposta(enderecos) : null;
  const doCampoProprio = !!enderecos?.email_resposta && respondeA === enderecos.email_resposta;

  return (
    <div className="space-y-4">
      <Card className="shadow-card-soft" data-cartao="remetente">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg"><Mail className="w-4 h-4 text-gold" /> Quem envia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Resumos e alertas saem de <strong data-remetente="automatico">{REMETENTE_AUTOMATICO}</strong>.</p>
          <p className="text-xs text-muted-foreground">
            Reservado aos relatórios sob demanda: <span data-remetente="relatorios">{REMETENTE_RELATORIOS}</span>. O domínio já é verificado, então não exige configuração nova.
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
            {TIPOS_DE_ENVIO.map(t => (<li key={t.id}><strong>{t.rotulo}</strong> — para {t.destinatarios}</li>))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-card-soft" data-cartao="resposta">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg"><Reply className="w-4 h-4 text-gold" /> Para onde vai a resposta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!enderecos ? (
            <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
          ) : respondeA ? (
            <p data-resposta="configurada">
              Quem responder a um e-mail do sistema escreve para <strong>{respondeA}</strong>
              <span className="text-muted-foreground"> {doCampoProprio ? "(campo “Responder para” da Identidade)" : "(o e-mail de contato da Identidade — não há “Responder para” preenchido)"}</span>.
            </p>
          ) : (
            <p data-resposta="nenhuma" className="text-warning-text">
              Nenhum endereço de resposta definido: os e-mails saem pedindo para <strong>não responder</strong>.{erro ? " (Não foi possível ler a Identidade agora.)" : ""}
            </p>
          )}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed" data-rodape>
            <p className="font-medium text-foreground mb-0.5">O rodapé que a pessoa lê</p>
            <p>{textoDaNotaDeResposta(respondeA)}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/admin/identidade">Editar em Identidade da Igreja <ArrowRight className="w-3.5 h-3.5" /></Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card-soft" data-cartao="regra-saldo">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg"><Scale className="w-4 h-4 text-gold" /> Regra do saldo das contas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm leading-relaxed">
          <p><strong>Resumo diário:</strong> não leva saldo.</p>
          <p><strong>Resumo semanal:</strong> mostra o saldo de uma conta de banco só se o último extrato importado tem <strong>até {DIAS_ATE_AVISAR} dias</strong>. Se estiver mais velho, o saldo daquela conta
            é <strong>ocultado</strong> e o e-mail diz até quando vai o banco, para evitar decisões sobre um número desatualizado.</p>
          <p className="text-xs text-muted-foreground">A regra vale por conta (uma pode estar em dia e outra não) e o caixa físico, que não tem extrato, sempre aparece. O limite está fixo no código; torná-lo ajustável aqui é uma etapa futura.</p>
        </CardContent>
      </Card>
    </div>
  );
}
