import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/Brand";
import {
  carregarCampanha, resumoCampanha, listarEntradas, carregarClasse,
  type CampanhaEbd, type ResumoCampanha, type EntradaEbd, type EbdClasse,
} from "@/services/ebdService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Modo = "resumido" | "completo" | "pastoral";

const TIPO_LABEL: Record<string, string> = { oferta: "Oferta", evento: "Evento", produto: "Produto" };
const FORMA_LABEL: Record<string, string> = { pix: "PIX", envelope: "Envelope", outro: "Outro" };
const STATUS_LABEL: Record<string, string> = {
  meta_atingida: "Meta atingida",
  acima_esperado: "Acima do esperado",
  no_ritmo: "No ritmo",
  abaixo_esperado: "Abaixo do esperado",
  muito_abaixo: "Muito abaixo do esperado",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR");
}

export default function EbdCampanhaRelatorio() {
  const { classeId = "", campanhaId = "" } = useParams();
  const { user } = useAuth();
  const [campanha, setCampanha] = useState<CampanhaEbd | null>(null);
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [resumo, setResumo] = useState<ResumoCampanha | null>(null);
  const [entradas, setEntradas] = useState<EntradaEbd[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>("completo");
  const [mostrarDescricao, setMostrarDescricao] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, cl, r, es] = await Promise.all([
          carregarCampanha(campanhaId),
          carregarClasse(classeId),
          resumoCampanha(campanhaId),
          listarEntradas(campanhaId),
        ]);
        setCampanha(c); setClasse(cl); setResumo(r); setEntradas(es);

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [classeId, campanhaId, user]);

  const totaisPorTipo = useMemo(() => {
    const map = new Map<string, number>();
    entradas.forEach(e => map.set(e.tipo, (map.get(e.tipo) ?? 0) + e.valor));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entradas]);

  const totaisPorForma = useMemo(() => {
    const map = new Map<string, number>();
    entradas.forEach(e => map.set(e.forma, (map.get(e.forma) ?? 0) + e.valor));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [entradas]);

  const totalEntradas = entradas.reduce((s, e) => s + e.valor, 0);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const horaHoje = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando relatório...
    </div>;
  }

  if (!campanha) {
    return <div className="p-8 text-center text-muted-foreground">
      Campanha não encontrada. <Link to={`/ebd/${classeId}/campanhas`} className="text-primary underline">Voltar</Link>
    </div>;
  }

  const mostraDetalhes = modo === "completo";
  const tituloModo = modo === "pastoral" ? "Relatório Pastoral"
    : modo === "resumido" ? "Prestação de Contas"
    : "Relatório de Campanha — Detalhado";

  return (
    <div className="bg-background min-h-screen">
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 1.2cm 1.5cm; }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          .relatorio-page { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: 100% !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* ── Barra de controles (não imprime) ───────────────────── */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Link to={`/ebd/${classeId}/campanhas/${campanhaId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Button>
          </Link>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-muted-foreground mr-1">Modo:</span>
            {(["resumido", "completo", "pastoral"] as Modo[]).map(m => (
              <Button
                key={m}
                size="sm"
                variant={modo === m ? "default" : "outline"}
                onClick={() => setModo(m)}
                className="capitalize text-xs"
              >
                {m}
              </Button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={mostrarDescricao}
              onChange={(e) => setMostrarDescricao(e.target.checked)}
            />
            Mostrar descrição
          </label>

          <Button onClick={() => window.print()} size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      {/* ── Página do relatório ───────────────────────────────── */}
      <div className="relatorio-page max-w-4xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        {/* Cabeçalho institucional */}
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex items-center gap-3">
            {/* Logo com fundo gold para garantir contraste do DIAKONIA (logo branco) */}
            <div className="bg-gold rounded-md px-3 py-2 flex items-center justify-center shadow-sm print:bg-gold print:!bg-gold" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
              <BrandMark className="text-2xl" />
            </div>
            <div>
              <h2 className="font-serif text-lg leading-tight">Diakonia APP — Sistema de Igrejas</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 tracking-wide">
                Conectando pessoas, organizando o propósito
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hoje}</strong> às {horaHoje}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        {/* Título */}
        <div className="text-center my-6 avoid-break">
          <p className="text-[10px] tracking-[0.25em] uppercase text-gold">{tituloModo}</p>
          <h1 className="font-serif text-3xl mt-2">{campanha.nome}</h1>
          {classe && (
            <p className="text-sm text-muted-foreground mt-1">
              Classe <strong>{classe.nome}</strong>
            </p>
          )}
          {campanha.descricao && (
            <p className="text-sm italic mt-2 text-muted-foreground max-w-xl mx-auto">
              "{campanha.descricao}"
            </p>
          )}
        </div>

        {/* Identificação */}
        <section className="avoid-break grid grid-cols-2 gap-3 text-sm border-y border-border py-3 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Período</p>
            <p className="font-medium">
              {dataBr(campanha.data_inicio)} → {dataBr(campanha.data_fim)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</p>
            <p className="font-medium">{campanha.ativo ? "Ativa" : "Encerrada"}</p>
          </div>
        </section>

        {/* ─── Resumo executivo ─── */}
        {resumo && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-3 text-gold">Resumo Executivo</h3>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <ResumoBox label="META" valor={brl(resumo.meta)} />
              <ResumoBox label="ARRECADADO" valor={brl(resumo.arrecadado)} destaque />
              <ResumoBox label="ALCANCE" valor={`${Math.round(resumo.percentual)}%`} />
            </div>

            {/* Barra de progresso impressa em preto e branco friendly */}
            <div className="space-y-1.5">
              <div className="h-3 rounded-full bg-muted overflow-hidden border border-border print:border-foreground">
                <div
                  className="h-full bg-gradient-to-r from-gold via-amber-500 to-emerald-600 print:bg-gold"
                  style={{ width: `${Math.min(100, resumo.percentual)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>R$ 0</span>
                <span>{brl(resumo.meta)}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-[11px] mt-4">
              <DadoMini label="Decorrido" valor={`${resumo.dias_decorridos}/${resumo.dias_totais} dias`} />
              <DadoMini label="Meta diária" valor={brl(resumo.meta_diaria)} />
              <DadoMini label="Entradas" valor={String(entradas.length)} />
              <DadoMini label="Status" valor={STATUS_LABEL[resumo.status] ?? "—"} />
            </div>
          </section>
        )}

        {/* ─── Por tipo / Por forma ─── */}
        <section className="avoid-break grid grid-cols-2 gap-6 mb-6">
          <Bloco titulo="Por Tipo">
            <Tabelinha
              linhas={totaisPorTipo.map(([k, v]) => [TIPO_LABEL[k] ?? k, brl(v)])}
              total={brl(totalEntradas)}
            />
          </Bloco>
          <Bloco titulo="Por Forma">
            <Tabelinha
              linhas={totaisPorForma.map(([k, v]) => [FORMA_LABEL[k] ?? k, brl(v)])}
              total={brl(totalEntradas)}
            />
          </Bloco>
        </section>

        {/* ─── Modo PASTORAL: projeção ─── */}
        {modo === "pastoral" && resumo && (
          <section className="avoid-break mb-6 p-4 rounded-md bg-gradient-verse border border-gold/30">
            <h3 className="font-serif text-base mb-2 text-gold">Acompanhamento Pastoral</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Esperado até hoje (ritmo linear)</p>
                <p className="font-semibold text-lg">{brl(resumo.esperado_ate_hoje)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Diferença em relação ao ritmo</p>
                <p className="font-semibold text-lg">
                  {resumo.arrecadado >= resumo.esperado_ate_hoje
                    ? `+${brl(resumo.arrecadado - resumo.esperado_ate_hoje)}`
                    : `−${brl(resumo.esperado_ate_hoje - resumo.arrecadado)}`}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 italic">
              {resumo.status === "muito_abaixo" || resumo.status === "abaixo_esperado"
                ? "Sugestão: revisar mobilização e comunicação com a classe."
                : resumo.status === "no_ritmo"
                ? "A campanha está saudável — manter o ritmo."
                : "Excelente desempenho — fortalecer agradecimento à classe."}
            </p>
          </section>
        )}

        {/* ─── Modo COMPLETO: tabela detalhada ─── */}
        {mostraDetalhes && entradas.length > 0 && (
          <section className="mb-6">
            <h3 className="font-serif text-base mb-3 text-gold">Detalhamento das Entradas</h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-gold/40 text-left">
                  <th className="py-1.5 pr-2 w-8">#</th>
                  <th className="py-1.5 pr-2 w-24">Data</th>
                  <th className="py-1.5 pr-2 w-28 text-right">Valor</th>
                  <th className="py-1.5 pr-2 w-20">Tipo</th>
                  <th className="py-1.5 pr-2 w-24">Forma</th>
                  {mostrarDescricao && <th className="py-1.5 pr-2">Descrição</th>}
                  <th className="py-1.5 w-12 text-center">Comp.</th>
                </tr>
              </thead>
              <tbody>
                {entradas.slice().reverse().map((e, idx) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 text-muted-foreground">{idx + 1}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{dataBr(e.data)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{brl(e.valor)}</td>
                    <td className="py-1.5 pr-2">{TIPO_LABEL[e.tipo]}</td>
                    <td className="py-1.5 pr-2">{FORMA_LABEL[e.forma]}</td>
                    {mostrarDescricao && (
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {e.descricao ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                    )}
                    <td className="py-1.5 text-center">{e.comprovante_url ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gold/40 font-semibold">
                  <td colSpan={2} className="py-2 text-right uppercase text-[10px] tracking-wide pr-2">Total</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{brl(totalEntradas)}</td>
                  <td colSpan={mostrarDescricao ? 4 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {mostraDetalhes && entradas.length === 0 && (
          <section className="text-center text-muted-foreground text-sm py-4 italic">
            Nenhuma entrada registrada até o momento.
          </section>
        )}

        {/* ─── Assinaturas ─── */}
        <section className="avoid-break mt-12 pt-4">
          <div className="grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Professor da Classe</p>
                {classe && (
                  <p className="text-muted-foreground text-[10px]">{classe.nome}</p>
                )}
              </div>
            </div>
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Área | Apoio Administrativo</p>
                <p className="text-muted-foreground text-[10px]">Responsável pela conta</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Rodapé com versículo ─── */}
        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Cada um contribua segundo propôs no seu coração; não com tristeza, ou por necessidade; porque Deus ama ao que dá com alegria."
          </p>
          <p className="text-[10px] text-gold tracking-wide mt-1">2 Coríntios 9:7</p>
        </footer>
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────
function ResumoBox({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`border rounded-md py-2.5 px-3 text-center ${destaque ? "border-gold bg-gold/5" : "border-border"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-semibold mt-0.5 tabular-nums ${destaque ? "text-xl text-gold" : "text-lg"}`}>{valor}</p>
    </div>
  );
}

function DadoMini({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="border border-border/60 rounded py-1 px-1">
      <p className="text-muted-foreground text-[9px] uppercase tracking-wide">{label}</p>
      <p className="font-medium text-xs mt-0.5">{valor}</p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">{titulo}</h4>
      {children}
    </div>
  );
}

function Tabelinha({ linhas, total }: { linhas: [string, string][]; total: string }) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {linhas.length === 0 ? (
          <tr><td className="py-1 text-muted-foreground italic">Sem dados</td></tr>
        ) : linhas.map(([k, v]) => (
          <tr key={k} className="border-b border-border/40">
            <td className="py-1">{k}</td>
            <td className="py-1 text-right tabular-nums font-medium">{v}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gold/40 font-semibold">
          <td className="pt-1.5 text-[10px] uppercase tracking-wide">Total</td>
          <td className="pt-1.5 text-right tabular-nums">{total}</td>
        </tr>
      </tfoot>
    </table>
  );
}
