// ─── AuditoriaExtrato.tsx — por que o saldo do sistema não bate com o do banco (SÓ LEITURA) ──────────────────────────────────
//
// Pedido dela (08/10/2026): "explique matematicamente cada diferença entre saldo bancário e saldo do sistema", sem presumir que toda
// divergência é erro de importação. Recebe o OFX e, de preferência, o PDF do extrato consolidado do Bradesco — que traz o que o OFX NÃO
// traz (aplicação e resgate do Invest Fácil) — e mostra: o saldo dos dois lados em cada fim de mês, a diferença decomposta por causa
// (a soma dos componentes tem de dar a diferença: o "resíduo" tem de ser R$ 0,00), o dia em que o saldo deixa de bater e as linhas
// responsáveis. Nada é gravado nem corrigido aqui.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCopy, FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listarContas, brl } from "@/services/finService";
import { executarAuditoria, type ResultadoDaAuditoria } from "@/services/auditoriaExtratoService";
import { causaDoBanco, causaDoSistema, porDia, primeiroDiaQueDiverge, ROTULO_CAUSA_BANCO, ROTULO_CAUSA_SISTEMA, type Decomposicao } from "@/lib/auditoriaExtrato";

const dataBr = (d: string) => d.split("-").reverse().join("/");
const CAMPO = "h-8 rounded-md border bg-background px-2 text-xs min-w-0";

export default function AuditoriaExtrato() {
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([]);
  const [contaId, setContaId] = useState("");
  const [aplicacaoId, setAplicacaoId] = useState("");
  const [ofx, setOfx] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaAuditoria | null>(null);
  const [corteEscolhido, setCorteEscolhido] = useState<string | null>(null);

  useEffect(() => {
    listarContas(true).then((cs) => {
      const lista = cs.map((c) => ({ id: c.id, nome: c.nome }));
      setContas(lista);
      setContaId(lista.find((c) => /^bradesco$/i.test(c.nome))?.id ?? lista[0]?.id ?? "");
      setAplicacaoId(lista.find((c) => /aplica/i.test(c.nome))?.id ?? "");
    }).catch((e) => toast.error(e?.message ?? "Não foi possível listar as contas."));
  }, []);

  async function auditar() {
    if (!ofx || !contaId) { toast.error("Escolha a conta e o arquivo OFX."); return; }
    setRodando(true); setResultado(null);
    try {
      const r = await executarAuditoria({
        contaId, contaNome: contas.find((c) => c.id === contaId)?.nome ?? "", contaAplicacaoId: aplicacaoId || null, arquivoOfx: ofx, arquivoPdf: pdf,
      });
      setResultado(r); setCorteEscolhido(r.cortes[r.cortes.length - 1]);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível auditar.");
    } finally {
      setRodando(false);
    }
  }

  async function copiar() {
    if (!resultado) return;
    try { await navigator.clipboard.writeText(resultado.markdown); toast.success("Relatório copiado."); }
    catch { toast.error("O navegador não deixou copiar. Use \"Baixar\"."); }
  }
  function baixar() {
    if (!resultado) return;
    const url = URL.createObjectURL(new Blob([resultado.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `auditoria-extrato-${resultado.conta}-${resultado.de}-${resultado.ate}.md`.replace(/\s+/g, "-");
    a.click(); URL.revokeObjectURL(url);
  }

  const dec: Decomposicao | undefined = resultado?.decomposicoes.find((d) => d.corte === corteEscolhido);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0 -ml-2">
          <Link to="/painel-tesouraria" aria-label="Voltar à Tesouraria"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2"><FileSearch className="w-5 h-5 text-gold shrink-0" /> Auditoria do extrato</h1>
          <p className="text-xs text-muted-foreground">Compara o extrato do banco com o que o sistema tem e explica cada centavo da diferença. Só leitura: não grava nem corrige nada.</p>
        </div>
      </div>

      <Card>
        <CardContent className="py-3 px-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs space-y-1 min-w-0">
              <span className="block text-muted-foreground">Conta corrente</span>
              <select className={`${CAMPO} w-full`} value={contaId} onChange={(e) => setContaId(e.target.value)} aria-label="Conta corrente">
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1 min-w-0">
              <span className="block text-muted-foreground">Conta da aplicação (Invest Fácil)</span>
              <select className={`${CAMPO} w-full`} value={aplicacaoId} onChange={(e) => setAplicacaoId(e.target.value)} aria-label="Conta da aplicação">
                <option value="">— não comparar —</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1 min-w-0">
              <span className="block text-muted-foreground">Extrato OFX (obrigatório)</span>
              <input type="file" accept=".ofx,.OFX" className="block w-full text-xs" aria-label="Arquivo OFX" onChange={(e) => setOfx(e.target.files?.[0] ?? null)} />
            </label>
            <label className="text-xs space-y-1 min-w-0">
              <span className="block text-muted-foreground">Extrato consolidado em PDF (traz aplicação e resgate)</span>
              <input type="file" accept=".pdf,application/pdf" className="block w-full text-xs" aria-label="Arquivo PDF" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button size="sm" onClick={auditar} disabled={rodando || !ofx || !contaId} className="gap-1.5">
            {rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />} {rodando ? "Auditando…" : "Auditar"}
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <>
          {resultado.avisos.length > 0 && (
            <div className="rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 text-xs text-warning-text space-y-1" role="status">
              {resultado.avisos.map((a, i) => <p key={i}>⚠ {a}</p>)}
            </div>
          )}

          <Card>
            <CardContent className="py-3 px-4 space-y-3">
              <p className="text-sm font-medium">{resultado.conta} · {dataBr(resultado.de)} a {dataBr(resultado.ate)}</p>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Data de corte">
                {resultado.cortes.map((c) => (
                  <button key={c} type="button" role="tab" aria-selected={c === corteEscolhido} onClick={() => setCorteEscolhido(c)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${c === corteEscolhido ? "border-gold bg-gold/10" : "hover:bg-muted/40"}`}>{dataBr(c)}</button>
                ))}
              </div>
              {dec && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border px-3 py-2 min-w-0"><p className="text-xs text-muted-foreground">Banco</p><p className="font-semibold tabular-nums">{brl(dec.saldoBanco)}</p></div>
                    <div className="rounded-md border px-3 py-2 min-w-0"><p className="text-xs text-muted-foreground">Sistema</p><p className="font-semibold tabular-nums">{brl(dec.saldoSistema)}</p></div>
                    <div className="rounded-md border px-3 py-2 min-w-0"><p className="text-xs text-muted-foreground">Diferença</p>
                      <p className={`font-semibold tabular-nums ${Math.abs(dec.diferenca) < 0.005 ? "text-success-text" : "text-warning-text"}`}>{brl(dec.diferenca)}</p></div>
                  </div>
                  {Math.abs(dec.diferenca) < 0.005 ? <p className="text-sm text-success-text">O saldo bate nesta data.</p> : (
                    <ul className="divide-y rounded-md border" aria-label="Componentes da diferença">
                      {dec.componentes.map((c) => (
                        <li key={c.chave} className="px-3 py-2 space-y-0.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm min-w-0">{c.rotulo}{c.n > 0 && <span className="text-xs text-muted-foreground"> · {c.n} lançamento{c.n !== 1 ? "s" : ""}</span>}</span>
                            <span className="shrink-0 tabular-nums text-sm font-medium">{brl(c.valor)}</span>
                          </div>
                          {c.oQueFazer && <p className="text-xs text-muted-foreground">{c.oQueFazer}</p>}
                        </li>
                      ))}
                      <li className="px-3 py-2 flex items-baseline justify-between gap-3 bg-muted/20">
                        <span className="text-xs text-muted-foreground">Resíduo (diferença − soma dos componentes; tem de ser zero)</span>
                        <span className={`tabular-nums text-sm font-semibold ${Math.abs(dec.residuo) < 0.005 ? "text-success-text" : "text-destructive-text"}`}>{brl(dec.residuo)}</span>
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <DiaADia r={resultado} />
          {resultado.aplicacao && <Aplicacao r={resultado} />}
          <Linhas r={resultado} />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copiar}><ClipboardCopy className="w-3.5 h-3.5" /> Copiar relatório</Button>
            <Button size="sm" variant="outline" onClick={baixar}>Baixar (.md)</Button>
          </div>
        </>
      )}
    </div>
  );
}

function DiaADia({ r }: { r: ResultadoDaAuditoria }) {
  const primeiro = primeiroDiaQueDiverge(r.auditoria);
  const dias = porDia(r.auditoria).filter((d) => Math.abs(d.diferenca) > 0.004);
  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2">
        <p className="text-sm font-medium">Onde o saldo deixa de bater</p>
        <p className="text-xs text-muted-foreground">{primeiro ? `A diferença aparece pela primeira vez em ${dataBr(primeiro)}.` : "O saldo bate em todos os dias do período."}</p>
        {dias.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-normal">Dia</th><th className="pr-3 text-right font-normal">Banco</th><th className="pr-3 text-right font-normal">Sistema</th><th className="pr-3 text-right font-normal">Dif. do dia</th><th className="text-right font-normal">Acumulada</th></tr></thead>
              <tbody>{dias.map((d) => (
                <tr key={d.data} className="border-t"><td className="py-1 pr-3">{dataBr(d.data)}</td><td className="pr-3 text-right">{brl(d.banco)}</td><td className="pr-3 text-right">{brl(d.sistema)}</td><td className="pr-3 text-right">{brl(d.diferenca)}</td><td className="text-right">{brl(d.acumulada)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Aplicacao({ r }: { r: ResultadoDaAuditoria }) {
  if (!r.aplicacao) return null;
  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2">
        <p className="text-sm font-medium">Invest Fácil: saldo do banco × conta de aplicação do sistema</p>
        <p className="text-xs text-muted-foreground">Cada aplicação e resgate tem de existir nas DUAS contas (como transferência). Quando só a corrente tem a perna, a aplicação fica diferente do banco.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-normal">Dia</th><th className="pr-3 text-right font-normal">Banco</th><th className="pr-3 text-right font-normal">Sistema</th><th className="text-right font-normal">Diferença</th></tr></thead>
            <tbody>{r.aplicacao.map((d) => (
              <tr key={d.data} className="border-t"><td className="py-1 pr-3">{dataBr(d.data)}</td><td className="pr-3 text-right">{brl(d.banco)}</td><td className="pr-3 text-right">{brl(d.sistema)}</td>
                <td className={`text-right ${Math.abs(d.diferenca) < 0.005 ? "" : "text-warning-text"}`}>{brl(d.diferenca)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Linhas({ r }: { r: ResultadoDaAuditoria }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const grupos = new Map<string, { rotulo: string; itens: { data: string; valor: number; texto: string }[] }>();
  for (const b of r.auditoria.soBanco) {
    const k = `B:${causaDoBanco(b)}`;
    (grupos.get(k) ?? grupos.set(k, { rotulo: `No banco, sem lançamento no sistema — ${ROTULO_CAUSA_BANCO[causaDoBanco(b)].rotulo}`, itens: [] }).get(k)!).itens.push({ data: b.data, valor: b.valor, texto: b.historico.slice(0, 80) });
  }
  for (const s of r.auditoria.soSistema) {
    const causa = causaDoSistema(s, new Set(r.auditoria.duplicatas));
    const k = `S:${causa}`;
    (grupos.get(k) ?? grupos.set(k, { rotulo: `No sistema, sem linha igual no banco — ${ROTULO_CAUSA_SISTEMA[causa].rotulo}`, itens: [] }).get(k)!).itens.push({ data: s.data, valor: s.valor, texto: `${s.origem} · ${s.descricao.slice(0, 60)}` });
  }
  if (grupos.size === 0) return null;
  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2">
        <p className="text-sm font-medium">As linhas responsáveis</p>
        <ul className="space-y-1.5">
          {[...grupos].map(([k, g]) => {
            const total = Math.round(g.itens.reduce((t, i) => t + i.valor, 0) * 100) / 100;
            return (
              <li key={k} className="rounded-md border">
                <button type="button" className="w-full flex items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30" aria-expanded={aberto === k} onClick={() => setAberto(aberto === k ? null : k)}>
                  <span className="text-xs min-w-0">{g.rotulo} <span className="text-muted-foreground">· {g.itens.length}</span></span>
                  <span className="shrink-0 tabular-nums text-xs font-medium">{brl(total)}</span>
                </button>
                {aberto === k && (
                  <ul className="divide-y border-t text-xs">
                    {g.itens.map((i, n) => (
                      <li key={n} className="flex items-baseline justify-between gap-3 px-3 py-1"><span className="min-w-0 truncate">{dataBr(i.data)} · {i.texto}</span><span className="shrink-0 tabular-nums">{brl(i.valor)}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
