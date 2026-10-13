// ─── QuitacaoDialog — "Quem pagou esta conta?" — registra ou corrige a Quitação (Responsável + Intenção) ─────────────────────────────────────────────
//
// Fase 1A da Política de Compras por Terceiros, Reembolsos e Doações. A pergunta vem ANTES do "Pagar": se foi a igreja, o fluxo de sempre; se foi uma Pessoa, uma Empresa
// ou uma Entidade, a obrigação NÃO é dada como paga — registra-se quem pagou e a intenção (Reembolso, Oferta, Compensação de adiantamento ou Não declarada), e o sistema
// deduz o resto (grau de prova pelos anexos, nível de risco, fila, credor). A intenção NUNCA é presumida: sem declaração, fica "Não declarada" (A esclarecer).
// Nesta entrega: Oferta (entrega 1B) e Compensação de adiantamento (fase futura) aparecem desabilitadas; o banco também as recusa.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { hojeLocal } from "@/lib/data";
import { mensagemErro } from "@/lib/erroRede";
import { cnpjValido, problemasDoRegistro, type Intencao, type NaturezaDoItem } from "@/lib/quitacao";
import { buscarPessoasParaLancamento, listarFornecedores, type FinFornecedor } from "@/services/finService";
import {
  alterarQuitacao, dadosDaDespesaParaQuitar, registrarQuitacao, type QuitacaoDaObrigacao,
} from "@/services/quitacaoService";

export interface AlvoDaQuitacao { id: string; descricao: string; valor: number }
type TipoEscolhido = "pessoa" | "empresa" | "entidade" | "nao_localizado";

const NATUREZAS: { valor: NaturezaDoItem; rotulo: string }[] = [
  { valor: "consumo", rotulo: "Material de consumo" }, { valor: "estoque", rotulo: "Estoque" }, { valor: "duravel", rotulo: "Bem durável (equipamento, móvel…)" }, { valor: "servico", rotulo: "Serviço" },
];

interface Escolhido { id: string; nome: string; cnpj?: string | null }

export function QuitacaoDialog({ alvo, quitacao, onFechar, onFeito }: { alvo: AlvoDaQuitacao | null; quitacao?: QuitacaoDaObrigacao | null; onFechar: () => void; onFeito: () => void }) {
  const editando = !!quitacao;
  const [tipo, setTipo] = useState<TipoEscolhido>("pessoa");
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Escolhido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pagoEm, setPagoEm] = useState("");
  const [intencao, setIntencao] = useState<Intencao>("nao_declarada");
  const [declaradoEm, setDeclaradoEm] = useState("");
  const [natureza, setNatureza] = useState<NaturezaDoItem | "">("");
  const [comprador, setComprador] = useState<"cnpj_igreja" | "contratacao_previa" | "">("");
  const [emitenteId, setEmitenteId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const seq = useRef(0);
  const hoje = hojeLocal();

  // abre o diálogo: limpa, ou carrega a quitação que está sendo corrigida; busca o que a despesa já sabe (natureza, comprador, emitente)
  useEffect(() => {
    if (!alvo) return;
    setBusca(""); setAchados([]); setMotivo("");
    if (quitacao) {
      setTipo(quitacao.responsavel); setPagoEm(quitacao.pagoEm ?? ""); setIntencao(quitacao.intencao === "nao_se_aplica" ? "nao_declarada" : quitacao.intencao); setDeclaradoEm(quitacao.declaradoEm ?? "");
      setEscolhido((quitacao.pessoaId || quitacao.fornecedorId) ? { id: (quitacao.pessoaId ?? quitacao.fornecedorId)!, nome: quitacao.responsavelNome ?? "(cadastro)" } : null);
    } else { setTipo("pessoa"); setEscolhido(null); setPagoEm(""); setIntencao("nao_declarada"); setDeclaradoEm(""); }
    let vivo = true;
    dadosDaDespesaParaQuitar(alvo.id).then(d => { if (!vivo || !d) return; setNatureza(d.naturezaItem ?? ""); setComprador(d.comprador ?? ""); setEmitenteId(d.fornecedorId); });
    return () => { vivo = false; };
  }, [alvo, quitacao]);

  // a busca no cadastro certo: Pessoa em Pessoas; Empresa e Entidade em Favorecidos (com CNPJ)
  useEffect(() => {
    if (!alvo || escolhido || tipo === "nao_localizado" || busca.trim().length < 2) { setAchados([]); return; }
    const minha = ++seq.current; setBuscando(true);
    const t = setTimeout(async () => {
      try {
        let lista: Escolhido[];
        if (tipo === "pessoa") lista = (await buscarPessoasParaLancamento(busca.trim()).catch(() => [])).map(p => ({ id: p.id, nome: p.nome }));
        else lista = (await listarFornecedores(busca.trim()).catch(() => [] as FinFornecedor[])).slice(0, 12).map(f => ({ id: f.id, nome: f.nome, cnpj: f.cnpj_cpf }));
        if (minha === seq.current) setAchados(lista.slice(0, 12));
      } finally { if (minha === seq.current) setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, tipo, escolhido, alvo]);

  const declara = intencao === "reembolso" || intencao === "oferta" || intencao === "compensacao_adiantamento";
  const problemas = useMemo(() => {
    if (!alvo) return [];
    if (tipo === "nao_localizado") return [];
    return problemasDoRegistro({
      responsavel: tipo, intencao, pessoaId: tipo === "pessoa" ? escolhido?.id ?? null : null, fornecedorId: tipo !== "pessoa" ? escolhido?.id ?? null : null,
      pagoEm: pagoEm || null, declaradoEm: declara ? declaradoEm || null : null, naturezaItem: (natureza || null) as NaturezaDoItem | null, hoje,
      emitenteId, cnpjDoFornecedor: tipo !== "pessoa" ? escolhido?.cnpj ?? null : null,
    });
  }, [alvo, tipo, intencao, escolhido, pagoEm, declaradoEm, declara, natureza, hoje, emitenteId]);
  const semComprador = tipo !== "nao_localizado" && !comprador;
  const semMotivo = editando && motivo.trim().length < 5;

  async function salvar() {
    if (!alvo) return;
    setSalvando(true);
    try {
      if (!editando) {
        await registrarQuitacao({
          lancamentoId: alvo.id, responsavel: tipo, pessoaId: tipo === "pessoa" ? escolhido?.id ?? null : null, fornecedorId: tipo === "empresa" || tipo === "entidade" ? escolhido?.id ?? null : null,
          intencao: tipo === "nao_localizado" ? "nao_se_aplica" : intencao, pagoEm: tipo === "nao_localizado" ? null : pagoEm || null, declaradoEm: tipo !== "nao_localizado" && declara ? declaradoEm || null : null,
          naturezaItem: tipo === "nao_localizado" ? null : (natureza || null) as NaturezaDoItem | null, comprador: tipo === "nao_localizado" ? null : (comprador || null), condicao: null, pedeRecibo: false, motivo: motivo.trim() || null,
        });
        toast.success(tipo === "nao_localizado" ? "Marcada como \"Não localizado\": entrou na fila Investigar." : "Quitação registrada. Anexe a prova do pagamento e a declaração do terceiro para formalizar.");
      } else {
        const mudancas: Record<string, unknown> = {};
        if (tipo !== quitacao!.responsavel) mudancas.responsavel_tipo = tipo;
        if (tipo === "pessoa" && (escolhido?.id ?? null) !== quitacao!.pessoaId) mudancas.responsavel_pessoa_id = escolhido?.id ?? null;
        if (tipo !== "pessoa" && tipo !== "nao_localizado" && (escolhido?.id ?? null) !== quitacao!.fornecedorId) mudancas.responsavel_fornecedor_id = escolhido?.id ?? null;
        if (tipo !== "nao_localizado") {
          if (intencao !== quitacao!.intencao) mudancas.intencao = intencao;
          if ((pagoEm || null) !== quitacao!.pagoEm) mudancas.pago_em = pagoEm || null;
          if ((declara ? declaradoEm || null : null) !== quitacao!.declaradoEm) mudancas.declarado_em = declara ? declaradoEm || null : null;
        }
        if (Object.keys(mudancas).length === 0) { toast.info("Nada mudou."); onFechar(); return; }
        await alterarQuitacao(quitacao!.quitacaoId, mudancas, motivo.trim());
        toast.success("Quitação alterada; a mudança ficou no histórico (e uma aprovação anterior perde a validade).");
      }
      onFeito(); onFechar();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setSalvando(false); }
  }

  const invalido = tipo !== "nao_localizado" && (problemas.length > 0 || semComprador);

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Corrigir a quitação" : "Quem pagou esta conta?"}</DialogTitle>
          <DialogDescription>
            {alvo?.descricao || "Despesa"} · {alvo ? alvo.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""}. Se foi a própria igreja, feche e use <b>Pagar</b>. Se outra pessoa, empresa ou entidade pagou o fornecedor, registre aqui —
            a obrigação <b>não</b> é dada como paga, e a igreja não paga o fornecedor de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quem pagou o fornecedor?</Label>
            <RadioGroup value={tipo} onValueChange={v => { setTipo(v as TipoEscolhido); setEscolhido(null); setBusca(""); }} className="grid grid-cols-2 gap-2">
              {([["pessoa", "Uma pessoa"], ["empresa", "Uma empresa"], ["entidade", "Uma entidade"], ["nao_localizado", "Não sei quem pagou"]] as const).map(([v, r]) => (
                <label key={v} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${tipo === v ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value={v} /> {r}
                </label>
              ))}
            </RadioGroup>
            {tipo === "nao_localizado" && <p className="text-xs text-muted-foreground">A conta entra na fila <b>Investigar</b>. Ela continua em aberto; se a igreja a pagar depois, a marcação some sozinha.</p>}
          </div>

          {tipo !== "nao_localizado" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="q-busca">{tipo === "pessoa" ? "Pessoa" : tipo === "empresa" ? "Empresa" : "Entidade"} (do cadastro)</Label>
                {escolhido ? (
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{escolhido.nome}</span>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEscolhido(null)}>Trocar</Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input id="q-busca" className="pl-8" placeholder="Digite pelo menos 2 letras do nome" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
                    {buscando && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    {achados.length > 0 && (
                      <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border divide-y text-sm">
                        {achados.map(a => {
                          const ruim = tipo !== "pessoa" && !cnpjValido(a.cnpj);
                          return (
                            <li key={a.id}>
                              <button type="button" disabled={ruim} onClick={() => { setEscolhido(a); setAchados([]); }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60">
                                <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                                {ruim && <span className="text-[11px] text-warning-text">sem CNPJ válido — corrija o cadastro</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {tipo !== "pessoa" && <p className="mt-1 text-xs text-muted-foreground">Empresa e entidade só podem ser registradas com CNPJ válido no cadastro de Favorecidos.</p>}
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="q-pago">Quando pagou o fornecedor?</Label>
                  <Input id="q-pago" type="date" max={hoje} value={pagoEm} onChange={e => setPagoEm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-nat">O que foi comprado?</Label>
                  <select id="q-nat" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={natureza} onChange={e => setNatureza(e.target.value as NaturezaDoItem | "")}>
                    <option value="">Escolha…</option>
                    {NATUREZAS.map(n => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>A igreja é a compradora?</Label>
                <RadioGroup value={comprador} onValueChange={v => setComprador(v as "cnpj_igreja" | "contratacao_previa")} className="grid gap-2 sm:grid-cols-2">
                  <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${comprador === "cnpj_igreja" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="cnpj_igreja" /> Sim, a nota está no CNPJ da igreja</label>
                  <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${comprador === "contratacao_previa" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="contratacao_previa" /> Sim, por contratação prévia</label>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label>O que essa pessoa quer? <span className="text-xs font-normal text-muted-foreground">(nunca presumido)</span></Label>
                <RadioGroup value={intencao} onValueChange={v => setIntencao(v as Intencao)} className="grid gap-2">
                  {([
                    ["reembolso", "Reembolso — pagou e quer ser ressarcida", false, ""],
                    ["oferta", "Oferta — pagou e não quer ressarcimento", true, "disponível na entrega 1B"],
                    ["compensacao_adiantamento", "Compensação de adiantamento", true, "fase futura"],
                    ["nao_declarada", "Ainda não declarou o que quer (fica A esclarecer)", false, ""],
                  ] as const).map(([v, r, off, dica]) => (
                    <label key={v} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${off ? "opacity-55 cursor-not-allowed" : "cursor-pointer"} ${intencao === v ? "border-primary bg-primary/5" : ""}`}>
                      <RadioGroupItem value={v} disabled={off} /> <span className="min-w-0 flex-1">{r}</span>{dica && <span className="text-[11px] text-muted-foreground">{dica}</span>}
                    </label>
                  ))}
                </RadioGroup>
                {declara && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="q-decl">Quando declarou?</Label>
                    <Input id="q-decl" type="date" max={hoje} value={declaradoEm} onChange={e => setDeclaradoEm(e.target.value)} />
                    <p className="text-xs text-muted-foreground">A intenção só é <b>Formal</b> com a declaração assinada anexada. Sem ela é <b>Relatado</b>, e reembolso não se paga com Relatado.</p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="q-motivo">{editando ? "Motivo da correção (obrigatório)" : "Observação (opcional)"}</Label>
            <Textarea id="q-motivo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={editando ? "Por que está mudando?" : "Ex.: pagou no cartão dele, cupom em mãos"} />
          </div>

          {invalido && problemas.length > 0 && (
            <ul className="space-y-0.5 rounded-md border border-warning-line bg-warning-soft/60 px-3 py-2 text-xs text-warning-text" role="alert">
              {problemas.map(p => <li key={p}>• {p}</li>)}
            </ul>
          )}
          {tipo !== "nao_localizado" && semComprador && problemas.length === 0 && <p className="text-xs text-warning-text">Diga se a igreja é a compradora.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || invalido || semMotivo}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? "Salvar correção" : tipo === "nao_localizado" ? "Marcar como não localizado" : "Registrar quitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
