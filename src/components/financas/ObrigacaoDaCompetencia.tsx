// ─── ObrigacaoDaCompetencia.tsx — Conta Corrente de Sustento, Fase 2 (3/3): a obrigação do saldo a pagar ──────────────────
//
// Para a competência FECHADA com saldo a pagar: adotar o previsto que a recorrência já gerou (o líquido de setembro vence em outubro, dia 5)
// ou, se não houver nenhum, criar um. Nada é criado sozinho — a tesouraria já tem esse previsto todo mês, e um segundo duplicaria o que a
// baixa das 12 obrigações corrigiu. Adotar liga o previsto à competência e ajusta o valor ao saldo a pagar; quem paga a obrigação é a Mesa
// de Operações/Conciliação, como sempre. Depois de paga, a obrigação é o pagamento final: aparece em "Pagamentos a classificar".
// Estes são os únicos botões do Sustento que escrevem em fin_lancamentos — e só em lançamento PREVISTO.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { brl } from "@/services/finService";
import {
  adotarObrigacao, atualizarValorDaObrigacao, criarObrigacao, desvincularObrigacao, obrigacoesCandidatas,
  type BeneficiarioComCompetencias, type CompetenciaDoSustento, type ObrigacaoCandidata,
} from "@/services/sustentoService";
import { TOLERANCIA, rotuloCompetencia, vencimentoDaObrigacao } from "@/lib/sustento";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const ROTULO_STATUS: Record<string, string> = { previsto: "prevista", conciliado: "paga", realizado: "paga", cancelado: "cancelada" };

export function ObrigacaoDaCompetencia({ b, c, aoMudar }: { b: BeneficiarioComCompetencias; c: CompetenciaDoSustento; aoMudar: () => void }) {
  const [candidatas, setCandidatas] = useState<ObrigacaoCandidata[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const saldo = Math.round(c.saldoAPagar * 100) / 100;
  const temObrigacao = !!c.obrigacao;
  const precisa = !temObrigacao && saldo > TOLERANCIA;

  useEffect(() => {
    setCandidatas(null);
    if (!precisa) return;
    obrigacoesCandidatas(b, c.competencia).then(setCandidatas).catch((e) => { toast.error(e?.message ?? "Não foi possível ler as obrigações previstas."); setCandidatas([]); });
  }, [c.id, precisa, b.pessoaId, b.fornecedorId]);

  async function executar(fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) {
    setOcupado(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível concluir."); return; }
      toast.success(sucesso);
      aoMudar();
    } finally {
      setOcupado(false);
    }
  }

  // aberta: ainda não há saldo a cobrar. Paga sem obrigação: nada a fazer.
  if (c.status === "aberta" || (!temObrigacao && !precisa)) return null;

  return (
    <div className="rounded-md border bg-background p-3 space-y-2" aria-label="Obrigação do saldo a pagar">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Obrigação do saldo a pagar</p>

      {temObrigacao && c.obrigacao && (
        <div className="space-y-1.5">
          <p className="text-sm">
            {brl(c.obrigacao.valor)} · vence {dataBr(c.obrigacao.data)} ·{" "}
            <span className="font-medium">{ROTULO_STATUS[c.obrigacao.status] ?? c.obrigacao.status}</span>
          </p>
          {c.obrigacao.status === "previsto" && Math.abs(c.obrigacao.valor - saldo) > TOLERANCIA && saldo > TOLERANCIA && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">O saldo a pagar agora é {brl(saldo)}.</span>
              <Button size="sm" variant="outline" className="h-7" disabled={ocupado}
                onClick={() => executar(() => atualizarValorDaObrigacao(c.obrigacao!.id, saldo), "Valor da obrigação atualizado.")}>
                Atualizar para {brl(saldo)}
              </Button>
            </div>
          )}
          {c.obrigacao.status !== "previsto" && (
            <p className="text-xs text-muted-foreground">
              Esta obrigação já foi paga: ela mesma é o pagamento final. Ligue-a em "Pagamentos a classificar" para zerar o saldo.
            </p>
          )}
          {c.obrigacao.status === "previsto" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupado}
              onClick={() => executar(() => desvincularObrigacao(c.id), "Obrigação desvinculada. O lançamento previsto continua existindo.")}>
              Desvincular
            </Button>
          )}
        </div>
      )}

      {precisa && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Saldo a pagar de {rotuloCompetencia(c.competencia)}: <span className="font-medium text-foreground">{brl(saldo)}</span>. Ainda não há obrigação ligada a esta competência.
          </p>
          {candidatas === null ? (
            <p className="text-xs text-muted-foreground">Procurando o previsto do mês…</p>
          ) : candidatas.length > 0 ? (
            <ul className="space-y-1.5" aria-label="Previstos que podem ser a obrigação">
              {candidatas.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                  <span className="min-w-0 text-xs">{dataBr(o.data)} · {o.descricao ?? "(sem descrição)"} · previsto {brl(o.valor)}</span>
                  <Button size="sm" className="h-7" disabled={ocupado}
                    onClick={() => executar(() => adotarObrigacao({ competenciaId: c.id, competencia: c.competencia, lancamentoId: o.id, valor: saldo }), "Obrigação adotada.")}>
                    Adotar como obrigação ({brl(saldo)})
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum previsto desta pessoa vence no mês seguinte.</p>
          )}
          <Button size="sm" variant="outline" className="h-7" disabled={ocupado || candidatas === null}
            onClick={() => executar(() => criarObrigacao({
              competenciaId: c.id, competencia: c.competencia, valor: saldo, vencimento: vencimentoDaObrigacao(c.competencia, b.diaDoLiquido),
              descricao: `Sustento — ${b.nomeExibicao.split(" — ")[0]} — ${rotuloCompetencia(c.competencia)}`, beneficiario: b,
            }), "Obrigação criada.")}>
            Criar nova obrigação
          </Button>
          <p className="text-xs text-muted-foreground">Adotar ajusta o valor do previsto ao saldo e o liga a esta competência. Criar só vale quando não há nada para adotar.</p>
        </div>
      )}
    </div>
  );
}
