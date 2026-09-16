import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, DollarSign, Loader2, Plus, Pencil, Trash2,
  Wallet, Tag, Layers, RotateCcw, PowerOff,
  TrendingUp, TrendingDown,
  Building2, CreditCard, PiggyBank, Mail, Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarContas, desativarConta, reativarConta, excluirConta,
  listarCategoriasTodas, excluirCategoria, atualizarCategoria, contarLancamentosPorCategoria,
  listarCentrosCustoTodas, atualizarCentroCusto, excluirCentroCusto, contarLancamentosPorCentro,
  VINCULO_LABEL, VINCULO_COR,
  CONTA_TIPO_LABEL, brl,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinCentroVinculo,
} from "@/services/finService";
import { usePermissoes } from "@/hooks/usePermissoes";
import { ContaForm } from "@/components/financas/ContaForm";
import { CategoriaForm } from "@/components/financas/CategoriaForm";
import { CentroCustoForm } from "@/components/financas/CentroCustoForm";
import { PaginaSkeleton } from "@/components/ListState";

const ICONE_CONTA: Record<string, JSX.Element> = {
  caixa:     <Wallet className="w-4 h-4" />,
  banco:     <Building2 className="w-4 h-4" />,
  cartao:    <CreditCard className="w-4 h-4" />,
  envelope:  <Mail className="w-4 h-4" />,
  aplicacao: <PiggyBank className="w-4 h-4" />,
  cofre:     <Coins className="w-4 h-4" />,
  pix:       <Wallet className="w-4 h-4" />,
};

export default function FinancasAdmin() {
  // "estruturar_financeiro": criar centro de custo à mão e excluir
  // centro/categoria mesmo em uso — pedido da Telma (16/09/2026), "quero
  // eu mesma configurar... para os demais perfis de acesso isso fica
  // desativado". Medido antes: a tela hoje é aberta por QUALQUER papel de
  // ROLES_FINANCEIRO (admin, diakonia, secretaria, tesouraria) — Caio
  // (admin), Lourdes (secretaria) e Bruno (tesouraria) já chegam aqui.
  // Um papel novo, "proprietario", só a Telma tem — ver migration
  // 20260916000100. Editar (Pencil) e ativar/desativar continuam pra
  // quem já usa a tela hoje; só criar/excluir centro e categoria ficam
  // atrás desta permissão.
  const { podeFazer } = usePermissoes();
  const podeEstruturar = podeFazer("estruturar_financeiro");

  const [contas, setContas] = useState<FinConta[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [loading, setLoading] = useState(true);

  const [contaOpen, setContaOpen] = useState(false);
  const [contaEdit, setContaEdit] = useState<FinConta | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<FinCategoria | null>(null);

  const [ccOpen, setCcOpen] = useState(false);
  const [ccEdit, setCcEdit] = useState<FinCentroCusto | null>(null);

  // Um `AlertDialog` só pras 3 exclusões (conta/categoria/centro) — até
  // 15/09/2026 cada uma usava `confirm()` nativo, que a Telma reportou
  // "não consigo excluir" pra categoria: `confirm()` não dispara diálogo
  // nenhum em WebView, devolve falso na hora, e o código lia isso como
  // "cancelou" — sem erro, sem aviso (CLAUDE.md Risco 3). Reproduzido ao
  // vivo neste navegador: console mostrava "Page dialog suppressed
  // (confirm)... confirm() returned false". `excluirCentroCusto`, novo
  // nesta mesma sessão, já tinha nascido certo (AlertDialog); as duas
  // antigas foram convertidas agora, pro mesmo padrão.
  const [apagando, setApagando] = useState<
    | { tipo: "conta"; item: FinConta }
    | { tipo: "categoria"; item: FinCategoria }
    | { tipo: "centro"; item: FinCentroCusto }
    | null
  >(null);
  const [excluindoBusy, setExcluindoBusy] = useState(false);
  // Quantos lançamentos usam o item que está pra ser excluído — null
  // enquanto conta, 0 quando não tem nenhum. `excluirCategoria`/
  // `excluirCentroCusto` NUNCA foram bloqueados pelo banco pra este caso
  // (`ON DELETE SET NULL`, não RESTRICT — ver o comentário corrigido em
  // finService.ts), então a contagem precisa vir ANTES de perguntar, não
  // depois de um erro que nunca ia acontecer.
  const [impactoExclusao, setImpactoExclusao] = useState<number | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, ks, ccs] = await Promise.all([
        listarContas(true),  // incluir inativas
        listarCategoriasTodas(),
        listarCentrosCustoTodas(),
      ]);
      setContas(cs);
      setCategorias(ks);
      setCentros(ccs);
    } finally { setLoading(false); }
  }

  async function toggleConta(c: FinConta) {
    try {
      if (c.ativo) await desativarConta(c.id);
      else         await reativarConta(c.id);
      toast.success(c.ativo ? "Conta desativada" : "Conta reativada");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  function pedirRemoverConta(c: FinConta) {
    setApagando({ tipo: "conta", item: c });
    setImpactoExclusao(null); // fora do escopo deste recurso — conta continua com a proteção de sempre
  }

  async function toggleCategoria(k: FinCategoria) {
    try {
      await atualizarCategoria(k.id, { ativo: !k.ativo });
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  // "Categoria do sistema — só dá pra desativar" continua valendo pra
  // quem NÃO tem `estruturar_financeiro`. Pedido da Telma (16/09/2026,
  // "ainda estamos em ambiente de teste, quero... ter opção de excluir
  // categorias"): pra quem tem a permissão, `sistema` deixa de travar —
  // 64 das 68 categorias hoje são `sistema=true` (o Plano de Contas
  // Oficial inteiro), então travar por esse flag também pra proprietária
  // esvaziava o pedido original de "eu mesma configuro".
  async function pedirRemoverCategoria(k: FinCategoria) {
    if (k.sistema && !podeEstruturar) { toast.error("Categoria do sistema — só dá pra desativar"); return; }
    setApagando({ tipo: "categoria", item: k });
    setImpactoExclusao(await contarLancamentosPorCategoria(k.id));
  }

  async function toggleCentro(c: FinCentroCusto) {
    try {
      await atualizarCentroCusto(c.id, { ativo: !c.ativo });
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function pedirRemoverCentro(c: FinCentroCusto) {
    setApagando({ tipo: "centro", item: c });
    setImpactoExclusao(await contarLancamentosPorCentro(c.id));
  }

  // `e.preventDefault()`: `AlertDialogAction` é um `DialogPrimitive.Close`
  // por baixo do Radix — fecha o diálogo no clique, síncrono, antes de
  // qualquer `await` deste handler rodar (achado numa revisão em
  // 13/09/2026, ver FinancasConta.tsx). Sem isto, um erro de exclusão
  // mostraria o toast com o diálogo já fechado.
  async function confirmarExcluir(e: React.MouseEvent) {
    e.preventDefault();
    if (!apagando) return;
    setExcluindoBusy(true);
    try {
      if (apagando.tipo === "conta") {
        await excluirConta(apagando.item.id);
        toast.success("Conta excluída");
      } else if (apagando.tipo === "categoria") {
        await excluirCategoria(apagando.item.id);
        toast.success("Categoria excluída");
      } else {
        await excluirCentroCusto(apagando.item.id);
        toast.success("Centro de custo excluído");
      }
      setApagando(null);
      setImpactoExclusao(null);
      await carregar();
    } catch (e: any) {
      const msgPorTipo = {
        conta: "Não foi possível excluir (provavelmente tem lançamentos). Use 'Desativar'.",
        categoria: "Categoria em uso por rateio, orçamento ou fornecedor padrão — desative em vez de excluir.",
        centro: "Centro em uso por rateio, reserva ou fornecedor padrão — desative em vez de excluir.",
      };
      toast.error(msgPorTipo[apagando.tipo]);
    } finally { setExcluindoBusy(false); }
  }

  const entradas = categorias.filter(c => c.tipo === "entrada");
  const saidas   = categorias.filter(c => c.tipo === "saida");

  // Agrupado por vínculo — "ministerio" e "subgrupo_administracao" juntos
  // primeiro (é a estrutura do Plano de Contas Oficial), depois os
  // demais tipos (área, EBD, PGM, campanha, geral) na ordem de
  // `VINCULO_LABEL`.
  const centrosPorTipo = (Object.keys(VINCULO_LABEL) as FinCentroVinculo[])
    .map(tipo => ({ tipo, lista: centros.filter(c => c.vinculo_tipo === tipo) }))
    .filter(g => g.lista.length > 0);

  if (loading) {
    return <PaginaSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gold" /> Configurações financeiras
          </h1>
          <p className="text-xs text-muted-foreground">
            Cadastre e personalize suas contas e o plano de contas da igreja.
          </p>
        </div>
      </div>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas" className="gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Contas ({contas.length})
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Categorias ({categorias.length})
          </TabsTrigger>
          <TabsTrigger value="centros" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Centros de custo ({centros.length})
          </TabsTrigger>
        </TabsList>

        {/* ── ABA CONTAS ─────────────────────────────────────────── */}
        <TabsContent value="contas" className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setContaEdit(null); setContaOpen(true); }}
              className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Plus className="w-3.5 h-3.5" /> Nova conta
            </Button>
          </div>

          {contas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma conta cadastrada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {contas.map(c => (
                <div key={c.id}
                  className={`flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30 ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-border"
                      style={{ background: (c.cor ?? "#cfa451") + "22", color: c.cor ?? "#cfa451" }}>
                      {ICONE_CONTA[c.tipo] ?? <Wallet className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* `<div>`, não `<p>`: `Badge` é sempre um `<div>`
                          (ver `components/ui/badge.tsx`), e `<div>` dentro
                          de `<p>` é HTML inválido. */}
                      <div className="font-medium text-sm truncate flex items-center gap-1.5">
                        {c.nome}
                        {!c.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Desativada</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {CONTA_TIPO_LABEL[c.tipo]}
                        {c.banco_nome && ` · ${c.banco_nome}`}
                        {c.conta_numero && ` · Ag ${c.agencia ?? "-"} / CC ${c.conta_numero}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-sm font-semibold tabular-nums">{brl(Number(c.saldo_atual))}</p>
                    <p className="text-xs text-muted-foreground">
                      Inicial: {brl(Number(c.saldo_inicial))}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setContaEdit(c); setContaOpen(true); }} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => toggleConta(c)}
                      title={c.ativo ? "Desativar" : "Reativar"}>
                      {c.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => pedirRemoverConta(c)} title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ABA CATEGORIAS ─────────────────────────────────────── */}
        <TabsContent value="categorias" className="space-y-3">
          {podeEstruturar && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setCatEdit(null); setCatOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
                <Plus className="w-3.5 h-3.5" /> Nova categoria
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ENTRADAS */}
            <Card>
              <CardContent className="py-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5 text-success-text">
                  <TrendingUp className="w-3.5 h-3.5" /> Entradas ({entradas.length})
                </p>
                {entradas.map(k => (
                  <CategoriaLinha key={k.id} k={k}
                    onEdit={() => { setCatEdit(k); setCatOpen(true); }}
                    onToggle={() => toggleCategoria(k)}
                    onDelete={podeEstruturar ? () => pedirRemoverCategoria(k) : undefined} />
                ))}
              </CardContent>
            </Card>

            {/* SAÍDAS */}
            <Card>
              <CardContent className="py-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5 text-destructive-text">
                  <TrendingDown className="w-3.5 h-3.5" /> Saídas ({saidas.length})
                </p>
                {saidas.map(k => (
                  <CategoriaLinha key={k.id} k={k}
                    onEdit={() => { setCatEdit(k); setCatOpen(true); }}
                    onToggle={() => toggleCategoria(k)}
                    onDelete={podeEstruturar ? () => pedirRemoverCategoria(k) : undefined} />
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            {podeEstruturar
              ? "Categoria do sistema também pode ser excluída por aqui — o diálogo avisa antes. Categoria em uso mostra quantos lançamentos ficarão sem classificação."
              : "Categorias do sistema não podem ser excluídas — só desativadas. Criar e excluir categoria é restrito à administradora do sistema."}
          </p>
        </TabsContent>

        {/* ── ABA CENTROS DE CUSTO ───────────────────────────────── */}
        <TabsContent value="centros" className="space-y-3">
          {podeEstruturar && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setCcEdit(null); setCcOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
                <Plus className="w-3.5 h-3.5" /> Novo centro de custo
              </Button>
            </div>
          )}

          {centrosPorTipo.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhum centro de custo cadastrado.
              </CardContent>
            </Card>
          ) : (
            centrosPorTipo.map(({ tipo, lista }) => (
              <Card key={tipo}>
                <CardContent className="py-3 space-y-1.5">
                  {/* `<div>`, não `<p>`: `Badge` é sempre um `<div>` (ver
                      components/ui/badge.tsx), e `<div>` dentro de `<p>` é
                      HTML inválido — mesmo cuidado já registrado na aba
                      Contas logo acima. */}
                  <div className="text-xs font-medium">
                    <Badge variant="outline" className={`text-xs ${VINCULO_COR[tipo]}`}>
                      {VINCULO_LABEL[tipo]}
                    </Badge>
                    <span className="text-muted-foreground ml-1.5">({lista.length})</span>
                  </div>
                  {lista.map(c => (
                    <CentroLinha key={c.id} c={c}
                      onEdit={() => { setCcEdit(c); setCcOpen(true); }}
                      onToggle={() => toggleCentro(c)}
                      onDelete={podeEstruturar ? () => pedirRemoverCentro(c) : undefined} />
                  ))}
                </CardContent>
              </Card>
            ))
          )}

          <p className="text-xs text-muted-foreground text-center">
            {podeEstruturar
              ? "Os demais centros nascem sozinhos, sincronizados a partir de ministérios, áreas, classes EBD, grupos de PGM e campanhas — \"Geral\" é o único tipo criável à mão. Centro em uso mostra quantos lançamentos ficarão sem centro de custo antes de confirmar."
              : "Centros de custo nascem sozinhos, sincronizados a partir de ministérios, áreas, classes EBD, grupos de PGM e campanhas. Criar e excluir centro é restrito à administradora do sistema."}
          </p>
        </TabsContent>
      </Tabs>

      <ContaForm
        open={contaOpen}
        onOpenChange={(v) => { setContaOpen(v); if (!v) setContaEdit(null); }}
        conta={contaEdit}
        onSaved={carregar}
      />
      <CategoriaForm
        open={catOpen}
        onOpenChange={(v) => { setCatOpen(v); if (!v) setCatEdit(null); }}
        categoria={catEdit}
        onSaved={carregar}
      />
      <CentroCustoForm
        open={ccOpen}
        onOpenChange={(v) => { setCcOpen(v); if (!v) setCcEdit(null); }}
        centro={ccEdit}
        onSaved={carregar}
      />

      <AlertDialog open={!!apagando} onOpenChange={(v) => { if (!v) { setApagando(null); setImpactoExclusao(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {apagando?.tipo === "conta" ? "Excluir conta?"
                : apagando?.tipo === "categoria" ? "Excluir categoria?"
                : "Excluir centro de custo?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5">
                <p>"{apagando?.item.nome}" — não dá pra desfazer.</p>
                {/* Categoria "sistema" faz parte do Plano de Contas Oficial
                    (64 das 68 categorias hoje) — só quem tem
                    `estruturar_financeiro` chega a ver este diálogo pra uma
                    delas (ver CategoriaLinha), mas vale destacar mesmo
                    assim, já que apaga algo usado pelo DRE/prestação de
                    contas inteiros, não só um lançamento avulso. */}
                {apagando?.tipo === "categoria" && apagando.item.sistema && (
                  <p className="text-destructive-text font-medium">
                    Categoria do sistema — faz parte do Plano de Contas Oficial.
                  </p>
                )}
                {/* Impacto medido ANTES de perguntar (contarLancamentosPor
                    Categoria/Centro) — pedido da Telma (16/09/2026): permitir
                    excluir mesmo em uso, mas avisando quantos lançamentos
                    vão perder essa classificação, em vez do aviso genérico
                    "só funciona se não tiver lançamentos" que nunca foi
                    verdade pra este caso (ON DELETE SET NULL, não RESTRICT
                    — ver finService.ts). Conta continua fora deste recurso. */}
                {(apagando?.tipo === "categoria" || apagando?.tipo === "centro") && (
                  impactoExclusao === null ? (
                    <p className="text-muted-foreground">Verificando uso...</p>
                  ) : impactoExclusao > 0 ? (
                    <p className="text-warning-text font-medium">
                      {impactoExclusao} lançamento{impactoExclusao === 1 ? "" : "s"} ficará{impactoExclusao === 1 ? "" : "ão"} sem
                      {" "}{apagando?.tipo === "categoria" ? "categoria" : "centro de custo"}.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Nenhum lançamento usa isto hoje.</p>
                  )
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluir} disabled={excluindoBusy || impactoExclusao === null}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {excluindoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoriaLinha({ k, onEdit, onToggle, onDelete }: {
  k: FinCategoria; onEdit: () => void; onToggle: () => void; onDelete?: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-1 text-sm border-l-2 pl-2 py-1 hover:bg-muted/30 ${!k.ativo ? "opacity-50" : ""}`}
         style={{ borderColor: k.cor ?? "#888" }}>
      <span className="truncate flex-1">
        {k.nome}
        {k.sistema && <Badge variant="outline" className="text-xs ml-1">sys</Badge>}
        {!k.ativo && <Badge variant="outline" className="text-xs ml-1 bg-warning-soft text-warning-text">desat.</Badge>}
      </span>
      <div className="flex items-center gap-0 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Editar">
          <Pencil className="w-3 h-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle}
          title={k.ativo ? "Desativar" : "Reativar"}>
          {k.ativo ? <PowerOff className="w-3 h-3 text-warning-text" /> : <RotateCcw className="w-3 h-3 text-success-text" />}
        </Button>
        {/* Excluir: restrito a quem tem "estruturar_financeiro" (onDelete
            vem undefined pra quem não tem). Categoria do sistema também
            trava pra quem NÃO tem a permissão (FinancasAdmin.tsx já barra
            antes de abrir o diálogo) — pra quem tem, o botão aparece
            igual, incluindo `sistema`. */}
        {onDelete && (
          <Button type="button" variant="ghost" size="icon"
            className="h-6 w-6 text-destructive" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function CentroLinha({ c, onEdit, onToggle, onDelete }: {
  c: FinCentroCusto; onEdit: () => void; onToggle: () => void; onDelete?: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-1 text-sm border-l-2 pl-2 py-1 hover:bg-muted/30 ${!c.ativo ? "opacity-50" : ""}`}
         style={{ borderColor: c.cor ?? "#888" }}>
      <span className="truncate flex-1">
        {c.nome}
        {!c.ativo && <Badge variant="outline" className="text-xs ml-1 bg-warning-soft text-warning-text">desat.</Badge>}
      </span>
      <div className="flex items-center gap-0 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Editar">
          <Pencil className="w-3 h-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle}
          title={c.ativo ? "Desativar" : "Reativar"}>
          {c.ativo ? <PowerOff className="w-3 h-3 text-warning-text" /> : <RotateCcw className="w-3 h-3 text-success-text" />}
        </Button>
        {/* Excluir: restrito a quem tem "estruturar_financeiro" (onDelete
            vem undefined pra quem não tem). */}
        {onDelete && (
          <Button type="button" variant="ghost" size="icon"
            className="h-6 w-6 text-destructive" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
