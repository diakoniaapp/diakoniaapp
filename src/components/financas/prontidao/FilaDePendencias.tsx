// ─── FilaDePendencias — a fila operacional do malote: o que falta, obrigação a obrigação ─────────────────────────────────────────────────────────────
// Da mais grave à mais leve (🔴 crítica, 🟠 parcial, 🔵 administrativa), do maior valor ao menor. Cada linha traz o que falta, o fornecedor, o valor, projeto, centro e data, e resolve sem sair da tela:
// Anexar (documento), Editar (o que é operacional) e Visualizar. Peça única: a etapa "Prontidão" do Fechamento do mês e a página de Auditoria de documentos usam a mesma.
import { useMemo, useState } from "react";
import { numeroDe, useEstadoNaUrl } from "@/hooks/useEstadoNaUrl";
import { CheckCircle2, Eye, MoreHorizontal, Paperclip, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { DocumentacaoChip, GravidadeChip } from "@/components/financas/DocumentacaoChip";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { ORDEM_DA_GRAVIDADE, textoDoQueFalta, type Gravidade, type ResumoDaProntidao } from "@/lib/documentacaoExigida";
import { dataBr, diaDoPagamento, type LinhaAuditoria } from "@/lib/pacoteContabil";
import { brl, nomeExtrato } from "@/services/finService";

type Vista = "pendencias" | Gravidade | "aguardando" | "completas" | "dispensam" | "todas";

const ROTULO_DA_VISTA: Record<Vista, string> = {
  pendencias: "Pendências", critica: "Críticas", parcial: "Parciais", administrativa: "Administrativas",
  aguardando: "Aguardando assinatura", completas: "Completas", dispensam: "Dispensam", todas: "Todas",
};

export function FilaDePendencias({ linhas, resumo, podeOperar, onMudou, porPagina = 100 }: {
  /** as linhas já filtradas (pela tela que usa) */
  linhas: LinhaAuditoria[];
  resumo: ResumoDaProntidao;
  podeOperar: boolean;
  /** algo foi anexado ou editado: quem usa recarrega e recalcula o topo */
  onMudou: () => void;
  porPagina?: number;
}) {
  // A vista e quantas linhas já foram mostradas moram na URL (`?vista=critica&ate=300`): abrir uma pendência e voltar devolve a fila onde estava (22/10/2026). Mudar a vista volta ao 1º lote.
  const [naUrl, mudarNaUrl] = useEstadoNaUrl({ vista: "pendencias", ate: String(porPagina) }, { ate: String(porPagina) });
  const vista = naUrl.vista as Vista;
  const setVista = (v: Vista) => mudarNaUrl({ vista: v });
  const visiveis = numeroDe(naUrl.ate, porPagina, porPagina);
  const setVisiveis = (f: number | ((n: number) => number)) => mudarNaUrl({ ate: String(typeof f === "function" ? f(visiveis) : f) });
  const [anexando, setAnexando] = useState<LinhaAuditoria | null>(null);
  const [detalhe, setDetalhe] = useState<LinhaAuditoria["lancamento"] | null>(null);
  const [editando, setEditando] = useState<LinhaDaFilaLancamento | null>(null);

  const porGravidade = useMemo(() => ({
    critica: linhas.filter(x => x.documentacao.gravidade === "critica").length,
    parcial: linhas.filter(x => x.documentacao.gravidade === "parcial").length,
    administrativa: linhas.filter(x => x.documentacao.gravidade === "administrativa").length,
  }), [linhas]);

  const lista = useMemo(() => {
    const doTipo = linhas.filter(x => {
      if (vista === "todas") return true;
      if (vista === "pendencias") return !!x.documentacao.gravidade;
      if (vista === "aguardando") return x.documentacao.aguardandoAssinatura;
      if (vista === "completas") return x.situacao === "completa";
      if (vista === "dispensam") return x.situacao === "dispensa";
      return x.documentacao.gravidade === vista;
    });
    // fila: 🔴 antes de 🟠 antes de 🔵, e o maior valor primeiro; o resto, por dia
    return [...doTipo].sort((a, b) => {
      if (vista === "pendencias" || vista === "critica" || vista === "parcial" || vista === "administrativa") {
        return ORDEM_DA_GRAVIDADE[a.documentacao.gravidade ?? "administrativa"] - ORDEM_DA_GRAVIDADE[b.documentacao.gravidade ?? "administrativa"]
          || Number(b.lancamento.valor) - Number(a.lancamento.valor);
      }
      return diaDoPagamento(a.lancamento).localeCompare(diaDoPagamento(b.lancamento)) || nomeExtrato(a.lancamento).principal.localeCompare(nomeExtrato(b.lancamento).principal, "pt-BR");
    });
  }, [linhas, vista]);

  return (
    <Card data-bloco="fila">
      <CardContent className="p-0">
        <div className="p-3 border-b space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="text-sm font-medium">Pendências do malote</h2>
            <p className="text-xs text-muted-foreground">da mais grave à mais leve, e do maior valor ao menor</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["pendencias", "critica", "parcial", "administrativa", ...(resumo.aguardandoAssinatura > 0 ? ["aguardando" as const] : []), "completas", "dispensam", "todas"] as const).map(v => {
              const n = v === "todas" ? resumo.total : v === "pendencias" ? resumo.pendentes : v === "completas" ? resumo.completas : v === "dispensam" ? resumo.dispensam : v === "aguardando" ? resumo.aguardandoAssinatura : porGravidade[v];
              return (
                <Button key={v} size="sm" variant={vista === v ? "default" : "outline"} className="h-7 text-xs" onClick={() => setVista(v)} data-vista={v}>
                  {ROTULO_DA_VISTA[v]} <span className="ml-1.5 tabular-nums opacity-80">{n}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            {vista === "pendencias" && resumo.total > 0
              ? <><CheckCircle2 className="w-4 h-4 text-success-text" /> Nenhuma pendência neste recorte.</>
              : "Nada para mostrar neste recorte."}
          </p>
        ) : (
          <ul className="divide-y">
            {lista.slice(0, visiveis).map(x => (
              <LinhaDaFila key={x.lancamento.id} x={x} podeOperar={podeOperar}
                onAnexar={() => setAnexando(x)} onEditar={() => setEditando(x.lancamento)} onVisualizar={() => setDetalhe(x.lancamento)} />
            ))}
          </ul>
        )}

        {lista.length > visiveis && (
          <div className="p-3 border-t text-center">
            <Button variant="outline" size="sm" onClick={() => setVisiveis(v => v + porPagina)}>
              Mostrar mais {Math.min(porPagina, lista.length - visiveis)} de {lista.length - visiveis} restantes
            </Button>
          </div>
        )}
      </CardContent>

      {/* Os fluxos de sempre, montados uma vez: resolver a pendência sem sair da tela */}
      {anexando && (
        <AnexosLancamentoDialog open onOpenChange={v => { if (!v) { setAnexando(null); onMudou(); } }}
          lancamentoId={anexando.lancamento.id} descricaoLancamento={nomeExtrato(anexando.lancamento).principal} onChange={onMudou} />
      )}
      <DetalhesDoLancamento lancamento={detalhe} onFechar={() => setDetalhe(null)} />
      <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); onMudou(); }} />
    </Card>
  );
}

type LinhaDaFilaLancamento = LinhaAuditoria["lancamento"];

export function LinhaDaFila({ x, podeOperar, onAnexar, onEditar, onVisualizar }: {
  x: LinhaAuditoria; podeOperar: boolean; onAnexar: () => void; onEditar: () => void; onVisualizar: () => void;
}) {
  const l = x.lancamento, d = x.documentacao;
  const nome = nomeExtrato(l).principal;
  const administrativa = d.gravidade === "administrativa";
  // a ação que resolve: documento faltando → Anexar; só falta algo operacional → Editar. As outras ficam no "⋯".
  const principal: "anexar" | "editar" | null = !podeOperar ? null : administrativa ? "editar" : d.gravidade ? "anexar" : null;
  return (
    <li data-pendencia={l.id} data-gravidade-da-linha={d.gravidade ?? "nenhuma"} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {d.gravidade ? <GravidadeChip gravidade={d.gravidade} /> : <DocumentacaoChip situacao={x.situacao} />}
          <button type="button" onClick={onVisualizar} className="min-w-0 truncate text-left font-medium hover:underline" title={nome}>{nome}</button>
          {x.aviso && <span className="rounded border border-gold bg-gold/10 px-1.5 text-[10px] font-semibold text-gold-text">Reembolso a pagar</span>}
        </div>
        <p className="text-xs text-muted-foreground">{textoDoQueFalta(d)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[dataBr(diaDoPagamento(l)), l.projeto_nome ? `Projeto: ${l.projeto_nome}` : null, l.centro_nome, l.conta_nome].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="text-right tabular-nums font-medium whitespace-nowrap">{brl(l.valor)}</span>
      <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1 md:self-center">
        {principal === "anexar" && (
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-xs whitespace-nowrap" onClick={onAnexar} aria-label={`Anexar documento — ${nome}`} title="Anexar documento">
            <Paperclip className="w-3.5 h-3.5" /><span className="hidden lg:inline">Anexar</span>
          </Button>
        )}
        {principal === "editar" && (
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-xs whitespace-nowrap" onClick={onEditar} aria-label={`Editar obrigação — ${nome}`} title="Editar obrigação">
            <Pencil className="w-3.5 h-3.5" /><span className="hidden lg:inline">Editar</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" aria-label={`Mais ações de ${nome}`} title="Mais ações"><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuItem onSelect={onVisualizar}><Eye className="w-3.5 h-3.5" /> Visualizar</DropdownMenuItem>
            {podeOperar && principal !== "editar" && <DropdownMenuItem onSelect={onEditar}><Pencil className="w-3.5 h-3.5" /> Editar obrigação</DropdownMenuItem>}
            {podeOperar && principal !== "anexar" && <DropdownMenuItem onSelect={onAnexar}><Paperclip className="w-3.5 h-3.5" /> Anexar documento</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
