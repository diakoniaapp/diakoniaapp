// ─── NotaQuitadaDialog — "Registrar NF já quitada por terceiro": a NOTA que o aplicativo ainda não tinha, nascendo JUNTO com a quitação ──────────────────────────────
//
// Fase 1B. É o caso das 17 NFs que o escritório conhece e o aplicativo nunca teve: a obrigação e a quitação são criadas na MESMA operação do banco (ou nada nasce) — não fica uma conta "a pagar"
// ao fornecedor que um terceiro já pagou. Oferta NÃO usa conta financeira (a nota nasce na conta estrutural "Não Aplicável"); reembolso e relatado escolhem a conta onde a nota fica registrada. A ORDEM da tela segue a Política (14/10/2026): a nota, a igreja é a compradora, quem pagou, o que a pessoa quer, e SÓ DEPOIS a classificação (categoria, centro, projeto). Não cria entrada, transferência nem saída realizada.
import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CamposDaQuitacao, ESTADO_VAZIO, problemasDoEstado, type EstadoDaQuitacao } from "@/components/financas/CamposDaQuitacao";
import { FornecedorForm } from "@/components/financas/FornecedorForm";
import { lerDocumento } from "@/lib/documentos/leitura";
import { lerArquivo } from "@/services/centralDocumentosService";
import { hojeLocal } from "@/lib/data";
import { paraNumero } from "@/lib/dinheiro";
import { mensagemErro } from "@/lib/erroRede";
import { chaveNfeValida, type NaturezaDoItem } from "@/lib/quitacao";
import { adicionarAnexo, buscarFornecedorPorCnpj, listarCategorias, listarCentrosCusto, listarContas, listarFornecedores, listarProjetos, type FinCategoria, type FinCentroCusto, type FinConta, type FinFornecedor, type FinProjeto } from "@/services/finService";
import { contaNaoAplicavelDisponivel, declaracaoDisponivel, ofertaDisponivel, projetoNaNotaDisponivel, registrarNotaQuitadaPorTerceiro } from "@/services/quitacaoService";

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
  const [contaNeutra, setContaNeutra] = useState(false);   // o banco já tem a conta "Não Aplicável": oferta não escolhe conta
  const [pedirForma, setPedirForma] = useState(false);   // Fase 1D-a: só pede a forma de pagamento do terceiro quando o banco já a tem
  const [salvando, setSalvando] = useState(false);
  // A NF anexada na própria tela (28/10/2026): o sistema a lê e preenche o que estiver vazio; o emitente lido ajuda a achar OU a cadastrar o fornecedor, sem sair da tela.
  const [arquivoNota, setArquivoNota] = useState<File | null>(null);
  const [chaveDoArquivo, setChaveDoArquivo] = useState(0);   // o <input type="file"> não é controlado: a `key` o remonta para limpar
  const [lendoNota, setLendoNota] = useState(false);
  const [lidoDaNota, setLidoDaNota] = useState<{ nome: string | null; cnpj: string | null } | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  // Projeto: dimensão da OBRIGAÇÃO (aprovado em 14/10/2026), ao lado de categoria e centro — não da quitação. Mesmo comportamento do LancamentoForm:
  // caixa que revela o seletor, item "Nenhum", só projetos ativos, e nada aparece sem projeto ativo. Aqui também some sem a migration 20261016110000.
  const [projetos, setProjetos] = useState<FinProjeto[]>([]); const [usarProjeto, setUsarProjeto] = useState(false); const [projetoId, setProjetoId] = useState("");
  const [aceitaProjeto, setAceitaProjeto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setV(ESTADO_VAZIO); setEmitente(null); setBuscaEmit(""); setNumero(""); setChave(""); setDataNota(""); setValorTxt(""); setDescricao(""); setContaId(""); setCategoriaId(""); setCentroId(""); setMotivo(""); setUsarProjeto(false); setProjetoId("");
    setArquivoNota(null); setLidoDaNota(null); setCadastrando(false); setChaveDoArquivo(k => k + 1);
    let vivo = true;
    ofertaDisponivel().then(ok => { if (vivo) setOfertaLiberada(ok); });
    contaNaoAplicavelDisponivel().then(ok => { if (vivo) setContaNeutra(ok); }).catch(() => { if (vivo) setContaNeutra(false); });
    declaracaoDisponivel().then(ok => { if (vivo) setPedirForma(ok); });
    projetoNaNotaDisponivel().then(ok => { if (vivo) setAceitaProjeto(ok); });
    listarProjetos().catch(() => [] as FinProjeto[]).then(p => { if (vivo) setProjetos(p); });
    Promise.all([listarContas().catch(() => []), listarCategorias("saida").catch(() => []), listarCentrosCusto().catch(() => [])]).then(([c, cat, ce]) => { if (vivo) { setContas(c); setCategorias(cat); setCentros(ce); } });
    return () => { vivo = false; };
  }, [aberto]);

  useEffect(() => {
    if (emitente || buscaEmit.trim().length < 2) { setAchadosEmit([]); return; }
    let vivo = true;
    const t = setTimeout(async () => { const l = await listarFornecedores(buscaEmit.trim()).catch(() => [] as FinFornecedor[]); if (vivo) setAchadosEmit(l.slice(0, 10)); }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [buscaEmit, emitente]);

  // Oferta não passa por banco, caixa, aplicação nem cartão: sem conta financeira (14/10/2026). A obrigação nasce na conta estrutural "Não Aplicável".
  const semConta = contaNeutra && v.tipo !== "nao_localizado" && v.intencao === "oferta";
  const valor = useMemo(() => paraNumero(valorTxt), [valorTxt]);
  const chaveLimpa = chave.replace(/\s/g, "");
  const problemas = useMemo(() => {
    const p: string[] = [];
    if (!emitente) p.push("Escolha o fornecedor que emitiu a nota.");
    if (!dataNota) p.push("Informe a data da nota."); else if (dataNota > hoje) p.push("A data da nota não pode ser futura.");
    if (!(valor > 0)) p.push("Informe o valor da nota.");
    if (!contaId && !semConta) p.push("Escolha a conta em que a obrigação ficará registrada.");
    if (chaveLimpa && !chaveNfeValida(chaveLimpa)) p.push("A chave de acesso não confere (44 dígitos, com o dígito verificador correto).");
    return [...p, ...problemasDoEstado(v, emitente?.id ?? null, hoje, pedirForma)];
  }, [emitente, dataNota, valor, contaId, semConta, chaveLimpa, v, hoje, pedirForma]);

  async function lerANota(file: File | null) {
    setArquivoNota(file); setLidoDaNota(null);
    if (!file) return;
    setLendoNota(true);
    try {
      // PDF com texto: instantâneo. Foto ou PDF digitalizado: cai no OCR (mais lento, e aproximado — por isso só PREENCHE o que está vazio)
      let lei = await lerArquivo(file, file.name, false);
      if (lei.fonte === "nao_lido" && !file.name.toLowerCase().endsWith(".xml")) lei = await lerArquivo(file, file.name, true);
      const l = lerDocumento(lei.texto ?? "");
      let preencheu = 0;
      if (!numero.trim() && l.numero) { setNumero(l.numero); preencheu++; }
      if (!dataNota && l.emissao && l.emissao <= hoje) { setDataNota(l.emissao); preencheu++; }
      if (!valorTxt.trim() && l.valores[0]) { setValorTxt(String(l.valores[0].valor).replace(".", ",")); preencheu++; }
      if (!chave.trim() && l.chave) { setChave(l.chave); preencheu++; }
      if (!emitente && (l.cnpj || l.emitente)) {
        const achado = l.cnpj ? await buscarFornecedorPorCnpj(l.cnpj).catch(() => null) : null;
        if (achado) { setEmitente(achado); setBuscaEmit(""); setAchadosEmit([]); preencheu++; toast.success(`Fornecedor encontrado pelo CNPJ da nota: ${achado.nome}.`); }
        else setLidoDaNota({ nome: l.emitente, cnpj: l.cnpj });
      }
      toast[preencheu > 0 || l.cnpj || l.emitente ? "success" : "message"](preencheu > 0 || l.cnpj || l.emitente
        ? "Nota lida: confira o que foi preenchido." : "Não consegui ler dados desta nota: preencha à mão (o arquivo continua anexado).");
    } catch { toast.message("Não consegui ler esta nota: preencha à mão (o arquivo continua anexado)."); }
    finally { setLendoNota(false); }
  }

  async function salvar() {
    if (!emitente) return;
    setSalvando(true);
    try {
      const declara = v.intencao === "reembolso" || v.intencao === "oferta" || v.intencao === "compensacao_adiantamento";
      const id = await registrarNotaQuitadaPorTerceiro({
        contaId: semConta ? null : contaId, emitenteId: emitente.id, dataDaNota: dataNota, valor, descricao: descricao.trim() || null, numeroDaNota: numero.trim() || null, chaveDeAcesso: chaveLimpa || null,
        categoriaId: categoriaId || null, centroCustoId: centroId || null, projetoId: aceitaProjeto && usarProjeto && projetoId ? projetoId : null, naturezaItem: (v.natureza || null) as NaturezaDoItem, comprador: (v.comprador || null) as "cnpj_igreja" | "contratacao_previa",
        responsavel: v.tipo, pessoaId: v.tipo === "pessoa" ? v.escolhido?.id ?? null : null, fornecedorDoResponsavelId: v.tipo !== "pessoa" ? v.escolhido?.id ?? null : null,
        formaPagamentoTerceiro: v.tipo === "nao_localizado" || !v.forma ? null : v.forma,
        intencao: v.tipo === "nao_localizado" ? "nao_se_aplica" : v.intencao, pagoEm: v.tipo === "nao_localizado" ? null : v.pagoEm || null, declaradoEm: declara && v.tipo !== "nao_localizado" ? v.declaradoEm || null : null,
        condicao: v.tipo !== "nao_localizado" && v.intencao === "oferta" && v.condicao.trim() ? v.condicao.trim() : null, pedeRecibo: v.tipo !== "nao_localizado" && v.intencao === "oferta" && v.pedeRecibo, motivo: motivo.trim() || null,
      });
      // a NF anexada nesta tela vira o documento original da obrigação (uma falha aqui não desfaz o registro)
      let anexada = false;
      if (arquivoNota) { try { await adicionarAnexo(id, arquivoNota, "nota_fiscal"); anexada = true; } catch (e) { toast.error(`Nota registrada, mas a NF não subiu: ${mensagemErro(e)}. Anexe-a no detalhe da despesa.`); } }
      toast.success(v.tipo === "nao_localizado"
        ? "Nota registrada em aberto, na fila Investigar: ninguém sabe quem a pagou. Anexe a nota fiscal no detalhe da despesa e descubra quem pagou."
        : v.intencao === "oferta" ? `Nota registrada como oferta de terceiro. Anexe ${anexada ? "" : "a nota fiscal e "}a Declaração do Terceiro assinada no detalhe da despesa: com as duas a oferta está formalizada.`
        : `Nota registrada já quitada por terceiro. Anexe ${anexada ? "" : "a nota fiscal, "}a prova do pagamento e a declaração no detalhe da despesa.`);
      onFeito(id); onFechar();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setSalvando(false); }
  }

  return (
    <>
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
            <div className="space-y-1.5 rounded-md border border-dashed bg-muted/20 p-2.5">
              <Label htmlFor="n-arquivo" className="flex items-center gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Anexar a nota fiscal (PDF ou foto) — o sistema lê e preenche</Label>
              <input id="n-arquivo" key={chaveDoArquivo} type="file" accept="application/pdf,image/jpeg,image/png,.xml" disabled={lendoNota || salvando}
                onChange={e => void lerANota(e.target.files?.[0] ?? null)} className="text-xs w-full file:mr-2 file:rounded file:border file:bg-background file:px-2 file:py-1 file:text-xs" />
              {lendoNota && <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><Loader2 className="h-3 w-3 animate-spin" /> Lendo a nota… (foto ou digitalização demora um pouco mais)</p>}
              {arquivoNota && !lendoNota && <p className="text-[11px] text-muted-foreground">Fica anexada como documento original ao registrar. O que o sistema lê é só uma ajuda: confira.</p>}
            </div>
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
              {!emitente && (
                <div className="space-y-1">
                  {lidoDaNota && (
                    <p className="rounded-md border border-info-line bg-info-soft px-2.5 py-1.5 text-xs text-info-text" role="status">
                      A nota é de <strong>{lidoDaNota.nome ?? "emitente não identificado"}</strong>{lidoDaNota.cnpj ? <> (CNPJ {lidoDaNota.cnpj})</> : null}. Não achei esse fornecedor no cadastro.
                    </p>
                  )}
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => setCadastrando(true)}>
                    <Plus className="h-3.5 w-3.5" /> Cadastrar novo fornecedor{lidoDaNota ? " com os dados da nota" : buscaEmit.trim().length >= 2 ? ` “${buscaEmit.trim()}”` : ""}
                  </button>
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
          </section>

          <section aria-label="Quem pagou" className="rounded-md border p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quem pagou e o que quer</h3>
            <CamposDaQuitacao valor={v} onChange={mudar} ofertaLiberada={ofertaLiberada} hoje={hoje} pedirForma={pedirForma} />
          </section>

          {/* Só DEPOIS de saber quem pagou e o que a pessoa quer: classificar a despesa. */}
          <section aria-label="Classificação" className="space-y-3 rounded-md border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classificação da despesa</h3>
            <div className={`grid gap-3 ${semConta ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              {!semConta && (
                <div className="space-y-1.5">
                  <Label htmlFor="n-conta">Conta da obrigação</Label>
                  <select id="n-conta" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={contaId} onChange={e => setContaId(e.target.value)}>
                    <option value="">Escolha…</option>{contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  {v.intencao === "reembolso" && <p className="text-[11px] text-muted-foreground">Só onde a nota fica registrada: o reembolso escolhe a conta no pagamento.</p>}
                </div>
              )}
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
            {aceitaProjeto && projetos.length > 0 && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={usarProjeto} onCheckedChange={(x) => {
                    const marcado = x === true;
                    setUsarProjeto(marcado);
                    if (!marcado) setProjetoId("");
                  }} />
                  Projeto (opcional)
                </label>
                {usarProjeto && (
                  // sentinela "__nenhum__" e a guarda do onValueChange: os mesmos do LancamentoForm (ver o comentário lá sobre a autocorreção do Radix)
                  <Select value={projetoId || "__nenhum__"} onValueChange={(x) => { if (x) setProjetoId(x === "__nenhum__" ? "" : x); }}>
                    <SelectTrigger aria-label="Projeto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhum__" className="text-muted-foreground">Nenhum</SelectItem>
                      {projetos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
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
    {/* o cadastro abre POR CIMA desta tela e, ao salvar, devolve o fornecedor já escolhido: nada do que foi digitado se perde */}
    <FornecedorForm open={cadastrando} onOpenChange={setCadastrando}
      inicial={{ nome: lidoDaNota?.nome ?? buscaEmit, cnpjCpf: lidoDaNota?.cnpj ?? "" }}
      onSaved={f => { setEmitente(f); setBuscaEmit(""); setAchadosEmit([]); setLidoDaNota(null); toast.success(`${f.nome} cadastrado e escolhido como emitente.`); }} />
    </>
  );
}
