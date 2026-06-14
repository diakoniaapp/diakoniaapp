import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, Plus, Minus, Trash2, CreditCard, Wallet, QrCode,
  ArrowLeft, Loader2, CheckCircle2, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  carregarCampanha, listarCatalogo, registrarVenda,
  type Campanha, type ItemCatalogo, type ItemVenda, type FormaPagamento,
} from "@/services/bazarService";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORMA_ICONE: Record<FormaPagamento, any> = {
  dinheiro: Banknote, pix: QrCode, cartao: CreditCard,
  debito: CreditCard, credito: CreditCard,
  fiado: Wallet, outros: ShoppingCart,
};
const FORMA_LABEL: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão",
  debito: "Débito", credito: "Crédito",
  fiado: "Fiado", outros: "Outros",
};

export default function Caixa() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [loading, setLoading] = useState(true);

  // Carrinho
  const [carrinho, setCarrinho] = useState<ItemVenda[]>([]);
  // Item livre (adicionado direto)
  const [livreNome, setLivreNome] = useState("");
  const [livreValor, setLivreValor] = useState("");
  // Forma de pagamento + finalização
  const [pagamento, setPagamento] = useState<FormaPagamento>("dinheiro");
  const [clienteNome, setClienteNome] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [vendedor, setVendedor] = useState<{ id: string | null; nome: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([carregarCampanha(id), listarCatalogo(id)])
      .then(([c, cat]) => { setCampanha(c); setCatalogo(cat.filter(x => x.ativo)); })
      .finally(() => setLoading(false));
  }, [id]);

  // Resolve quem é o vendedor: tenta pegar a pessoa vinculada ao profile.
  // Se o user logado não tem pessoa_id em profile, deixa vendedor_id NULL
  // e usa o e-mail como nome cosmético.
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome, pessoa_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.pessoa_id) {
        const { data: m } = await supabase
          .from("membros")
          .select("nome_completo")
          .eq("id", profile.pessoa_id)
          .maybeSingle();
        setVendedor({
          id: profile.pessoa_id,
          nome: m?.nome_completo ?? profile.nome ?? user.email ?? "Vendedor",
        });
      } else {
        // Sem pessoa vinculada — registra venda anônima
        setVendedor({ id: null, nome: profile?.nome ?? user.email ?? "Vendedor" });
      }
    })();
  }, [user?.id]);

  const total = carrinho.reduce((acc, i) => acc + i.subtotal, 0);

  function addCatalogo(item: ItemCatalogo) {
    const existente = carrinho.find(c => c.item_catalogo_id === item.id);
    if (existente) {
      ajustarQtd(carrinho.indexOf(existente), 1);
    } else {
      setCarrinho([...carrinho, {
        item_catalogo_id: item.id,
        descricao: item.nome,
        quantidade: 1,
        preco_unit: item.preco_sugerido,
        subtotal: item.preco_sugerido,
      }]);
    }
  }

  function addLivre() {
    const v = Number(livreValor.replace(",", "."));
    if (!livreNome.trim() || isNaN(v) || v <= 0) {
      toast.error("Informe nome e valor válidos"); return;
    }
    setCarrinho([...carrinho, {
      descricao: livreNome,
      quantidade: 1,
      preco_unit: v,
      subtotal: v,
    }]);
    setLivreNome(""); setLivreValor("");
  }

  function ajustarQtd(idx: number, delta: number) {
    const novo = [...carrinho];
    const item = novo[idx];
    const novaQtd = item.quantidade + delta;
    if (novaQtd <= 0) {
      novo.splice(idx, 1);
    } else {
      item.quantidade = novaQtd;
      item.subtotal = item.preco_unit * novaQtd;
    }
    setCarrinho(novo);
  }

  function remover(idx: number) {
    setCarrinho(carrinho.filter((_, i) => i !== idx));
  }

  async function finalizar() {
    if (carrinho.length === 0) { toast.error("Carrinho vazio"); return; }
    if (!campanha || !user) return;
    setFinalizando(true);
    try {
      await registrarVenda(
        campanha.id,
        carrinho,
        pagamento,
        vendedor ?? { id: null, nome: user.email ?? "Vendedor" },
        { cliente_nome: clienteNome || undefined },
      );
      toast.success(`Venda de ${fmtBR(total)} registrada`);
      setCarrinho([]); setClienteNome("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao registrar");
    } finally {
      setFinalizando(false);
    }
  }

  if (loading || !campanha) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  if (campanha.status !== "ativa") {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <h2 className="font-serif text-xl">Campanha não está ativa</h2>
        <p className="text-sm text-muted-foreground">
          Status atual: <Badge>{campanha.status}</Badge>
        </p>
        <Button asChild><Link to={`/bazar/campanha/${campanha.id}`}>Voltar à campanha</Link></Button>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-3">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/bazar/campanha/${campanha.id}`}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg truncate">PDV — {campanha.nome}</h1>
          <p className="text-[10px] text-muted-foreground">{vendedor?.nome ?? user?.email}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Catálogo + venda livre */}
        <div className="lg:col-span-2 space-y-3">
          {/* Catálogo */}
          {catalogo.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cardápio / Catálogo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {catalogo.map(item => (
                    <button key={item.id} onClick={() => addCatalogo(item)}
                      className="border rounded-md p-2 text-left hover:bg-emerald-50 hover:border-emerald-300 transition">
                      <div className="text-xs font-medium">{item.nome}</div>
                      <div className="text-base font-serif text-emerald-700">{fmtBR(item.preco_sugerido)}</div>
                      {item.categoria && (
                        <Badge variant="outline" className="text-[9px] mt-1">{item.categoria}</Badge>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Item livre */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Adicionar item livre</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-2">
                <Input placeholder="Descrição (ex: X-burguer)" value={livreNome}
                  onChange={e => setLivreNome(e.target.value)} className="flex-1" />
                <Input placeholder="R$ 0,00" value={livreValor}
                  onChange={e => setLivreValor(e.target.value)}
                  className="md:w-32" />
                <Button onClick={addLivre} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrinho + finalização */}
        <Card className="lg:sticky lg:top-3 h-fit">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-gold" /> Carrinho ({carrinho.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {carrinho.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Adicione itens pra iniciar a venda
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {carrinho.map((it, idx) => (
                  <li key={idx} className="flex items-center gap-1.5 text-xs border-b pb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{it.descricao}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtBR(it.preco_unit)} × {it.quantidade}
                      </div>
                    </div>
                    <button onClick={() => ajustarQtd(idx, -1)} className="p-0.5 hover:bg-muted rounded">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-xs">{it.quantidade}</span>
                    <button onClick={() => ajustarQtd(idx, +1)} className="p-0.5 hover:bg-muted rounded">
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="w-16 text-right font-medium tabular-nums">{fmtBR(it.subtotal)}</span>
                    <button onClick={() => remover(idx)} className="p-0.5 hover:bg-rose-50 rounded text-rose-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Total */}
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-sm uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-xl font-serif font-medium">{fmtBR(total)}</span>
            </div>

            {/* Forma de pagamento */}
            <div>
              <Label className="text-[11px]">Forma de pagamento</Label>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {(["dinheiro","pix","debito","credito","fiado"] as FormaPagamento[]).map(f => {
                  const Icon = FORMA_ICONE[f];
                  return (
                    <button key={f} onClick={() => setPagamento(f)}
                      className={
                        "border rounded-md p-1.5 text-xs flex flex-col items-center gap-0.5 transition " +
                        (pagamento === f ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium" : "hover:bg-muted/30")
                      }>
                      <Icon className="w-3.5 h-3.5" />
                      {FORMA_LABEL[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            {pagamento === "fiado" && (
              <Input placeholder="Nome do cliente (fiado)" value={clienteNome}
                onChange={e => setClienteNome(e.target.value)} className="text-xs" />
            )}

            <Button onClick={finalizar}
              disabled={finalizando || carrinho.length === 0}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              {finalizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Finalizar venda
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
