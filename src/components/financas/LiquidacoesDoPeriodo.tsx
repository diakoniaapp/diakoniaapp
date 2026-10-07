// ─── LiquidacoesDoPeriodo — a Central de Pagamentos vista pela SITUAÇÃO de cada conta ────────────────────────
//
// Pedido dela (06/10/2026): para cada obrigação, Documento · Pago · Juros · Multa · Desconto · Saldo · Situação, com os 6
// status (Previsto, Em Aberto, Pago Parcialmente, Pago Integralmente, Pago com Diferença, Cancelado), e respostas
// prontas: quanto de juros, de multa, quanto economizamos, quais contas parciais, quais com ajuste manual.
// Lê `vw_fin_obrigacoes`; sem a migration 20261007110000 o painel não aparece.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { CampoData } from "@/components/CampoData";
import { brl } from "@/services/finService";
import { hojeLocal } from "@/lib/data";
import { ROTULO_DA_SITUACAO, type SituacaoDaObrigacao } from "@/lib/liquidacao";
import { listarObrigacoes, obrigacoesDisponiveis, totaisDasObrigacoes, type Obrigacao } from "@/services/obrigacoesService";

const ORDEM: SituacaoDaObrigacao[] = ["em_aberto", "pago_parcialmente", "pago_com_diferenca", "pago_integralmente", "previsto", "cancelado"];

const CHIP: Record<SituacaoDaObrigacao, string> = {
  previsto: "border-info-line bg-info-soft text-info-text",
  em_aberto: "border-destructive-line bg-destructive-soft text-destructive-text",
  pago_parcialmente: "border-warning-line bg-warning-soft text-warning-text",
  pago_integralmente: "border-success-line bg-success-soft text-success-text",
  pago_com_diferenca: "border-warning-line bg-warning-soft text-warning-text",
  cancelado: "border-border bg-muted text-muted-foreground",
};

const dataCurta = (ymd: string | null) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "—");
const valida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export function LiquidacoesDoPeriodo({ chaveDeAtualizacao }: { chaveDeAtualizacao?: number }) {
  const hoje = hojeLocal();
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;
  const [disponivel, setDisponivel] = useState<boolean | null>(null);
  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(hoje);
  const [lista, setLista] = useState<Obrigacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SituacaoDaObrigacao | "todas">("todas");

  useEffect(() => { obrigacoesDisponiveis().then(setDisponivel).catch(() => setDisponivel(false)); }, []);

  const inicio = valida(de) ? de : primeiroDoMes;
  const fim = valida(ate) ? ate : hoje;
  const carregar = useCallback(async () => {
    setErro(null);
    try { setLista(await listarObrigacoes(inicio, fim)); } catch (e: any) { setErro(e?.message ?? "Não foi possível carregar"); setLista([]); }
  }, [inicio, fim]);
  useEffect(() => { if (disponivel) carregar(); }, [disponivel, carregar, chaveDeAtualizacao]);

  const totais = useMemo(() => totaisDasObrigacoes(lista ?? []), [lista]);
  const contagem = useMemo(() => {
    const m = new Map<SituacaoDaObrigacao, number>();
    (lista ?? []).forEach(o => m.set(o.situacao, (m.get(o.situacao) ?? 0) + 1));
    return m;
  }, [lista]);
  const visiveis = (lista ?? []).filter(o => filtro === "todas" || o.situacao === filtro);

  if (!disponivel) return null;

  const Cartao = ({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) => (
    <div className="rounded-md border p-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-base font-extrabold tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Liquidações e diferenças</h3>
          <p className="text-[11px] text-muted-foreground">Cada conta: valor do documento, o que foi pago e a diferença. Período pelo último pagamento (ou vencimento).</p>
        </div>
        <div className="flex items-end gap-2">
          <span><label className="text-xs text-muted-foreground block">De</label><CampoData value={de} onChange={setDe} className="h-8 w-[10.5rem]" inputClassName="text-sm" /></span>
          <span><label className="text-xs text-muted-foreground block">Até</label><CampoData value={ate} onChange={setAte} className="h-8 w-[10.5rem]" inputClassName="text-sm" /></span>
        </div>
      </div>

      {lista === null ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Cartao rotulo="Juros pagos" valor={brl(totais.juros)} />
            <Cartao rotulo="Multas pagas" valor={brl(totais.multas)} detalhe={`encargos financeiros: ${brl(totais.juros + totais.multas)}`} />
            <Cartao rotulo="Economia com descontos" valor={brl(totais.economia)} detalhe={`${totais.comDesconto} conta${totais.comDesconto !== 1 ? "s" : ""}`} />
            <Cartao rotulo="Pagas parcialmente" valor={String(totais.parciais)} detalhe={totais.parciais > 0 ? `saldo pendente ${brl(totais.saldoDasParciais)}` : undefined} />
            <Cartao rotulo="Ajustes manuais" valor={brl(totais.ajustes)} detalhe={`${totais.comAjuste} conta${totais.comAjuste !== 1 ? "s" : ""}${totais.complementos > 0 ? ` · complementos ${brl(totais.complementos)}` : ""}`} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["todas", ...ORDEM] as const).map(f => {
              const n = f === "todas" ? lista.length : contagem.get(f) ?? 0;
              const ativo = filtro === f;
              return (
                <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={ativo}
                  className={`rounded-full border px-2.5 py-1 text-xs ${ativo ? "border-gold bg-gold/10 font-semibold" : "hover:bg-muted"}`}>
                  {f === "todas" ? "Todas" : ROTULO_DA_SITUACAO[f]} · {n}
                </button>
              );
            })}
          </div>

          {erro && <p className="text-xs text-destructive-text">{erro}</p>}
          {visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma conta neste filtro e período.</p>
          ) : (
            <ul className="divide-y">
              {visiveis.map(o => (
                <li key={o.obrigacao_id} className="py-2 text-sm space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(o.referencia)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{o.fornecedor_nome || o.descricao || "(sem descrição)"}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${CHIP[o.situacao]}`}>{ROTULO_DA_SITUACAO[o.situacao]}</span>
                  </div>
                  <p className="pl-[3.25rem] text-xs text-muted-foreground tabular-nums flex flex-wrap gap-x-3">
                    <span>Documento {brl(o.valor_original)}</span>
                    {o.total_pago > 0 && <span>Pago {brl(o.total_pago)}</span>}
                    {o.juros > 0 && <span>Juros {brl(o.juros)}</span>}
                    {o.multa > 0 && <span>Multa {brl(o.multa)}</span>}
                    {o.desconto > 0 && <span>Desconto {brl(o.desconto)}</span>}
                    {o.complemento > 0 && <span>Complemento {brl(o.complemento)}</span>}
                    {o.ajuste > 0 && <span className="text-warning-text">Ajuste manual {brl(o.ajuste)}</span>}
                    {o.saldo_pendente > 0.009 && o.situacao !== "cancelado" && o.situacao !== "previsto" && o.situacao !== "em_aberto" && <span className="text-warning-text font-medium">Saldo pendente {brl(o.saldo_pendente)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
