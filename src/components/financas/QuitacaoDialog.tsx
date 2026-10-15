// ─── QuitacaoDialog — "Quem pagou esta conta?" — registra ou corrige a Quitação (Responsável + Intenção) de uma despesa que JÁ EXISTE ───────────────────────────────
//
// Política de Compras por Terceiros, Reembolsos e Doações. A pergunta vem ANTES do "Pagar": se foi a igreja, o fluxo de sempre; se foi uma Pessoa, uma Empresa ou uma Entidade, a obrigação NÃO é
// dada como paga — registra-se quem pagou e a intenção, e o sistema deduz o resto (grau de prova pelos anexos, nível de risco, fila, credor e, para a oferta com prova suficiente, a extinção).
// A intenção NUNCA é presumida: sem declaração, fica "Não declarada" (A esclarecer). Os campos são os de CamposDaQuitacao (os mesmos da nota que o app ainda não tinha).
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CamposDaQuitacao, ESTADO_VAZIO, problemasDoEstado, type EstadoDaQuitacao } from "@/components/financas/CamposDaQuitacao";
import { hojeLocal } from "@/lib/data";
import { mensagemErro } from "@/lib/erroRede";
import type { NaturezaDoItem } from "@/lib/quitacao";
import { alterarQuitacao, dadosDaDespesaParaQuitar, declaracaoDisponivel, ofertaDisponivel, registrarQuitacao, situacaoDaDeclaracao, type QuitacaoDaObrigacao } from "@/services/quitacaoService";

export interface AlvoDaQuitacao { id: string; descricao: string; valor: number }

export function QuitacaoDialog({ alvo, quitacao, onFechar, onFeito }: { alvo: AlvoDaQuitacao | null; quitacao?: QuitacaoDaObrigacao | null; onFechar: () => void; onFeito: () => void }) {
  const editando = !!quitacao;
  const hoje = hojeLocal();
  const [v, setV] = useState<EstadoDaQuitacao>(ESTADO_VAZIO);
  const [emitenteId, setEmitenteId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ofertaLiberada, setOfertaLiberada] = useState(false);
  // Fase 1D-a: a forma de pagamento do terceiro só é pedida quando o banco já tem a Declaração do Terceiro
  const [pedirForma, setPedirForma] = useState(false);
  const [formaInicial, setFormaInicial] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const mudar = (parte: Partial<EstadoDaQuitacao>) => setV(x => ({ ...x, ...parte }));

  // abre o diálogo: limpa, ou carrega a quitação que está sendo corrigida; busca o que a despesa já sabe (natureza, comprador, emitente)
  useEffect(() => {
    if (!alvo) return;
    setMotivo("");
    let vivo = true;
    ofertaDisponivel().then(ok => { if (vivo) setOfertaLiberada(ok); });
    setFormaInicial("");
    declaracaoDisponivel().then(async ok => {
      if (!vivo) return;
      setPedirForma(ok);
      if (ok && quitacao) { const s = await situacaoDaDeclaracao(quitacao.quitacaoId).catch(() => null); if (vivo && s?.forma) { setFormaInicial(s.forma); setV(x => ({ ...x, forma: s.forma! })); } }
    });
    const base: EstadoDaQuitacao = quitacao
      ? {
        ...ESTADO_VAZIO, tipo: quitacao.responsavel, pagoEm: quitacao.pagoEm ?? "", intencao: quitacao.intencao === "nao_se_aplica" ? "nao_declarada" : quitacao.intencao, declaradoEm: quitacao.declaradoEm ?? "",
        condicao: quitacao.condicao ?? "", pedeRecibo: quitacao.pedeRecibo,
        escolhido: (quitacao.pessoaId || quitacao.fornecedorId) ? { id: (quitacao.pessoaId ?? quitacao.fornecedorId)!, nome: quitacao.responsavelNome ?? "(cadastro)" } : null,
      }
      : ESTADO_VAZIO;
    setV(base);
    dadosDaDespesaParaQuitar(alvo.id).then(d => { if (!vivo || !d) return; setEmitenteId(d.fornecedorId); setV(x => ({ ...x, natureza: d.naturezaItem ?? x.natureza, comprador: d.comprador ?? x.comprador })); });
    return () => { vivo = false; };
  }, [alvo, quitacao]);

  const declara = v.intencao === "reembolso" || v.intencao === "oferta" || v.intencao === "compensacao_adiantamento";
  const problemas = useMemo(() => (alvo ? problemasDoEstado(v, emitenteId, hoje, pedirForma) : []), [alvo, v, emitenteId, hoje, pedirForma]);
  const semMotivo = editando && motivo.trim().length < 5;
  const invalido = v.tipo !== "nao_localizado" && problemas.length > 0;

  async function salvar() {
    if (!alvo) return;
    setSalvando(true);
    try {
      if (!editando) {
        await registrarQuitacao({
          lancamentoId: alvo.id, responsavel: v.tipo, pessoaId: v.tipo === "pessoa" ? v.escolhido?.id ?? null : null, fornecedorId: v.tipo === "empresa" || v.tipo === "entidade" ? v.escolhido?.id ?? null : null,
          intencao: v.tipo === "nao_localizado" ? "nao_se_aplica" : v.intencao, pagoEm: v.tipo === "nao_localizado" ? null : v.pagoEm || null, declaradoEm: v.tipo !== "nao_localizado" && declara ? v.declaradoEm || null : null,
          naturezaItem: v.tipo === "nao_localizado" ? null : (v.natureza || null) as NaturezaDoItem | null, comprador: v.tipo === "nao_localizado" ? null : (v.comprador || null),
          condicao: v.intencao === "oferta" && v.condicao.trim() ? v.condicao.trim() : null, pedeRecibo: v.intencao === "oferta" && v.pedeRecibo, motivo: motivo.trim() || null,
          formaPagamentoTerceiro: v.tipo === "nao_localizado" || !v.forma ? null : v.forma,
        });
        toast.success(v.tipo === "nao_localizado" ? "Marcada como \"Não localizado\": entrou na fila Investigar."
          : v.intencao === "oferta" ? "Quitação registrada. Anexe a nota fiscal e a Declaração do Terceiro assinada para formalizar a oferta (o sistema diz, no cartão, o que ainda falta)."
          : "Quitação registrada. Anexe a prova do pagamento e a declaração do terceiro para formalizar (o sistema diz, no cartão, o que ainda falta).");
      } else {
        const q = quitacao!, mudancas: Record<string, unknown> = {};
        if (v.tipo !== q.responsavel) mudancas.responsavel_tipo = v.tipo;
        if (v.tipo === "pessoa" && (v.escolhido?.id ?? null) !== q.pessoaId) mudancas.responsavel_pessoa_id = v.escolhido?.id ?? null;
        if (v.tipo !== "pessoa" && v.tipo !== "nao_localizado" && (v.escolhido?.id ?? null) !== q.fornecedorId) mudancas.responsavel_fornecedor_id = v.escolhido?.id ?? null;
        if (v.tipo !== "nao_localizado") {
          if (v.intencao !== q.intencao) mudancas.intencao = v.intencao;
          if ((v.pagoEm || null) !== q.pagoEm) mudancas.pago_em = v.pagoEm || null;
          if ((declara ? v.declaradoEm || null : null) !== q.declaradoEm) mudancas.declarado_em = declara ? v.declaradoEm || null : null;
          const cond = v.intencao === "oferta" && v.condicao.trim() ? v.condicao.trim() : null;
          if (cond !== q.condicao) mudancas.condicao = cond;
          if ((v.intencao === "oferta" && v.pedeRecibo) !== q.pedeRecibo) mudancas.pede_recibo = v.intencao === "oferta" && v.pedeRecibo;
          if (pedirForma && v.forma && v.forma !== formaInicial) mudancas.forma_pagamento_terceiro = v.forma;
        }
        if (Object.keys(mudancas).length === 0) { toast.info("Nada mudou."); onFechar(); return; }
        await alterarQuitacao(q.quitacaoId, mudancas, motivo.trim());
        toast.success("Quitação alterada; a mudança ficou no histórico (e uma aprovação anterior perde a validade).");
      }
      onFeito(); onFechar();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o && !salvando) onFechar(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Corrigir a quitação" : "Quem pagou esta conta?"}</DialogTitle>
          <DialogDescription>
            {alvo?.descricao || "Despesa"} · {alvo ? alvo.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""}. Se foi a própria igreja, feche e use <b>Pagar</b>. Se outra pessoa, empresa ou entidade pagou o fornecedor,
            registre aqui — a obrigação <b>não</b> é dada como paga, e a igreja não paga o fornecedor de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CamposDaQuitacao valor={v} onChange={mudar} ofertaLiberada={ofertaLiberada} hoje={hoje} pedirForma={pedirForma} />
          <div className="space-y-1.5">
            <Label htmlFor="q-motivo">{editando ? "Motivo da correção (obrigatório)" : "Observação (opcional)"}</Label>
            <Textarea id="q-motivo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={editando ? "Por que está mudando?" : "Ex.: pagou no cartão dele, cupom em mãos"} />
          </div>
          {invalido && (
            <ul className="space-y-0.5 rounded-md border border-warning-line bg-warning-soft/60 px-3 py-2 text-xs text-warning-text" role="alert">
              {problemas.map(p => <li key={p}>• {p}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || invalido || semMotivo}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? "Salvar correção" : v.tipo === "nao_localizado" ? "Marcar como não localizado" : "Registrar quitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
