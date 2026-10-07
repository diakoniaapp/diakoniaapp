// ─── LiquidacaoPainel — "quanto foi pago?" e, se não bate com o documento, por quê ───────────────────────────
//
// Fica dentro do diálogo "Confirmar pagamento". Igual ao documento: nada a responder (um clique, como sempre).
// Diferente: mostra Valor Original · Valor Pago · Diferença · Motivo e só deixa confirmar quando a diferença está
// EXPLICADA (parcial, desconto, juros, multa, outro documento, complemento ou ajuste com motivo). A conta é de
// `lib/liquidacao.ts`; este componente só colhe as respostas e devolve o plano pronto para quem confirma.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { paraNumero } from "@/lib/dinheiro";
import {
  planejarLiquidacao, type DocumentoAPagar, type MotivoPagouMais, type MotivoPagouMenos, type PlanoDeLiquidacao,
} from "@/lib/liquidacao";
import { documentosEmAbertoDoFavorecido, type DocumentoEmAberto } from "@/services/liquidacaoService";
import { brl, type FinVencimento } from "@/services/finService";
const dataBrCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

const MOTIVOS_A_MAIOR: { valor: MotivoPagouMais; rotulo: string }[] = [
  { valor: "juros", rotulo: "Juros" },
  { valor: "multa", rotulo: "Multa" },
  { valor: "juros_multa", rotulo: "Juros e Multa" },
  { valor: "outro_documento", rotulo: "Outro documento incluído" },
  { valor: "complemento", rotulo: "Complementação voluntária" },
  { valor: "ajuste", rotulo: "Ajuste manual" },
];

const txt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function LiquidacaoPainel({ lancamento, onPlano, valorPagoFixo }: {
  lancamento: Pick<FinVencimento, "id" | "valor" | "data" | "fornecedor_id">;
  onPlano: (p: PlanoDeLiquidacao) => void;
  /** Pagamento que veio do extrato: o valor pago é o do banco e não se digita. */
  valorPagoFixo?: number;
}) {
  const [valorPagoTxt, setValorPagoTxt] = useState(txt(valorPagoFixo ?? Number(lancamento.valor)));
  const [extras, setExtras] = useState<DocumentoEmAberto[]>([]);
  const [candidatos, setCandidatos] = useState<DocumentoEmAberto[] | null>(null);
  const [escolhendo, setEscolhendo] = useState(false);
  const [motivoMenos, setMotivoMenos] = useState<MotivoPagouMenos | null>(null);
  const [motivoMais, setMotivoMais] = useState<MotivoPagouMais | null>(null);
  const [jurosTxt, setJurosTxt] = useState("");
  const [multaTxt, setMultaTxt] = useState("");
  const [complTxt, setComplTxt] = useState("");
  const [ajusteTxt, setAjusteTxt] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState("");

  const documentos: DocumentoAPagar[] = useMemo(() => [
    { id: lancamento.id, valor: Number(lancamento.valor), vencimento: String(lancamento.data).slice(0, 10) },
    ...extras.map(e => ({ id: e.id, valor: e.valor, vencimento: e.vencimento })),
  ], [lancamento.id, lancamento.valor, lancamento.data, extras]);

  const plano = useMemo(() => planejarLiquidacao({
    documentos, valorPago: paraNumero(valorPagoTxt), motivoMenos, motivoMais,
    juros: paraNumero(jurosTxt), multa: paraNumero(multaTxt), complemento: paraNumero(complTxt),
    ajuste: paraNumero(ajusteTxt), motivoDoAjuste: motivoAjuste,
  }), [documentos, valorPagoTxt, motivoMenos, motivoMais, jurosTxt, multaTxt, complTxt, ajusteTxt, motivoAjuste]);

  useEffect(() => { onPlano(plano); }, [plano, onPlano]);

  // Ao incluir/remover documento o "valor pago" acompanha a soma, enquanto a pessoa não tiver digitado outro.
  const [valorPagoMexido, setValorPagoMexido] = useState(false);
  useEffect(() => {
    if (!valorPagoMexido && valorPagoFixo === undefined) setValorPagoTxt(txt(documentos.reduce((s, d) => s + d.valor, 0)));
  }, [documentos, valorPagoMexido, valorPagoFixo]);

  async function abrirEscolha() {
    setEscolhendo(true);
    if (candidatos === null) {
      try { setCandidatos(await documentosEmAbertoDoFavorecido(lancamento)); } catch { setCandidatos([]); }
    }
  }

  function escolherMotivoMais(m: MotivoPagouMais) {
    setMotivoMais(m);
    const d = txt(Math.max(plano.diferenca, 0));
    if (m === "juros") { setJurosTxt(d); setMultaTxt(""); }
    if (m === "multa") { setMultaTxt(d); setJurosTxt(""); }
    if (m === "juros_multa") { setJurosTxt(""); setMultaTxt(""); }
    if (m === "complemento") setComplTxt(d);
    if (m === "ajuste") setAjusteTxt(d);
    if (m === "outro_documento") void abrirEscolha();
  }

  const aMenos = plano.diferenca < -0.004;
  const aMaior = plano.diferenca > 0.004;
  const livres = (candidatos ?? []).filter(c => !extras.some(e => e.id === c.id));

  return (
    <div className="rounded-md border bg-muted/20 p-2.5 space-y-2.5">
      <div className="grid grid-cols-2 gap-2 items-end">
        <div className="min-w-0">
          <Label className="text-xs">Valor do documento</Label>
          <p className="h-9 flex items-center text-sm font-semibold tabular-nums">{brl(plano.valorOriginal)}</p>
        </div>
        <div className="min-w-0">
          <Label htmlFor="liq-valor-pago" className="text-xs">{valorPagoFixo !== undefined ? "Valor no extrato" : "Valor pago (saiu do banco)"}</Label>
          <Input id="liq-valor-pago" type="text" inputMode="decimal" className="h-9 tabular-nums"
            value={valorPagoTxt} readOnly={valorPagoFixo !== undefined}
            onChange={(e) => { setValorPagoMexido(true); setValorPagoTxt(e.target.value); setMotivoMenos(null); setMotivoMais(null); }} />
        </div>
      </div>

      {extras.length > 0 && (
        <ul className="space-y-1">
          {extras.map(e => (
            <li key={e.id} className="flex items-center gap-2 text-xs rounded border bg-background px-2 py-1">
              <span className="min-w-0 flex-1 truncate">{e.descricao ?? "Documento"} · vence {dataBrCurta(e.vencimento)}</span>
              <span className="tabular-nums font-medium">{brl(e.valor)}</span>
              <button type="button" aria-label="Tirar este documento do pagamento" className="text-muted-foreground hover:text-foreground"
                onClick={() => { setExtras(x => x.filter(y => y.id !== e.id)); setMotivoMais(null); setMotivoMenos(null); }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lancamento.fornecedor_id && (
        <div>
          {!escolhendo ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs px-1" onClick={abrirEscolha}>
              <Plus className="w-3 h-3" /> Incluir outro documento neste pagamento
            </Button>
          ) : (
            <div className="rounded border bg-background p-1.5 space-y-1">
              <p className="text-2xs text-muted-foreground px-1">Outros documentos em aberto deste favorecido:</p>
              {candidatos === null && <p className="text-xs px-1">Procurando…</p>}
              {candidatos !== null && livres.length === 0 && <p className="text-xs px-1 text-muted-foreground">Nenhum outro documento em aberto.</p>}
              {livres.map(c => (
                <button key={c.id} type="button" className="w-full flex items-center gap-2 text-xs rounded px-1.5 py-1 hover:bg-muted text-left"
                  onClick={() => { setExtras(x => [...x, c]); setMotivoMais(null); setMotivoMenos(null); setEscolhendo(false); }}>
                  <span className="min-w-0 flex-1 truncate">{c.descricao ?? "Documento"} · vence {dataBrCurta(c.vencimento)}</span>
                  <span className="tabular-nums font-medium">{brl(c.valor)}</span>
                </button>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-6 text-2xs px-1" onClick={() => setEscolhendo(false)}>Fechar</Button>
            </div>
          )}
        </div>
      )}

      {(aMenos || aMaior) && (
        <div className="rounded-md border border-warning/50 bg-warning/5 p-2.5 space-y-2.5">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-warning-text">
            <AlertTriangle className="w-3.5 h-3.5" /> Diferença identificada
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <dt className="text-muted-foreground">Valor Original:</dt><dd className="font-medium text-right">{brl(plano.valorOriginal)}</dd>
            <dt className="text-muted-foreground">Valor Pago:</dt><dd className="font-medium text-right">{brl(plano.valorPago)}</dd>
            <dt className="text-muted-foreground">Diferença:</dt>
            <dd className="font-semibold text-right">{plano.diferenca > 0 ? "+" : "−"}{brl(Math.abs(plano.diferenca))}</dd>
            <dt className="text-muted-foreground">Motivo:</dt><dd className="font-medium text-right">{plano.motivo || "—"}</dd>
          </dl>

          {aMenos && (
            <RadioGroup value={motivoMenos ?? ""} onValueChange={(v) => setMotivoMenos(v as MotivoPagouMenos)} className="gap-1.5">
              <p className="text-xs">Pagou {brl(Math.abs(plano.diferenca))} a menos. O que foi?</p>
              <label className="flex items-center gap-2 text-xs"><RadioGroupItem value="parcial" /> Pagamento parcial — o saldo continua em aberto</label>
              <label className="flex items-center gap-2 text-xs"><RadioGroupItem value="desconto" /> Desconto (ex.: por antecipação)</label>
            </RadioGroup>
          )}

          {aMaior && (
            <>
              <RadioGroup value={motivoMais ?? ""} onValueChange={(v) => escolherMotivoMais(v as MotivoPagouMais)} className="gap-1.5">
                <p className="text-xs">Pagou {brl(plano.diferenca)} a mais. Qual o motivo da diferença?</p>
                {MOTIVOS_A_MAIOR.map(m => (
                  <label key={m.valor} className="flex items-center gap-2 text-xs"><RadioGroupItem value={m.valor} /> {m.rotulo}</label>
                ))}
              </RadioGroup>
              {(motivoMais === "juros" || motivoMais === "juros_multa") && (
                <ValorDoMotivo rotulo="Juros (R$)" valor={jurosTxt} onChange={setJurosTxt} />
              )}
              {(motivoMais === "multa" || motivoMais === "juros_multa") && (
                <ValorDoMotivo rotulo="Multa (R$)" valor={multaTxt} onChange={setMultaTxt} />
              )}
              {motivoMais === "complemento" && <ValorDoMotivo rotulo="Complementação (R$)" valor={complTxt} onChange={setComplTxt} />}
              {motivoMais === "ajuste" && (
                <>
                  <ValorDoMotivo rotulo="Ajuste (R$)" valor={ajusteTxt} onChange={setAjusteTxt} />
                  <div>
                    <Label htmlFor="liq-motivo-ajuste" className="text-xs">Motivo do ajuste (obrigatório)</Label>
                    <Input id="liq-motivo-ajuste" className="h-8 text-xs" value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} placeholder="Por que o valor pago é diferente?" />
                  </div>
                </>
              )}
            </>
          )}

          {plano.problemas.length > 0 && (
            <ul className="text-xs text-warning-text space-y-0.5">
              {plano.problemas.map(p => <li key={p}>• {p}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ValorDoMotivo({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs w-32 shrink-0">{rotulo}</Label>
      <Input type="text" inputMode="decimal" className="h-8 text-xs tabular-nums" value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
