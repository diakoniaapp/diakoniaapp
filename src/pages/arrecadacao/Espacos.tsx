import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings, Loader2, Save, ShoppingBag, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { listarEspacos, atualizarTaxasEspaco, atualizarResponsavelEspaco, type Espaco } from "@/services/arrecadacaoService";

export default function ArrecadacaoEspacos() {
  const [espacos, setEspacos] = useState<Espaco[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => { listarEspacos().then(setEspacos).finally(() => setLoading(false)); }, []);

  async function salvar(esp: Espaco) {
    setSalvandoId(esp.id);
    try {
      await atualizarTaxasEspaco(esp.id, {
        taxa_debito_pct: esp.taxa_debito_pct,
        taxa_credito_pct: esp.taxa_credito_pct,
        taxa_pix_pct: esp.taxa_pix_pct,
      });
      toast.success(`${esp.nome} atualizado`);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvandoId(null); }
  }

  function atualizar(id: string, patch: Partial<Espaco>) {
    setEspacos(espacos.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Settings className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Configuração dos espaços</h1>
      </header>

      <p className="text-xs text-muted-foreground">
        Taxas configuradas aqui são aplicadas em cada caixa novo (snapshot).
        Caixas já abertos preservam as taxas que tinham no momento da abertura.
      </p>

      {espacos.map(e => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-gold" /> {e.nome}
              <span className="text-[10px] text-muted-foreground font-normal ml-auto">{e.codigo}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {e.descricao && <p className="text-xs text-muted-foreground">{e.descricao}</p>}
            <div className="grid grid-cols-3 gap-2">
              <Field label="Taxa débito (%)">
                <Input type="number" step="0.01" value={e.taxa_debito_pct}
                  onChange={ev => atualizar(e.id, { taxa_debito_pct: Number(ev.target.value) })} />
              </Field>
              <Field label="Taxa crédito (%)">
                <Input type="number" step="0.01" value={e.taxa_credito_pct}
                  onChange={ev => atualizar(e.id, { taxa_credito_pct: Number(ev.target.value) })} />
              </Field>
              <Field label="Taxa PIX (%)">
                <Input type="number" step="0.01" value={e.taxa_pix_pct}
                  onChange={ev => atualizar(e.id, { taxa_pix_pct: Number(ev.target.value) })} />
              </Field>
            </div>
            <div className="border-t pt-3 mt-3 space-y-2">
              <Label className="text-[11px] text-muted-foreground">Responsável pela manutenção (recebe WhatsApp)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nome do responsável" value={(e as any).responsavel_manutencao_nome ?? ""}
                  onChange={ev => atualizar(e.id, { responsavel_manutencao_nome: ev.target.value } as any)} />
                <Input placeholder="WhatsApp (21) 99999-9999" value={(e as any).whatsapp_manutencao ?? ""}
                  onChange={ev => atualizar(e.id, { whatsapp_manutencao: ev.target.value } as any)} />
              </div>
              <Button size="sm" variant="outline" className="w-full gap-2"
                onClick={async () => {
                  try {
                    await atualizarResponsavelEspaco(
                      e.id,
                      (e as any).responsavel_manutencao_nome ?? null,
                      (e as any).whatsapp_manutencao ?? null,
                    );
                    toast.success("Responsável atualizado");
                  } catch (err: any) { toast.error(err?.message ?? "Erro"); }
                }}>
                <Save className="w-3.5 h-3.5" /> Salvar responsável
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => salvar(e)} disabled={salvandoId === e.id} className="gap-2">
                {salvandoId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar taxas
              </Button>
              <Button size="sm" variant="outline" asChild className="gap-2">
                <Link to={`/arrecadacao/produtos/${e.id}`}>
                  <Package className="w-3.5 h-3.5" /> Produtos
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
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
