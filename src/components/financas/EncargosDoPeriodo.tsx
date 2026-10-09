// ─── EncargosDoPeriodo — "Juros, multas e descontos pagos" na Prestação de Contas ────────────────────────────────────────────────
//
// Uma obrigação continua sendo UMA obrigação (um documento, um boleto, uma guia, um comprovante): juros, multa e desconto são atributos dela,
// não lançamentos à parte. Aqui o relatório mostra, para cada obrigação paga com diferença no período, o valor do documento, o que se pagou a mais
// (juros, multa, outros) ou a menos (desconto) e o total que saiu do banco — e os totais que respondem "quanto pagamos de juros / de multa /
// quanto economizamos". Lê `vw_fin_obrigacoes` (antes da migration que a cria, o bloco simplesmente não aparece).
import { useEffect, useState } from "react";
import { brl } from "@/services/finService";
import { listarObrigacoes, obrigacoesDisponiveis, totaisDasObrigacoes, type Obrigacao } from "@/services/obrigacoesService";

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

interface Props { de: string; ate: string; contaId?: string }

export function EncargosDoPeriodo({ de, ate, contaId }: Props) {
  const [lista, setLista] = useState<Obrigacao[] | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (!(await obrigacoesDisponiveis())) { if (vivo) setLista(null); return; }
        const todas = await listarObrigacoes(de, ate);
        if (!vivo) return;
        setLista(todas
          .filter(o => (!contaId || o.conta_id === contaId) && o.juros + o.multa + o.complemento + o.ajuste + o.desconto > 0.004)
          .sort((a, b) => String(a.ultimo_pagamento ?? a.referencia).localeCompare(String(b.ultimo_pagamento ?? b.referencia))));
      } catch { if (vivo) setLista(null); }
    })();
    return () => { vivo = false; };
  }, [de, ate, contaId]);

  if (lista === null) return null;
  const t = totaisDasObrigacoes(lista);
  const c2 = (n: number) => Math.round(n * 100) / 100;

  return (
    <section className="avoid-break mb-6" aria-label="Juros, multas e descontos pagos no período">
      <h3 className="text-sm font-semibold mb-1">Juros, multas e descontos do período</h3>
      <p className="text-xs text-muted-foreground mb-2">
        Cada obrigação é um só documento; os encargos e descontos são dela. Pago = valor do documento + juros + multa + outros − desconto.
      </p>
      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma obrigação foi paga com juros, multa ou desconto neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Pago em</th>
                <th className="py-1 pr-2 font-medium">Obrigação</th>
                <th className="py-1 pr-2 font-medium text-right">Valor original</th>
                <th className="py-1 pr-2 font-medium text-right">Juros</th>
                <th className="py-1 pr-2 font-medium text-right">Multa</th>
                <th className="py-1 pr-2 font-medium text-right">Outros</th>
                <th className="py-1 pr-2 font-medium text-right">Desconto</th>
                <th className="py-1 font-medium text-right">Total pago</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(o => (
                <tr key={o.obrigacao_id} className="border-b border-border/40 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap tabular-nums">{dataBr(o.ultimo_pagamento)}</td>
                  <td className="py-1 pr-2 min-w-0">
                    <span className="font-medium">{o.descricao ?? "—"}</span>
                    {o.fornecedor_nome && o.fornecedor_nome !== o.descricao && <span className="text-muted-foreground"> · {o.fornecedor_nome}</span>}
                    {o.situacao === "pago_parcialmente" && <span className="text-warning-text"> · pago parcialmente (falta {brl(o.saldo_pendente)})</span>}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{brl(o.valor_original)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{o.juros > 0 ? brl(o.juros) : "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{o.multa > 0 ? brl(o.multa) : "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{o.complemento + o.ajuste > 0 ? brl(c2(o.complemento + o.ajuste)) : "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{o.desconto > 0 ? `− ${brl(o.desconto)}` : "—"}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{brl(o.total_pago)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1.5 pr-2" colSpan={3}>Totais do período</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{brl(t.juros)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{brl(t.multas)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{t.ajustes + t.complementos > 0 ? brl(c2(t.ajustes + t.complementos)) : "—"}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{t.economia > 0 ? `− ${brl(t.economia)}` : "—"}</td>
                <td className="py-1.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
