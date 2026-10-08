// ─── EditorDaCompetencia.tsx — Conta Corrente de Sustento, Fase 2 (2/3): valor previsto, rubricas do RSP e fechamento ──────
//
// Dentro do detalhe de uma competência (com o controle ligado):
//   · modo SIMPLES: o valor previsto do mês (valor previsto, valor pago, saldo — nada mais);
//   · modo AVANÇADO: as linhas do RSP — sustento, arredondamento, IRRF e o que mais houver — e o líquido que elas dão;
//   · fechar a competência (a apuração conferida: o saldo a pagar passa a disputar o pagamento) e reabri-la para corrigir.
// O modo é o da própria competência (nasceu com ela); esta tela nunca o troca. Só escreve em sustento_*. A obrigação prevista que o
// fechamento vai gerar é a parte 3 — aqui fechar só muda o status.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/services/finService";
import {
  adicionarRubrica, fecharCompetencia, reabrirCompetencia, removerRubrica, salvarValorPrevisto, type CompetenciaDoSustento,
} from "@/services/sustentoService";
import { OPCOES_DE_RUBRICA, motivoParaNaoFechar, parseValorBR } from "@/lib/sustento";

const CAMPO = "h-8 rounded-md border bg-background px-2 text-xs min-w-0";

export function EditorDaCompetencia({ c, aoMudar }: { c: CompetenciaDoSustento; aoMudar: () => void }) {
  const [valor, setValor] = useState(c.valorPrevisto != null ? String(c.valorPrevisto).replace(".", ",") : "");
  const [opcao, setOpcao] = useState(OPCOES_DE_RUBRICA[0].chave);
  const [valorRubrica, setValorRubrica] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) {
    setOcupado(true);
    try {
      const r = await fn();
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível salvar."); return false; }
      toast.success(sucesso);
      aoMudar();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  async function salvarValor() {
    const n = parseValorBR(valor);
    if (n === null || n <= 0) { toast.error("Digite um valor válido, maior que zero (ex.: 2.362,00)."); return; }
    await executar(() => salvarValorPrevisto(c.id, n), "Valor previsto salvo.");
  }

  async function incluirRubrica() {
    const n = parseValorBR(valorRubrica);
    if (n === null || n <= 0) { toast.error("Digite o valor da rubrica, maior que zero (ex.: 3.723,55)."); return; }
    const o = OPCOES_DE_RUBRICA.find((x) => x.chave === opcao)!;
    const ok = await executar(() => adicionarRubrica({ competenciaId: c.id, rubrica: o.rubrica, natureza: o.natureza, descricao: o.descricao, valor: n }), "Rubrica lançada.");
    if (ok) setValorRubrica("");
  }

  const motivo = motivoParaNaoFechar(c);

  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {c.modo === "avancado" ? "Apuração do RSP — editar" : "Valor previsto — editar"}
      </p>

      {c.modo === "simples" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvarValor(); }}
            className="h-8 w-36 text-xs" placeholder="2.362,00" aria-label="Valor previsto" disabled={ocupado} />
          <Button size="sm" className="h-8" onClick={salvarValor} disabled={ocupado}>Salvar valor</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {c.rubricas.length > 0 && (
            <ul className="divide-y rounded-md border" aria-label="Rubricas do RSP">
              {c.rubricas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
                  <span className="min-w-0 truncate">{r.natureza === "provento" ? "(+)" : "(−)"} {r.descricao}</span>
                  <span className="shrink-0 flex items-center gap-2">
                    <span className="tabular-nums">{brl(r.valor)}</span>
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={ocupado}
                      aria-label={`Remover ${r.descricao}`}
                      onClick={() => executar(() => removerRubrica(c.id, r.id), "Rubrica removida.")}>Remover</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className={CAMPO} value={opcao} onChange={(e) => setOpcao(e.target.value)} aria-label="Rubrica" disabled={ocupado}>
              {OPCOES_DE_RUBRICA.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
            </select>
            <Input value={valorRubrica} onChange={(e) => setValorRubrica(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") incluirRubrica(); }}
              className="h-8 w-32 text-xs" placeholder="17.451,84" aria-label="Valor da rubrica" disabled={ocupado} />
            <Button size="sm" variant="outline" className="h-8" onClick={incluirRubrica} disabled={ocupado}>Lançar</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Lance as linhas do RSP uma a uma. O líquido ({brl(c.liquidoPrevisto)}) é a soma dos proventos menos os descontos; os adiantamentos
            vêm dos pagamentos ligados e são abatidos no saldo.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        {c.status === "aberta" ? (
          <>
            <Button size="sm" className="h-8" disabled={ocupado || motivo !== null}
              onClick={() => executar(() => fecharCompetencia(c.id), "Competência fechada.")}>Fechar competência</Button>
            <span className="text-xs text-muted-foreground">{motivo ?? "Fecha quando a apuração estiver conferida: o saldo a pagar passa a contar."}</span>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-8" disabled={ocupado}
              onClick={() => executar(() => reabrirCompetencia(c.id), "Competência reaberta. Os pagamentos ligados continuam ligados.")}>Reabrir para corrigir</Button>
            <span className="text-xs text-muted-foreground">Fechada. Reabrir não apaga nada.</span>
          </>
        )}
      </div>
    </div>
  );
}
