// ─── PagarReembolsoDialog — pagar à PESSOA que pagou a nota (total ou parcial), sem lançamento fictício ─────────────────────────────────────────────
//
// Fase 1C-a da Política de Compras por Terceiros. O reembolso já foi APROVADO (outro ato, de outra pessoa); aqui a Tesouraria só PAGA: escolhe a conta de onde sai, a data, a forma e o valor
// (até o saldo a reembolsar). O banco (fin_liquidar_reembolso) confere tudo de novo e usa a liquidação de sempre: o dinheiro sai UMA vez, da conta escolhida. Não nasce entrada, transferência
// nem saída duplicada. O Pix e o QR são DE QUEM RECEBE (a pessoa), não do fornecedor da nota — pagar o fornecedor outra vez é justamente o erro que esta tela existe para evitar.
import { useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Paperclip, QrCode, Wallet } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { paraNumero } from "@/lib/dinheiro";
import { hojeLocal } from "@/lib/data";
import { mensagemErro } from "@/lib/erroRede";
import { formatarChavePix, montarPayloadPix, type TipoChavePix } from "@/lib/pix";
import { ROTULO_RESPONSAVEL } from "@/lib/quitacao";
import {
  adicionarAnexo, brl, buscarFornecedor, buscarPixDaPessoa, FORMA_LABEL, formasPermitidas, listarContas, type FinConta, type FinFormaPagamento,
} from "@/services/finService";
import { lancamentosDaLiquidacao, pagarReembolso, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import { supabase } from "@/integrations/supabase/client";

/** O que a tela precisa saber do reembolso a pagar (a linha da fila, ou o cartão da despesa). */
export type AlvoDoReembolso = Pick<QuitacaoDaObrigacao, "quitacaoId" | "obrigacaoId" | "responsavel" | "pessoaId" | "fornecedorId" | "responsavelNome" | "valorDaObrigacao" | "reembolsado" | "saldoAReembolsar"> & {
  descricao?: string | null;
  emitente?: string | null;
};

const txt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function PagarReembolsoDialog({ alvo, onFechar, onFeito }: { alvo: AlvoDoReembolso | null; onFechar: () => void; onFeito: () => void }) {
  const saldo = alvo?.saldoAReembolsar ?? alvo?.valorDaObrigacao ?? 0;
  const [contas, setContas] = useState<FinConta[]>([]);
  const [contaId, setContaId] = useState("");
  const [data, setData] = useState(hojeLocal());
  const [forma, setForma] = useState<FinFormaPagamento | "">("");
  const [valorTxt, setValorTxt] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pix, setPix] = useState<{ chave: string; tipo: TipoChavePix | null } | null>(null);
  const [carregandoPix, setCarregandoPix] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  // abrir: carrega as contas (a da despesa é a sugerida) e a chave Pix de QUEM RECEBE
  useEffect(() => {
    if (!alvo) return;
    let vivo = true;
    setData(hojeLocal()); setForma(""); setArquivo(null); setValorTxt(txt(alvo.saldoAReembolsar ?? alvo.valorDaObrigacao));
    (async () => {
      try {
        const [cs, l] = await Promise.all([
          listarContas(),
          supabase.from("fin_lancamentos").select("conta_id").eq("id", alvo.obrigacaoId).maybeSingle(),
        ]);
        if (!vivo) return;
        setContas(cs.filter(c => c.aceita_despesas !== false));
        const daDespesa = (l.data as unknown as { conta_id?: string } | null)?.conta_id;
        setContaId(daDespesa && cs.some(c => c.id === daDespesa) ? daDespesa : cs[0]?.id ?? "");
      } catch (e) { if (vivo) toast.error(mensagemErro(e)); }
    })();
    setCarregandoPix(true); setPix(null);
    (async () => {
      try {
        if (alvo.pessoaId) { const p = await buscarPixDaPessoa(alvo.pessoaId); if (vivo) setPix(p ? { chave: p.chave, tipo: p.tipo } : null); }
        else if (alvo.fornecedorId) { const f = await buscarFornecedor(alvo.fornecedorId); if (vivo) setPix(f?.chave_pix ? { chave: f.chave_pix, tipo: (f.tipo_chave_pix as TipoChavePix | null) } : null); }
      } catch { /* sem a chave o pagamento continua possível: é só uma comodidade */ }
      finally { if (vivo) setCarregandoPix(false); }
    })();
    return () => { vivo = false; };
  }, [alvo]);

  const valor = paraNumero(valorTxt);
  const conta = useMemo(() => contas.find(c => c.id === contaId) ?? null, [contas, contaId]);
  const formas = useMemo(() => formasPermitidas(conta, "saida"), [conta]);
  useEffect(() => { if (forma && !formas.includes(forma)) setForma(""); }, [formas, forma]);

  const payload = useMemo(() => {
    if (!alvo || !pix || !(valor > 0)) return null;
    try { return montarPayloadPix({ chave: pix.chave, tipoChave: pix.tipo, nomeRecebedor: alvo.responsavelNome ?? "Beneficiário", valor }); } catch { return null; }
  }, [alvo, pix, valor]);
  useEffect(() => {
    let vivo = true;
    if (!payload) { setQr(null); return; }
    QRCode.toDataURL(payload, { margin: 1, width: 200 }).then(u => { if (vivo) setQr(u); }).catch(() => { if (vivo) setQr(null); });
    return () => { vivo = false; };
  }, [payload]);

  if (!alvo) return null;
  const parcial = valor > 0 && valor < saldo - 0.004;
  const problema = !(valor > 0) ? "Informe o valor." : valor > saldo + 0.004 ? `O valor passa do que falta reembolsar (${brl(saldo)}).` : !contaId ? "Escolha a conta de onde sai o pagamento." : !data ? "Informe a data." : null;

  async function pagar() {
    if (!alvo || problema) return;
    setOcupado(true);
    try {
      const liq = await pagarReembolso({ quitacaoId: alvo.quitacaoId, contaId, data, forma: forma || null, valor });
      if (arquivo) {
        try { const ids = await lancamentosDaLiquidacao(liq); if (ids[0]) await adicionarAnexo(ids[0], arquivo, "comprovante"); }
        catch (e) { toast.error(`Pago, mas o comprovante não subiu: ${mensagemErro(e)}`); }
      }
      toast.success(parcial ? `Reembolso pago em parte — falta ${brl(saldo - valor)}.` : "Reembolso pago por inteiro.");
      onFeito(); onFechar();
    } catch (e) { toast.error(mensagemErro(e, "Não foi possível pagar o reembolso")); }
    finally { setOcupado(false); }
  }
  async function copiar(t: string, o: string) { try { await navigator.clipboard.writeText(t); toast.success(`${o} copiado — cole no app do seu banco`); } catch { toast.error("Não consegui copiar"); } }

  return (
    <Dialog open onOpenChange={o => { if (!o && !ocupado) onFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar reembolso</DialogTitle>
          <DialogDescription>
            Pagar a <b>{alvo.responsavelNome ?? ROTULO_RESPONSAVEL[alvo.responsavel]}</b> o que ela pagou{alvo.emitente ? <> a {alvo.emitente}</> : null}. O fornecedor <b>não</b> é pago de novo.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div><dt className="text-[11px] text-muted-foreground">Nota</dt><dd className="tabular-nums font-medium">{brl(alvo.valorDaObrigacao)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Já reembolsado</dt><dd className="tabular-nums font-medium">{brl(alvo.reembolsado ?? 0)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Falta</dt><dd className="tabular-nums font-semibold">{brl(saldo)}</dd></div>
        </dl>

        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <Label htmlFor="reemb-valor" className="text-xs">Valor a pagar agora</Label>
              <Input id="reemb-valor" inputMode="decimal" className="h-9 tabular-nums" value={valorTxt} onChange={e => setValorTxt(e.target.value)} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="reemb-data" className="text-xs">Data do pagamento</Label>
              <Input id="reemb-data" type="date" className="h-9" max={hojeLocal()} value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          {parcial && <p className="text-xs text-warning-text">Pagamento parcial: os {brl(saldo - valor)} restantes continuam na fila “Reembolso a pagar”.</p>}
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <Label htmlFor="reemb-conta" className="text-xs">Sai da conta</Label>
              <select id="reemb-conta" value={contaId} onChange={e => setContaId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="reemb-forma" className="text-xs">Forma (opcional)</Label>
              <select id="reemb-forma" value={forma} onChange={e => setForma(e.target.value as FinFormaPagamento | "")} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">—</option>
                {formas.map(f => <option key={f} value={f}>{FORMA_LABEL[f]}</option>)}
              </select>
            </div>
          </div>

          {carregandoPix && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Procurando a chave Pix de quem recebe…</p>}
          {pix && (
            <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-gold" /> Pix de {alvo.responsavelNome ?? "quem recebe"}</p>
              <p className="text-xs text-muted-foreground break-all">{formatarChavePix(pix.chave, pix.tipo)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!payload} onClick={() => payload && void copiar(payload, "Código Pix")}><Copy className="w-3.5 h-3.5" /> Copiar Pix</Button>
                {qr && <span className="text-xs text-muted-foreground flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> ou escaneie:</span>}
              </div>
              {qr && <img src={qr} alt="QR Code do Pix de quem recebe" width={140} height={140} className="rounded border bg-white p-1 mx-auto" />}
            </div>
          )}
          {!carregandoPix && !pix && <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">Quem recebe ainda não tem chave Pix cadastrada: pague pelo meio combinado e registre o pagamento aqui.</p>}

          <div>
            <label className="text-xs font-medium flex items-center gap-1.5 mb-1"><Paperclip className="w-3.5 h-3.5" /> Anexar comprovante do pagamento (opcional agora; sem ele a despesa não fica Pronta)</label>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)} className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-background" />
          </div>
          {problema && <p className="text-xs text-warning-text" role="status">{problema}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>Cancelar</Button>
          <Button disabled={ocupado || !!problema} onClick={() => void pagar()}>{ocupado ? "…" : parcial ? "Pagar parte" : "Pagar reembolso"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
