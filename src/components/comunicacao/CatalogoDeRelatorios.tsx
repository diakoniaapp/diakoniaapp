// ─── CatalogoDeRelatorios — aba Relatórios da Central de Comunicação ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cada relatório aponta para a tela onde já funciona. Os que a Central JÁ envia por e-mail (hoje: Doadores e dizimistas, só agregado) ganham o botão "Enviar por e-mail", que abre a gaveta com período,
// destinatários e prévia obrigatória; os demais dizem claramente que o envio está por vir, em vez de exibir um botão que não faz nada. A gaveta também abre por `?enviar=doadores&de=&ate=` (o botão
// "Enviar relatório" da tela Doadores leva o período que a pessoa estava vendo).
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Info, Send } from "lucide-react";
import { CATALOGO_DE_RELATORIOS } from "@/lib/comunicacao";
import { EnviarRelatorioDeContribuicoes, type ServicoDoEnvio } from "./EnviarRelatorioDeContribuicoes";

const ehData = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function CatalogoDeRelatorios({ servicoDoEnvio, aoEnviar }: { servicoDoEnvio?: ServicoDoEnvio; aoEnviar?: () => void }) {
  const [params, setParams] = useSearchParams();
  const [aberta, setAberta] = useState(params.get("enviar") === "doadores");
  const de = params.get("de"), ate = params.get("ate");
  const periodoInicial = ehData(de) && ehData(ate) ? { ini: de!, fim: ate! } : null;

  function fechar() {
    setAberta(false);
    if (params.has("enviar")) { const p = new URLSearchParams(params); ["enviar", "de", "ate"].forEach(k => p.delete(k)); setParams(p, { replace: true }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed" data-aviso="envio-em-breve">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          O <strong>envio por e-mail</strong> já funciona para <strong>Doadores e dizimistas</strong> (só números agregados, com prévia obrigatória e registro no Histórico). Os demais relatórios ainda abrem só na
          sua tela, onde dá para visualizar, exportar e imprimir; o envio deles está em construção.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATALOGO_DE_RELATORIOS.map(r => (
          <Card key={r.id} className="shadow-card-soft" data-relatorio={r.id}>
            <CardContent className="p-4 flex flex-col gap-2.5 h-full">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <p className="font-serif text-base font-semibold flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-gold shrink-0" /> <span className="truncate">{r.titulo}</span>
                </p>
                {r.envioPorEmail === "em_breve" && <Badge variant="outline" className="shrink-0 text-[10px]">Envio por e-mail em breve</Badge>}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">{r.descricao}</p>
              <p className="text-xs text-muted-foreground">Hoje: {r.formatos.join(" · ")}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to={r.rota}>Abrir <ArrowRight className="w-3.5 h-3.5" /></Link></Button>
                {r.id === "doadores" && r.envioPorEmail === "disponivel" && (
                  <Button size="sm" className="gap-1.5" onClick={() => setAberta(true)} data-acao="enviar-doadores"><Send className="w-3.5 h-3.5" /> Enviar por e-mail</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {aberta && <EnviarRelatorioDeContribuicoes aberto aoFechar={fechar} aoEnviar={aoEnviar} periodoInicial={periodoInicial} servico={servicoDoEnvio} />}
    </div>
  );
}
