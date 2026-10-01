// ─── PendenciasCategorizacaoDrawer.tsx ───────────────────────────────────
//
// Central de Pendências de Categorização — Fase 1 do pedido dela
// (01/10/2026). A Prestação de Contas já calculava, a cada vez que
// rodava, QUAIS lançamentos ficam de fora da demonstração por precisar
// de categorização (`gerarPrestacaoContas` → `dados.excluidos.itens`,
// ver o comentário grande de `MotivoExclusao` em
// `prestacaoContasService.ts`) — só não existia nenhum jeito de AGIR
// sobre essa lista, só de ver a contagem. Esta é essa ação: listar,
// editar um por um (reaproveitando o `LancamentoForm` que já existe,
// sem formulário novo) e corrigir em lote (categoria/centro de uma vez
// pra vários lançamentos do mesmo fornecedor, por exemplo).
//
// Deliberadamente FORA desta v1 (pedido dela, escopo combinado
// 01/10/2026): sugestão automática por fornecedor→categoria (o motor de
// hoje só aprende centro a partir de uma categoria já certa — a maioria
// das pendências medidas não tem NENHUMA categoria, esse motor não
// serve) e "ignorar com motivo" (precisaria de uma coluna nova em
// `fin_lancamentos` — só vale a pena se ela de fato bater um caso real
// de lançamento que precise ficar permanentemente fora da lista).
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  brl, listarCategorias, listarCentrosCusto, atualizarCategoriaCentroEmLote,
  type FinCategoria, type FinCentroCusto, type FinLancamentoExtenso,
} from "@/services/finService";
import { MOTIVO_EXCLUSAO_LABEL, type LancamentoExcluido } from "@/services/prestacaoContasService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";

function dataBr(s: string): string {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR");
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itens: LancamentoExcluido[];
  /** Chamado depois de uma edição/aplicação em lote — a tela de trás
   *  (Prestação de Contas) recalcula e manda a lista atualizada de volta
   *  via `itens`, igual já faz hoje ao reabrir a Nota. */
  onChange: () => void;
}

export function PendenciasCategorizacaoDrawer({ open, onOpenChange, itens, onChange }: Props) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [categoriaLote, setCategoriaLote] = useState("");
  const [centroLote, setCentroLote] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelecionados(new Set());
    setCategoriaLote(""); setCentroLote("");
    listarCategorias().then(setCategorias);
    listarCentrosCusto().then(setCentros);
  }, [open]);

  function alternar(id: string) {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados(prev => prev.size === itens.length ? new Set() : new Set(itens.map(i => i.id)));
  }

  async function aplicarLote() {
    if (selecionados.size === 0 || (!categoriaLote && !centroLote)) return;
    setAplicando(true);
    try {
      await atualizarCategoriaCentroEmLote(Array.from(selecionados), {
        categoriaId: categoriaLote || undefined,
        centroCustoId: centroLote || undefined,
      });
      const n = selecionados.size;
      toast.success(`${n} lançamento${n > 1 ? "s" : ""} corrigido${n > 1 ? "s" : ""}`);
      setSelecionados(new Set()); setCategoriaLote(""); setCentroLote("");
      onChange();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível aplicar em lote.");
    } finally {
      setAplicando(false);
    }
  }

  const valorTotal = itens.reduce((s, i) => s + i.valor, 0);
  const valorSelecionado = itens.filter(i => selecionados.has(i.id)).reduce((s, i) => s + i.valor, 0);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b space-y-1">
            <SheetTitle>Pendências de Categorização</SheetTitle>
            <SheetDescription>
              {itens.length} lançamento{itens.length !== 1 ? "s" : ""} precisa{itens.length !== 1 ? "m" : ""} de categorização
              {" "}— {brl(valorTotal)} no total.
            </SheetDescription>
          </SheetHeader>

          {/* Barra de ação em lote — só aparece com alguma linha marcada,
              mesmo padrão de seleção em lote já usado em
              `ExtratoContaDrawer`/`FinancasConta`. */}
          {selecionados.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-3 border-b bg-muted/30">
              <span className="text-xs text-muted-foreground shrink-0">
                {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""} ({brl(valorSelecionado)})
              </span>
              <Select value={categoriaLote || "__manter__"} onValueChange={(v) => setCategoriaLote(v === "__manter__" ? "" : v)}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manter__">Manter categoria</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={centroLote || "__manter__"} onValueChange={(v) => setCentroLote(v === "__manter__" ? "" : v)}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Centro de custo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manter__">Manter centro</SelectItem>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="gold" className="gap-1.5 h-8 text-xs"
                disabled={aplicando || (!categoriaLote && !centroLote)} onClick={aplicarLote}>
                {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Aplicar
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {itens.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground italic">
                Nenhuma pendência — tudo categorizado.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 py-2 px-2">
                      <Checkbox checked={selecionados.size > 0 && selecionados.size === itens.length}
                        onCheckedChange={alternarTodos} aria-label="Selecionar todos" />
                    </th>
                    <th className="text-left py-2 px-2 w-20">Data</th>
                    <th className="text-left py-2 px-2">Descrição / Fornecedor</th>
                    <th className="text-left py-2 px-2 w-32">Conta</th>
                    <th className="text-left py-2 px-2 w-36">Categoria atual</th>
                    <th className="text-left py-2 px-2 w-32">Centro atual</th>
                    <th className="text-left py-2 px-2 w-40">Problema</th>
                    <th className="text-right py-2 px-2 w-24">Valor</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map(i => (
                    <tr key={i.id} className="border-t hover:bg-muted/30">
                      <td className="py-1.5 px-2">
                        <Checkbox checked={selecionados.has(i.id)} onCheckedChange={() => alternar(i.id)}
                          aria-label={`Selecionar ${i.favorecido}`} />
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">{dataBr(i.data)}</td>
                      <td className="py-1.5 px-2 min-w-[160px]">
                        <p className="font-medium truncate">{i.favorecido}</p>
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground truncate">{i.contaNome}</td>
                      <td className="py-1.5 px-2 text-muted-foreground truncate">{i.categoriaNome ?? "—"}</td>
                      <td className="py-1.5 px-2 text-muted-foreground truncate">{i.centroNome ?? "—"}</td>
                      <td className="py-1.5 px-2">
                        <Badge variant="outline" className="text-xs max-w-full truncate border-warning-line text-warning-text">
                          {MOTIVO_EXCLUSAO_LABEL[i.motivo]}
                        </Badge>
                      </td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap ${i.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                        {i.tipo === "entrada" ? "+" : "−"} {brl(i.valor)}
                      </td>
                      <td className="py-1.5 px-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => setEditando(i.lancamento)} title="Editar lançamento">
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <LancamentoForm
        open={!!editando}
        onOpenChange={(v) => !v && setEditando(null)}
        lancamento={editando}
        onSaved={() => { setEditando(null); onChange(); }}
      />
    </>
  );
}
