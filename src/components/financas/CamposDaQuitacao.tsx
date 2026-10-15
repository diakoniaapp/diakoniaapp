// ─── CamposDaQuitacao — o formulário "quem pagou e por quê", usado por QuitacaoDialog (despesa que já existe) e NotaQuitadaDialog (nota que o app ainda não tinha) ─────────
//
// Controlado: quem usa guarda o estado e valida. A pergunta é sempre a mesma — quem pagou o fornecedor (uma pessoa, uma empresa, uma entidade, ou "não sei"), quando, o que foi comprado, se a
// igreja é a compradora e O QUE ESSA PESSOA QUER (reembolso, oferta ou ainda não declarou). A intenção NUNCA é presumida. Compensação de adiantamento aparece desabilitada (fase futura).
import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FORMAS_DE_PAGAMENTO, ROTULO_FORMA, cnpjValido, problemasDoRegistro, type FormaDePagamento, type Intencao, type NaturezaDoItem } from "@/lib/quitacao";
import { buscarPessoasParaLancamento, listarFornecedores, type FinFornecedor } from "@/services/finService";

export type TipoEscolhido = "pessoa" | "empresa" | "entidade" | "nao_localizado";
export interface Escolhido { id: string; nome: string; cnpj?: string | null }

export interface EstadoDaQuitacao {
  tipo: TipoEscolhido;
  escolhido: Escolhido | null;
  pagoEm: string;
  intencao: Intencao;
  declaradoEm: string;
  condicao: string;
  pedeRecibo: boolean;
  natureza: NaturezaDoItem | "";
  comprador: "cnpj_igreja" | "contratacao_previa" | "";
  /** Fase 1D-a: como o terceiro pagou o fornecedor (vai impressa na Declaração do Terceiro) */
  forma: FormaDePagamento | "";
}

export const ESTADO_VAZIO: EstadoDaQuitacao = { tipo: "pessoa", escolhido: null, pagoEm: "", intencao: "nao_declarada", declaradoEm: "", condicao: "", pedeRecibo: false, natureza: "", comprador: "", forma: "" };

export const NATUREZAS: { valor: NaturezaDoItem; rotulo: string }[] = [
  { valor: "consumo", rotulo: "Material de consumo" }, { valor: "estoque", rotulo: "Estoque" }, { valor: "duravel", rotulo: "Bem durável (equipamento, móvel…)" }, { valor: "servico", rotulo: "Serviço" },
];

/** O que impede de salvar, em palavras (o banco confere de novo e recusa o que a Política não permite). */
export function problemasDoEstado(e: EstadoDaQuitacao, emitenteId: string | null, hoje: string, pedirForma = false): string[] {
  if (e.tipo === "nao_localizado") return [];
  const declara = e.intencao === "reembolso" || e.intencao === "oferta" || e.intencao === "compensacao_adiantamento";
  const p = problemasDoRegistro({
    responsavel: e.tipo, intencao: e.intencao, pessoaId: e.tipo === "pessoa" ? e.escolhido?.id ?? null : null, fornecedorId: e.tipo !== "pessoa" ? e.escolhido?.id ?? null : null,
    pagoEm: e.pagoEm || null, declaradoEm: declara ? e.declaradoEm || null : null, naturezaItem: (e.natureza || null) as NaturezaDoItem | null, hoje, emitenteId,
    cnpjDoFornecedor: e.tipo !== "pessoa" ? e.escolhido?.cnpj ?? null : null,
  });
  if (!e.comprador) p.push("Diga se a igreja é a compradora.");
  if (pedirForma && !e.forma) p.push("Informe a forma de pagamento usada pelo terceiro.");
  return p;
}

/** O que acontece com a obrigação conforme a intenção: o fluxo "quem pagou → o que quer → como será tratada" (14/10/2026). Só informa: a decisão é sempre da pessoa e nada aqui é presumido. */
export function ConsequenciaDaIntencao({ intencao }: { intencao: Intencao }) {
  const texto: Partial<Record<Intencao, { titulo: string; itens: string[] }>> = {
    oferta: {
      titulo: "Como a obrigação será tratada: oferta",
      itens: [
        "A nota é despesa da igreja e se extingue sem pagamento da igreja quando a prova bastar. Nenhum dinheiro da igreja se move.",
        "Não gera entrada, transferência nem saída, e não se liga a nenhuma conta financeira.",
        "Documentos: a nota fiscal em nome da igreja e a Declaração do Terceiro assinada (gerada pelo sistema). Com as duas a oferta está formalizada: não precisa do comprovante do pagamento do terceiro, e a chave de acesso é opcional (se informada, tem de ser válida).",
        "Alto risco (pessoa do circuito financeiro, empresa que recebe pagamentos da igreja, bem durável ou pedido de recibo com efeito fiscal): o comprovante do pagamento do terceiro OU a aprovação formal do Administrador, com justificativa.",
      ],
    },
    reembolso: {
      titulo: "Como a obrigação será tratada: reembolso",
      itens: [
        "A nota continua em aberto como dívida da igreja com a pessoa. O fornecedor não é pago de novo.",
        "Aprovação: o reembolso é aprovado por outra pessoa (acima do teto da Política, só o Administrador). Só depois de aprovado se paga.",
        "Documentos: a nota fiscal, a Declaração do Terceiro assinada e, conforme o nível de risco, a prova do pagamento. A conta de onde sai o pagamento se escolhe na hora de pagar.",
      ],
    },
    nao_declarada: {
      titulo: "Como a obrigação será tratada: ainda sem declaração",
      itens: ["A nota fica em aberto na fila A esclarecer, sem pagar o fornecedor nem a pessoa, até ela declarar o que quer: reembolso ou oferta."],
    },
  };
  const t = texto[intencao];
  if (!t) return null;
  return (
    <div className="rounded-md border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground space-y-1" aria-label="O que acontece com a obrigação">
      <p className="font-semibold text-foreground">{t.titulo}</p>
      <ul className="list-disc pl-4 space-y-0.5">{t.itens.map(i => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export function CamposDaQuitacao({ valor: v, onChange, ofertaLiberada, hoje, pedirForma = false }: { valor: EstadoDaQuitacao; onChange: (parte: Partial<EstadoDaQuitacao>) => void; ofertaLiberada: boolean; hoje: string; pedirForma?: boolean }) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Escolhido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const seq = useRef(0);

  // a busca no cadastro certo: Pessoa em Pessoas; Empresa e Entidade em Favorecidos (com CNPJ)
  useEffect(() => {
    if (v.escolhido || v.tipo === "nao_localizado" || busca.trim().length < 2) { setAchados([]); return; }
    const minha = ++seq.current; setBuscando(true);
    const t = setTimeout(async () => {
      try {
        let lista: Escolhido[];
        if (v.tipo === "pessoa") lista = (await buscarPessoasParaLancamento(busca.trim(), true).catch(() => [])).map(p => ({ id: p.id, nome: p.nome }));
        else lista = (await listarFornecedores(busca.trim()).catch(() => [] as FinFornecedor[])).slice(0, 12).map(f => ({ id: f.id, nome: f.nome, cnpj: f.cnpj_cpf }));
        if (minha === seq.current) setAchados(lista.slice(0, 12));
      } finally { if (minha === seq.current) setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, v.tipo, v.escolhido]);

  const declara = v.intencao === "reembolso" || v.intencao === "oferta" || v.intencao === "compensacao_adiantamento";
  const OPCOES: [Intencao, string, boolean, string][] = [
    ["reembolso", "Reembolso — pagou e quer ser ressarcida", false, ""],
    ["oferta", "Oferta — pagou e não quer ressarcimento", !ofertaLiberada, "ainda não liberada no banco"],
    ["compensacao_adiantamento", "Compensação de adiantamento", true, "fase futura"],
    ["nao_declarada", "Ainda não declarou o que quer (fica A esclarecer)", false, ""],
  ];

  return (
    <div className="space-y-4">
      {v.tipo !== "nao_localizado" && (
      <div className="space-y-1.5">
        <Label>A igreja é a compradora?</Label>
        <RadioGroup value={v.comprador} onValueChange={c => onChange({ comprador: c as "cnpj_igreja" | "contratacao_previa" })} className="grid gap-2 sm:grid-cols-2">
          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${v.comprador === "cnpj_igreja" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="cnpj_igreja" /> Sim, a nota está no CNPJ da igreja</label>
          <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${v.comprador === "contratacao_previa" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="contratacao_previa" /> Sim, por contratação prévia</label>
        </RadioGroup>
      </div>

      )}

      <div className="space-y-1.5">
        <Label>Quem pagou o fornecedor?</Label>
        <RadioGroup value={v.tipo} onValueChange={t => { onChange({ tipo: t as TipoEscolhido, escolhido: null }); setBusca(""); }} className="grid grid-cols-2 gap-2">
          {([["pessoa", "Uma pessoa"], ["empresa", "Uma empresa"], ["entidade", "Uma entidade"], ["nao_localizado", "Não sei quem pagou"]] as const).map(([k, r]) => (
            <label key={k} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${v.tipo === k ? "border-primary bg-primary/5" : ""}`}>
              <RadioGroupItem value={k} /> {r}
            </label>
          ))}
        </RadioGroup>
        {v.tipo === "nao_localizado" && <p className="text-xs text-muted-foreground">A conta entra na fila <b>Investigar</b>. Ela continua em aberto; se a igreja a pagar depois, a marcação some sozinha.</p>}
      </div>

      {v.tipo !== "nao_localizado" && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="q-busca">{v.tipo === "pessoa" ? "Pessoa" : v.tipo === "empresa" ? "Empresa" : "Entidade"} (do cadastro)</Label>
            {v.escolhido ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{v.escolhido.nome}</span>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange({ escolhido: null })}>Trocar</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="q-busca" className="pl-8" placeholder="Digite pelo menos 2 letras do nome" value={busca} onChange={e => setBusca(e.target.value)} autoComplete="off" />
                {buscando && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                {achados.length > 0 && (
                  <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border divide-y text-sm">
                    {achados.map(a => {
                      const ruim = v.tipo !== "pessoa" && !cnpjValido(a.cnpj);
                      return (
                        <li key={a.id}>
                          <button type="button" disabled={ruim} onClick={() => { onChange({ escolhido: a }); setAchados([]); }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60">
                            <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                            {ruim && <span className="text-[11px] text-warning-text">sem CNPJ válido — corrija o cadastro</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {v.tipo !== "pessoa" && <p className="mt-1 text-xs text-muted-foreground">Empresa e entidade só podem ser registradas com CNPJ válido no cadastro de Favorecidos.</p>}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-pago">Quando pagou o fornecedor?</Label>
              <Input id="q-pago" type="date" max={hoje} value={v.pagoEm} onChange={e => onChange({ pagoEm: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-nat">O que foi comprado?</Label>
              <select id="q-nat" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={v.natureza} onChange={e => onChange({ natureza: e.target.value as NaturezaDoItem | "" })}>
                <option value="">Escolha…</option>
                {NATUREZAS.map(n => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
              </select>
            </div>
          </div>

          {pedirForma && (
            <div className="space-y-1.5">
              <Label htmlFor="q-forma">Como o terceiro pagou o fornecedor?</Label>
              <select id="q-forma" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={v.forma} onChange={e => onChange({ forma: e.target.value as FormaDePagamento | "" })}>
                <option value="">Escolha…</option>
                {FORMAS_DE_PAGAMENTO.map(f => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Vai impressa na Declaração do Terceiro e ajuda a auditoria.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>O que essa pessoa quer? <span className="text-xs font-normal text-muted-foreground">(nunca presumido)</span></Label>
            <RadioGroup value={v.intencao} onValueChange={i => onChange({ intencao: i as Intencao })} className="grid gap-2">
              {OPCOES.map(([k, r, off, dica]) => (
                <label key={k} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${off ? "opacity-55 cursor-not-allowed" : "cursor-pointer"} ${v.intencao === k ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value={k} disabled={off} /> <span className="min-w-0 flex-1">{r}</span>{off && dica && <span className="text-[11px] text-muted-foreground">{dica}</span>}
                </label>
              ))}
            </RadioGroup>
            {declara && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="q-decl">Quando declarou?</Label>
                <Input id="q-decl" type="date" max={hoje} value={v.declaradoEm} onChange={e => onChange({ declaradoEm: e.target.value })} />
                <p className="text-xs text-muted-foreground">A intenção só é <b>Formal</b> com a declaração assinada anexada. Sem ela é <b>Relatado</b>: vale para uma oferta de risco baixo; reembolso não se paga com Relatado.</p>
              </div>
            )}
            <ConsequenciaDaIntencao intencao={v.intencao} />
            {v.intencao === "oferta" && (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="space-y-1">
                  <Label htmlFor="q-cond" className="text-xs">A oferta tem condição ou destinação restrita? (opcional)</Label>
                  <Input id="q-cond" value={v.condicao} onChange={e => onChange({ condicao: e.target.value })} placeholder="Ex.: só para a EBD" />
                </div>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={v.pedeRecibo} onChange={e => onChange({ pedeRecibo: e.target.checked })} />
                  <span>O ofertante pede recibo com efeito fiscal. <span className="text-muted-foreground">(A igreja só emite declaração de recebimento, sem efeito no Imposto de Renda; isto eleva o risco da operação.)</span></span>
                </label>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
