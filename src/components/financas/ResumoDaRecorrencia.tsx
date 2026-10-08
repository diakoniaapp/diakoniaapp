// ─── ResumoDaRecorrencia.tsx — a linha de baixo do cartão de uma recorrência ────────
//
// Frequência e dia, o favorecido (ou o aviso de que não há), o próximo vencimento e, no
// parcelamento, "parcela 4/12 · próxima 5/12 · término 15/09/2027". Tudo calculado por
// `lib/recorrencia.ts` — a mesma régua que gera os lançamentos.

import { AlertTriangle } from "lucide-react";
import { FREQUENCIA_LABEL, type FinRecorrencia } from "@/services/finService";
import { dataFimReal, situacaoDaSerie } from "@/lib/recorrencia";
import { parametrosDaRecorrencia } from "@/services/recorrenciaService";
import { hojeLocal } from "@/lib/data";

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

export function ResumoDaRecorrencia({ r }: { r: FinRecorrencia }) {
  const favorecido = r.fornecedor_nome ?? r.pessoa_nome ?? null;
  const semFavorecido = r.tipo === "saida" && !r.fornecedor_id && !r.pessoa_id;
  const s = situacaoDaSerie(parametrosDaRecorrencia(r), hojeLocal());
  const parcelado = r.tipo_recorrencia === "parcelamento" && !!r.total_parcelas;
  return (
    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span>{FREQUENCIA_LABEL[r.frequencia]} · todo dia {r.dia_vencimento}</span>
      {favorecido && <span className="truncate max-w-[16rem]">· {favorecido}</span>}
      {semFavorecido && (
        <span className="inline-flex items-center gap-1 text-warning-text" title="Abra a recorrência e escolha o favorecido no cadastro">
          <AlertTriangle className="w-3 h-3" /> sem favorecido vinculado
        </span>
      )}
      {r.ativo && s.proximoVencimento && <span>· próximo {dataBr(s.proximoVencimento)}</span>}
      {parcelado && s.parcelaAtual && (
        <span className="text-foreground">
          · parcela {s.parcelaAtual.numero}/{s.parcelaAtual.total}
          {s.proximaParcela && <> · próxima {s.proximaParcela.numero}/{s.proximaParcela.total}</>}
          {s.termino && <> · término {dataBr(s.termino)}</>}
        </span>
      )}
      {!parcelado && dataFimReal(r.data_fim) && <span>· até {dataBr(r.data_fim!)}</span>}
      {!parcelado && !dataFimReal(r.data_fim) && <span>· sem data final</span>}
      {r.ultimo_gerado_ate && <span>· lançamentos até {dataBr(r.ultimo_gerado_ate)}{!parcelado && !dataFimReal(r.data_fim) ? " (renova sozinho)" : ""}</span>}
    </p>
  );
}
