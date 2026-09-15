// ─── ImportacaoFaturaDialog.tsx ──────────────────────────────────────────
//
// Pedido da Telma (15/09/2026): trazer os pagamentos de 2024 do cartão
// Visa — não passaram pelo Omie, ela só tem os PDFs de fatura em mãos, um
// por titular de cartão ("alguns meses estão com duas faturas cada").
// Mesmo padrão de segurança do `ImportacaoOmieDialog.tsx`, reaproveitado
// direto: trava de arquivo repetido (`fin_import_arquivos`), aviso de
// sobreposição de período, tela fecha sozinha ao confirmar com "Desfazer"
// embutido no toast.
//
// Diferença de forma: aceita VÁRIOS arquivos de uma vez (um mês = vários
// titulares), e o "fornecedor" de cada linha é o texto do Histórico do
// extrato — sem CNPJ, então o casamento é por nome. Confirmado por ela:
// não precisa vincular o titular do cartão a uma pessoa; cada
// "Histórico" vira um fornecedor, com o mesmo aprendizado de categoria/
// centro de custo que já existe pros demais.
import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  FileUp, Upload, TrendingDown, AlertTriangle, Building2, ShieldAlert, FileWarning,
} from "lucide-react";
import {
  brl, listarCategorias, listarCentrosCusto,
  type FinCategoria, type FinCentroCusto,
} from "@/services/finService";
import {
  prepararImportacaoFatura, confirmarImportacaoFatura, desfazerImportacaoFatura,
  type ResumoImportacaoFatura, type ResolucaoFornecedorFatura,
} from "@/services/faturaImportService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function ImportacaoFaturaDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [processando, setProcessando] = useState(false);
  const [resumo, setResumo] = useState<ResumoImportacaoFatura | null>(null);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  // chave (fornecedor normalizado) → o que fazer. Todo fornecedor novo
  // nasce como "criar", sem categoria/centro — a pessoa preenche só quem
  // quiser (fica sem categoria/centro por padrão, dá pra classificar
  // depois, mesma folga que o import do Omie já dá pra categoria sem
  // correspondente).
  const [resolucoes, setResolucoes] = useState<Record<string, { categoriaId: string; centroCustoId: string }>>({});
  const [confirmando, setConfirmando] = useState(false);
  const emVooRef = useRef(false);

  function reiniciar() {
    setResumo(null);
    setResolucoes({});
  }

  async function processarArquivos(files: File[]) {
    if (files.length === 0) return;
    setProcessando(true);
    try {
      const [res, cats, ccs] = await Promise.all([
        prepararImportacaoFatura(files, contaId),
        categorias.length ? Promise.resolve(categorias) : listarCategorias("saida"),
        centros.length ? Promise.resolve(centros) : listarCentrosCusto(),
      ]);
      if (categorias.length === 0) setCategorias(cats);
      if (centros.length === 0) setCentros(ccs);

      if (res.transacoes.length === 0) {
        const semNenhuma = res.arquivosLidos.every(a => a.jaImportado || !a.lida);
        toast.error(semNenhuma
          ? "Nenhum arquivo novo pra importar (já importados ou formato não reconhecido)."
          : "Nenhuma transação encontrada nos arquivos.");
        return;
      }
      setResumo(res);
      setResolucoes(Object.fromEntries(
        res.fornecedoresNovos.map(f => [f.chave, { categoriaId: "", centroCustoId: "" }])));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler os arquivos");
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar() {
    if (!resumo || emVooRef.current) return;
    emVooRef.current = true;
    setConfirmando(true);
    try {
      const arquivosOk = resumo.arquivosLidos.filter(a => a.lida && !a.jaImportado);
      const resolucoesFornecedor: ResolucaoFornecedorFatura[] = resumo.fornecedoresNovos.map(f => {
        const escolha = resolucoes[f.chave];
        return {
          chave: f.chave, acao: "criar", nome: f.nomeOriginal,
          categoriaId: escolha?.categoriaId || null,
          centroCustoId: escolha?.centroCustoId || null,
        };
      });

      const r = await confirmarImportacaoFatura(
        resumo.transacoes, contaId,
        arquivosOk.map(a => ({ nomeArquivo: a.nomeArquivo, hash: a.hash })),
        resolucoesFornecedor,
      );

      const partes = [`${r.criados} lançamento${r.criados !== 1 ? "s" : ""} importado${r.criados !== 1 ? "s" : ""}`];
      if (r.fornecedoresCriados > 0) partes.push(`${r.fornecedoresCriados} fornecedor(es) novo(s)`);

      onOpenChange(false);
      reiniciar();
      toast.success(partes.join(" · "), {
        duration: 15000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              const n = await desfazerImportacaoFatura(r.loteTag);
              toast.success(`${n} lançamento(s) removido(s) — importação desfeita`);
              onSaved();
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao desfazer");
            }
          },
        },
      });
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao importar");
    } finally {
      setConfirmando(false);
      emVooRef.current = false;
    }
  }

  const travado = confirmando || processando;
  const arquivosProntos = resumo?.arquivosLidos.filter(a => a.lida && !a.jaImportado) ?? [];
  const arquivosComProblema = resumo?.arquivosLidos.filter(a => !a.lida || a.jaImportado) ?? [];
  const amostra = resumo?.transacoes.slice(0, 50) ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (travado) return; onOpenChange(v); if (!v) reiniciar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Upload className="w-5 h-5 text-gold" /> Importar fatura de cartão
          </DialogTitle>
          <DialogDescription>
            Traz as transações do extrato de <strong>{contaNome}</strong> lidas direto do PDF da
            fatura — pra período que não passou pelo Omie. Pode escolher vários arquivos de uma vez
            (um mês pode ter mais de um titular de cartão).
          </DialogDescription>
        </DialogHeader>

        {!resumo && (
          processando ? (
            <p className="text-sm text-center text-muted-foreground py-6">Lendo os PDFs...</p>
          ) : (
            <label className="cursor-pointer block">
              <input type="file" accept="application/pdf" multiple className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) processarArquivos(files);
                  e.target.value = "";
                }} />
              <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
                <FileUp className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm">Selecionar fatura(s) em PDF — pode escolher várias</span>
                <span className="text-xs text-muted-foreground text-center">
                  Extrato "Net Empresa" do Bradesco, um PDF por titular de cartão.
                </span>
              </div>
            </label>
          )
        )}

        {resumo && (
          <div className="space-y-3">
            {arquivosComProblema.length > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3 space-y-1">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" /> {arquivosComProblema.length} arquivo(s) ficaram de fora
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {arquivosComProblema.map(a => (
                    <li key={a.nomeArquivo} className="flex items-center gap-1.5">
                      <FileWarning className="w-3 h-3 shrink-0" />
                      {a.nomeArquivo} — {a.jaImportado ? "já importado nesta conta antes" : "formato não reconhecido"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Arquivos prontos</p>
                <p className="text-lg font-semibold tabular-nums">{arquivosProntos.length}</p>
              </div>
              <div className="rounded-md border border-destructive-line bg-destructive-soft/20 p-2">
                <p className="text-xs text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
                <p className="text-lg font-semibold tabular-nums text-destructive-text">− {brl(resumo.totalSaidas)}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">Transações</p>
                <p className="text-lg font-semibold tabular-nums">{resumo.transacoes.length}</p>
              </div>
            </div>

            {resumo.periodoMin && resumo.periodoMax && (
              <p className="text-xs text-muted-foreground">
                Período: {dataBr(resumo.periodoMin)} a {dataBr(resumo.periodoMax)}
              </p>
            )}

            {resumo.sobreposicaoNaConta > 0 && (
              <div className="rounded-md border border-warning-line bg-warning-soft/30 p-3">
                <p className="text-sm font-medium text-warning-text flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {contaNome} já tem {resumo.sobreposicaoNaConta} lançamento(s) no período destes arquivos
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Confira se não é uma reimportação de um período já trazido antes — se for de
                  propósito, pode seguir.
                </p>
              </div>
            )}

            {resumo.fornecedoresNovos.length > 0 && (
              <div className="rounded-md border border-info-line bg-info-soft/20 p-3 space-y-2">
                <p className="text-sm font-medium text-info-text flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> {resumo.fornecedoresNovos.length} fornecedor(es) novo(s) — categoria e centro de custo opcionais, dá pra deixar em branco e classificar depois
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {resumo.fornecedoresNovos.map(f => (
                    <div key={f.chave} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center text-xs border-b border-border/30 py-1 last:border-0">
                      <div className="min-w-0">
                        <p className="truncate">{f.nomeOriginal}</p>
                        <p className="text-muted-foreground">{f.qtdTransacoes}×</p>
                      </div>
                      <Select value={resolucoes[f.chave]?.categoriaId ?? ""}
                        onValueChange={(v) => setResolucoes(prev => ({ ...prev, [f.chave]: { ...prev[f.chave], categoriaId: v } }))}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>
                          {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={resolucoes[f.chave]?.centroCustoId ?? ""}
                        onValueChange={(v) => setResolucoes(prev => ({ ...prev, [f.chave]: { ...prev[f.chave], centroCustoId: v } }))}>
                        <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Centro custo" /></SelectTrigger>
                        <SelectContent>
                          {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md p-2">
              {amostra.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 py-1 last:border-0">
                  <span className="text-muted-foreground shrink-0">{dataBr(t.data)}</span>
                  <span className="flex-1 min-w-0 truncate">{t.historico}</span>
                  <span className="text-muted-foreground shrink-0 hidden sm:inline">{t.titular}</span>
                  <span className={`tabular-nums shrink-0 ${t.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                    {t.tipo === "entrada" ? "+" : "−"} {brl(t.valor)}
                  </span>
                </div>
              ))}
              {resumo.transacoes.length > amostra.length && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {resumo.transacoes.length - amostra.length} transação(ões)...
                </p>
              )}
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar} disabled={travado}>Trocar arquivo(s)</Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={travado}>
            Fechar
          </Button>
          {resumo && arquivosProntos.length > 0 && (
            <Button type="button" onClick={confirmar} disabled={confirmando}
              className="bg-gold hover:bg-gold/90 text-white gap-1.5">
              <Upload className="w-3.5 h-3.5" /> {confirmando ? "Importando..." : `Importar ${resumo.transacoes.length} transação(ões)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
