// ─── PagamentosAClassificar.tsx — Conta Corrente de Sustento, Fase 2: ligar pagamentos às competências ──────────
//
// Mostra os pagamentos reais do beneficiário (saídas realizadas/conciliadas dos últimos 6 meses, achadas pela pessoa/favorecido do
// cadastro) que ainda não pertencem a nenhuma competência — e uma busca manual para o PIX que a Mesa não soube atribuir à pessoa.
// Para cada um a tela SUGERE a competência (a mais antiga com saldo a pagar; senão a do mês até o dia 20; senão a seguinte) e o tipo
// (adiantamento antes do RSP fechar, pagamento final depois; "pagamento" no modo simples). Quem confirma é a pessoa.
//
// Só escreve em sustento_pagamentos (e, se a competência sugerida ainda não existe, abre a competência vazia). Não toca em
// fin_lancamentos: ligar um pagamento a uma competência não mexe em saldo, status nem conciliação.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/services/finService";
import {
  abrirCompetencia, buscarPagamentosSoltos, ligarPagamento, pagamentosSoltosDoBeneficiario,
  type BeneficiarioComCompetencias, type PagamentoSolto,
} from "@/services/sustentoService";
import {
  ROTULO_MODO, ROTULO_PAGAMENTO, competenciaExiste, mesAnterior, modoVigente, podeReceberPagamento, rotuloCompetencia, situacaoDaCompetencia,
  sugerirCompetencia, tipoSugerido, tiposPermitidos, type ModoSustento, type TipoDoPagamento,
} from "@/lib/sustento";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const NOVO = "novo:";
const ESCOLHA = "";   // "— escolha a competência —": a sugerida já está paga e a pessoa precisa dizer a que mês o pagamento se refere
const CAMPO = "h-8 rounded-md border bg-background px-2 text-xs min-w-0";

interface Escolha { destino: string; tipo: TipoDoPagamento }

export function PagamentosAClassificar({ b, aoMudar }: { b: BeneficiarioComCompetencias; aoMudar: () => void }) {
  const [soltos, setSoltos] = useState<PagamentoSolto[] | null>(null);
  const [achados, setAchados] = useState<PagamentoSolto[]>([]);
  const [termo, setTermo] = useState("");
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const vigente = useMemo(() => modoVigente(b.tipoControle, b.tipo, b.competencias), [b]);

  const carregar = useCallback(async () => {
    try {
      setSoltos(await pagamentosSoltosDoBeneficiario(b));
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ler os pagamentos do beneficiário.");
      setSoltos([]);
    }
  }, [b.id, b.pessoaId, b.fornecedorId]);
  useEffect(() => { setSoltos(null); setAchados([]); setTermo(""); setEscolhas({}); carregar(); }, [b.id]);

  async function buscar() {
    try {
      setAchados(await buscarPagamentosSoltos(termo));
      if (termo.trim().length < 2) toast.info("Digite ao menos 2 letras, ou um valor.");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível buscar.");
    }
  }

  // a lista: os do cadastro + os achados na busca (sem repetir)
  const lista = useMemo(() => {
    const vistos = new Set((soltos ?? []).map((p) => p.id));
    return [...(soltos ?? []), ...achados.filter((p) => !vistos.has(p.id))];
  }, [soltos, achados]);

  function padrao(p: PagamentoSolto): Escolha {
    const s = sugerirCompetencia(p.data, b.competencias);
    const existente = b.competencias.find((c) => c.competencia === s.competencia);
    if (existente && podeReceberPagamento(existente)) return { destino: existente.id, tipo: tipoSugerido(existente) };
    if (!existente) return { destino: NOVO + s.competencia, tipo: tipoSugerido({ modo: vigente.modo, status: "aberta" }) };
    // a sugerida existe mas já está paga (pagamento antigo, de um mês fechado): não decidir por ela — quem sabe a que mês ele se refere é a pessoa
    return { destino: ESCOLHA, tipo: tipoSugerido({ modo: vigente.modo, status: "aberta" }) };
  }
  const escolha = (p: PagamentoSolto): Escolha => escolhas[p.id] ?? padrao(p);

  function modoDoDestino(destino: string): ModoSustento {
    if (destino === ESCOLHA || destino.startsWith(NOVO)) return vigente.modo;
    return b.competencias.find((c) => c.id === destino)?.modo ?? vigente.modo;
  }
  function statusDoDestino(destino: string): "aberta" | "fechada" | "paga" {
    return destino === ESCOLHA || destino.startsWith(NOVO) ? "aberta" : b.competencias.find((c) => c.id === destino)?.status ?? "aberta";
  }

  function trocarDestino(p: PagamentoSolto, destino: string) {
    setEscolhas((e) => ({ ...e, [p.id]: { destino, tipo: tipoSugerido({ modo: modoDoDestino(destino), status: statusDoDestino(destino) }) } }));
  }

  async function ligar(p: PagamentoSolto) {
    const { destino, tipo } = escolha(p);
    if (destino === ESCOLHA) { toast.info("Escolha a competência a que este pagamento se refere."); return; }
    setOcupado(p.id);
    try {
      let competenciaId = destino;
      if (destino.startsWith(NOVO)) {
        const a = await abrirCompetencia({ beneficiarioId: b.id, competencia: destino.slice(NOVO.length), modo: vigente.modo });
        if (!a.ok) { toast.error(a.erro ?? "Não foi possível abrir a competência."); return; }
        competenciaId = a.id!;
      }
      const r = await ligarPagamento({ competenciaId, lancamentoId: p.id, tipo });
      if (!r.ok) { toast.error(r.erro ?? "Não foi possível ligar o pagamento."); return; }
      toast.success("Pagamento ligado à competência.");
      setAchados((a) => a.filter((x) => x.id !== p.id));
      await carregar();
      aoMudar();
    } finally {
      setOcupado(null);
    }
  }

  if (soltos === null) return null;

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Pagamentos a classificar</p>
          <p className="text-xs text-muted-foreground">
            Saídas já realizadas de {b.nomeExibicao.split(" — ")[0]} que ainda não pertencem a nenhuma competência. Ligar não altera saldo nem lançamento — só diz a que mês o pagamento se refere.
          </p>
        </div>

        {lista.length === 0 && <p className="text-xs text-muted-foreground">Nenhum pagamento pendente de classificação. Se um PIX não aparece aqui, procure abaixo.</p>}

        <ul className="space-y-2" aria-label="Pagamentos a classificar">
          {lista.map((p) => {
            const e = escolha(p);
            const s = sugerirCompetencia(p.data, b.competencias);
            const modoDestino = modoDoDestino(e.destino);
            return (
              <li key={p.id} className="rounded-md border p-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">{dataBr(p.data)} · {p.descricao ?? "(sem descrição)"}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(p.valor)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.destino === ESCOLHA
                    ? `${rotuloCompetencia(s.competencia)} já está paga: escolha a competência a que este pagamento se refere (o líquido de um mês costuma sair no início do seguinte).`
                    : s.explicacao}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={CAMPO} value={e.destino} onChange={(ev) => trocarDestino(p, ev.target.value)} aria-label="Competência" disabled={ocupado === p.id}>
                    {e.destino === ESCOLHA && <option value={ESCOLHA}>— escolha a competência —</option>}
                    {b.competencias.filter((c) => podeReceberPagamento(c)).map((c) => (
                      <option key={c.id} value={c.id}>{rotuloCompetencia(c.competencia)} · {ROTULO_MODO[c.modo]} · {situacaoDaCompetencia(c)}</option>
                    ))}
                    {!competenciaExiste(s.competencia, b.competencias) && (
                      <option value={NOVO + s.competencia}>Abrir {rotuloCompetencia(s.competencia)} ({ROTULO_MODO[vigente.modo]})</option>
                    )}
                    {!competenciaExiste(mesAnterior(p.data), b.competencias) && mesAnterior(p.data) !== s.competencia && (
                      <option value={NOVO + mesAnterior(p.data)}>Abrir {rotuloCompetencia(mesAnterior(p.data))} ({ROTULO_MODO[vigente.modo]})</option>
                    )}
                  </select>
                  <select className={CAMPO} value={e.tipo} aria-label="Tipo do pagamento" disabled={ocupado === p.id}
                    onChange={(ev) => setEscolhas((m) => ({ ...m, [p.id]: { ...e, tipo: ev.target.value as TipoDoPagamento } }))}>
                    {tiposPermitidos(modoDestino).map((t) => <option key={t} value={t}>{ROTULO_PAGAMENTO[t]}</option>)}
                  </select>
                  <Button size="sm" className="h-8" onClick={() => ligar(p)} disabled={ocupado === p.id || e.destino === ESCOLHA}>
                    {ocupado === p.id ? "Ligando…" : "Ligar"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }}
              className="h-8 text-xs pl-6" placeholder="Procurar outro pagamento: nome no extrato ou valor (ex.: 4000)" aria-label="Procurar outro pagamento" />
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={buscar}>Procurar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
