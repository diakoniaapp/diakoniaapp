// ─── Sustento.tsx — Conta Corrente de Sustento (Fase 1: tela de leitura) ──────────────────────────────────────────
//
// Pedido dela (08/10/2026), a partir do RSP do Pastor Titular e do Pastor Missionário: sustento − IRRF − adiantamentos = líquido a
// pagar, por COMPETÊNCIA. Duas visões, definidas pelo TIPO do beneficiário (src/lib/sustento.ts):
//   · avançada (pastor titular): a apuração do RSP em rubricas, os adiantamentos e o saldo a pagar;
//   · simples (os demais): valor previsto do mês, o que já foi pago, o que falta.
// Só leitura. Não grava, não cria lançamento, não mexe em saldo — a Fase 1 foi aprovada nestes termos. Os pagamentos mostrados
// são os lançamentos que já existem em `fin_lancamentos`, apenas ligados a uma competência.
//
// Remuneração de pastor é dado sensível: só `admin` e `tesouraria` (ROUTE_ROLES, o menu e a RLS das quatro tabelas dizem o mesmo).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronRight, HeartHandshake, RefreshCw, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PaginaSkeleton, ErrorState } from "@/components/ListState";
import { brl } from "@/services/finService";
import { carregarSustento, type BeneficiarioComCompetencias, type CompetenciaDoSustento, type ResultadoDoSustento } from "@/services/sustentoService";
import {
  ROTULO_TIPO, resumirBeneficiario, rotuloCompetencia, situacaoDaCompetencia, sugerirCompetencia, totalPago, TOLERANCIA,
  type SituacaoDaCompetencia,
} from "@/lib/sustento";
import { hojeLocal } from "@/lib/data";

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

const ROTULO_PAGAMENTO = { adiantamento: "Adiantamento", pagamento_final: "Pagamento final", complemento: "Complemento", pagamento: "Pagamento" } as const;

// A cor segue o que a tesouraria precisa ver primeiro: o que ainda falta pagar.
const COR_DA_SITUACAO: Record<SituacaoDaCompetencia, string> = {
  "Prevista": "border-info-line bg-info-soft text-info-text",
  "Paga parcialmente": "border-warning-line bg-warning-soft text-warning-text",
  "Paga integralmente": "border-success-line bg-success-soft text-success-text",
  "Aberta": "border-info-line bg-info-soft text-info-text",
  "A pagar": "border-warning-line bg-warning-soft text-warning-text",
  "Paga": "border-success-line bg-success-soft text-success-text",
};

export default function Sustento() {
  const [res, setRes] = useState<ResultadoDoSustento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      setRes(await carregarSustento());
    } catch (e: any) {
      setRes({ pronto: false, beneficiarios: [], motivo: "erro", mensagem: e?.message ?? "Não foi possível ler a conta corrente de sustento." });
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  const beneficiarios = res?.beneficiarios ?? [];
  const atual = beneficiarios.find((b) => b.id === selecionado) ?? beneficiarios[0] ?? null;

  if (carregando && !res) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0 -ml-2">
          <Link to="/painel-tesouraria" aria-label="Voltar à Tesouraria"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-gold shrink-0" /> Conta Corrente de Sustento
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="w-3 h-3 shrink-0" /> Visível só para tesouraria e administração.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={carregar} disabled={carregando} className="gap-1.5 shrink-0">
          <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {res && !res.pronto && res.motivo === "migration_pendente" && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-sm font-medium">A conta corrente de sustento ainda não foi ativada no banco.</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              A tela já está pronta; falta aplicar a migration <span className="font-mono">20261008170000_sustento_conta_corrente</span>.
              Ela só cria tabelas novas e vazias — nenhum lançamento, saldo ou recorrência existente é alterado.
            </p>
          </CardContent>
        </Card>
      )}
      {res && !res.pronto && res.motivo === "erro" && <ErrorState message={res.mensagem} onRetry={carregar} />}

      {res?.pronto && beneficiarios.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum beneficiário cadastrado ainda. Quando o Pastor Titular e o Pastor Missionário forem cadastrados, as competências aparecem aqui.
          </CardContent>
        </Card>
      )}

      {atual && (
        <>
          {beneficiarios.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Beneficiários">
              {beneficiarios.map((b) => {
                const ativo = b.id === atual.id;
                const r = resumirBeneficiario(b.competencias);
                return (
                  <button key={b.id} type="button" role="tab" aria-selected={ativo} onClick={() => setSelecionado(b.id)}
                    className={`min-w-0 text-left rounded-md border px-3 py-1.5 text-sm transition-colors ${ativo ? "border-gold bg-gold/10" : "hover:bg-muted/40"}`}>
                    <span className="block truncate font-medium">{b.nomeExibicao}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROTULO_TIPO[b.tipo]}{r.saldoPendente > TOLERANCIA ? ` · a pagar ${brl(r.saldoPendente)}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <PainelDoBeneficiario b={atual} />
        </>
      )}
    </div>
  );
}

function PainelDoBeneficiario({ b }: { b: BeneficiarioComCompetencias }) {
  const resumo = useMemo(() => resumirBeneficiario(b.competencias), [b]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [dataTeste, setDataTeste] = useState(hojeLocal());

  // se a competência aberta some (troca de beneficiário), recolhe
  useEffect(() => { setAberta(null); }, [b.id]);

  const sugestao = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(dataTeste) ? sugerirCompetencia(dataTeste, b.competencias) : null),
    [dataTeste, b],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3 px-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium min-w-0 truncate">{b.nomeExibicao}</p>
            <Badge variant="outline" className="text-[11px]">{ROTULO_TIPO[b.tipo]}</Badge>
            <Badge variant="outline" className="text-[11px]">{b.modo === "avancado" ? "Visão avançada — RSP" : "Visão simples"}</Badge>
          </div>
          {b.modoManual && (
            <p className="text-xs text-muted-foreground">
              Exceção de modo desde {dataBr(b.modoManualDesde)}: {b.modoManualMotivo}. Competências anteriores continuam na visão do tipo.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border px-3 py-2 min-w-0">
              <p className="text-xs text-muted-foreground">Saldo a pagar</p>
              <p className={`text-lg font-semibold tabular-nums ${resumo.saldoPendente > TOLERANCIA ? "text-warning-text" : "text-success-text"}`}>{brl(resumo.saldoPendente)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {resumo.pendentes.length === 0 ? "Nada em aberto" : resumo.pendentes.map(rotuloCompetencia).join(" · ")}
              </p>
            </div>
            <div className="rounded-md border px-3 py-2 min-w-0">
              <p className="text-xs text-muted-foreground">{b.modo === "avancado" ? "Adiantado, aguardando RSP" : "Dia do líquido"}</p>
              <p className="text-lg font-semibold tabular-nums">
                {b.modo === "avancado" ? brl(resumo.adiantadoEmAberto) : b.diaDoLiquido ? `dia ${b.diaDoLiquido}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {b.modo === "avancado" ? "adiantamentos de competências ainda abertas" : "do mês seguinte à competência"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {b.competencias.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhuma competência lançada para {b.nomeExibicao}.</CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="Competências">
          {b.competencias.map((c) => (
            <LinhaDeCompetencia key={c.id} c={c} aberta={aberta === c.id} alternar={() => setAberta(aberta === c.id ? null : c.id)} />
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="py-3 px-4 space-y-2">
          <p className="text-sm font-medium">Onde cairia um pagamento?</p>
          <p className="text-xs text-muted-foreground">
            A regra: 1º a competência mais antiga com saldo a pagar; 2º a atual, se o dia for até 20; 3º a seguinte. É só uma conferência da regra — nada é gravado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={dataTeste} onChange={(e) => setDataTeste(e.target.value)} className="h-8 w-40 text-xs" aria-label="Data do pagamento" />
            {sugestao && (
              <p className="text-sm min-w-0">
                → <span className="font-medium">{rotuloCompetencia(sugestao.competencia)}</span>
                <span className="text-xs text-muted-foreground"> — {sugestao.explicacao}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaDeCompetencia({ c, aberta, alternar }: { c: CompetenciaDoSustento; aberta: boolean; alternar: () => void }) {
  const situacao = situacaoDaCompetencia(c);
  const pago = totalPago(c);
  return (
    <li>
      <button type="button" onClick={alternar} aria-expanded={aberta}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30">
        {aberta ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium capitalize">{rotuloCompetencia(c.competencia)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {c.liquidoPrevisto > 0 ? `líquido ${brl(c.liquidoPrevisto)}` : "sem apuração"} · pago {brl(pago)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${COR_DA_SITUACAO[situacao]}`}>{situacao}</span>
        <span className={`shrink-0 w-24 text-right text-sm font-semibold tabular-nums ${c.saldoAPagar > TOLERANCIA ? "text-warning-text" : "text-muted-foreground"}`}>
          {brl(c.saldoAPagar)}
        </span>
      </button>
      {aberta && <DetalheDaCompetencia c={c} />}
    </li>
  );
}

function Linha({ rotulo, valor, forte, sinal }: { rotulo: string; valor: number; forte?: boolean; sinal?: "+" | "−" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${forte ? "border-t font-semibold" : ""}`}>
      <span className="min-w-0 truncate text-muted-foreground">{sinal ? `(${sinal}) ` : ""}{rotulo}</span>
      <span className="shrink-0 tabular-nums">{brl(valor)}</span>
    </div>
  );
}

function DetalheDaCompetencia({ c }: { c: CompetenciaDoSustento }) {
  const avancado = c.modo === "avancado";
  return (
    <div className="px-4 pb-4 pt-1 space-y-3 text-sm bg-muted/20">
      {avancado ? (
        c.nItens > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Apuração do RSP</p>
            <Linha rotulo="Sustento pastoral" valor={c.sustento} sinal="+" />
            {c.outrosProventos > 0 && <Linha rotulo="Arredondamento e outros proventos" valor={c.outrosProventos} sinal="+" />}
            <Linha rotulo="Total de proventos" valor={c.proventos} forte />
            <Linha rotulo="IRRF" valor={c.irrf} sinal="−" />
            {c.outrosDescontos > 0 && <Linha rotulo="Arredondamento e outros descontos" valor={c.outrosDescontos} sinal="−" />}
            <Linha rotulo="Total de descontos" valor={c.descontos} forte />
            <Linha rotulo="Líquido previsto" valor={c.liquidoPrevisto} forte />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">O RSP desta competência ainda não foi lançado — por isso só aparecem os adiantamentos.</p>
        )
      ) : (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Valor do mês</p>
          <Linha rotulo="Valor previsto" valor={c.liquidoPrevisto} />
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Pagamentos ligados a esta competência</p>
        {c.pagamentos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum pagamento ligado ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border bg-background">
            {c.pagamentos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="min-w-0 truncate">
                  {dataBr(p.data)} · {ROTULO_PAGAMENTO[p.tipo]}
                  {p.status && p.status !== "conciliado" && p.status !== "realizado" && <span className="text-xs text-muted-foreground"> ({p.status})</span>}
                </span>
                <span className="shrink-0 tabular-nums">{brl(p.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {avancado && <Linha rotulo="Adiantamentos" valor={c.adiantamentos} sinal="−" />}
        {avancado && c.pagamentosFinais > 0 && <Linha rotulo="Pagamento final" valor={c.pagamentosFinais} sinal="−" />}
        {c.complementos > 0 && <Linha rotulo="Complementos" valor={c.complementos} sinal="−" />}
        {!avancado && <Linha rotulo="Pagamentos" valor={c.pagamentosSimples} sinal="−" />}
        <Linha rotulo="Saldo a pagar" valor={c.saldoAPagar} forte />
        {c.saldoAPagar < -TOLERANCIA && (
          <p className="text-xs text-muted-foreground">
            Saldo negativo: {avancado && c.status === "aberta" ? "adiantado antes do RSP — ele será abatido do líquido quando a competência for fechada." : "pago a mais que o previsto."}
          </p>
        )}
      </div>
    </div>
  );
}
