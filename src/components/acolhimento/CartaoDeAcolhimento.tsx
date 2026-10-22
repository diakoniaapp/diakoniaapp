// ─── CartaoDeAcolhimento — UM visitante, na ordem em que a pessoa precisa decidir: quem é e quão urgente → o que fazer agora → como chegou até aqui → o resto (pequeno) ──────────────────────────────────────
//
// Antes: cinco botões do mesmo tamanho (Retorno, Contato, WhatsApp…), uma faixa de cor de prioridade que só dependia do tempo e nada dizendo qual era o PRÓXIMO PASSO. Agora:
//   1. a prioridade é um selo preenchido, com palavra e ícone (ALTA / MÉDIA / BAIXA) — nunca só a cor da borda;
//   2. o painel "Próxima ação" diz o que fazer e por quê, com UM botão principal (WhatsApp, promover, abrir a ficha);
//   3. a linha do tempo mostra em quatro marcos onde a pessoa está e onde parou (chegou · contato · retorno · próximo passo);
//   4. o que é operacional (registrar contato, registrar retorno, editar mensagem, tarefas) fica pequeno, embaixo.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCheck, CheckCircle2, ChevronDown, Clock, ListChecks, MessageCircle, Phone, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatarTelefoneSemDDI } from "@/lib/telefone";
import type { AcaoDoBotao, Marco, Prioridade, VisitanteDaCentral } from "@/lib/centralDeAcolhimento";
import type { TarefaAcolhimento } from "@/services/visitanteService";

const SELO: Record<Prioridade, { classe: string; rotulo: string; icone: typeof AlertTriangle }> = {
  alta: { classe: "bg-destructive text-destructive-foreground", rotulo: "ALTA", icone: AlertTriangle },
  media: { classe: "bg-warning text-warning-foreground", rotulo: "MÉDIA", icone: Clock },
  baixa: { classe: "border border-success-line bg-success-soft text-success-text", rotulo: "BAIXA", icone: CheckCircle2 },
};
const BORDA: Record<Prioridade, string> = { alta: "border-l-destructive", media: "border-l-warning", baixa: "border-l-success" };
const PAINEL: Record<Prioridade, string> = {
  alta: "border-destructive-line bg-destructive-soft", media: "border-warning-line bg-warning-soft", baixa: "border-border bg-muted/40",
};

export function SeloDePrioridade({ p }: { p: Prioridade }) {
  const s = SELO[p];
  const Icone = s.icone;
  return <span data-prioridade-selo={p} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide ${s.classe}`}><Icone className="h-3 w-3" aria-hidden /> {s.rotulo}</span>;
}

const DOT: Record<Marco["estado"], string> = {
  feito: "bg-success border-success",
  atencao: "bg-destructive border-destructive ring-2 ring-destructive/25",
  pendente: "bg-background border-muted-foreground/40",
  proximo: "bg-gold border-gold ring-4 ring-gold/30",
};
const TEXTO_DO_ESTADO: Record<Marco["estado"], string> = { feito: "feito", atencao: "atenção", pendente: "pendente", proximo: "próximo passo" };

export function LinhaDoTempo({ marcos }: { marcos: Marco[] }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Linha do tempo do visitante" data-linha-do-tempo>
      {marcos.map((m, i) => (
        <li key={m.chave} className="relative min-w-0 pt-0.5" data-marco={m.chave} data-estado={m.estado}>
          {/* o fio liga o ponto anterior a este: sai da borda direita do ponto de trás (14 px) e chega na borda esquerda deste */}
          {i > 0 && <span aria-hidden style={{ left: "calc(-100% - 0.25rem + 14px)", width: "calc(100% + 0.25rem - 14px)" }} className={`absolute top-[8px] h-0.5 ${marcos[i - 1].estado === "feito" ? "bg-success/60" : "bg-border"}`} />}
          <span aria-hidden className={`relative z-10 block h-3.5 w-3.5 rounded-full border-2 ${DOT[m.estado]}`} />
          <p className="mt-1 truncate text-[11px] font-semibold leading-tight">{m.rotulo}<span className="sr-only"> ({TEXTO_DO_ESTADO[m.estado]})</span></p>
          <p className={`truncate text-[11px] leading-tight ${m.estado === "atencao" ? "font-medium text-destructive-text" : "text-muted-foreground"}`} title={m.detalhe}>{m.detalhe}</p>
        </li>
      ))}
    </ol>
  );
}

export interface AcoesDoCartao {
  onAcao: (v: VisitanteDaCentral, botao: AcaoDoBotao) => void;
  onMensagem: (v: VisitanteDaCentral) => void;
  onContato: (v: VisitanteDaCentral) => void;
  onRetorno: (v: VisitanteDaCentral) => void;
  onRetornoFeito: (v: VisitanteDaCentral) => void;
  onToggleTarefa: (t: TarefaAcolhimento) => void;
}

const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

export function CartaoDeAcolhimento({ v, ocupado, tarefas, tarefaOcupada, acoes }: { v: VisitanteDaCentral; ocupado: boolean; tarefas: TarefaAcolhimento[]; tarefaOcupada: string | null; acoes: AcoesDoCartao }) {
  const [tarefasAbertas, setTarefasAbertas] = useState(false);
  const a = v.proximaAcao;
  const feitas = tarefas.filter(t => t.concluida).length;
  const temPedido = !!v.pedido && (v.pedido.oracao.length > 0 || v.pedido.quer_contato || !!(v.pedido.oracaoTexto ?? "").trim());
  const meta = [formatarTelefoneSemDDI(v.telefone), v.bairro].filter(Boolean).join(" · ") || "sem telefone";
  const situacao = v.situacao === "nao_voltou" ? { t: `Não voltou há ${v.diasDesdeCadastro} dias`, c: "border-destructive-line bg-destructive-soft text-destructive-text" }
    : v.situacao === "retornou" ? { t: `Retornou · ${v.numeroVisitas} visitas`, c: "border-success-line bg-success-soft text-success-text" }
    : v.situacao === "chegou_agora" ? { t: v.diasDesdeCadastro === 0 ? "Chegou hoje" : "Chegou ontem", c: "border-info-line bg-info-soft text-info-text" }
    : { t: `Dia ${v.diasDesdeCadastro} · 1 visita`, c: "border-border bg-muted text-muted-foreground" };

  return (
    <article data-visitante={v.id} data-prioridade={v.prioridade} data-acao={a.tipo} aria-busy={ocupado}
      className={`min-w-0 rounded-lg border border-l-[6px] bg-card shadow-card-soft ${BORDA[v.prioridade]} ${ocupado ? "opacity-60" : ""}`}>
      <div className="space-y-3 p-4">

        {/* 1 — quem é e quão urgente */}
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/visitantes/${v.id}`} className="block truncate text-base font-semibold hover:underline" translate="no">{v.nome}</Link>
            <p className="truncate text-xs text-muted-foreground" translate="no">{meta}</p>
          </div>
          <SeloDePrioridade p={v.prioridade} />
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${CHIP} ${situacao.c}`} data-situacao={v.situacao}>{situacao.t}</span>
          {v.pedido && v.pedido.oracao.length + (v.pedido.oracaoTexto ? 1 : 0) > 0 && <span className={`${CHIP} border-destructive-line bg-destructive-soft text-destructive-text`}>🙏 Pediu oração</span>}
          {v.pedido?.quer_contato && <span className={`${CHIP} border-warning-line bg-warning-soft text-warning-text`}>💬 Quer contato pastoral</span>}
          {v.sugestaoDePromocao && <span className={`${CHIP} border-success-line bg-success-soft text-success-text`}><Sparkles className="h-3 w-3" aria-hidden /> Pronto para o próximo passo</span>}
        </div>
        {v.pedido?.oracaoTexto && <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs italic text-muted-foreground">“{v.pedido.oracaoTexto}”</p>}

        {/* 2 — o que fazer agora */}
        <section aria-label="Próxima ação" data-proxima-acao className={`rounded-md border p-3 ${PAINEL[v.prioridade]}`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Próxima ação</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug">{a.titulo}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
          {a.botao !== "nenhuma" && (
            <Button type="button" className="mt-2 h-11 w-full gap-2 sm:w-auto" variant={a.botao === "whatsapp" ? "whatsapp" : a.botao === "promover" ? "success" : "outline"} disabled={ocupado}
              onClick={() => acoes.onAcao(v, a.botao)} data-botao-principal={a.botao}>
              {a.botao === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : a.botao === "promover" ? <Sparkles className="h-4 w-4" /> : null} {a.rotuloDoBotao}
            </Button>
          )}
        </section>

        {/* 3 — como chegou até aqui */}
        <LinhaDoTempo marcos={v.linhaDoTempo} />

        {/* 4 — o resto, pequeno */}
        <footer className="flex flex-wrap items-center gap-1 border-t pt-2">
          <Button type="button" size="sm" variant="ghost" className="h-10 gap-1 px-2 text-xs text-muted-foreground" disabled={ocupado} onClick={() => acoes.onContato(v)} data-secundaria="contato"><Phone className="h-3.5 w-3.5" /> Registrar contato</Button>
          <Button type="button" size="sm" variant="ghost" className="h-10 gap-1 px-2 text-xs text-muted-foreground" disabled={ocupado} onClick={() => acoes.onRetorno(v)} data-secundaria="retorno"><RotateCcw className="h-3.5 w-3.5" /> Registrar retorno</Button>
          {v.telefone && <Button type="button" size="sm" variant="ghost" className="h-10 gap-1 px-2 text-xs text-muted-foreground" disabled={ocupado} onClick={() => acoes.onMensagem(v)} data-secundaria="mensagem"><MessageCircle className="h-3.5 w-3.5" /> Editar mensagem</Button>}
          {temPedido && <Button type="button" size="sm" variant="ghost" className="h-10 gap-1 px-2 text-xs text-muted-foreground" disabled={ocupado} onClick={() => acoes.onRetornoFeito(v)} data-secundaria="retorno_feito"><CheckCheck className="h-3.5 w-3.5" /> Retorno feito</Button>}
          {tarefas.length > 0 && (
            <Button type="button" size="sm" variant="ghost" className="ml-auto h-10 gap-1 px-2 text-xs text-muted-foreground" aria-expanded={tarefasAbertas} onClick={() => setTarefasAbertas(x => !x)} data-secundaria="tarefas">
              <ListChecks className="h-3.5 w-3.5" /> {feitas}/{tarefas.length} tarefas <ChevronDown className={`h-3 w-3 transition-transform ${tarefasAbertas ? "rotate-180" : ""}`} />
            </Button>
          )}
        </footer>
        {tarefasAbertas && tarefas.length > 0 && (
          <ul className="space-y-1 rounded-md border bg-muted/20 px-2.5 py-2" data-tarefas>
            {tarefas.map(t => (
              <li key={t.id} className="flex items-start gap-2">
                <Checkbox checked={t.concluida} disabled={tarefaOcupada === t.id} onCheckedChange={() => acoes.onToggleTarefa(t)} className="mt-0.5 shrink-0"
                  aria-label={`Marcar "${t.titulo.split(" — ")[0]}" como ${t.concluida ? "pendente" : "concluída"}`} />
                <span className={`text-xs leading-snug ${t.concluida ? "text-muted-foreground line-through" : ""}`} translate="no">{t.titulo.split(" — ")[0]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
