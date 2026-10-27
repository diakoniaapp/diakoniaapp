// ─── CatalogoDeRelatorios — aba Relatórios da Central de Comunicação ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O envio de relatório por e-mail (escolher → período → destinatários → prévia obrigatória → enviar, com histórico) é a Fase 4 do roadmap e AINDA NÃO EXISTE. Esta aba mostra o catálogo do que será
// enviado e leva à tela onde cada relatório já funciona hoje; ela diz claramente que o envio está por vir, em vez de exibir um botão que não faz nada.
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Info } from "lucide-react";
import { CATALOGO_DE_RELATORIOS } from "@/lib/comunicacao";

export function CatalogoDeRelatorios() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed" data-aviso="envio-em-breve">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          O <strong>envio por e-mail</strong> de relatórios, com prévia obrigatória e histórico de quem recebeu, está em construção. Por enquanto cada relatório abre na sua tela, onde dá para
          visualizar, exportar e imprimir.
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
                <Badge variant="outline" className="shrink-0 text-[10px]">Envio por e-mail em breve</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">{r.descricao}</p>
              <p className="text-xs text-muted-foreground">Hoje na tela: {r.formatos.join(" · ")}</p>
              <Button asChild variant="outline" size="sm" className="self-start gap-1.5">
                <Link to={r.rota}>Abrir <ArrowRight className="w-3.5 h-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
