// ─── PacoteContabilCard.tsx — conferência + ZIP do Pacote Contábil do mês ──
//
// Mostra, ANTES de gerar, quantas saídas pagas do mês estão sem documento
// (a "conferência de anexos" que o financeiro não tinha — só o fiscal tinha)
// e baixa o ZIP. O ZIP sai mesmo com pendência: o aviso aqui e o
// PENDENCIAS.csv dentro dele são o alerta (decisão dela, 02/10/2026).
// Anexar direto da lista reaproveita o `AnexosLancamentoDialog` de sempre.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Files, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { brl, nomeExtrato, type FinLancamentoExtenso } from "@/services/finService";
import { baixarPacoteContabil, prepararPacoteContabil } from "@/services/pacoteContabilService";
import { dataBr, diaDoPagamento, type PlanoPacote } from "@/lib/pacoteContabil";

export function PacoteContabilCard({ ano, mes }: { ano: number; mes: number }) {
  const [plano, setPlano] = useState<PlanoPacote | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<[number, number] | null>(null);
  const [anexosPara, setAnexosPara] = useState<FinLancamentoExtenso | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try { setPlano(await prepararPacoteContabil(ano, mes)); }
    catch (e: any) { setErro(e?.message ?? "Erro ao conferir os documentos"); }
    finally { setCarregando(false); }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function gerar() {
    if (!plano) return;
    setGerando(true);
    setProgresso([0, plano.arquivos.length]);
    try {
      const r = await baixarPacoteContabil(plano, (f, t) => setProgresso([f, t]));
      if (r.falhas.length > 0) {
        toast.warning(`Pacote gerado, mas ${r.falhas.length} arquivo(s) não puderam ser baixados — veja ERROS.txt dentro do ZIP.`);
      } else if (r.pendencias > 0) {
        toast.warning(`Pacote gerado com ${r.pendencias} saída(s) sem documento — a lista está em PENDENCIAS.csv.`);
      } else {
        toast.success("Pacote contábil gerado e baixado");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar o pacote");
    } finally {
      setGerando(false);
      setProgresso(null);
    }
  }

  const nomeMinusculo = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  const mesNome = nomeMinusculo.charAt(0).toUpperCase() + nomeMinusculo.slice(1);
  const pendencias = plano?.pendencias ?? [];

  return (
    <section className="no-print rounded-md border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <PackageOpen className="w-5 h-5 text-gold mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base">Pacote contábil — {mesNome} de {ano}</h2>
          <p className="text-xs text-muted-foreground">
            ZIP por conta → dia do pagamento → fornecedor, com os documentos de cada saída.
          </p>
        </div>
        <Button variant="gold" size="sm" className="gap-1.5" onClick={gerar}
          disabled={carregando || gerando || !plano || plano.totalSaidas === 0}>
          {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {gerando && progresso ? `Baixando ${progresso[0]}/${progresso[1]}` : "Baixar pacote (ZIP)"}
        </Button>
      </div>

      {carregando && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Conferindo os documentos do mês…
        </p>
      )}
      {erro && <p className="text-xs text-destructive-text">{erro}</p>}

      {plano && !carregando && (
        <>
          <p className="text-sm tabular-nums">
            <strong>{plano.totalSaidas}</strong> saídas pagas ·{" "}
            <strong>{plano.comAnexo}</strong> com documento ·{" "}
            <strong className={pendencias.length ? "text-warning-text" : "text-success-text"}>
              {pendencias.length}
            </strong>{" "}sem documento
          </p>

          {plano.totalSaidas > 0 && pendencias.length === 0 && (
            <p className="text-xs text-success-text flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Todas as saídas do mês têm documento.
            </p>
          )}

          {pendencias.length > 0 && (
            <div className="rounded-md border border-warning-line bg-warning-soft p-3 space-y-2">
              <p className="text-xs text-warning-text flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{pendencias.length} saída(s) sem documento.</strong> O ZIP sai mesmo assim,
                  com a lista em <code>PENDENCIAS.csv</code>.
                </span>
              </p>
              <details>
                <summary className="text-xs cursor-pointer select-none text-warning-text">Ver quais</summary>
                <ul className="mt-2 max-h-64 overflow-y-auto divide-y text-xs">
                  {pendencias.map(l => (
                    <li key={l.id} className="flex items-center gap-2 py-1.5">
                      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{dataBr(diaDoPagamento(l))}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {nomeExtrato(l).principal}
                        <span className="text-muted-foreground"> · {l.conta_nome}</span>
                      </span>
                      <span className="tabular-nums shrink-0">{brl(l.valor)}</span>
                      <button type="button" onClick={() => setAnexosPara(l)} title="Anexar documento"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-gold">
                        <Files className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}

      {anexosPara && (
        <AnexosLancamentoDialog
          open={!!anexosPara}
          onOpenChange={(v) => !v && setAnexosPara(null)}
          lancamentoId={anexosPara.id}
          descricaoLancamento={nomeExtrato(anexosPara).principal}
          onChange={carregar}
        />
      )}
    </section>
  );
}
