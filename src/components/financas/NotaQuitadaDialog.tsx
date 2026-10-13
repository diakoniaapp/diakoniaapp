// ─── NotaQuitadaDialog — "Registrar NF já quitada por terceiro": a NOTA que o aplicativo ainda não tinha, nascendo JUNTO com a quitação ──────────────────────────────
//
// Fase 1B. É o caso das 17 NFs que o escritório conhece e o aplicativo nunca teve: a obrigação e a quitação são criadas na MESMA operação do banco (ou nada nasce) — não fica uma conta "a pagar"
// ao fornecedor que um terceiro já pagou. A conta escolhida é só onde a obrigação mora: a oferta NÃO mexe nela (sem banco, sem caixa). Não cria entrada, transferência nem saída realizada.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CamposDaQuitacao, ESTADO_VAZIO, problemasDoEstado, type EstadoDaQuitacao } from "@/components/financas/CamposDaQuitacao";
import { hojeLocal } from "@/lib/data";
import { paraNumero } from "@/lib/dinheiro";
import { mensagemErro } from "@/lib/erroRede";
import { chaveNfeValida, type NaturezaDoItem } from "@/lib/quitacao";
import { listarCategorias, listarCentrosCusto, listarContas, listarFornecedores, type FinCategoria, type FinCentroCusto, type FinConta, type FinFornecedor } from "@/services/finService";
import { ofertaDisponivel, registrarNotaQuitadaPorTerceiro } from "@/services/quitacaoService";

export function NotaQuitadaDialog({ aberto, onFechar, onFeito }: { aberto: boolean; onFechar: () => void; onFeito: (obrigacaoId: string) => void }) {
  const hoje = hojeLocal();
  const [v, setV] = useState<EstadoDaQuitacao>(ESTADO_VAZIO);
  const mudar = (parte: Partial<EstadoDaQuitacao>) => setV(x => ({ ...x, ...parte }));
  const [emitente, setEmitente] = useState<FinFornecedor | null>(null);
  const [buscaEmit, setBuscaEmit] = useState("");
  const [achadosEmit, setAchadosEmit] = useState<FinFornecedor[]>([]);
  const [numero, setNumero] = useState(""); const [chave, setChave] = useState(""); const [dataNota, setDataNota] = useState(""); const [valorTxt, setValorTxt] = useState(""); const [descricao, setDescricao] = useState("");
  const [contaId, setContaId] = useState(""); const [categoriaId, setCategoriaId] = useState(""); const [centroId, setCentroId] = useState(""); const [motivo, setMotivo] = useState("");
  const [contas, setContas] = useState<FinConta[]>([]); const [categorias, setCategorias] = useState<FinCategoria[]>([]); const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [ofertaLiberada, setOfertaLiberada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setV(ESTADO_VAZIO); setEmitente(null); setBuscaEmit(""); setNumero(""); setChave(""); setDataNota(""); setValorTxt(""); setDescricao(""); setContaId(""); setCategoriaId(""); setCentroId(""); setMotivo("");
    let vivo = true;
    ofertaDisponivel().then(ok => { if (vivo) setOfertaLiberada(ok); });
    Promise.all([listarContas().catch(() => []), listarCategorias("saida").catch(() => []), listarCentrosCusto().catch(() => [])]).then(([c, cat, ce]) => { if (vivo) { setContas(c); setCategorias(cat); setCentros(ce); } });
    return () => { vivo = false; };
  }, [aberto]);

  useEffect(() => {
    if (emitente || buscaEmit.trim().length < 2) { setAchadosEmit([]); return; }
    let vivo = true;
    const t = setTimeout(async () => { const l = await listarFornecedores(buscaEmit.trim()).catch(() => [] as FinFornecedor[]); if (vivo) setAchadosEmit(l.slice(0, 10)); }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [buscaEmit, emitente]);

  const valor = useMemo(() => paraNumero(valorTxt), [valorTxt]);
  const chaveLimpa = chave.replace(/\s/g, "");
  const problemas = useMemo(() => {
    const p: string[] = [];
    if (!emitente) p.push("Escolha o fornecedor que emitiu a nota.");
    if (!dataNota) p.push("Informe a data da nota."); else if (dataNota > hoje) p.push("A data da nota não pode ser futura.");
    if (!(valor > 0)) p.push("Informe o valor da nota.");
    if (!contaId) p.push("Escolha a conta em que a obrigação ficará registrada (a oferta não mexe nela).");
    if (chaveLimpa && !chaveNfeValida(chaveLimpa)) p.push("A chave de acesso não confere (44 dígitos, com o dígito verificador correto).");
    return [...p, ...problemasDoEstado(v, emitente?.id ?? null, hoje)];
  }, [emitente, dataNota, valor, contaId, chaveLimpa, v, hoje]);

  async function salvar() {
    if (!emitente) return;
    setSalvando(true);
    try {
      const declara = v.intencao === "reembolso" || v.intencao === "oferta" || v.intencao === "compensacao_adiantamento";
      const id = await registrarNotaQuitadaPorTerceiro({
        contaId, emitenteId: emitente.id, dataDaNota: dataNota, valor, descricao: descricao.trim() || null, numeroDaNota: numero.trim() || null, chaveDeAcesso: chaveLimpa || null,
        categoriaId: categoriaId || null, centroCustoId: centroId || null, naturezaItem: (v.natureza || null) as NaturezaDoItem, comprador: (v.comprador || null) as "cnpj_igreja" | "contratacao_previa",
        responsavel: v.tipo, pessoaId: v.tipo === "pessoa" ? v.escolhido?.id ?? null : null, fornecedorDoResponsavelId: v.tipo !== "pessoa" ? v.escolhido?.id ?? null : null,
        intencao: v.tipo === "nao_localizado" ? "nao_se_aplica" : v.intencao, pagoEm: v.tipo === "nao_localizado" ? null : v.pagoEm || null, declaradoEm: declara && v.tipo !== "nao_localizado" ? v.declaradoEm || null : null,
        condicao: v.tipo !== "nao_localizado" && v.intencao === "oferta" && v.condicao.trim() ? v.condicao.trim() : null, pedeRecibo: v.tipo !== "nao_localizado" && v.intencao === "oferta" && v.pedeRecibo, motivo: motivo.trim() || null,
      });
      toast.success(v.tipo === "nao_localizado"
        ? "Nota registrada em aberto, na fila Investigar: ninguém sabe quem a pagou. Anexe a nota fiscal no detalhe da despesa e descubra quem pagou."
        : "Nota registrada já quitada por terceiro. Anexe a nota fiscal, a prova do pagamento e a declaração no detalhe da despesa.");
      onFeito(id); onFechar();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar NF já quitada por terceiro</DialogTitle>
          <DialogDescription>
            Para a nota que a contabilidade conhece e o aplicativo ainda não tinha. A nota e a quitação nascem juntas; nenhum dinheiro da igreja se move e nenhuma entrada ou transferência é criada. Se ninguém sabe quem pagou, escolha “Não sei quem pagou”: a nota entra em aberto na fila Investigar (sem prova suficiente, nada é presumido).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section aria-label="A nota" className="space-y-3 rounded-md border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">A nota fiscal</h3>
            <div className="space-y-1.5">
              <Label htmlFor="n-emit">Fornecedor que emitiu</Label>
              {emitente ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{emitente.nome}</span>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setEmitente(null)}>Trocar</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="n-emit" className="pl-8" placeholder="Digite pelo menos 2 letras do nome" value={buscaEmit} onChange={e => setBuscaEmit(e.target.value)} autoComplete="off" />
                  {achadosEmit.length > 0 && (
                    <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
                      {achadosEmit.map(f => <li key={f.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted/60" onClick={() => { setEmitente(f); setAchadosEmit([]); }}>{f.nome}</button></li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="n-num">Nº da nota</Label><Input id="n-num" value={numero} onChange={e => setNumero(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="n-data">Data da nota</Label><Input id="n-data" type="date" max={hoje} value={dataNota} onChange={e => setDataNota(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="n-valor">Valor (R$)</Label><Input id="n-valor" inputMode="decimal" placeholder="0,00" value={valorTxt} onChange={e => setValorTxt(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="n-chave">Chave de acesso (44 dígitos, opcional)</Label><Input id="n-chave" inputMode="numeric" value={chave} onChange={e => setChave(e.target.value)} placeholder="Com a chave conferida, o risco da operação cai" /></div>
            <div className="space-y-1.5"><Label htmlFor="n-desc">Descrição (opcional)</Label><Input id="n-desc" value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="n-conta">Conta da obrigação</Label>
                <select id="n-conta" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contaId} onChange={e => setContaId(e.target.value)}>
                  <option value="">Escolha…</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-cat">Categoria (opcional)</Label>
                <select id="n-cat" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                  <option value="">—</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-centro">Centro de custo (opcional)</Label>
                <select id="n-centro" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={centroId} onChange={e => setCentroId(e.target.value)}>
                  <option value="">—</option>{centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section aria-label="Quem pagou" className="rounded-md border p-3">
            <CamposDaQuitacao valor={v} onChange={mudar} ofertaLiberada={ofertaLiberada} hoje={hoje} />
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="n-motivo">Observação (opcional)</Label>
            <Textarea id="n-motivo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: nota apontada pelo escritório em 08/2026; paga em espécie pelo Pr. Patrick" />
          </div>
          {problemas.length > 0 && (emitente || dataNota || valorTxt || v.escolhido) && (
            <ul className="space-y-0.5 rounded-md border border-warning-line bg-warning-soft/60 px-3 py-2 text-xs text-warning-text" role="alert">
              {problemas.map(p => <li key={p}>• {p}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || problemas.length > 0}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar nota e quitação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
