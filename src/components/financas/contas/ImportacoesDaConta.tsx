// ─── ImportacoesDaConta — a aba "Importações": trazer um arquivo para a conta e ver o que já foi trazido ──────────────────────────────────────────────
// Fase D (20/10/2026): o REGISTRO dos arquivos que a conta já recebeu, para a pessoa saber se um arquivo é novo antes de importar (a trava de arquivo repetido segue sendo a do banco,
// `unique(conta_id, arquivo_hash)`). Desde 21/10/2026 a aba só existe no cartão (histórico de faturas) e NÃO tem botão: "Importar fatura" fica no cabeçalho da conta, em qualquer aba.
import { useCallback, useEffect, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listarArquivosImportados, type ArquivoImportado } from "@/services/importacaoArquivosService";
import type { FinContaTipo } from "@/services/finService";

const dataBr = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

export function ImportacoesDaConta({ contaId, contaNome, tipo }: { contaId: string; contaNome: string; tipo: FinContaTipo }) {
  const [arquivos, setArquivos] = useState<ArquivoImportado[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setArquivos(await listarArquivosImportados(contaId)); }
    catch (e: any) { toast.error(e?.message ?? "Não foi possível listar os arquivos importados"); }
    finally { setCarregando(false); }
  }, [contaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <section aria-label={`Importações de ${contaNome}`} className="rounded-lg border bg-card" data-aba="importacoes">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold"><FileUp className="h-4 w-4 text-gold" /> Importações — {contaNome}</h2>
          <p className="text-xs text-muted-foreground">
            {tipo === "cartao"
              ? "Faturas do cartão já importadas. Um arquivo repetido é recusado antes de gravar qualquer lançamento. Para importar uma nova, use \"Importar fatura\" no alto da conta."
              : "Arquivos que a conta já recebeu."}
          </p>
        </div>
      </header>

      {carregando ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : arquivos.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum arquivo importado nesta conta ainda.</p>
      ) : (
        <ul className="divide-y">
          {arquivos.map(a => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate font-medium">{a.arquivo_nome || a.lote_tag}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.data_min && a.data_max ? `${dataBr(a.data_min)} a ${dataBr(a.data_max)}` : "período não registrado"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{a.qtd_linhas} {a.qtd_linhas === 1 ? "linha" : "linhas"} · importado em {dataBr(a.importado_em)}</span>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}
