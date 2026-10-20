// ─── AcoesDeObrigacao — o que se faz com UMA obrigação, a partir de qualquer lista dela ────────────────────────────────────────────────────────────────
// Extraído do Extrato de Obrigações em 20/10/2026 (Fase A da simplificação do Financeiro): a Mesa (calendário de vencimentos) e o Extrato mostram a MESMA obrigação e precisam das MESMAS
// ações, com os mesmos fluxos por trás. Uma peça só (`AcoesDaLinha`, o que fica à vista e o que vai em "⋯") e um gancho (`useAcoesDeObrigacao`) que guarda o estado e monta os diálogos uma vez.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Eye, Loader2, MoreHorizontal, Paperclip, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { DocumentacaoDaObrigacao } from "@/components/financas/DocumentacaoDaObrigacao";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { PagarReembolsoDialog } from "@/components/financas/PagarReembolsoDialog";
import { QuitacaoDialog, type AlvoDaQuitacao } from "@/components/financas/QuitacaoDialog";
import { useAcoesLancamento } from "@/hooks/useAcoesLancamento";
import { mensagemErro } from "@/lib/erroRede";
import { acoesDaObrigacao, type LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import { quitacaoDaObrigacao, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import { buscarVencimentoPorId } from "@/services/finService";

/**
 * As ações da linha — o que existe vem de `acoesDaObrigacao` (lib), que carrega a regra por situação; AQUI só se decide o que fica à vista (revisão de 20/10/2026: os cinco botões
 * disputavam o espaço com o que importa — fornecedor, valor, situação, atraso, projeto, quem pagou).
 *   · à vista: o botão que mexe no dinheiro (Pagar agora / Pagar reembolso) e, onde a Documentação é o centro da decisão (terceiro e reembolso), ela também;
 *   · "⋯ Mais ações": Visualizar, Editar, Documentação (quando não está à vista) e Corrigir quitação. O nome do fornecedor também abre o detalhe.
 * Fora da tela para não remontar a cada renderização.
 */
export function AcoesDaLinha({ l, podeOperar, ocupada, onVisualizar, onEditar, onPagar, onPagarReembolso, onDocumentacao, onCorrigirQuitacao }: {
  l: LinhaDoExtrato; podeOperar: boolean; ocupada: boolean;
  onVisualizar: () => void; onEditar: () => void; onPagar: () => void; onPagarReembolso: () => void; onDocumentacao: () => void; onCorrigirQuitacao: () => void;
}) {
  const a = acoesDaObrigacao(l);
  const quem = l.fornecedor || l.descricao || "obrigação";
  const btn = "h-7 gap-1 px-2 text-xs whitespace-nowrap";
  const centroDaDecisao = l.situacao === "quitada_por_terceiro" || l.situacao === "reembolso";
  const pagarAgora = a.pagar === "normal" && podeOperar;
  const pagarReembolso = a.pagar === "reembolso" && podeOperar;
  // a Documentação fica à vista nas de terceiro/reembolso: com o rótulo quando é a ação principal (não há o que pagar), só o clipe quando ao lado do Pagar
  const docComRotulo = centroDaDecisao && !pagarReembolso;
  const docAVista = a.documentacao && centroDaDecisao;
  return (
    <div className="flex items-center gap-1">
      {pagarAgora && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagar} aria-label={`Pagar agora — ${quem}`} title="Pagar agora">
          {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}<span className="hidden lg:inline">Pagar agora</span>
        </Button>
      )}
      {pagarReembolso && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagarReembolso} aria-label={`Pagar reembolso — ${quem}`} title="Pagar reembolso">
          {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}<span className="hidden lg:inline">Pagar reembolso</span>
        </Button>
      )}
      {docAVista && (
        <Button size="sm" variant={docComRotulo ? "default" : "outline"} className={docComRotulo ? btn : "h-7 w-7 p-0"} disabled={ocupada} onClick={onDocumentacao}
          aria-label={`Documentação de ${quem}`} title="Documentação">
          <Paperclip className="w-3.5 h-3.5" />{docComRotulo && <span className="hidden lg:inline">Documentação</span>}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" aria-label={`Mais ações de ${quem}`} title="Mais ações" disabled={ocupada}>
            {ocupada && !pagarAgora && !pagarReembolso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[11rem]">
          {a.visualizar && <DropdownMenuItem onSelect={onVisualizar}><Eye className="w-3.5 h-3.5" /> Visualizar</DropdownMenuItem>}
          {a.editar && podeOperar && <DropdownMenuItem onSelect={onEditar}><Pencil className="w-3.5 h-3.5" /> Editar</DropdownMenuItem>}
          {a.documentacao && !docAVista && <DropdownMenuItem onSelect={onDocumentacao}><Paperclip className="w-3.5 h-3.5" /> Documentação</DropdownMenuItem>}
          {a.corrigirQuitacao && podeOperar && <DropdownMenuItem onSelect={onCorrigirQuitacao}><ShieldCheck className="w-3.5 h-3.5" /> Corrigir quitação</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


type Lancamento = Awaited<ReturnType<typeof buscarLancamentoParaEditar>>;

/**
 * Guarda o estado dos fluxos e devolve: `abrirLinha` (o nome do fornecedor abre o detalhe), `acoesDaLinha` (a peça de ações de uma linha) e `dialogos` (monte UMA vez na tela).
 * As duas funções são ESTÁVEIS (`useCallback`): a lista que as recebe é `memo`, e abrir/fechar um diálogo não pode re-renderizar todas as linhas.
 */
export function useAcoesDeObrigacao({ podeOperar, recarregar }: { podeOperar: boolean; recarregar: () => void | Promise<void> }): {
  abrirLinha: (l: LinhaDoExtrato) => void; acoesDaLinha: (l: LinhaDoExtrato) => ReactNode; dialogos: ReactNode;
} {
  const acoes = useAcoesLancamento(() => { void recarregar(); });
  const [detalhe, setDetalhe] = useState<Lancamento>(null);
  const [editando, setEditando] = useState<Lancamento>(null);
  const [reembolso, setReembolso] = useState<QuitacaoDaObrigacao | null>(null);
  const [corrigindo, setCorrigindo] = useState<{ alvo: AlvoDaQuitacao; quitacao: QuitacaoDaObrigacao } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [documentando, setDocumentando] = useState<Lancamento>(null);
  const [anexando, setAnexando] = useState<{ id: string; descricao: string } | null>(null);
  const carregar = () => { void recarregar(); };

  /** Uma ação por vez na linha: o botão fica desabilitado enquanto a leitura (de um lançamento, vencimento ou quitação) responde, e qualquer falha vira aviso — nunca fica muda. */
  async function naLinha(id: string, fazer: () => Promise<void>) {
    setOcupado(id);
    try { await fazer(); } catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(null); }
  }
  const visualizar = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const x = await buscarLancamentoParaEditar(l.obrigacaoId);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setDetalhe(x);
  });
  const documentacao = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const x = await buscarLancamentoParaEditar(l.obrigacaoId);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setDocumentando(x);
  });
  const editar = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    if (!l.idEmAberto) return;
    const x = await buscarLancamentoParaEditar(l.idEmAberto);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setEditando(x);
  });
  const pagarAgora = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    if (!l.idEmAberto) return;
    const v = await buscarVencimentoPorId(l.idEmAberto);
    if (!v) { toast.info("Esta obrigação já não está em aberto — alguém acabou de pagá-la. Atualizando a lista."); await carregar(); return; }
    acoes.pagar(v);   // o MESMO fluxo de sempre: documento, Pix/QR, liquidação, comprovante
  });
  const pagarReembolso = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const q = await quitacaoDaObrigacao(l.obrigacaoId);
    if (!q) throw new Error("Não encontrei a quitação deste reembolso. Atualize a lista.");
    setReembolso(q);
  });
  const corrigirQuitacao = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const q = await quitacaoDaObrigacao(l.obrigacaoId);
    if (!q) throw new Error("Esta obrigação não tem quitação registrada para corrigir.");
    setCorrigindo({ alvo: { id: l.obrigacaoId, descricao: l.descricao || l.fornecedor || "Obrigação", valor: l.valor }, quitacao: q });
  });


  // Funções ESTÁVEIS para as linhas (a lista é `memo`): os manipuladores acima são recriados a cada render; a linha chama sempre a versão mais recente pela referência.
  const ultimos = useRef({ visualizar, documentacao, editar, pagarAgora, pagarReembolso, corrigirQuitacao });
  ultimos.current = { visualizar, documentacao, editar, pagarAgora, pagarReembolso, corrigirQuitacao };
  const abrirLinha = useCallback((l: LinhaDoExtrato) => void ultimos.current.visualizar(l), []);
  const acoesDaLinha = useCallback((l: LinhaDoExtrato) => (
    <AcoesDaLinha l={l} podeOperar={podeOperar} ocupada={ocupado === l.obrigacaoId}
      onVisualizar={() => void ultimos.current.visualizar(l)} onEditar={() => void ultimos.current.editar(l)} onPagar={() => void ultimos.current.pagarAgora(l)}
      onPagarReembolso={() => void ultimos.current.pagarReembolso(l)} onDocumentacao={() => void ultimos.current.documentacao(l)} onCorrigirQuitacao={() => void ultimos.current.corrigirQuitacao(l)} />
  ), [podeOperar, ocupado]);

  const dialogos = (
    <>
      {acoes.dialogs}
      <DetalhesDoLancamento lancamento={detalhe} onFechar={() => setDetalhe(null)} />
      <DocumentacaoDaObrigacao lancamento={documentando} onFechar={() => setDocumentando(null)}
        onAnexos={podeOperar ? (x => { setDocumentando(null); setAnexando({ id: x.id, descricao: x.descricao || x.fornecedor_nome || "Obrigação" }); }) : undefined} />
      {anexando && (
        <AnexosLancamentoDialog open onOpenChange={v => {
          if (v) return;
          const id = anexando.id; setAnexando(null); carregar();
          void buscarLancamentoParaEditar(id).then(x => { if (x) setDocumentando(x); }).catch(() => { /* só não reabre o painel */ });
        }} lancamentoId={anexando.id} descricaoLancamento={anexando.descricao} />
      )}
      <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); carregar(); }} />
      <PagarReembolsoDialog alvo={reembolso} onFechar={() => setReembolso(null)} onFeito={() => { setReembolso(null); carregar(); }} />
      <QuitacaoDialog alvo={corrigindo?.alvo ?? null} quitacao={corrigindo?.quitacao ?? null} onFechar={() => setCorrigindo(null)} onFeito={() => { setCorrigindo(null); carregar(); }} />
    </>
  );
  return { abrirLinha, acoesDaLinha, dialogos };
}
