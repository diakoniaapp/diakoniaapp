// ─── MissoesDrawer.tsx — o detalhe por trás do card de destaque ─────────
//
// Fase 12 (Workspace Financeiro), pedido dela (23/09/2026): "Ofertas para
// Missões é muito mais relevante pra uma igreja que 'contas a receber' —
// quero um card de destaque, e ao abrir 'Ver detalhes' um drawer com
// evolução por período, comparação por mês, maiores contribuintes (quando
// permitido), histórico e metas/campanhas vinculadas".
//
// MEDIDO antes de montar: não existe `fin_projetos` (nem qualquer outra
// tabela) vinculado a "missão"/campanha missionária — a seção de metas e
// campanhas fica marcada honestamente como "ainda não existe", não
// inventada. "Maiores contribuintes" reaproveita os MESMOS lançamentos já
// buscados (nenhuma consulta nova de fato) e só aparece pra quem já tem
// `ROLES_DOADORES` — o mesmo papel que já guarda "Doadores" no resto do
// Financeiro; identificar quem deu quanto é dado pastoral sensível, não
// unicamente financeiro.

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Globe2 } from "lucide-react";
import { listarLancamentosSemTeto, brl, type FinLancamentoExtenso } from "@/services/finService";
import { hojeLocal, daquiAMeses } from "@/lib/data";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoriaId: string | null;
  podeVerContribuintes: boolean;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function MissoesDrawer({ open, onOpenChange, categoriaId, podeVerContribuintes }: Props) {
  const [lancs, setLancs] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !categoriaId) return;
    setLoading(true);
    const hoje = hojeLocal();
    listarLancamentosSemTeto({
      tipo: "entrada", categoriaId,
      dataInicio: daquiAMeses(hoje.slice(0, 7) + "-01", -11),
      dataFim: hoje,
    }).then(setLancs).catch(() => setLancs([])).finally(() => setLoading(false));
  }, [open, categoriaId]);

  // Últimos 12 meses, mais antigo primeiro — mês sem lançamento continua
  // na lista com zero, pra "evolução" não esconder um mês parado.
  const hoje = hojeLocal();
  const meses = Array.from({ length: 12 }, (_, i) => daquiAMeses(hoje.slice(0, 7) + "-01", -(11 - i)).slice(0, 7));
  const porMes = meses.map(chave => {
    const doMes = lancs.filter(l => l.data.slice(0, 7) === chave);
    return {
      chave,
      rotulo: `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`,
      total: doMes.reduce((s, l) => s + Number(l.valor), 0),
      qtd: doMes.length,
    };
  });
  const maiorMes = Math.max(1, ...porMes.map(m => m.total));

  const contribuintes = (() => {
    const mapa = new Map<string, { nome: string; total: number; qtd: number }>();
    for (const l of lancs) {
      const chave = l.pessoa_id ?? `_avulso_${l.id}`;
      const nome = l.pessoa_nome ?? l.descricao ?? "Contribuição avulsa";
      const atual = mapa.get(chave) ?? { nome, total: 0, qtd: 0 };
      atual.total += Number(l.valor);
      atual.qtd += 1;
      mapa.set(chave, atual);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-gold" /> Ofertas para Missões — detalhe
          </SheetTitle>
          <SheetDescription className="text-xs">
            Últimos 12 meses, mesma categoria do plano de contas.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : (
            <>
              {/* ── Evolução mensal / histórico ─────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Evolução mensal</h3>
                <div className="space-y-1.5">
                  {porMes.map(m => (
                    <div key={m.chave} className="flex items-center gap-2 text-xs">
                      <span className="w-9 shrink-0 text-muted-foreground uppercase">{m.rotulo}</span>
                      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-violeta" style={{ width: `${(m.total / maiorMes) * 100}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right tabular-nums font-medium">{brl(m.total)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Comparação por mês (mesmo dado da evolução, em tabela) ── */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Comparação por mês</h3>
                <ul className="divide-y rounded-md border">
                  {[...porMes].reverse().map(m => (
                    <li key={m.chave} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="capitalize">{m.rotulo}</span>
                      <span className="text-muted-foreground">{m.qtd} {m.qtd === 1 ? "contribuição" : "contribuições"}</span>
                      <span className="font-medium tabular-nums">{brl(m.total)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* ── Maiores contribuintes ───────────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Maiores contribuintes</h3>
                {!podeVerContribuintes ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-3">
                    Seu papel não inclui ver contribuição por pessoa — mesma regra de "Doadores" no resto do Financeiro.
                  </p>
                ) : contribuintes.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-3">Nenhuma contribuição nos últimos 12 meses.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {contribuintes.map((c, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="truncate min-w-0">{c.nome}</span>
                        <span className="text-muted-foreground shrink-0 mx-2">{c.qtd}x</span>
                        <span className="font-medium tabular-nums shrink-0">{brl(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ── Metas e campanhas — honesto sobre o que não existe ──── */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Metas e campanhas missionárias</h3>
                <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3">
                  Ainda não existe no sistema — nenhuma meta ou campanha missionária está cadastrada no Financeiro hoje.
                </p>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
