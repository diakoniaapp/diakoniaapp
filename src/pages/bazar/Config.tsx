import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Settings, Loader2, Save, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { carregarBazarConfig, atualizarBazarConfig, type BazarConfig } from "@/services/bazarService";

export default function BazarConfigPage() {
  const [cfg, setCfg] = useState<BazarConfig | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregarBazarConfig().then(setCfg); }, []);

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    try {
      await atualizarBazarConfig({
        taxa_debito_pct: cfg.taxa_debito_pct,
        taxa_credito_pct: cfg.taxa_credito_pct,
        taxa_pix_pct: cfg.taxa_pix_pct,
        taxa_outros_pct: cfg.taxa_outros_pct,
        observacao: cfg.observacao,
      });
      toast.success("Configuração salva");
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  if (!cfg) return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild><Link to="/bazar"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <Settings className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Configuração do Bazar</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gold" /> Taxas de operação (%)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Configure as taxas cobradas pelas máquinas/serviços. Aplicadas a TODAS as campanhas
            ao calcular o líquido no fechamento de caixa.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Débito (%)">
              <Input type="number" step="0.01" value={cfg.taxa_debito_pct ?? ""}
                onChange={e => setCfg({...cfg, taxa_debito_pct: Number(e.target.value)})} />
            </Field>
            <Field label="Crédito (%)">
              <Input type="number" step="0.01" value={cfg.taxa_credito_pct ?? ""}
                onChange={e => setCfg({...cfg, taxa_credito_pct: Number(e.target.value)})} />
            </Field>
            <Field label="PIX (%)">
              <Input type="number" step="0.01" value={cfg.taxa_pix_pct ?? ""}
                onChange={e => setCfg({...cfg, taxa_pix_pct: Number(e.target.value)})} />
            </Field>
            <Field label="Outros (%)">
              <Input type="number" step="0.01" value={cfg.taxa_outros_pct ?? ""}
                onChange={e => setCfg({...cfg, taxa_outros_pct: Number(e.target.value)})} />
            </Field>
          </div>
          <Field label="Observação">
            <Textarea value={cfg.observacao ?? ""}
              onChange={e => setCfg({...cfg, observacao: e.target.value})}
              placeholder="Ex: PagSeguro · taxas a partir de 12/jun/2026" />
          </Field>
          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        Última atualização: {new Date(cfg.atualizado_em).toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
