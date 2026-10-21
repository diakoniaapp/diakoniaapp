// ─── ReservaDeRecursos — Saldo nas contas · Reservado · Saldo livre (cabeçalho da Tesouraria) e o painel lateral do que está reservado ─────────────────────
//
// Decisão dela (21/10/2026): o "Disponível" somava tudo que está nas contas, inclusive dinheiro que já tem destino (o almoço da Juventude para o retiro, o Fundo Missionário). Agora a
// Tesouraria vê, todo dia: 1) quanto existe nas contas, 2) quanto já tem destinação, 3) quanto está realmente livre. Clicar em "Reservado" abre o detalhe por projeto.
// É uma LEITURA: não cria conta, não move dinheiro, não bloqueia pagamento (o dinheiro continua na mesma conta bancária).
// As regras de cálculo moram em lib/recursosReservados.ts.
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Landmark, PiggyBank } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { brl } from "@/services/finService";
import type { ItemReservado, RecursosReservados } from "@/lib/recursosReservados";

const ROTULO = "text-2xs uppercase tracking-wide text-muted-foreground font-semibold";

/** Os três números do cabeçalho; "Reservado" é um botão que abre o painel lateral. */
export function IndicadoresDeSaldo({ recursos }: { recursos: RecursosReservados }) {
  const [aberto, setAberto] = useState(false);
  const livreNegativo = recursos.saldoLivre < 0;
  const contasNegativo = recursos.saldoNasContas < 0;
  return (
    <>
      <div className="flex items-center gap-3 sm:gap-4" data-saldos>
        <div className="text-right">
          <p className={ROTULO}>Saldo nas contas</p>
          {/* negativo é vermelho (o "Disponível" antigo era verde mesmo no negativo) */}
          <p className={`text-sm font-bold tabular-nums ${contasNegativo ? "text-destructive-text" : "text-success-text"}`} data-saldo-contas>{brl(recursos.saldoNasContas)}</p>
        </div>
        <div className="w-px h-7 bg-border" />
        <button type="button" onClick={() => setAberto(true)} aria-label={`Reservado ${brl(recursos.reservado)} — ver detalhe`}
          className="group -mx-1 rounded-md px-1 text-right hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
          <p className={`${ROTULO} inline-flex items-center gap-0.5`}>Reservado <ChevronRight className="h-3 w-3 opacity-60 group-hover:translate-x-0.5 transition-transform" aria-hidden /></p>
          <p className="text-sm font-bold tabular-nums text-info-text">{brl(recursos.reservado)}</p>
        </button>
        <div className="w-px h-7 bg-border" />
        <div className="text-right">
          <p className={ROTULO}>Saldo livre</p>
          <p className={`text-sm font-bold tabular-nums ${livreNegativo ? "text-destructive-text" : "text-success-text"}`}>{brl(recursos.saldoLivre)}</p>
        </div>
      </div>
      <PainelDosReservados aberto={aberto} onOpenChange={setAberto} recursos={recursos} />
    </>
  );
}

function Linha({ rotulo, valor, destaque, negativo }: { rotulo: string; valor: string; destaque?: boolean; negativo?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={`tabular-nums ${destaque ? "font-semibold" : ""} ${negativo ? "text-destructive-text" : ""}`}>{valor}</span>
    </div>
  );
}

function CartaoDoItem({ item }: { item: ItemReservado }) {
  const fundo = item.origem === "fundo_missionario";
  const nome = item.origem === "projeto"
    ? <Link to={`/financas/projeto/${item.id}`} className="font-medium underline-offset-2 hover:underline">{item.nome}</Link>
    : <span className="font-medium">{item.nome}</span>;
  return (
    <li className="rounded-lg border bg-card p-3 text-sm" data-reservado={item.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {nome}
          <p className="text-xs text-muted-foreground">{fundo ? "Fundo (calculado nos Indicadores Missionários)" : "Projeto com Reserva Financeira"}</p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-info-text">{brl(item.reservado)}</p>
      </div>
      <div className="mt-2 space-y-0.5 border-t pt-2 text-xs">
        <Linha rotulo={fundo ? "Arrecadado" : "Receitas realizadas"} valor={brl(item.entradas)} />
        <Linha rotulo={fundo ? "Enviado" : "Despesas realizadas"} valor={`− ${brl(item.saidas)}`} />
        {fundo && !!item.ajustes && <Linha rotulo="Ajustes gerenciais" valor={`${item.ajustes > 0 ? "+" : "−"} ${brl(Math.abs(item.ajustes))}`} />}
        {item.alemDaReserva > 0 && (
          <p className="mt-1 flex items-center gap-1.5 rounded bg-warning-soft px-2 py-1 text-warning-text">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Gasto além da reserva: <b className="tabular-nums">{brl(item.alemDaReserva)}</b>
          </p>
        )}
      </div>
    </li>
  );
}

export function PainelDosReservados({ aberto, onOpenChange, recursos }: { aberto: boolean; onOpenChange: (v: boolean) => void; recursos: RecursosReservados }) {
  const livreNegativo = recursos.saldoLivre < 0;
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><PiggyBank className="h-5 w-5 text-gold" /> Recursos reservados</SheetTitle>
          <SheetDescription>
            Dinheiro que está nas contas mas já tem destino. Não bloqueia pagamentos — é só para a Tesouraria enxergar o que realmente está livre.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-1 rounded-lg border bg-muted/30 p-3 text-sm" aria-label="Como o saldo livre é calculado">
          <Linha rotulo="Saldo nas contas" valor={brl(recursos.saldoNasContas)} negativo={recursos.saldoNasContas < 0} />
          <Linha rotulo="Reservado" valor={`− ${brl(recursos.reservado)}`} />
          <div className="border-t pt-1">
            <Linha rotulo="Saldo livre" valor={brl(recursos.saldoLivre)} destaque negativo={livreNegativo} />
          </div>
        </div>
        {livreNegativo && (
          <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-destructive-soft p-2.5 text-sm text-destructive-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {recursos.saldoNasContas < 0
              ? "As contas estão no negativo: não há dinheiro livre, e o que está reservado também não está coberto."
              : "As reservas somam mais do que há nas contas: parte do dinheiro reservado já foi usada em outras despesas."}
          </p>
        )}

        {recursos.itens.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nenhum projeto com reserva ainda. Marque “Projeto com Reserva Financeira” no cadastro do projeto (Financeiro → Projetos).
          </p>
        ) : (
          <ul className="mt-4 space-y-2" aria-label="Itens reservados">
            {recursos.itens.map(i => <CartaoDoItem key={`${i.origem}-${i.id}`} item={i} />)}
          </ul>
        )}

        <div className="mt-5 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5"><Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Contam só receitas e despesas <b>realizadas</b> do mesmo projeto. Previstos e transferências entre contas não entram.</p>
          <p>A reserva nunca fica negativa: o que passou do arrecadado aparece como “gasto além da reserva”.</p>
          <p>Receitas lançadas só com o centro de custo (sem o projeto) <b>não</b> entram na reserva — marque o projeto no lançamento.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
