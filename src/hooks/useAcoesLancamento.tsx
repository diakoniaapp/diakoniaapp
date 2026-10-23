// ─── useAcoesLancamento.tsx — pagar, aprovar e rejeitar sem trocar de tela ──
//
// Fase 10 do roadmap Financeiro ERP (22/09/2026): "Central Operacional
// Financeira" — o pedido explícito foi "o usuário deve conseguir realizar
// trabalho financeiro sem navegar entre múltiplas telas". Até aqui, Pagar/
// Aprovar/Rejeitar só existiam dentro de `FinancasAgenda.tsx` — o Painel da
// Tesouraria mostrava a mesma fila, mas só como link "abrir agenda".
//
// Em vez de copiar os três diálogos pro Painel (duplicando a mesma lógica
// de Pix/QR/anexo que a Fase 8 já escreveu), este hook isola o que é
// COMPORTAMENTO — estado, chamadas de serviço, os três diálogos prontos —
// de onde ele é DISPARADO. Qualquer tela que já carregue vencimentos ou
// pendências (Agenda, Painel da Tesouraria) monta `{dialogs}` uma vez e
// chama `pagar(v)` a partir da própria lista (aprovar/rejeitar saíram em 14/10/2026).
//
// `FinancasAgenda.tsx` foi refeito pra usar este hook em vez da cópia local
// — prova que a extração não mudou comportamento nenhum, só o lugar onde
// mora.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Loader2, Copy, QrCode, Paperclip, Wallet, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  confirmarPagamento,
  buscarFornecedor, adicionarAnexo, brl, pessoaDoLancamento, buscarPixDaPessoa, salvarPixDaPessoa,
  fornecedoresParaNome, atualizarLancamento, listarContas,
  type FinVencimento, type FinLancamentoExtenso, type FinFornecedor, type FinConta,
} from "@/services/finService";
import { montarPayloadPix, formatarChavePix, TIPOS_CHAVE_PIX, type TipoChavePix } from "@/lib/pix";
import { Input } from "@/components/ui/input";
import QRCode from "qrcode";
import { mensagemErro } from "@/lib/erroRede";
import { hojeLocal } from "@/lib/data";
import { dadosParaPagarDoLancamento, ID_DA_LINHA_INFORMADA, informarLinhaDigitavel, type DadosParaPagar } from "@/services/documentoPagamentoService";
import { linhaParaGuardar } from "@/lib/boleto";
import { fornecedorPeloNome, type FornecedorParaNome } from "@/lib/favorecidoPorNome";
import { LiquidacaoPainel } from "@/components/financas/LiquidacaoPainel";
import { liquidacaoDisponivel, liquidar } from "@/services/liquidacaoService";
import type { PlanoDeLiquidacao } from "@/lib/liquidacao";
import { QuitacaoDialog, type AlvoDaQuitacao } from "@/components/financas/QuitacaoDialog";
import { RecalcularGuiaDialog, type AlvoDoRecalculo } from "@/components/financas/RecalcularGuiaDialog";
import { listarRecalculos, type RecalculoRegistrado } from "@/services/recalculoDeObrigacaoService";
import { resumoDoRecalculo } from "@/lib/recalculoDeGuia";
import { CONTA_NAO_APLICAVEL_ID, ROTULO_FILA, ROTULO_RESPONSAVEL, ehTerceiro } from "@/lib/quitacao";
import { quitacaoDaObrigacao, quitacaoDisponivel, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import { DataDoPagamento, type EstadoDaDataDoPagamento } from "@/components/financas/DataDoPagamento";
import { auditoriaDaDataDisponivel, registrarDecisaoDaData } from "@/services/comprovanteService";

const dataBrCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const juntarEm = (d: string, n: number) => d.match(new RegExp(`.{1,${n}}`, "g"))?.join(" ") ?? d;

export function useAcoesLancamento(onChanged: () => void | Promise<void>) {

  // `confirm()` nativo não dispara em WebView (CLAUDE.md Risco 3) — por
  // isso os três são AlertDialog/Dialog, nunca `window.confirm`.
  const [confirmando, setConfirmando] = useState<FinVencimento | null>(null);
  const [confirmandoBusy, setConfirmandoBusy] = useState(false);

  // Central de Pagamentos (Fase 8): Pix pronto pra copiar/escanear e anexo
  // opcional no mesmo instante da confirmação — só pra saída.
  const [fornecedorPagando, setFornecedorPagando] = useState<FinFornecedor | null>(null);
  const [carregandoFornecedor, setCarregandoFornecedor] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);
  // A data em que o dinheiro saiu (14/10/2026): sugerida pelo comprovante, decidida pela pessoa — não mais "hoje" sem perguntar.
  const [dataPag, setDataPag] = useState<EstadoDaDataDoPagamento | null>(null);
  useEffect(() => { setDataPag(null); }, [confirmando?.id]);   // só quando muda a DESPESA (vincular favorecido troca o objeto, não a despesa)
  // Pagamento a uma PESSOA do catálogo (folha, RPA, côngrua): o lançamento tem `pessoa_id`, não
  // `fornecedor_id`. A chave Pix dela mora em `fin_pessoa_pix` (migration 20261006170000).
  const [pessoaPagando, setPessoaPagando] = useState<{ id: string; nome: string; pix: { chave: string; tipo: TipoChavePix | null } | null } | null>(null);
  const [novaChave, setNovaChave] = useState("");
  const [novoTipoChave, setNovoTipoChave] = useState<TipoChavePix>("cpf");
  const [salvandoChave, setSalvandoChave] = useState(false);
  const [recarregarPix, setRecarregarPix] = useState(0);

  // Pagamentos inteligentes (06/10/2026): o que está IMPRESSO nos documentos já anexados (linha digitável, Pix do
  // próprio boleto, valor, vencimento) — para pagar sem abrir o PDF e conferir o valor ANTES de pagar.
  const [docsPagamento, setDocsPagamento] = useState<DadosParaPagar[]>([]);
  const [lendoDocs, setLendoDocs] = useState(false);
  // A linha digitável INFORMADA no lançamento (23/10/2026), para quem não anexou o arquivo da fatura: digitar/colar aqui guarda o código no lançamento e o Pagar, o "Preparar envio" e o e-mail diário passam a mostrá-lo.
  const [linhaTexto, setLinhaTexto] = useState("");
  const [salvandoLinha, setSalvandoLinha] = useState(false);
  const [recarregarDocs, setRecarregarDocs] = useState(0);
  const linhaInformadaAtual = docsPagamento.find(d => d.anexoId === ID_DA_LINHA_INFORMADA)?.linhaDigitavel ?? "";
  const temLinhaDeAnexo = docsPagamento.some(d => d.anexoId !== ID_DA_LINHA_INFORMADA && (d.linhaDigitavel || d.codigoBarras));
  const conferenciaDaLinha = linhaTexto.replace(/\D/g, "") ? linhaParaGuardar(linhaTexto) : null;
  useEffect(() => { setLinhaTexto(""); }, [confirmando?.id]);
  async function salvarLinha() {
    if (!confirmando) return;
    setSalvandoLinha(true);
    try {
      const r = await informarLinhaDigitavel(confirmando.id, linhaTexto);
      toast.success(r.digitos ? "Linha digitável guardada neste lançamento" : "Linha digitável removida");
      setLinhaTexto(""); setRecarregarDocs(n => n + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui guardar a linha digitável"); }
    finally { setSalvandoLinha(false); }
  }
  useEffect(() => {
    setDocsPagamento([]);
    if (!confirmando || confirmando.tipo !== "saida") return;
    let cancelado = false;
    setLendoDocs(true);
    dadosParaPagarDoLancamento(confirmando.id)
      .then(d => { if (!cancelado) setDocsPagamento(d); })
      .catch(() => { /* melhoria: sem a leitura o "Pagar" continua igual ao de antes */ })
      .finally(() => { if (!cancelado) setLendoDocs(false); });
    return () => { cancelado = true; };
  }, [confirmando, recarregarDocs]);

  // Liquidação real (migration 20261007100000): valor pago × documento, parcial, juros, multa, desconto. Sem a migration
  // o "Pagar" continua o de antes (`liqDisponivel` = false).
  const [liqDisponivel, setLiqDisponivel] = useState(false);
  const [planoLiq, setPlanoLiq] = useState<PlanoDeLiquidacao | null>(null);
  useEffect(() => {
    setPlanoLiq(null);
    if (!confirmando || confirmando.tipo !== "saida") { setLiqDisponivel(false); return; }
    let cancelado = false;
    liquidacaoDisponivel().then(ok => { if (!cancelado) setLiqDisponivel(ok); }).catch(() => { if (!cancelado) setLiqDisponivel(false); });
    return () => { cancelado = true; };
  }, [confirmando]);
  const usaLiquidacao = liqDisponivel && confirmando?.tipo === "saida";

  // Despesa que está na conta estrutural "Não Aplicável" (compra paga por terceiro que voltou a ser da igreja, por exemplo quando a prova da oferta deixou de bastar): não tem conta
  // financeira, então o pagamento pede de qual conta sai. As demais despesas seguem pagando da conta delas, como sempre.
  const semContaFinanceira = confirmando?.conta_id === CONTA_NAO_APLICAVEL_ID;
  const [contasParaPagar, setContasParaPagar] = useState<FinConta[]>([]);
  const [contaDoPagamento, setContaDoPagamento] = useState("");
  useEffect(() => {
    setContaDoPagamento("");
    if (!semContaFinanceira) { setContasParaPagar([]); return; }
    let cancelado = false;
    listarContas().then(cs => { if (!cancelado) setContasParaPagar(cs.filter(c => c.aceita_despesas !== false)); }).catch(() => { if (!cancelado) setContasParaPagar([]); });
    return () => { cancelado = true; };
  }, [semContaFinanceira, confirmando?.id]);

  // Fase 1A da Quitação (Política de Compras por Terceiros): ANTES de pagar, "quem pagou?". Se um terceiro já pagou o fornecedor, a igreja NÃO paga de novo — o botão trava e o
  // aviso diz onde a conta está. Sem a migration, nada disto aparece e o "Pagar" é o de sempre.
  const [quitacaoDoAlvo, setQuitacaoDoAlvo] = useState<QuitacaoDaObrigacao | null>(null);
  const [quitacaoPossivel, setQuitacaoPossivel] = useState(false);
  const [quitando, setQuitando] = useState<AlvoDaQuitacao | null>(null);
  // "Recalcular guia" (23/10/2026): a guia atrasou e foi reemitida — a obrigação muda de valor sem perder o original, o encargo e o motivo (fin_recalcular_obrigacao).
  const [recalculando, setRecalculando] = useState<AlvoDoRecalculo | null>(null);
  const [recalculosDaDespesa, setRecalculosDaDespesa] = useState<RecalculoRegistrado[]>([]);
  const [recarregarRecalculos, setRecarregarRecalculos] = useState(0);
  useEffect(() => {
    setRecalculosDaDespesa([]);
    if (!confirmando || confirmando.tipo !== "saida") return;
    let cancelado = false;
    listarRecalculos(confirmando.id).then(r => { if (!cancelado) setRecalculosDaDespesa(r); }).catch(() => { /* melhoria: sem o histórico o Pagar segue igual */ });
    return () => { cancelado = true; };
  }, [confirmando?.id, recarregarRecalculos]);
  useEffect(() => {
    setQuitacaoDoAlvo(null); setQuitacaoPossivel(false);
    if (!confirmando || confirmando.tipo !== "saida") return;
    let cancelado = false;
    (async () => {
      if (!(await quitacaoDisponivel())) return;
      const q = await quitacaoDaObrigacao(confirmando.id).catch(() => null);
      if (!cancelado) { setQuitacaoPossivel(true); setQuitacaoDoAlvo(q); }
    })();
    return () => { cancelado = true; };
  }, [confirmando]);
  const terceiroJaPagou = !!quitacaoDoAlvo && ehTerceiro(quitacaoDoAlvo.responsavel);

  // Lançamento SEM favorecido ligado (folha/RPA gerados só com a descrição "Salario Caio"): procura o fornecedor pelo
  // NOME. Só sugere quando o nome identifica um único cadastro; quem liga é o botão "Vincular" (06/10/2026).
  const [favorecidoProvavel, setFavorecidoProvavel] = useState<FornecedorParaNome | null>(null);
  const [vinculando, setVinculando] = useState(false);

  /** O QR a partir de uma chave — erro no QR nunca trava o "Pagar" (Copiar Pix continua). */
  const gerarQr = useCallback((chave: string, tipo: TipoChavePix | null, nome: string, valor: number, cancelado: () => boolean) => {
    const payload = montarPayloadPix({ chave, tipoChave: tipo, nomeRecebedor: nome, valor });
    QRCode.toDataURL(payload, { margin: 1, width: 220 })
      .then(url => { if (!cancelado()) setQrDataUrl(url); })
      .catch(() => { if (!cancelado()) setQrDataUrl(null); });
  }, []);

  useEffect(() => {
    setPessoaPagando(null); setNovaChave("");
    if (!confirmando || confirmando.tipo !== "saida" || confirmando.fornecedor_id) return;
    let cancelado = false;
    setCarregandoFornecedor(true);
    (async () => {
      const p = await pessoaDoLancamento(confirmando.id).catch(() => null);
      if (!p || cancelado) return;
      const pix = await buscarPixDaPessoa(p.id).catch(() => null);
      if (cancelado) return;
      setPessoaPagando({ id: p.id, nome: p.nome, pix });
      if (pix) gerarQr(pix.chave, pix.tipo, p.nome, Number(confirmando.valor), () => cancelado);
      else setQrDataUrl(null);
    })().finally(() => { if (!cancelado) setCarregandoFornecedor(false); });
    return () => { cancelado = true; };
  }, [confirmando, recarregarPix, gerarQr]);

  useEffect(() => {
    setFavorecidoProvavel(null);
    if (!confirmando || confirmando.tipo !== "saida" || confirmando.fornecedor_id) return;
    if (carregandoFornecedor || pessoaPagando?.pix) return; // a pessoa do catálogo já tem a chave: não precisa de palpite
    const nome = pessoaPagando?.nome ?? confirmando.descricao;
    if (!nome) return;
    let cancelado = false;
    fornecedoresParaNome()
      .then(lista => { if (!cancelado) setFavorecidoProvavel(fornecedorPeloNome(nome, lista)); })
      .catch(() => { /* melhoria: sem o palpite o "Pagar" continua como antes */ });
    return () => { cancelado = true; };
  }, [confirmando, pessoaPagando, carregandoFornecedor]);

  async function vincularFavorecido() {
    if (!confirmando || !favorecidoProvavel) return;
    setVinculando(true);
    try {
      await atualizarLancamento(confirmando.id, { fornecedor_id: favorecidoProvavel.id });
      toast.success(`Lançamento ligado a ${favorecidoProvavel.nome}`);
      setConfirmando({ ...confirmando, fornecedor_id: favorecidoProvavel.id }); // o Pix aparece pelo caminho normal
    } catch (e: any) {
      toast.error(mensagemErro(e, "Não foi possível vincular"));
    } finally { setVinculando(false); }
  }

  async function guardarChaveDaPessoa() {
    if (!pessoaPagando) return;
    setSalvandoChave(true);
    try {
      await salvarPixDaPessoa(pessoaPagando.id, novaChave, novoTipoChave);
      toast.success(`Chave Pix de ${pessoaPagando.nome} guardada`);
      setRecarregarPix(n => n + 1);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível guardar a chave");
    } finally { setSalvandoChave(false); }
  }

  useEffect(() => {
    if (!confirmando || confirmando.tipo !== "saida" || !confirmando.fornecedor_id) {
      setFornecedorPagando(null);
      setQrDataUrl(null);
      return;
    }
    let cancelado = false;
    setCarregandoFornecedor(true);
    buscarFornecedor(confirmando.fornecedor_id)
      .then(f => {
        if (cancelado) return;
        setFornecedorPagando(f);
        if (f?.chave_pix) {
          const payload = montarPayloadPix({
            chave: f.chave_pix, tipoChave: f.tipo_chave_pix, nomeRecebedor: f.nome, valor: Number(confirmando.valor),
          });
          // Erro no QR não pode travar o "Pagar" — Copiar Pix continua
          // funcionando mesmo se isso falhar.
          QRCode.toDataURL(payload, { margin: 1, width: 220 })
            .then(url => { if (!cancelado) setQrDataUrl(url); })
            .catch(() => { if (!cancelado) setQrDataUrl(null); });
        } else {
          setQrDataUrl(null);
        }
      })
      .finally(() => { if (!cancelado) setCarregandoFornecedor(false); });
    return () => { cancelado = true; };
  }, [confirmando]);

  async function confirmarPagamentoDialog() {
    if (!confirmando) return;
    setConfirmandoBusy(true);
    try {
      const saida = confirmando.tipo === "saida";
      if (saida && dataPag && !dataPag.pronto) { toast.error(dataPag.problema ?? "Confira a data do pagamento."); return; }
      const dataEfetiva = (saida && dataPag?.data) || hojeLocal();
      if (semContaFinanceira && !contaDoPagamento) { toast.error("Escolha a conta de onde sai o pagamento."); return; }
      const contaDePagamento = semContaFinanceira ? contaDoPagamento : confirmando.conta_id;
      let liquidacaoId: string | null = null;
      if (usaLiquidacao) {
        if (!planoLiq?.pronto) { toast.error(planoLiq?.problemas[0] ?? "Confira o valor pago."); return; }
        liquidacaoId = await liquidar({ contaId: contaDePagamento, data: dataEfetiva, plano: planoLiq });
      } else {
        await confirmarPagamento(confirmando.id, { dataPagamento: dataEfetiva, ...(semContaFinanceira ? { contaId: contaDePagamento } : {}) });
      }
      // a decisão sobre a data (o que o comprovante sugeriu × o que foi escolhido) — registro, não pré-requisito: o pagamento já valeu
      if (saida && dataPag?.comprovante && (await auditoriaDaDataDisponivel())) {
        try {
          await registrarDecisaoDaData({ lancamentoId: confirmando.id, liquidacaoId, comprovante: dataPag.comprovante, dataEscolhida: dataEfetiva, motivo: dataPag.motivo });
        } catch (e) {
          toast.error(`Pago, mas o registro da data do comprovante não foi gravado: ${e instanceof Error ? e.message : "erro"}`);
        }
      }
      // Anexo é melhoria, não pré-requisito — uma falha só no upload não
      // pode desfazer ou travar um pagamento que já foi confirmado.
      if (anexoArquivo) {
        try {
          await adicionarAnexo(confirmando.id, anexoArquivo, "comprovante");
        } catch (e: any) {
          toast.error(`Pago, mas o comprovante não subiu: ${e?.message ?? "erro"}`);
        }
      }
      toast.success(
        usaLiquidacao && planoLiq && planoLiq.saldoPendente > 0
          ? `Pago parcialmente — saldo pendente ${brl(planoLiq.saldoPendente)}`
          : `${confirmando.tipo === "saida" ? "Pago" : "Recebido"}${confirmando.tipo === "saida" && dataPag && dataPag.data !== hojeLocal() ? ` em ${dataPag.data.split("-").reverse().join("/")}` : ""}!`);
      setConfirmando(null);
      setAnexoArquivo(null);
      await onChanged();
    } catch (e: any) {
      toast.error(mensagemErro(e, "Não foi possível confirmar"));
    }
    finally { setConfirmandoBusy(false); }
  }

  const dialogs = (
    <>
      {/* ── Confirmar pagamento/recebimento — Central de Pagamentos (Fase 8) ── */}
      <AlertDialog open={!!confirmando} onOpenChange={(v) => { if (!v) { setConfirmando(null); setAnexoArquivo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar {confirmando?.tipo === "saida" ? "pagamento" : "recebimento"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando?.descricao ?? "Este lançamento"} — {confirmando && brl(Number(confirmando.valor))}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmando?.tipo === "saida" && terceiroJaPagou && quitacaoDoAlvo && (
            <div role="alert" className="rounded-md border border-destructive-line bg-destructive-soft px-3 py-2 text-sm text-destructive-text space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Este fornecedor já foi pago por um terceiro</p>
              <p className="text-xs">
                {quitacaoDoAlvo.responsavelNome ?? ROTULO_RESPONSAVEL[quitacaoDoAlvo.responsavel]} pagou o fornecedor{quitacaoDoAlvo.fila ? ` (fila: ${ROTULO_FILA[quitacaoDoAlvo.fila]})` : ""}.
                Não pague de novo. Conclua a quitação no detalhe da despesa (ou, se foi registrada por engano, remova-a lá).
              </p>
            </div>
          )}
          {confirmando?.tipo === "saida" && quitacaoPossivel && !quitacaoDoAlvo && (
            <button type="button" className="text-xs text-primary hover:underline text-left"
              onClick={() => { setQuitando({ id: confirmando.id, descricao: confirmando.descricao ?? "", valor: Number(confirmando.valor) }); setConfirmando(null); setAnexoArquivo(null); }}>
              Foi outra pessoa, empresa ou entidade que pagou o fornecedor? Registrar quem pagou
            </button>
          )}

          {confirmando?.tipo === "saida" && recalculosDaDespesa.length > 0 && (
            <div className="rounded-md border border-warning-line bg-warning-soft/50 px-3 py-2 text-xs text-warning-text space-y-0.5">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Guia recalculada (custo extra por atraso)</p>
              {recalculosDaDespesa.map(r => (
                <p key={r.id}>
                  {resumoDoRecalculo(r.valor_antes, r.valor_depois)} · {r.motivo}
                  <span className="text-muted-foreground"> — {[r.juros > 0 ? `juros ${brl(r.juros)}` : "", r.multa > 0 ? `multa ${brl(r.multa)}` : "", r.correcao > 0 ? `correção ${brl(r.correcao)}` : ""].filter(Boolean).join(" · ")}{r.por_nome ? `, por ${r.por_nome}` : ""}</span>
                </p>
              ))}
            </div>
          )}
          {confirmando?.tipo === "saida" && !terceiroJaPagou && (
            <button type="button" className="text-xs text-primary hover:underline text-left"
              onClick={() => { setRecalculando({ id: confirmando.id, descricao: confirmando.descricao ?? "", valor: Number(confirmando.valor) }); setConfirmando(null); setAnexoArquivo(null); }}>
              A guia atrasou e foi recalculada? Recalcular guia (guarda o valor original e o encargo)
            </button>
          )}

          {confirmando?.tipo === "saida" && !quitacaoDoAlvo && /reembols/i.test(confirmando.descricao ?? "") && (
            <div role="alert" className="rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-text space-y-1">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" /> Esta conta fala em reembolso</p>
              <p>Confirme se um terceiro já pagou o fornecedor <b>antes</b> de pagá-lo: pagar o fornecedor e depois reembolsar a pessoa é pagar duas vezes. Se alguém já pagou, registre quem pagou (link acima). É só um aviso: nada é bloqueado.</p>
            </div>
          )}

          {confirmando?.tipo === "saida" && !terceiroJaPagou && (
            <div className="space-y-2.5">
              {carregandoFornecedor && (
                <p className="text-xs text-muted-foreground">Carregando dados do favorecido…</p>
              )}
              {lendoDocs && <p className="text-xs text-muted-foreground">Lendo o documento anexado…</p>}
              {docsPagamento.map(d => {
                const valorDifere = d.valor !== null && Math.abs(d.valor - Number(confirmando.valor)) > 0.009;
                const copiar = (texto: string, oQue: string) =>
                  navigator.clipboard.writeText(texto).then(() => toast.success(`${oQue} copiado — cole no app do seu banco`), () => toast.error("Não consegui copiar"));
                return (
                  <div key={d.anexoId} className="rounded-md border bg-muted/20 p-2.5 space-y-1.5">
                    <p className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
                      <FileText className="w-3.5 h-3.5 text-gold" /> {d.rotulo}
                      {d.valor !== null && <span className="tabular-nums">· {brl(d.valor)}</span>}
                      {d.vencimento && <span className="text-muted-foreground tabular-nums">· vence {dataBrCurta(d.vencimento)}</span>}
                    </p>
                    {d.beneficiario && <p className="text-xs text-muted-foreground truncate">{d.beneficiario}</p>}
                    {valorDifere && (
                      <p className="text-xs text-warning-text flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        O documento diz {brl(d.valor!)}, mas este lançamento está em {brl(Number(confirmando.valor))} — confira antes de pagar (multa, juros ou desconto?).
                      </p>
                    )}
                    {d.codigoValido === false && (
                      <p className="text-xs text-warning-text flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Os dígitos da linha digitável não conferem — compare com o documento.
                      </p>
                    )}
                    {(d.linhaDigitavel || d.codigoBarras) && (
                      <div className="flex items-start gap-2">
                        <code className="text-2xs break-all flex-1 tabular-nums">{juntarEm((d.linhaDigitavel ?? d.codigoBarras)!, 5)}</code>
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0"
                          onClick={() => copiar((d.linhaDigitavel ?? d.codigoBarras)!, "Linha digitável")}>
                          <Copy className="w-3 h-3" /> Copiar
                        </Button>
                      </div>
                    )}
                    {d.pix && (
                      <div className="flex items-center gap-3">
                        <QrDoPix payload={d.pix.payload} />
                        <div className="space-y-1 min-w-0">
                          <p className="text-xs text-muted-foreground">
                            Pix do documento{d.pix.nome ? " · " + d.pix.nome : ""} — escaneie ou copie
                          </p>
                          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                            onClick={() => copiar(d.pix!.payload, "Pix do documento")}>
                            <Copy className="w-3 h-3" /> Copiar Pix do documento
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!lendoDocs && !temLinhaDeAnexo && (
                <div className="rounded-md border border-dashed p-2.5 space-y-1.5">
                  <label htmlFor="pagar-linha" className="text-xs font-medium">
                    {linhaInformadaAtual ? "Corrigir a linha digitável deste lançamento" : "Sem arquivo anexado? Informe a linha digitável"}
                  </label>
                  <div className="flex items-start gap-2">
                    <Input id="pagar-linha" inputMode="numeric" autoComplete="off" value={linhaTexto} onChange={e => setLinhaTexto(e.target.value)}
                      placeholder="Cole os 47 números do boleto ou os 48 da conta de consumo" className="h-8 text-xs tabular-nums" />
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs shrink-0"
                      disabled={salvandoLinha || !linhaTexto.trim() || (conferenciaDaLinha !== null && !conferenciaDaLinha.ok)} onClick={() => void salvarLinha()}>
                      {salvandoLinha ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
                    </Button>
                  </div>
                  {conferenciaDaLinha && !conferenciaDaLinha.ok && <p className="text-xs text-destructive-text">{conferenciaDaLinha.erro}</p>}
                  {conferenciaDaLinha?.ok && conferenciaDaLinha.boleto && (
                    <p className="text-xs text-muted-foreground">
                      ✓ Números conferem{conferenciaDaLinha.boleto.valor ? ` · a linha diz ${brl(conferenciaDaLinha.boleto.valor)}` : ""}
                      {conferenciaDaLinha.boleto.vencimento ? ` · vence ${dataBrCurta(conferenciaDaLinha.boleto.vencimento)}` : ""}
                      {conferenciaDaLinha.boleto.valor && Math.abs(conferenciaDaLinha.boleto.valor - Number(confirmando.valor)) > 0.009 ? " — diferente do lançamento, confira" : ""}
                    </p>
                  )}
                  <p className="text-2xs text-muted-foreground">Fica guardada neste lançamento e vai no e-mail diário e no "Preparar envio", como se o arquivo estivesse anexado.</p>
                </div>
              )}
              {semContaFinanceira && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 p-2.5 space-y-1.5">
                  <label htmlFor="pagar-conta" className="text-xs font-medium">Esta despesa não tem conta financeira. De qual conta sai o pagamento?</label>
                  <select id="pagar-conta" value={contaDoPagamento} onChange={e => setContaDoPagamento(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Escolha…</option>{contasParaPagar.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}
              {/* As duas chaves (esta e a do DataDoPagamento, mais abaixo) TÊM de ser diferentes: irmãs com a mesma `key` fazem o React duplicar/remontar os filhos sem parar
                  (o painel remontava a cada renderização e o diálogo "Pagar" crescia sem fim — 15/10/2026, introduzido em 016f145). */}
              {usaLiquidacao && <LiquidacaoPainel key={`liquidacao-${confirmando.id}`} lancamento={confirmando} onPlano={setPlanoLiq} />}
              {fornecedorPagando?.chave_pix && (
                <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-gold" /> Pix de {fornecedorPagando.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatarChavePix(fornecedorPagando.chave_pix, fornecedorPagando.tipo_chave_pix)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5"
                      onClick={() => {
                        const payload = montarPayloadPix({
                          chave: fornecedorPagando.chave_pix!, tipoChave: fornecedorPagando.tipo_chave_pix,
                          nomeRecebedor: fornecedorPagando.nome, valor: Number(confirmando.valor),
                        });
                        navigator.clipboard.writeText(payload);
                        toast.success("Código Pix copiado — cole no app do seu banco");
                      }}>
                      <Copy className="w-3.5 h-3.5" /> Copiar Pix
                    </Button>
                    {qrDataUrl && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> ou escaneie:
                      </span>
                    )}
                  </div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="QR Code do Pix" width={140} height={140}
                      className="rounded border bg-white p-1 mx-auto" />
                  )}
                </div>
              )}
              {/* Sem fornecedor ligado ao lançamento não há de onde tirar a chave Pix: antes o QR
                  simplesmente não aparecia, sem explicação (relato dela, 06/10/2026). */}
              {pessoaPagando?.pix && (
                <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-gold" /> Pix de {pessoaPagando.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatarChavePix(pessoaPagando.pix.chave, pessoaPagando.pix.tipo)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(montarPayloadPix({
                          chave: pessoaPagando.pix!.chave, tipoChave: pessoaPagando.pix!.tipo,
                          nomeRecebedor: pessoaPagando.nome, valor: Number(confirmando.valor),
                        }));
                        toast.success("Código Pix copiado — cole no app do seu banco");
                      }}>
                      <Copy className="w-3.5 h-3.5" /> Copiar Pix
                    </Button>
                    {qrDataUrl && <span className="text-xs text-muted-foreground flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /> ou escaneie:</span>}
                  </div>
                  {qrDataUrl && <img src={qrDataUrl} alt="QR Code do Pix" width={140} height={140} className="rounded border bg-white p-1 mx-auto" />}
                </div>
              )}
              {pessoaPagando && !pessoaPagando.pix && !carregandoFornecedor && !favorecidoProvavel?.chave_pix && (
                <div className="rounded-md border border-dashed p-2.5 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{pessoaPagando.nome}</strong> ainda não tem chave Pix cadastrada.
                    Informe uma vez e o QR Code passa a aparecer em todos os pagamentos dela.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select value={novoTipoChave} onChange={(e) => setNovoTipoChave(e.target.value as TipoChavePix)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Tipo da chave">
                      {TIPOS_CHAVE_PIX.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                    </select>
                    <Input value={novaChave} onChange={(e) => setNovaChave(e.target.value)} placeholder="Chave Pix" className="h-8 text-base md:text-xs flex-1 min-w-[10rem]" />
                    <Button type="button" size="sm" variant="outline" disabled={!novaChave.trim() || salvandoChave} onClick={guardarChaveDaPessoa}>
                      {salvandoChave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar chave"}
                    </Button>
                  </div>
                </div>
              )}
              {favorecidoProvavel && (
                <div className="rounded-md border border-dashed border-gold/60 bg-muted/20 p-2.5 space-y-2">
                  <p className="text-xs">
                    Este lançamento não está ligado a um favorecido. Pelo nome, achei no cadastro de favorecidos:{" "}
                    <strong>{favorecidoProvavel.nome}</strong>. Confira antes de pagar.
                  </p>
                  {favorecidoProvavel.chave_pix ? (
                    <div className="flex items-center gap-3">
                      <QrDoPix payload={montarPayloadPix({
                        chave: favorecidoProvavel.chave_pix, tipoChave: favorecidoProvavel.tipo_chave_pix as TipoChavePix | null,
                        nomeRecebedor: favorecidoProvavel.nome, valor: Number(confirmando.valor),
                      })} />
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {formatarChavePix(favorecidoProvavel.chave_pix, favorecidoProvavel.tipo_chave_pix as TipoChavePix | null)}
                        </p>
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(montarPayloadPix({
                              chave: favorecidoProvavel.chave_pix!, tipoChave: favorecidoProvavel.tipo_chave_pix as TipoChavePix | null,
                              nomeRecebedor: favorecidoProvavel.nome, valor: Number(confirmando.valor),
                            }));
                            toast.success("Código Pix copiado — cole no app do seu banco");
                          }}>
                          <Copy className="w-3 h-3" /> Copiar Pix
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Esse cadastro ainda não tem chave Pix.{" "}
                      <Link to={`/financas/favorecido/${favorecidoProvavel.id}`} className="text-primary hover:underline">Cadastrar</Link>
                    </p>
                  )}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={vinculando} onClick={vincularFavorecido}>
                    {vinculando ? <Loader2 className="w-3 h-3 animate-spin" /> : "Vincular este favorecido ao lançamento"}
                  </Button>
                </div>
              )}
              {!confirmando.fornecedor_id && !pessoaPagando && !carregandoFornecedor && !favorecidoProvavel && (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
                  Sem QR Code Pix: este lançamento não está ligado a um favorecido (fornecedor ou pessoa do catálogo).
                  Edite o lançamento (ou a recorrência) e escolha o favorecido no cadastro.
                </p>
              )}
              {!carregandoFornecedor && confirmando.fornecedor_id && !fornecedorPagando?.chave_pix && (
                <p className="text-xs text-muted-foreground">
                  Este favorecido ainda não tem chave Pix cadastrada.{" "}
                  <Link to={`/financas/favorecido/${confirmando.fornecedor_id}`} className="text-primary hover:underline">
                    Cadastrar
                  </Link>
                </p>
              )}

              <div>
                <label className="text-xs font-medium flex items-center gap-1.5 mb-1 cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5" /> Anexar comprovante (opcional)
                </label>
                <input type="file" accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setAnexoArquivo(e.target.files?.[0] ?? null)}
                  className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-background" />
              </div>
              <DataDoPagamento key={`data-pagamento-${confirmando.id}`} lancamentoId={confirmando.id} arquivo={anexoArquivo}
                valorEsperado={usaLiquidacao ? (planoLiq?.valorPago ?? null) : Number(confirmando.valor)} onMudar={setDataPag} />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="success" onClick={(e) => { e.preventDefault(); confirmarPagamentoDialog(); }} disabled={confirmandoBusy || terceiroJaPagou || (semContaFinanceira && !contaDoPagamento) || (usaLiquidacao && !planoLiq?.pronto) || (confirmando?.tipo === "saida" && !!dataPag && !dataPag.pronto)}>
              {confirmandoBusy ? "..." : (confirmando?.tipo === "saida" ? "Marcar como pago" : "Receber")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <QuitacaoDialog alvo={quitando} onFechar={() => setQuitando(null)} onFeito={() => { void onChanged(); }} />
      <RecalcularGuiaDialog alvo={recalculando} onFechar={() => setRecalculando(null)} onFeito={() => { setRecarregarRecalculos(n => n + 1); void onChanged(); }} />
    </>
  );

  return {
    pagar: (v: FinVencimento) => setConfirmando(v),
    dialogs,
  };
}

/** Botão "Pagar"/"Receber" pronto — mesmo estilo nas duas telas que o usam. */
/** O QR do Pix que veio no próprio documento (boleto/fatura). Falha ao desenhar nunca trava o "Pagar". */
function QrDoPix({ payload }: { payload: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(payload, { margin: 1, width: 160 })
      .then(u => { if (!cancelado) setUrl(u); })
      .catch(() => { if (!cancelado) setUrl(null); });
    return () => { cancelado = true; };
  }, [payload]);
  return url ? <img src={url} alt="QR Code do Pix do documento" className="w-28 h-28 rounded bg-white shrink-0" /> : null;
}

export function BotaoPagar({ vencimento, onClick }: { vencimento: FinVencimento; onClick: () => void }) {
  return (
    <Button variant="success" size="sm" onClick={onClick} className="gap-1 h-7 text-xs shrink-0">
      <CheckCircle2 className="w-3 h-3" /> {vencimento.tipo === "saida" ? "Pagar" : "Receber"}
    </Button>
  );
}

