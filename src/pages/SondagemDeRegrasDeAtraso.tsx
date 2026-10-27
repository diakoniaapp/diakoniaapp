// ─── SondagemDeRegrasDeAtraso — fase 0 das regras de atraso: quantos documentos JÁ anexados trazem multa e juros legíveis? (admin; SÓ LÊ, não grava nada) ─────────────────────
// Pedido dela (27/10/2026): "posso começar pela sondagem? SIM". A tela baixa os PDFs mais recentes, lê o texto e conta. Não mostra o texto dos documentos — só contagens, os favorecidos e os trechos das regras.
// Rota: /admin/sondagem-regras-de-atraso (fora do menu; é uma ferramenta de medição, não um recurso do dia a dia).
import { useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resumirSondagem, type ResultadoDaSondagem } from "@/lib/sondagemDeRegras";
import { listarAnexosParaSondar, sondarAnexo } from "@/services/sondagemDeRegrasService";

const OPCOES = [50, 150, 300, 600];
const SIMULTANEOS = 3;
const pct = (n: number | null) => (n === null ? "—" : `${n.toString().replace(".", ",")}%`);

export default function SondagemDeRegrasDeAtraso() {
  const [limite, setLimite] = useState(150);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoDaSondagem[]>([]);
  const parar = useRef(false);

  async function rodar() {
    parar.current = false; setRodando(true); setResultados([]); setProgresso(null);
    try {
      const anexos = await listarAnexosParaSondar(limite);
      if (anexos.length === 0) { toast.info("Nenhum anexo em PDF encontrado."); return; }
      setProgresso({ feitos: 0, total: anexos.length });
      const acumulado: ResultadoDaSondagem[] = [];
      let proximo = 0;
      const trabalhador = async () => {
        while (!parar.current) {
          const i = proximo++;
          if (i >= anexos.length) return;
          acumulado.push(await sondarAnexo(anexos[i]));
          if (acumulado.length % 5 === 0 || acumulado.length === anexos.length) { setResultados([...acumulado]); setProgresso({ feitos: acumulado.length, total: anexos.length }); }
        }
      };
      await Promise.all(Array.from({ length: SIMULTANEOS }, trabalhador));
      setResultados([...acumulado]); setProgresso({ feitos: acumulado.length, total: anexos.length });
      toast.success(parar.current ? "Sondagem interrompida" : "Sondagem concluída");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível rodar a sondagem"); }
    finally { setRodando(false); }
  }

  const r = resumirSondagem(resultados);
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="font-serif text-xl font-semibold">Sondagem das regras de atraso</h1>
        <p className="text-xs text-muted-foreground">Mede quantos documentos já anexados trazem multa e juros legíveis, antes de construir a funcionalidade. Só leitura: nada é gravado.</p>
      </div>

      <Card><CardContent className="pt-4 flex flex-wrap items-center gap-2">
        <label className="text-xs">Quantos anexos (PDF, os mais recentes)
          <select className="ml-2 h-8 rounded-md border bg-background px-2 text-sm" value={limite} onChange={e => setLimite(Number(e.target.value))} disabled={rodando}>
            {OPCOES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {!rodando
          ? <Button size="sm" onClick={() => void rodar()} className="gap-1.5"><Play className="h-3.5 w-3.5" /> Rodar a sondagem</Button>
          : <Button size="sm" variant="outline" onClick={() => { parar.current = true; }} className="gap-1.5"><Square className="h-3.5 w-3.5" /> Parar</Button>}
        {rodando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {progresso && <span className="text-xs text-muted-foreground tabular-nums">{progresso.feitos} de {progresso.total}</span>}
      </CardContent></Card>

      {r.total > 0 && (
        <>
          <Card><CardContent className="pt-4 space-y-2">
            <p className="text-sm font-semibold">{r.total} anexos lidos · {r.lidos} com texto · {r.porSituacao.sem_texto} escaneados sem texto ({pct(r.semTextoPct)}) · {r.porSituacao.erro} com erro</p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                ["Multa e juros legíveis", r.porSituacao.com_regra, pct(r.pctComRegraCompleta)],
                ["Só multa", r.porSituacao.so_multa, null],
                ["Só juros", r.porSituacao.so_juros, null],
                ["Nenhuma regra no texto", r.porSituacao.sem_regra, null],
              ].map(([rotulo, n, p]) => (
                <div key={String(rotulo)} className="rounded-md bg-muted/40 p-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{n}{p ? <span className="text-xs font-normal text-muted-foreground"> · {p}</span> : null}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Com <b>alguma</b> regra: {pct(r.pctComAlgumaRegra)} dos lidos · "não receber após": {r.naoReceberApos} · com desconto: {r.comDesconto} · citam índice de correção: {r.comCorrecao}.
            </p>
          </CardContent></Card>

          <Card><CardContent className="pt-4">
            <p className="text-sm font-semibold mb-2">Por favorecido (os mais frequentes)</p>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground border-b"><th className="py-1 font-medium">Favorecido</th><th className="py-1 font-medium text-right">Anexos</th><th className="py-1 font-medium text-right">Com regra</th><th className="py-1 font-medium text-right">%</th></tr></thead>
              <tbody>{r.porFavorecido.map(f => (
                <tr key={f.favorecido} className="border-b border-border/40"><td className="py-1 pr-2 truncate max-w-[18rem]">{f.favorecido}</td><td className="py-1 text-right tabular-nums">{f.anexos}</td><td className="py-1 text-right tabular-nums">{f.comRegra}</td><td className="py-1 text-right tabular-nums">{pct(f.pct)}</td></tr>
              ))}</tbody>
            </table>
          </CardContent></Card>

          {r.exemplos.length > 0 && (
            <Card><CardContent className="pt-4">
              <p className="text-sm font-semibold mb-1">Como as regras aparecem nos documentos (exemplos)</p>
              <ul className="list-disc pl-5 text-xs space-y-0.5">{r.exemplos.map(t => <li key={t}>{t}</li>)}</ul>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
