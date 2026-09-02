import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Sparkles, X, RefreshCw, Loader2, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import AreasDialog from "@/components/ministerios/AreasDialog";
import RefatoracaoComparacao from "@/components/ministerios/RefatoracaoComparacao";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import {
        extrairEstrutura,
        analisarRefatoracao,
        aplicarItemRefatoracao,
        salvarHistoricoRefatoracao,
        ItemComparacao,
        MinisterioExistente,
        ResultadoRefatoracao,
} from "@/services/ministerioRefatoracaoService";

export interface Ministerio {
        id: string; nome: string; sigla: string | null; descricao: string | null;
        lider_id: string | null; co_lider_id: string | null; vice_lider_id: string | null; ativo: boolean;
}
interface MembroOpt { id: string; nome_completo: string; }

// Era `Record<string, any>`. O nome do tipo ja avisava: com index signature
// aberta, qualquer chave passava — inclusive uma coluna que nao existe, e o
// erro so apareceria no banco, em producao. As seis chaves abaixo foram
// conferidas contra `information_schema`: todas existem em `ministerios`.
//
// `string | null` e nao `string` porque o formulario guarda "" enquanto a
// pessoa digita e converte para null na hora de gravar.
interface FormMinisterio {
  nome: string;
  sigla: string | null;
  descricao: string | null;
  lider_id: string | null;
  co_lider_id: string | null;
  ativo: boolean;
}

export default function Ministerios() {
        const { canEdit, user } = useAuth();
        const [list, setList] = useState<Ministerio[]>([]);
        const [membros, setMembros] = useState<MembroOpt[]>([]);
        const [counts, setCounts] = useState<Record<string, number>>({});
        const [areaCounts, setAreaCounts] = useState<Record<string, number>>({});
        const [loadingCounts, setLoadingCounts] = useState(true);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string | null>(null);
        const [areasOpenFor, setAreasOpenFor] = useState<Ministerio | null>(null);
        const [open, setOpen] = useState(false);
        const [editingId, setEditingId] = useState<string | null>(null);
        const emptyForm: FormMinisterio = { nome: "", sigla: "", descricao: "", lider_id: "", co_lider_id: "", ativo: true };
        const [form, setForm] = useState<FormMinisterio>(emptyForm);
        const [sugestao, setSugestao] = useState<{
                  nome: string; descricao: string; responsabilidades: string;
                  origem: "documento" | "modelo"; base_institucional?: string;
        } | null>(null);
        const [buscandoModelo, setBuscandoModelo] = useState(false);
        const [refOpen, setRefOpen] = useState(false);
        const [refCarregando, setRefCarregando] = useState(false);
        const [refResultado, setRefResultado] = useState<ResultadoRefatoracao>({
                  paraCriar: [], paraAtualizar: [], paraManter: [], orfaos: [],
        });
        const [refFonte, setRefFonte] = useState<"ia" | "parser" | "combinado">("parser");

  const load = async () => {
            setLoading(true); setLoadingCounts(true); setError(null);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error: err } = await supabase.from("ministerios").select("*, areas(count)").order("nome");
            if (err) { toast.error(err.message); setError(err.message); }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows = (data ?? []) as any[];
            setList(rows as Ministerio[]);
            // Contador real de voluntarios ativos por ministerio (via area_voluntarios)
            const { data: vol } = await supabase
                .from("area_voluntarios")
                .select("ministerio_id, membro_id, status");
            const c: Record<string, number> = {};
            const ac: Record<string, number> = {};
            const seenByMin = new Map<string, Set<string>>();
            (vol ?? []).forEach((v: any) => {
                const st = String(v.status ?? "").toLowerCase();
                if (st !== "ativa" && st !== "ativo") return;
                if (!seenByMin.has(v.ministerio_id)) seenByMin.set(v.ministerio_id, new Set());
                seenByMin.get(v.ministerio_id)!.add(v.membro_id);
            });
            rows.forEach((m) => {
                c[m.id] = seenByMin.get(m.id)?.size ?? 0;
                ac[m.id] = m.areas?.[0]?.count ?? 0;
            });
            setCounts(c); setAreaCounts(ac);
            const { data: ms } = await supabase.from("membros").select("id, nome_completo").order("nome_completo");
            setMembros((ms ?? []) as MembroOpt[]);
            setLoadingCounts(false); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
            if (editingId || !open) { setSugestao(null); return; }
            const nome = (form.nome as string)?.trim();
            if (!nome || nome.length < 3) { setSugestao(null); return; }
            setBuscandoModelo(true);
            const timer = setTimeout(async () => {
                        const { data } = await supabase.rpc("buscar_modelo_ministerio", { p_nome: nome });
                        setBuscandoModelo(false);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                           const d = data as any;
                        if (d?.encontrado) {
                                      setSugestao({ nome: d.nome ?? "", descricao: d.descricao ?? "", responsabilidades: d.responsabilidades ?? "", origem: d.origem === "documento" ? "documento" : "modelo", base_institucional: d.base_institucional ?? undefined });
                        } else { setSugestao(null); }
            }, 500);
            return () => { clearTimeout(timer); setBuscandoModelo(false); };
  }, [form.nome, editingId, open]);

  const iniciarRefatoracao = async () => {
            setRefCarregando(true); setRefOpen(true);
            try {
                        const { ministerios: extraidos, fonte } = await extrairEstrutura();
                        setRefFonte(fonte);
                        if (extraidos.length === 0) {
                                      toast.info("Nenhum ministério encontrado nos documentos.");
                                      setRefOpen(false); setRefCarregando(false); return;
                        }
                        setRefResultado(analisarRefatoracao(list as MinisterioExistente[], extraidos));
            } catch (err) {
                        toast.error("Erro ao analisar: " + (err as Error).message);
                        setRefOpen(false);
            } finally { setRefCarregando(false); }
  };

  const aplicarRefatoracao = async (
            decisoes: Map<ItemComparacao, "atualizar" | "manter" | "criar" | "ignorar" | "pendente">,
            _orfaos: MinisterioExistente[]
          ) => {
            const email = user?.email ?? null;
            const ta = [...decisoes.values()].filter(d => d === "atualizar").length;
            const tc = [...decisoes.values()].filter(d => d === "criar").length;
            const tm = [...decisoes.values()].filter(d => d === "manter").length;
            await salvarHistoricoRefatoracao(list as MinisterioExistente[], email, tc, ta, tm);
            let erros = 0;
            const ps: Promise<void>[] = [];
            decisoes.forEach((d, item) => {
                        if (d === "atualizar") ps.push(aplicarItemRefatoracao(item, "atualizar", email).catch(() => { erros++; }));
                        if (d === "criar") ps.push(aplicarItemRefatoracao(item, "criar", email).catch(() => { erros++; }));
            });
            await Promise.all(ps);
            if (erros > 0) { toast.error(erros + " item(s) com erro."); }
            else {
                        const acoes: string[] = [];
                        if (ta > 0) acoes.push(ta + " atualizado(s)");
                        if (tc > 0) acoes.push(tc + " criado(s)");
                        if (acoes.length > 0) toast.success("Refatoracao: " + acoes.join(", "));
                        else toast.info("Nenhuma alteracao.");
            }
            load();
  };

  const memberName = (id: string | null) => membros.find(m => m.id === id)?.nome_completo;

  const onSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            // Campo por campo, e nao um laco sobre Object.keys: o laco
            // aceitava qualquer chave que estivesse no estado, entao um
            // campo novo no formulario iria para o banco sem ninguem
            // conferir se a coluna existe.
            const semVazio = (v: string | null) => (v && v.trim() !== "" ? v : null);
            const payload = {
              nome:        form.nome,
              sigla:       semVazio(form.sigla),
              descricao:   semVazio(form.descricao),
              lider_id:    semVazio(form.lider_id),
              co_lider_id: semVazio(form.co_lider_id),
              ativo:       form.ativo,
            };
            let err;
            if (editingId) { ({ error: err } = await supabase.from("ministerios").update(payload).eq("id", editingId)); }
            else { ({ error: err } = await supabase.from("ministerios").insert(payload)); }
            if (err) return toast.error(err.message);
            toast.success(editingId ? "Ministério atualizado" : "Ministério cadastrado");
            setForm(emptyForm); setEditingId(null); setOpen(false); load();
  };

  const startEdit = (m: Ministerio) => {
            setEditingId(m.id);
            setForm({ nome: m.nome, sigla: m.sigla ?? "", descricao: m.descricao ?? "", lider_id: m.lider_id ?? "", co_lider_id: m.co_lider_id ?? "", ativo: m.ativo });
            setOpen(true);
  };

  const handleOpenChange = (o: boolean) => {
            setOpen(o);
            if (!o) { setEditingId(null); setForm(emptyForm); setSugestao(null); }
  };

  const aplicarModelo = () => {
            if (!sugestao) return;
            const partes: string[] = [];
            if (sugestao.descricao) partes.push(sugestao.descricao);
            if (sugestao.responsabilidades) partes.push("Responsabilidades:\n" + sugestao.responsabilidades);
            if (sugestao.base_institucional) partes.push("Base: " + sugestao.base_institucional);
            setForm((f: FormMinisterio) => ({ ...f, descricao: partes.join("\n\n") }));
            setSugestao(null);
            toast.success(sugestao.origem === "documento" ? "Preenchido com base nos documentos" : "Modelo padrão aplicado");
  };

  const btnLabel = refCarregando ? "Analisando..." : "Atualizar com base no documento";

  return (
            <div>
                  <PageHeader
                                title="Ministérios"
                                description={list.length + (list.length === 1 ? " ministério cadastrado" : " ministérios cadastrados")}
                                actions={canEdit && (
                                                <div className="flex items-center gap-2">
                                                            <Button variant="outline" className="whitespace-nowrap gap-1.5" onClick={iniciarRefatoracao} disabled={refCarregando}>
                                                                  {refCarregando
                                                                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                                        : <RefreshCw className="w-4 h-4" />
                                                                  }
                                                                  {btnLabel}
                                                            </Button>
                                                            <Button className="whitespace-nowrap" onClick={() => { setEditingId(null); setForm(emptyForm); setOpen(true); }}>
                                                                          <Plus className="w-4 h-4 mr-2" />Novo ministério
                                                            </Button>
                                                </div>
                          )}
                        />
                        <div className="p-4 md:p-8">
                              {loading ? <ListSkeleton /> : error ? <ErrorState onRetry={load} /> : list.length === 0 ? (
                                                <EmptyState
                                                  message="Nenhum ministério cadastrado"
                                                  descricao="Ministérios e suas áreas são onde as pessoas servem. Com eles no sistema, o organograma se desenha sozinho e cada voluntário passa a aparecer ligado a algum lugar."
                                                />
                                              ) : (
                                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                      {list.map((m) => (
                                                                    // Mesmo padrao de linha de Pessoas e Familias: sem quadradinho
                                                                    // de icone (era igual nos 11 cartoes), etiqueta so na excecao,
                                                                    // e o cartao inteiro clicavel para a acao principal.
                                                                    <Card
                                                                      key={m.id}
                                                                      className={"min-w-0 shadow-card-soft hover:shadow-elevated transition-shadow relative focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 " + (m.ativo ? "" : "opacity-60")}
                                                                    >
                                                                      <CardContent className="p-4 flex items-center gap-3">
                                                                        <div className="flex-1 min-w-0">
                                                                          {/* Alvo esticado — e ele leva ao PAINEL do ministerio.
                                                                              `block w-full` impede que o h3 com truncate estique
                                                                              o link ate a largura do nome.

                                                                              ── POR QUE O PAINEL, E NAO AS AREAS ─────────────
                                                                              A rota `/ministerios/:id/painel` existe e funciona
                                                                              para os onze desde que foi escrita, mas NENHUMA tela
                                                                              linkava para ela: so se chegava pela Home, e so aos
                                                                              ministerios que a pessoa lidera. Medido em 02/09:
                                                                              nove dos onze paineis eram inalcancaveis.

                                                                              O painel e a bancada — areas, quem serve, proximas
                                                                              escalas e checklist. As areas continuam a um clique,
                                                                              no botao ao lado, porque o dialogo delas e a unica
                                                                              porta para CRIAR e EDITAR area. */}
                                                                          <Link
                                                                            to={`/ministerios/${m.id}/painel`}
                                                                            aria-label={`Abrir o painel de ${m.nome}`}
                                                                            className="block w-full min-w-0 text-left after:absolute after:inset-0 after:rounded-lg focus:outline-none"
                                                                          >
                                                                            <h3 className="font-serif text-lg truncate">{m.nome}</h3>
                                                                          </Link>
                                                                          {/* A sigla saiu: e a abreviacao do nome que esta ao lado
                                                                              por extenso. "Ativo" tambem — 10 dos 11 ministerios
                                                                              estao ativos, e o cartao inativo ja fica esmaecido.
                                                                              Sobra so a marca de quem foge do padrao. */}
                                                                          {!m.ativo && (
                                                                            <Badge variant="outline" className="bg-muted text-muted-foreground mt-0.5">Inativo</Badge>
                                                                          )}
                                                                          {/* Uma linha de apoio no lugar de quatro. Lider, tamanho
                                                                              e numero de areas e o que distingue um ministerio do
                                                                              outro nesta tela; descricao e co-lider sao da ficha. */}
                                                                          <p className="text-sm text-muted-foreground truncate">
                                                                            {[
                                                                              m.lider_id ? memberName(m.lider_id) : null,
                                                                              loadingCounts ? null : `${counts[m.id] ?? 0} ${(counts[m.id] ?? 0) === 1 ? "integrante" : "integrantes"}`,
                                                                              loadingCounts ? null : `${areaCounts[m.id] ?? 0} ${(areaCounts[m.id] ?? 0) === 1 ? "área" : "áreas"}`,
                                                                            ].filter(Boolean).join(" • ")}
                                                                          </p>
                                                                        </div>
                                                                        {/* z-10 tira os dois botoes de baixo do alvo esticado. */}
                                                                        <Button
                                                                          variant="ghost" size="icon"
                                                                          onClick={() => setAreasOpenFor(m)}
                                                                          aria-label={`Áreas de ${m.nome}`}
                                                                          title="Áreas"
                                                                          className="h-11 w-11 shrink-0 relative z-10"
                                                                        >
                                                                          <Layers className="w-4 h-4" />
                                                                        </Button>
                                                                        {canEdit && (
                                                                          <Button
                                                                            variant="ghost" size="icon"
                                                                            onClick={() => startEdit(m)}
                                                                            aria-label={`Editar ${m.nome}`}
                                                                            title="Editar"
                                                                            className="h-11 w-11 shrink-0 relative z-10"
                                                                          >
                                                                            <Pencil className="w-4 h-4" />
                                                                          </Button>
                                                                        )}
                                                                      </CardContent>
                                                                    </Card>
                                                                  ))}
                                                </div>
                                )}
                        </div>
                  
                        <Dialog open={open} onOpenChange={handleOpenChange}>
                                <DialogContent>
                                          <DialogHeader>
                                                      <DialogTitle className="font-serif text-2xl">{editingId ? "Editar ministério" : "Novo ministério"}</DialogTitle>
                                          </DialogHeader>
                                          <form onSubmit={onSubmit} className="space-y-3">
                                                      <div className="grid grid-cols-3 gap-3">
                                                                    <div className="col-span-2">
                                                                                    <Label>Nome *</Label>
                                                                                    <div className="relative">
                                                                                                      <Input required value={form.nome as string} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                                                                                          {buscandoModelo && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">buscando...</span>}
                                                                                          </div>
                                                                    </div>
                                                                    <div><Label>Sigla</Label><Input value={form.sigla as string} onChange={(e) => setForm({ ...form, sigla: e.target.value })} /></div>
                                                      </div>
                                                {sugestao && (
                                                    <div className={"rounded-md border px-3 py-2.5 flex items-start gap-2 " + (sugestao.origem === "documento" ? "border-gold/50 bg-gold/8" : "border-muted bg-muted/30")}>
                                                                    <Sparkles className={"w-4 h-4 mt-0.5 shrink-0 " + (sugestao.origem === "documento" ? "text-gold" : "text-muted-foreground")} />
                                                                    <div className="flex-1 min-w-0">
                                                                                      <p className={"text-xs font-medium " + (sugestao.origem === "documento" ? "text-gold" : "text-foreground")}>
                                                                                            {sugestao.origem === "documento" ? "Sugerido pelo regimento: " : "Modelo padrão: "}{sugestao.nome}
                                                                                            </p>
                                                                          {sugestao.base_institucional && <p className="text-xs text-gold/70 mt-0.5">{sugestao.base_institucional}</p>}
                                                                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sugestao.descricao}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                                      <Button type="button" size="sm" variant="outline" className={"h-7 text-xs " + (sugestao.origem === "documento" ? "border-gold/40 text-gold hover:bg-gold/10" : "")} onClick={aplicarModelo}>Aplicar</Button>
                                                                                      <button type="button" onClick={() => setSugestao(null)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted">
                                                                                                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                                                                                            </button>
                                                                    </div>
                                                    </div>
                                                      )}
                                                      <div><Label>Descrição</Label><Textarea rows={3} value={form.descricao as string} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                                                      <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                                    <Label>Líder</Label>
                                                                                    <Select value={(form.lider_id as string) || undefined} onValueChange={(v) => setForm({ ...form, lider_id: v })}>
                                                                                                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                                                                                      <SelectContent>{membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                                                                                          </Select>
                                                                    </div>
                                                                    <div>
                                                                                    <Label>Co-líder</Label>
                                                                                    <Select value={(form.co_lider_id as string) || undefined} onValueChange={(v) => setForm({ ...form, co_lider_id: v })}>
                                                                                                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                                                                                      <SelectContent>{membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}</SelectContent>
                                                                                          </Select>
                                                                    </div>
                                                      </div>
                                                      <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                                                                    <div>
                                                                                    <Label className="text-sm">Status</Label>
                                                                                    <p className="text-xs text-muted-foreground">{form.ativo ? "Ativo" : "Inativo"}</p>
                                                                    </div>
                                                                    <Switch checked={form.ativo as boolean} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                                                      </div>
                                                      <DialogFooter>
                                                                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
                                                                    <Button type="submit">{editingId ? "Atualizar" : "Salvar"}</Button>
                                                      </DialogFooter>
                                          </form>
                                </DialogContent>
                        </Dialog>
                  
                        {areasOpenFor && (
                                              <AreasDialog
                                                              ministerio={areasOpenFor}
                                                              membros={membros}
                                                              open={!!areasOpenFor}
                                                              onOpenChange={(o) => { if (!o) { setAreasOpenFor(null); load(); } }}
                                                            />
                                            )}
                  
                        <RefatoracaoComparacao
                                      open={refOpen}
                                      onOpenChange={setRefOpen}
                                      resultado={refResultado}
                                      fonte={refFonte}
                                      carregando={refCarregando}
                                      onAplicar={aplicarRefatoracao}
                                    />
                  </div>
              );
                  }
