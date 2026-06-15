import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart, Plus, Minus, Trash2, ArrowLeft, Loader2, CheckCircle2,
  Banknote, QrCode, CreditCard, Package, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  carregarCaixa,
  reabrirCaixa, listarProdutos, registrarVendaPDV,
  carregarResumoCaixa,
  type Caixa, type Produto, type FormaPagamento, type ItemVendaInput,
  type CaixaResumo,
} from "@/services/arrecadacaoService";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FORMA_ICONE: Record<FormaPagamento, any> = {
  dinheiro: Banknote, pix: QrCode,
  debito: CreditCard, credito: CreditCard, outros: ShoppingCart,
};
const FORMA_LABEL: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro", pix: "PIX",
  debito: "Débito", credito: "Crédito", outros: "Outros",
};

export default function CaixaPDV() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();

  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [reserva, setReserva] = useState<any>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [resumo, setResumo] = useState<CaixaResumo | null>(null);
  const [loading, setLoading] = useState(true);

  // Vendedor resolvido
  const [vendedor, setVendedor] = useState<{ id: string | null; nome: string } | null>(null);

  // Carrinho
  const [carrinho, setCarrinho] = useState<ItemVendaInput[]>([]);
  const [livreNome, setLivreNome] = useState("");
  const [livreValor, setLivreValor] = useState("");
  const [pagamento, setPagamento] = useState<FormaPagamento>("dinheiro");
  const [clienteNome, setClienteNome] = useState("");
  const [finalizando, setFinalizando] = useState(false);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const c = await carregarCaixa(id);
      if (!c) { toast.error("Caixa não encontrado"); nav("/arrecadacao"); return; }
      setCaixa(c);
      const { data: r } = await supabase
        .from("arr_reservas")
        .select("*, espaco:arr_espacos!espaco_id(id, codigo, nome)")
        .eq("id", c.reserva_id).single();
      setReserva(r);
      if (r?.espaco_id) {
        setProdutos((await listarProdutos(r.espaco_id)).filter(p => p.ativo));
      }
      setResumo(await carregarResumoCaixa(id));
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [id]);

  // Resolve vendedor via profiles.pessoa_id
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles").select("nome, pessoa_id" as any).eq("id", user.id).maybeSingle();
      const p = profile as any;
      if (p?.pessoa_id) {
        const { data: m } = await supabase
          .from("membros").select("nome_completo").eq("id", p.pessoa_id).maybeSingle();
        setVendedor({ id: p.pessoa_id, nome: m?.nome_completo ?? p.nome ?? user.email ?? "Vendedor" });
      } else {
        setVendedor({ id: null, nome: p?.nome ?? user.email ?? "Vendedor" });
      }
    })();
  }, [user?.id]);

  const total = carrinho.reduce((acc, i) => acc + i.subtotal, 0);

  function addCatalogo(item: Produto) {
    const idx = carrinho.findIndex(c => c.produto_id === item.id);
    if (idx >= 0) {
      ajustarQtd(idx, 1);
    } else {
      setCarrinho([...carrinho, {
        produto_id: item.id,
        descricao: item.nome,
        qtd: 1,
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
      descricao: livreNome, qtd: 1, preco_unit: v, subtotal: v,
    }]);
    setLivreNome(""); setLivreValor("");
  }

  function ajustarQtd(idx: number, delta: number) {
    const novo = [...carrinho];
    const item = novo[idx];
    const novaQtd = item.qtd + delta;
    if (novaQtd <= 0) { novo.splice(idx, 1); }
    else { item.qtd = novaQtd; item.subtotal = item.preco_unit * novaQtd; }
    setCarrinho(novo);
  }

  function remover(idx: number) { setCarrinho(carrinho.filter((_, i) => i !== idx)); }

  async function finalizar() {
    if (carrinho.length === 0) { toast.error("Carrinho vazio"); return; }
    if (!caixa || !vendedor) return;
    setFinalizando(true);
    try {
      await registrarVendaPDV(
        caixa.id, carrinho, pagamento, vendedor,
        { cliente_nome: clienteNome || undefined },
      );
      toast.success(`Venda de ${fmtBR(total)} registrada`);
      setCarrinho([]); setClienteNome("");
      setResumo(await carregarResumoCaixa(caixa.id));
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao registrar");
    } finally { setFinalizando(false); }
  }

  if (loading || !caixa) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  if (caixa.estado !== "aberto") {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <h2 className="font-serif text-xl">Caixa não está aberto</h2>
        <p className="text-sm text-muted-foreground">
          Estado atual: <Badge>{caixa.estado}</Badge>
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild variant="outline"><Link to={`/arrecadacao/reserva/${caixa.reserva_id}`}>Voltar à reserva</Link></Button>
          {caixa.estado === "fechado" && (
            <Button
              onClick={async () => {
                const motivo = prompt("Motivo da reabertura (opcional):") ?? undefined;
                if (motivo === null) return;
                try {
                  await reabrirCaixa(caixa.id, motivo || undefined);
                  toast.success("Caixa reaberto");
                  // Recarrega
                  const c = await carregarCaixa(caixa.id);
                  if (c) setCaixa(c);
                } catch (err: any) { toast.error(err?.message ?? "Erro"); }
              }}
              className="bg-amber-600 hover:bg-amber-700">
              Reabrir caixa
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-3">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/arrecadacao/reserva/${caixa.reserva_id}`}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg truncate">
            PDV — {reserva?.espaco?.nome} · {reserva?.finalidade}
          </h1>
          <p className="text-[10px] text-muted-foreground">
            Operador: {vendedor?.nome} ·
            Bruto: {fmtBR(resumo?.total_bruto ?? 0)} ·
            Líquido: {fmtBR(resumo?.saldo_virtual ?? 0)}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          {/* Catálogo */}
          {produtos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-gold" /> Cardápio / Produtos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {produtos.map(p => {
                    const semEstoque = p.estoque_atual != null && p.estoque_atual <= 0;
                    const baixo = p.estoque_atual != null && p.estoque_atual <= (p.estoque_minimo ?? 5);
                    return (
                      <button key={p.id}
                        onClick={() => !semEstoque && addCatalogo(p)}
                        disabled={semEstoque}
                        className={
                          "border-2 rounded-lg p-3 text-left transition active:scale-95 " +
                          (semEstoque
                            ? "opacity-40 cursor-not-allowed bg-muted"
                            : "hover:bg-emerald-50 hover:border-emerald-500 hover:shadow-md")
                        }>
                        <div className="text-sm font-medium leading-tight">{p.nome}</div>
                        <div className="text-lg md:text-xl font-serif text-emerald-700 font-semibold mt-1">
                          {fmtBR(p.preco_sugerido)}
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {p.subcategoria && (
                            <Badge variant="outline" className="text-[9px]">{p.subcategoria}</Badge>
                          )}
                          {semEstoque ? (
                            <Badge className="text-[9px] bg-rose-100 text-rose-700 border-rose-200">esgotado</Badge>
                          ) : baixo ? (
                            <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200">
                              restam {p.estoque_atual}
                            </Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
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
                  onChange={e => setLivreValor(e.target.value)} className="md:w-32" />
                <Button onClick={addLivre} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrinho */}
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
                        {fmtBR(it.preco_unit)} × {it.qtd}
                      </div>
                    </div>
                    <button onClick={() => ajustarQtd(idx, -1)} className="p-0.5 hover:bg-muted rounded">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-5 text-center text-xs">{it.qtd}</span>
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

            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-sm uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-xl font-serif font-medium">{fmtBR(total)}</span>
            </div>

            <div>
              <Label className="text-[11px]">Forma de pagamento</Label>
              <div className="grid grid-cols-3 gap-1 mt-1">
                {(["dinheiro","pix","debito","credito","outros"] as FormaPagamento[]).map(f => {
                  const Icon = FORMA_ICONE[f];
                  return (
                    <button key={f} onClick={() => setPagamento(f)}
                      className={
                        "border-2 rounded-lg p-2 text-xs flex flex-col items-center gap-1 transition active:scale-95 " +
                        (pagamento === f
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700 font-semibold shadow"
                          : "hover:bg-muted/30")
                      }>
                      <Icon className="w-4 h-4" />
                      {FORMA_LABEL[f]}
                    </button>
                  );
                })}
              </div>
            </div>

            {pagamento === "outros" && (
              <Input placeholder="Identificação do pagamento" value={clienteNome}
                onChange={e => setClienteNome(e.target.value)} className="text-xs" />
            )}

            <Button onClick={finalizar}
              disabled={finalizando || carrinho.length === 0}
              size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-base h-12 font-semibold">
              {finalizando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Finalizar venda
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
