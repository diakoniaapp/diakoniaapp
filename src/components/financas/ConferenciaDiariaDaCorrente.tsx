// ─── ConferenciaDiariaDaCorrente — "o saldo de cada dia terminou em R$ 1,00?" ──────────────────────────────────────────────
//
// O banco varre a conta corrente para o Invest Fácil todo dia com movimento, deixando R$ 1,00. Se o sistema terminou um dia com outro valor,
// falta registrar uma aplicação ou um resgate — e o aviso diz de quanto e de que dia, em vez de esperar a conta divergir por meses.
// Só leitura: a correção é feita na Mesa de Conciliação, com o PDF do extrato consolidado.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { brl } from "@/services/finService";
import { carregarConferenciaDiaria, type ConferenciaDiariaCarregada } from "@/services/investFacilService";
import { mensagemDaFalta } from "@/lib/varredura";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const MOSTRAR = 5;

export function ConferenciaDiariaDaCorrente() {
  const [dados, setDados] = useState<ConferenciaDiariaCarregada | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    carregarConferenciaDiaria().then(d => { if (vivo) setDados(d); }).catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, []);

  if (!dados || erro) return null;     // sem conta com Invest Fácil (ou sem OFX importado): não há o que conferir
  const { conferencia, contaId, contaNome, ultimaImportacao } = dados;
  const faltas = [...conferencia.faltas].reverse();

  if (faltas.length === 0) {
    return (
      <div className="rounded-md border border-success-line bg-success-soft/40 p-3 mb-2 flex items-start gap-2" role="status">
        <CheckCircle2 className="w-4 h-4 text-success-text shrink-0 mt-0.5" />
        <p className="text-sm min-w-0 text-success-text">
          <span className="font-medium">{contaNome}: todos os dias terminaram em R$ 1,00</span>
          <span className="opacity-80"> · conferido até {dataBr(conferencia.dias.at(-1)?.data ?? ultimaImportacao)}, antes da última importação ({dataBr(ultimaImportacao)})</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-warning-line bg-warning-soft/40 p-3 mb-2 space-y-1.5" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warning-text shrink-0 mt-0.5" />
        <p className="text-sm min-w-0 flex-1 text-warning-text">
          <span className="font-medium">{contaNome}: {faltas.length} {faltas.length !== 1 ? "dias não terminaram" : "dia não terminou"} em R$ 1,00</span>
          <span className="opacity-80"> · o sistema está {brl(Math.abs(conferencia.desvioAtual))} {conferencia.desvioAtual >= 0 ? "acima" : "abaixo"} do banco hoje</span>
        </p>
      </div>
      <ul className="text-xs space-y-0.5 pl-6">
        {faltas.slice(0, MOSTRAR).map(f => <li key={f.data}><b className="tabular-nums">{dataBr(f.data)}</b> · {mensagemDaFalta(f)}</li>)}
        {faltas.length > MOSTRAR && <li className="text-muted-foreground">e mais {faltas.length - MOSTRAR} dia{faltas.length - MOSTRAR !== 1 ? "s" : ""} antes destes.</li>}
      </ul>
      <p className="text-xs pl-6">
        Para corrigir, abra o <Link to={`/financas/conta/${contaId}`} className="underline underline-offset-2">extrato da conta</Link>, importe o OFX, anexe o PDF do extrato consolidado na Mesa de Conciliação e confirme as transferências sugeridas.
      </p>
    </div>
  );
}
