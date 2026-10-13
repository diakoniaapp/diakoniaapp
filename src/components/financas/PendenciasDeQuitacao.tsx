// ─── PendenciasDeQuitacao — as filas da Quitação: Investigar · A esclarecer · Formalizar · Aprovar reembolso · Reembolso a pagar ─────────────────────
//
// Fase 1A da Política de Compras por Terceiros. Cada fila é UMA PERGUNTA (Quem pagou? Qual era a intenção? Falta o documento assinado? Aprova o reembolso? Quando a igreja paga?).
// Só aparece depois da migration e quando há algo na fila. A Política só BLOQUEIA o fechamento e o malote depois da vigência (parâmetro); até lá, estas filas só informam.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { mensagemErro } from "@/lib/erroRede";
import { ROTULO_FILA, ROTULO_INTENCAO, ROTULO_RESPONSAVEL, type Fila } from "@/lib/quitacao";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import { brl, type FinLancamentoExtenso } from "@/services/finService";
import { carregarParametros, listarFilasDeQuitacao, sincronizarQuitacoes, type ItemDeFila } from "@/services/quitacaoService";

const PERGUNTA: Record<Fila, string> = {
  investigar: "Quem pagou?", a_esclarecer: "Qual era a intenção de quem pagou?", formalizar: "Falta o documento assinado (ou a aprovação do Administrador)?",
  aprovar_reembolso: "A igreja aceita este reembolso?", reembolso_a_pagar: "Quando a igreja paga o reembolso?",
};
const ORDEM: Fila[] = ["a_esclarecer", "formalizar", "aprovar_reembolso", "reembolso_a_pagar", "investigar"];
const BLOQUEIA: Fila[] = ["a_esclarecer", "formalizar"];

export function PendenciasDeQuitacao({ hoje, chave }: { hoje: string; chave: number }) {
  const [itens, setItens] = useState<ItemDeFila[] | null>(null);
  const [vigencia, setVigencia] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Fila | null>(null);
  const [detalhe, setDetalhe] = useState<FinLancamentoExtenso | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    // a formalização vencida é um fato do tempo: ao abrir, o banco realinha o status das ofertas com o que a Matriz manda (idempotente)
    sincronizarQuitacoes().catch(() => 0)
      .then(() => Promise.all([listarFilasDeQuitacao(hoje), carregarParametros()]))
      .then(([l, p]) => { if (vivo) { setItens(l); setVigencia(p.vigencia); } }).catch(() => { if (vivo) setItens([]); });
    return () => { vivo = false; };
  }, [hoje, chave, recarga]);

  const abrir = useCallback(async (it: ItemDeFila) => {
    try { const l = await buscarLancamentoParaEditar(it.obrigacaoId); if (l) setDetalhe(l); else toast.error("Não encontrei a despesa."); }
    catch (e) { toast.error(mensagemErro(e)); }
  }, []);

  if (itens === null) return null;
  if (itens.length === 0) return null;
  const por = (f: Fila) => itens.filter(i => i.fila === f);

  return (
    <section aria-label="Quitações a resolver" className="rounded-lg border bg-card lg:col-span-2">
      <header className="px-4 pt-3 pb-2">
        <h2 className="text-sm font-bold">Quitações a resolver</h2>
        <p className="text-xs text-muted-foreground">
          Contas em que um terceiro pagou ou ninguém sabe quem pagou. A igreja <b>não</b> paga estas ao fornecedor.{" "}
          {vigencia ? <>Valem como bloqueio do fechamento a partir de {vigencia.split("-").reverse().join("/")}.</> : <>A Política ainda está desligada: estas filas só informam, não bloqueiam o fechamento nem o malote.</>}
        </p>
      </header>
      <ul className="divide-y border-t">
        {ORDEM.map(f => {
          const lista = por(f);
          if (lista.length === 0) return null;
          const aberto = aberta === f;
          return (
            <li key={f}>
              <button type="button" onClick={() => setAberta(aberto ? null : f)} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/40">
                {aberto ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">{ROTULO_FILA[f]} · {lista.length}</span>
                  <span className="block text-xs text-muted-foreground">{PERGUNTA[f]}{BLOQUEIA.includes(f) ? " — bloqueia o fechamento depois da vigência" : ""}</span>
                </span>
                <span className="text-xs tabular-nums font-semibold shrink-0">{brl(lista.reduce((s, i) => s + i.valorDaObrigacao, 0))}</span>
              </button>
              {aberto && (
                <ul className="border-t bg-muted/20">
                  {lista.map(i => (
                    <li key={i.quitacaoId}>
                      <button type="button" onClick={() => void abrir(i)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{i.emitente ?? i.descricao ?? "Despesa"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {i.responsavelNome ? `${i.responsavelNome} · ` : ""}{ROTULO_RESPONSAVEL[i.responsavel]}{i.responsavel !== "nao_localizado" ? ` · ${ROTULO_INTENCAO[i.intencao]}` : ""} · {i.idadeEmDias} dia{i.idadeEmDias === 1 ? "" : "s"} da nota
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{brl(i.valorDaObrigacao)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <DetalhesDoLancamento lancamento={detalhe} onFechar={() => { setDetalhe(null); setRecarga(n => n + 1); }} />
    </section>
  );
}
