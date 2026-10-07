// ─── LeituraDoDocumentoPainel.tsx — "Lido do documento": o que o sistema achou e o que sugere ──────────────
//
// Pedido dela (06/10/2026): ao anexar boleto/guia/fatura, extrair valor, vencimento, beneficiário, código de
// barras, linha digitável e Pix, e sugerir categoria, centro e fornecedor. Esta peça só APRESENTA e dispara as
// ações (quem lê, sugere e grava é `documentoPagamentoService`): cada número vem com a prova ao lado (o que o
// lançamento tem hoje) e nada é aplicado sozinho.
//
// Medido nos 23 documentos reais da tesouraria: o valor sai certo em 21 de 21 com texto exato e o CNPJ do
// beneficiário confere em 13 de 13 que o têm — por isso o painel destaca a COMPARAÇÃO com o lançamento (valor
// e vencimento), e não o número isolado.

import { AlertTriangle, CheckCircle2, Copy, ScanText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl } from "@/services/finService";
import type { LancamentoLido, LeituraDoArquivo } from "@/services/documentoPagamentoService";
import type { Sugestao } from "@/lib/documentos/sugestaoPagamento";

interface Props {
  leitura: LeituraDoArquivo;
  sugestao: Sugestao | null;
  lancamento: LancamentoLido | null;
  nomeDoFornecedor: (id: string) => string;
  nomeDaCategoria: (id: string) => string;
  nomeDoCentro: (id: string) => string;
  /** Falso quando o lançamento já foi pago/conciliado: valor e vencimento não se mexem. */
  podeAlterar: boolean;
  ocupado: boolean;
  onUsarValor: () => void;
  onUsarVencimento: () => void;
  onPreencherClassificacao: () => void;
  onCopiar: (texto: string, oQue: string) => void;
}

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const cnpjBr = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
const juntar = (d: string, tam: number) => d.match(new RegExp(`.{1,${tam}}`, "g"))?.join(" ") ?? d;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs py-1">
      <span className="w-24 shrink-0 text-muted-foreground">{rotulo}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function LeituraDoDocumentoPainel({
  leitura, sugestao, lancamento, nomeDoFornecedor, nomeDaCategoria, nomeDoCentro,
  podeAlterar, ocupado, onUsarValor, onUsarVencimento, onPreencherClassificacao, onCopiar,
}: Props) {
  const d = leitura.documento;
  const porOcr = leitura.fonte === "ocr";

  const valorDifere = !!lancamento && d.valor !== null && Math.abs(d.valor - lancamento.valor) > 0.009;
  const vencDifere = !!lancamento && d.vencimento !== null && d.vencimento !== lancamento.data;

  // o que a sugestão tem a mais do que o lançamento já traz
  const vazios = !!lancamento && !!sugestao && (
    (!lancamento.fornecedor_id && !!sugestao.fornecedorId)
    || (!lancamento.categoria_id && !!sugestao.categoriaId)
    || (!lancamento.centro_custo_id && !!sugestao.centroId)
  );
  // Fornecedor DIFERENTE do que o lançamento tem = o aviso mais útil do painel: o documento provavelmente
  // pertence a OUTRO lançamento (anexo no lugar errado). Nunca se diz "já está assim" nesse caso.
  const fornecedorDiverge = !!lancamento && !!sugestao?.fornecedorId && !!lancamento.fornecedor_id && sugestao.fornecedorId !== lancamento.fornecedor_id;
  const categoriaDiverge = !!lancamento && !!sugestao?.categoriaId && !!lancamento.categoria_id && sugestao.categoriaId !== lancamento.categoria_id;
  const classificacaoJaConfere = !!lancamento && !!sugestao && !vazios && !fornecedorDiverge && !categoriaDiverge;

  return (
    <section className="rounded-md border border-gold/40 bg-muted/30 p-3 space-y-2" aria-label="Lido do documento">
      <div className="flex items-center gap-2 flex-wrap">
        <Sparkles className="w-4 h-4 text-gold shrink-0" />
        <h3 className="text-sm font-semibold">Lido do documento: {d.rotulo}</h3>
        <span className={`px-1.5 py-0.5 rounded text-2xs ${porOcr ? "bg-warning-soft text-warning-text" : "bg-success-soft text-success-text"}`}>
          {porOcr ? <><ScanText className="w-3 h-3 inline mr-0.5" />foto/escaneado (OCR)</> : "texto exato do PDF"}
        </span>
        <span className="text-2xs text-muted-foreground ml-auto tabular-nums">confiança {d.confianca}%</span>
      </div>

      {porOcr && (
        <p className="text-xs text-warning-text flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Lido por OCR{leitura.confiancaDoOcr != null ? ` (${leitura.confiancaDoOcr}%)` : ""}: o OCR erra dígito. Confira o valor, o vencimento e a linha digitável com o documento antes de pagar.
        </p>
      )}
      {d.avisos.map(a => (
        <p key={a} className="text-xs text-warning-text flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {a}
        </p>
      ))}

      <div className="divide-y divide-border/60">
        <Linha rotulo="Valor">
          {d.valor === null ? <span className="text-muted-foreground">não encontrei</span> : (
            <span className="flex items-center gap-2 flex-wrap">
              <strong className="tabular-nums text-sm">{brl(d.valor)}</strong>
              {lancamento && (valorDifere
                ? <span className="text-warning-text">lançamento está {brl(lancamento.valor)}</span>
                : <span className="text-success-text flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />confere com o lançamento</span>)}
              {valorDifere && podeAlterar && (
                <Button type="button" size="sm" variant="outline" className="h-6 text-2xs" disabled={ocupado} onClick={onUsarValor}>Usar o do documento</Button>
              )}
            </span>
          )}
        </Linha>
        <Linha rotulo="Vencimento">
          {d.vencimento === null ? <span className="text-muted-foreground">não encontrei</span> : (
            <span className="flex items-center gap-2 flex-wrap">
              <strong className="tabular-nums text-sm">{dataBr(d.vencimento)}</strong>
              {lancamento && (vencDifere
                ? <span className="text-warning-text">lançamento está em {dataBr(lancamento.data)}</span>
                : <span className="text-success-text flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />confere</span>)}
              {vencDifere && podeAlterar && (
                <Button type="button" size="sm" variant="outline" className="h-6 text-2xs" disabled={ocupado} onClick={onUsarVencimento}>Usar o do documento</Button>
              )}
            </span>
          )}
        </Linha>
        <Linha rotulo="Beneficiário">
          {d.beneficiario || d.cnpjBeneficiario
            ? <span>{d.beneficiario ?? "—"}{d.cnpjBeneficiario ? <span className="text-muted-foreground tabular-nums"> · CNPJ {cnpjBr(d.cnpjBeneficiario)}</span> : null}</span>
            : <span className="text-muted-foreground">não encontrei</span>}
        </Linha>
        {d.competencia && <Linha rotulo="Competência"><span className="tabular-nums">{d.competencia.slice(5)}/{d.competencia.slice(0, 4)}</span></Linha>}
        {d.numeroDocumento && <Linha rotulo="Nº documento"><span className="tabular-nums">{d.numeroDocumento}</span></Linha>}

        {(d.linhaDigitavel || d.codigoBarras) && (
          <Linha rotulo="Linha digitável">
            <span className="flex items-start gap-2">
              <code className="text-2xs break-all flex-1 tabular-nums">{juntar(d.linhaDigitavel ?? d.codigoBarras ?? "", 5)}</code>
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 text-2xs shrink-0"
                onClick={() => onCopiar((d.linhaDigitavel ?? d.codigoBarras)!, "Linha digitável")}>
                <Copy className="w-3 h-3" /> Copiar
              </Button>
            </span>
            {d.codigoValido === true && <span className="text-2xs text-success-text">dígitos verificadores conferem</span>}
          </Linha>
        )}
        {d.pix && (
          <Linha rotulo="Pix">
            <span className="flex items-start gap-2">
              <span className="flex-1 min-w-0">
                {d.pix.nomeRecebedor ?? "recebedor não informado"}{d.pix.chave ? <span className="text-muted-foreground"> · chave {d.pix.chave}</span> : null}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 text-2xs shrink-0"
                onClick={() => onCopiar(d.pix!.payload, "Pix copia e cola")}>
                <Copy className="w-3 h-3" /> Copiar Pix
              </Button>
            </span>
          </Linha>
        )}
      </div>

      {sugestao && (sugestao.fornecedorId || sugestao.categoriaId || sugestao.centroId) && (
        <div className="rounded border bg-background/60 p-2 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">Sugestão de classificação</p>
            <span className="text-2xs text-muted-foreground tabular-nums">confiança {sugestao.confianca}%</span>
            {sugestao.origem === "aprendido" && <span className="px-1.5 py-0.5 rounded bg-info-soft text-info-text text-2xs">aprendido com você</span>}
          </div>
          <p className="text-xs">
            {sugestao.fornecedorId && <>Favorecido <strong>{nomeDoFornecedor(sugestao.fornecedorId)}</strong> · </>}
            {sugestao.categoriaId && <>Categoria <strong>{nomeDaCategoria(sugestao.categoriaId)}</strong></>}
            {sugestao.centroId && <> · Centro <strong>{nomeDoCentro(sugestao.centroId)}</strong></>}
          </p>
          <p className="text-2xs text-muted-foreground">{sugestao.motivos.join(" · ")}</p>
          {lancamento && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {classificacaoJaConfere && <span className="text-xs text-success-text flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />o lançamento já está assim</span>}
              {fornecedorDiverge && (
                <span className="text-xs text-warning-text flex items-start gap-1.5 basis-full">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Este documento é de <strong>{nomeDoFornecedor(sugestao!.fornecedorId!)}</strong>, mas o lançamento está com{" "}
                  <strong>{nomeDoFornecedor(lancamento!.fornecedor_id!)}</strong> — confira se é o lançamento certo antes de anexar.
                </span>
              )}
              {categoriaDiverge && !fornecedorDiverge && (
                <span className="text-xs text-warning-text">
                  o lançamento usa <strong>{nomeDaCategoria(lancamento.categoria_id!)}</strong> — vale o que você escolheu; vou aprender com isso
                </span>
              )}
              {vazios && (
                <Button type="button" size="sm" variant="outline" className="h-6 text-2xs" disabled={ocupado} onClick={onPreencherClassificacao}>
                  Preencher o que está vazio
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
