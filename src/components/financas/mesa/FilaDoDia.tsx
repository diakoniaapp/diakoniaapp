// ─── FilaDoDia — UMA fila para tudo o que pede a Tesouraria agora ─────────────────────────────────────────────────────────────────────────────────────
// Fase C (20/10/2026). Antes, a Mesa listava o que pede ação em quatro lugares (contas a pagar por janela, débitos automáticos, filas da Quitação e prazos da Quitação) e a Tesouraria juntava de
// cabeça. Aqui as três origens viram UMA lista, com UM vocabulário (o verbo da ação: Pagar, Conferir débito, Formalizar…) e UMA régua (Agora · Hoje · Em breve). As regras estão em
// `lib/filaDoDia.ts`; este arquivo só carrega o que falta (as filas e os prazos da Quitação) e desenha. As ações são as de sempre: Pagar, Editar, Anexar, Marcar debitado, Pagar reembolso, abrir a quitação.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NATUREZA_DA_ACAO, ROTULO_DA_ACAO, ROTULO_DA_URGENCIA, montarFilaDoDia, resumirFila, type AcaoDaObrigacao, type ItemDaFila, type UrgenciaDaFila,
} from "@/lib/filaDoDia";
import { ROTULO_INTENCAO, ROTULO_RESPONSAVEL } from "@/lib/quitacao";
import { contaPrevista, oQueQuitou, quemRecebe } from "@/lib/reembolsoApresentacao";
import type { DebitoDoMes } from "@/services/mesaOperacoesService";
import { brl, type FinVencimento } from "@/services/finService";
import {
  carregarParametros, listarFilasDeQuitacao, prazosAbertos, sincronizarQuitacoes, type ItemDeFila, type PrazoAberto, type QuitacaoDaObrigacao,
} from "@/services/quitacaoService";

/** Cor (token semântico) pela natureza da ação: dinheiro que sai · banco a conferir · falha · só informa · decisão sobre terceiro. */
const CLASSE_DA_NATUREZA = {
  dinheiro: "border-success-line bg-success-soft text-success-text",
  banco: "border-warning-line bg-warning-soft text-warning-text",
  falha: "border-destructive-line bg-destructive-soft text-destructive-text",
  informa: "border-info-line bg-info-soft text-info-text",
  decisao: "border-violeta-line bg-violeta-soft text-violeta-text",
} as const;
const GLIFO_DA_NATUREZA = { dinheiro: "$", banco: "◐", falha: "▲", informa: "○", decisao: "◆" } as const;

export function ChipDaAcao({ acao }: { acao: AcaoDaObrigacao }) {
  const n = NATUREZA_DA_ACAO[acao];
  return (
    <span data-acao={acao} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${CLASSE_DA_NATUREZA[n]}`}>
      <span aria-hidden>{GLIFO_DA_NATUREZA[n]}</span>{ROTULO_DA_ACAO[acao]}
    </span>
  );
}

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export interface AcoesDaFila {
  /** a linha de uma conta a pagar (a MESMA da Mesa, com Pagar / Editar / Anexar), com o chip da ação à frente */
  renderConta: (v: FinVencimento, chip: ReactNode) => ReactNode;
  onAbrirObrigacao: (obrigacaoId: string) => void;
  onMarcarDebitado: (obrigacaoId: string) => void;
  onPagarReembolso: (q: QuitacaoDaObrigacao) => void;
  podePagar: boolean;
}

export function FilaDoDia({ hoje, vencimentos, debitos, obrigacoesComQuitacao, chave, acoes }: {
  hoje: string; vencimentos: FinVencimento[]; debitos: DebitoDoMes[]; obrigacoesComQuitacao: ReadonlySet<string>; chave: number; acoes: AcoesDaFila;
}) {
  const [filas, setFilas] = useState<ItemDeFila[]>([]);
  const [prazos, setPrazos] = useState<PrazoAberto[]>([]);
  const [vigencia, setVigencia] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // a formalização vencida é um fato do tempo: ao abrir, o banco realinha o status das ofertas com o que a Matriz manda (idempotente)
    sincronizarQuitacoes().catch(() => 0)
      .then(() => Promise.all([listarFilasDeQuitacao(hoje), prazosAbertos(), carregarParametros()]))
      .then(([l, p, par]) => { if (vivo) { setFilas(l); setPrazos(p); setVigencia(par.vigencia); } })
      .catch(() => { if (vivo) { setFilas([]); setPrazos([]); } });
    return () => { vivo = false; };
  }, [hoje, chave]);

  const fila = useMemo(() => montarFilaDoDia({
    hoje, vencimentos, debitos, quitacoes: filas, prazos, obrigacoesComQuitacao,
  }), [hoje, vencimentos, debitos, filas, prazos, obrigacoesComQuitacao]);
  const resumo = useMemo(() => resumirFila(fila), [fila]);

  if (fila.length === 0) {
    return <p data-fila-vazia className="py-4 text-center text-sm text-muted-foreground">Nada pede você agora: nenhuma conta atrasada ou a vencer nesta semana, nenhum débito sem confirmação e nenhuma quitação a resolver.</p>;
  }
  return (
    <div data-fila-do-dia>
      {([0, 1, 2] as UrgenciaDaFila[]).map(u => {
        const itens = fila.filter(i => i.urgencia === u);
        if (itens.length === 0) return null;
        return (
          <div key={u} data-urgencia={u} className="mb-2 last:mb-0">
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <h3 className={`text-xs font-bold uppercase tracking-wide ${u === 0 ? "text-destructive-text" : u === 1 ? "text-warning-text" : "text-muted-foreground"}`}>{ROTULO_DA_URGENCIA[u]} · {itens.length}</h3>
              <span className="text-xs font-semibold tabular-nums">{brl(resumirFila(itens).valor)}</span>
            </div>
            <ul>{itens.map(i => <LinhaDaFilaDoDia key={i.chave} i={i} acoes={acoes} />)}</ul>
          </div>
        );
      })}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {resumo.total} {resumo.total === 1 ? "item" : "itens"} · o que vence depois de 7 dias está no Calendário.
        {filas.length > 0 && (vigencia
          ? <> A Política de compras por terceiros bloqueia o fechamento a partir de {vigencia.split("-").reverse().join("/")}.</>
          : <> A Política de compras por terceiros ainda está desligada: as quitações só informam, não bloqueiam o fechamento nem o malote.</>)}
      </p>
    </div>
  );
}

function LinhaDaFilaDoDia({ i, acoes }: { i: ItemDaFila; acoes: AcoesDaFila }) {
  if (i.origem === "vencimento") return <>{acoes.renderConta(i.ref as FinVencimento, <ChipDaAcao acao={i.acao} />)}</>;

  if (i.origem === "debito") {
    const d = i.ref as DebitoDoMes;
    return (
      <li data-chave={i.chave} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t py-2 text-sm first:border-t-0 sm:flex-nowrap">
        <span className="shrink-0 sm:w-[8.5rem]"><ChipDaAcao acao={i.acao} /></span>
        <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(d.data)}</span>
        <button type="button" onClick={() => acoes.onAbrirObrigacao(i.obrigacaoId)} className="min-w-0 flex-1 basis-40 text-left hover:underline">
          <span className="block truncate font-medium">{d.fornecedor || d.descricao || "(sem descrição)"}</span>
          <span className="block truncate text-xs text-muted-foreground">{i.porque}{d.variavel ? " · valor estimado" : ""}{d.contaNome ? ` · ${d.contaNome}` : ""}</span>
        </button>
        <span className="shrink-0 font-medium tabular-nums">{brl(i.valor)}</span>
        {i.acao !== "debito_hoje" && acoes.podePagar && (
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => acoes.onMarcarDebitado(i.obrigacaoId)} title="Já conferi no banco: marcar como debitado">Marcar debitado</Button>
        )}
      </li>
    );
  }

  const q = i.ref as ItemDeFila;
  return (
    <li data-chave={i.chave} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t py-2 text-sm first:border-t-0 sm:flex-nowrap">
      <span className="shrink-0 sm:w-[8.5rem]"><ChipDaAcao acao={i.acao} /></span>
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{dataCurta(i.data)}</span>
      <button type="button" onClick={() => acoes.onAbrirObrigacao(i.obrigacaoId)} className="min-w-0 flex-1 basis-40 text-left hover:underline">
        {i.acao === "pagar_reembolso" ? (
          // a dívida da igreja é com QUEM PAGOU: ele vem em destaque; o fornecedor é só "o que ele quitou" (pedido dela, 22/10/2026)
          <>
            <span data-quem-recebe className="block truncate font-medium">{quemRecebe({ quem_recebe: q.responsavelNome })}</span>
            <span data-reembolso-detalhe className="block truncate text-xs text-muted-foreground">
              Quitou: {oQueQuitou({ quitou: q.emitente, descricao: q.descricao })} · Conta prevista para pagamento: {contaPrevista({ conta_prevista: q.contaPrevistaNome })}
              {(q.reembolsado ?? 0) > 0 ? ` · já reembolsado ${brl(q.reembolsado ?? 0)}` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="block truncate font-medium">{q.emitente ?? q.descricao ?? "Despesa"}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {q.responsavelNome ? `${q.responsavelNome} · ` : ""}{ROTULO_RESPONSAVEL[q.responsavel]}{q.responsavel !== "nao_localizado" ? ` · ${ROTULO_INTENCAO[q.intencao]}` : ""} · {i.porque}
            </span>
          </>
        )}
      </button>
      <span className="shrink-0 font-medium tabular-nums">{brl(i.valor)}</span>
      {i.acao === "pagar_reembolso" && acoes.podePagar ? (
        <Button size="sm" variant="success" className="h-7 shrink-0 gap-1 text-xs" onClick={() => acoes.onPagarReembolso(q)}><Wallet className="h-3 w-3" /> Pagar</Button>
      ) : (
        <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => acoes.onAbrirObrigacao(i.obrigacaoId)}><CheckCircle2 className="h-3 w-3" /> Resolver</Button>
      )}
    </li>
  );
}

