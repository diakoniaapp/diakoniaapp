// ─── PainelTesouraria.tsx — o trabalho da tesouraria em um lugar ──────────
//
// ── POR QUE ESTE PAINEL EXISTE ─────────────────────────────────────────────
//
// A auditoria de navegação de 08/09/2026 (Raio-X do Diakonia) encontrou o
// maior problema estrutural do sistema: o Painel Pastoral existe, o Painel
// da Secretaria existe, e quem tem o papel `tesouraria` cai na Home genérica
// ao entrar — obrigada a descobrir sozinha o que fazer primeiro em meio a
// nove sub-rotas de `/financas`, o módulo fiscal, a folha e o bazar.
//
// A pista mais direta de que isto já devia existir: `MeusPaineis.tsx` (o
// menu de conta) já tinha um cartão "Tesouraria" com um comentário dizendo
// que ele "leva a uma bancada" — e apontava para `/financas`, que é rico mas
// não é bancada nenhuma: sem frase-resumo, sem prioridade, sem chegada
// automática no login. Este painel cumpre o que aquele comentário prometia.
//
// ── SPRINT 1 DO PLANO "BANCADA DA TESOURARIA" ──────────────────────────────
//
// Só os dois blocos que respondem pelos dois riscos que custam dinheiro de
// verdade quando alguém deixa passar: Fiscal (multa) e Caixa (dinheiro em
// espécie sem responsável claro). Pendências, conciliação, orçamento e o
// cruzamento com a Diaconia entram nos sprints seguintes, sobre este mesmo
// arquivo — nenhum deles é pré-requisito deste.
//
// ── POR QUE O BLOCO FISCAL EMBUTE O WIDGET, EM VEZ DE RECALCULAR ───────────
//
// `AgendaFiscalUrgente` já existe, já é usado (hoje só dentro de
// `WidgetsDoPainel painel="financas"`, em `/financas`), e já tem o botão de
// avisar a tesouraria por WhatsApp. Reescrever a mesma consulta aqui
// produziria duas fontes da mesma verdade — o defeito que este projeto vem
// evitando a semana toda. `useReportarVazio`, que o widget chama, é inerte
// sem `VazioCtx` (não há esse provider aqui), e é exatamente esse o
// comportamento certo: a seção fica visível dizendo "em ordem" quando não há
// nada — mesma regra do Painel da Secretaria, porque esta também é bancada
// de UMA pessoa, não uma tela pessoal que deve encolher ao mínimo.
//
// ── AS SEÇÕES NÃO SOMEM QUANDO ZERAM ───────────────────────────────────────
//
// Como no Painel da Secretaria, e pelo mesmo motivo: bancada que muda de
// forma toda manhã obriga a reprocurar tudo.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, Receipt, Wallet, ChevronRight, RefreshCw, Sparkles, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { carregarResumoFiscal, type ResumoFiscalDashboard } from "@/services/fiscalService";
import {
  listarCaixasAbertos, formatarTempoAberto, caixaEhUrgente, type CaixaAberto,
} from "@/services/painelTesourariaService";
import { AgendaFiscalUrgente } from "@/components/dashboard/AgendaFiscalUrgente";

export default function PainelTesouraria() {
  const [fiscal, setFiscal] = useState<ResumoFiscalDashboard | null>(null);
  const [caixas, setCaixas] = useState<CaixaAberto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [f, c] = await Promise.all([
        carregarResumoFiscal(),
        listarCaixasAbertos(),
      ]);
      setFiscal(f);
      setCaixas(c);
      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const totalFiscal = fiscal ? fiscal.total_atrasados + fiscal.total_urgentes + fiscal.total_proximos : 0;
  const caixasUrgentes = caixas.filter(caixaEhUrgente);

  return (
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* Mesma largura e mesmo cabeçalho fixo do Painel Pastoral e do Painel
          da Secretaria — ver os comentários de largura naqueles dois
          arquivos, resolvidos em 27/08/2026. A faixa de indicadores é o
          índice da tela. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-gold shrink-0" />
              Painel da Tesouraria
            </h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={carregar} disabled={carregando}
            className="gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ── Resumo em linguagem natural ──────────────────────────────── */}
        {fiscal && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <span className="min-w-0">
              {resumoNatural(fiscal, caixas, caixasUrgentes)}
              {atualizadoEm && (
                <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                  · {formatarAtualizadoHa(atualizadoEm)}
                </span>
              )}
            </span>
          </p>
        )}

        {/* ── A faixa de indicadores — índice, não painel de números ──────
            Mesma regra dos outros dois painéis, decidida em 27/08/2026: sem
            `valor`, cada bloco vira atalho de ícone + rótulo + seta. */}
        {fiscal && (
          <FaixaDeIndicadores colunas={2}>
            <Indicador
              rotulo="Fiscal" tom="warning" icone={Receipt}
              onClick={() => irParaSecao("fiscal")} descricao="Ir para Fiscal"
            />
            <Indicador
              rotulo="Caixa" tom="info" icone={Wallet}
              onClick={() => irParaSecao("caixa")} descricao="Ir para Caixa"
            />
          </FaixaDeIndicadores>
        )}
      </div>

      {erro && (
        <p className="text-sm text-destructive-text border border-destructive-line rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      {carregando && !fiscal && (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      )}

      {fiscal && (
        <>
          {/* ── Fiscal ─────────────────────────────────────────────────── */}
          <section id="fiscal" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Receipt} tom="warning" contagem={totalFiscal}>
              Fiscal
            </TituloDaSecao>
            <div className="rounded-md border bg-card p-3">
              <AgendaFiscalUrgente />
            </div>
          </section>

          {/* ── Caixa ──────────────────────────────────────────────────── */}
          <section id="caixa" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Wallet} tom="info" contagem={caixas.length}>
              Caixa
            </TituloDaSecao>
            {caixas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhum caixa aberto no momento.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {caixas.map(c => (
                  <li key={c.id}>
                    {/* A linha inteira é o link, como nas outras listas de
                        painel — chega direto na tela de fechamento, sem
                        passar pelo catálogo de reservas. */}
                    <Link
                      to={`/arrecadacao/caixa/${c.id}`}
                      className="flex items-center gap-2 px-3 py-2.5 min-h-11 group"
                    >
                      <span className="text-sm min-w-0 flex-1">
                        <span className={caixaEhUrgente(c) ? "font-medium text-warning-text" : "font-medium"}>
                          {c.espaco_nome ?? c.finalidade ?? "Caixa"}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}— aberto {formatarTempoAberto(c.aberto_em)}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Atalhos ────────────────────────────────────────────────── */}
          <section className="pt-1">
            <TituloDaSecao icone={DollarSign} tom="neutro">Ir para</TituloDaSecao>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas"><DollarSign className="w-3.5 h-3.5" /> Tesouraria</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas/fiscal"><Receipt className="w-3.5 h-3.5" /> Módulo Fiscal</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/arrecadacao"><Package className="w-3.5 h-3.5" /> Bazar e Cantina</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/financas/insights"><Sparkles className="w-3.5 h-3.5" /> Insights</Link>
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * A frase que abre o painel — mesma régua dos outros dois: urgência primeiro
 * (o que gera multa ou deixa dinheiro sem responsável), fila depois.
 */
function resumoNatural(
  fiscal: ResumoFiscalDashboard,
  caixas: CaixaAberto[],
  caixasUrgentes: CaixaAberto[],
): string {
  const partes: string[] = [];

  if (fiscal.total_atrasados > 0) {
    partes.push(`${fiscal.total_atrasados} ${fiscal.total_atrasados === 1
      ? "obrigação fiscal atrasada" : "obrigações fiscais atrasadas"}`);
  }
  if (caixasUrgentes.length > 0) {
    partes.push(`${caixasUrgentes.length} ${caixasUrgentes.length === 1
      ? "caixa aberto há mais de um dia" : "caixas abertos há mais de um dia"}`);
  }
  if (partes.length > 0) return `Atenção: ${partes.join(", ")}.`;

  // ── A FILA NÃO ENTRA NA FRASE QUANDO HÁ URGÊNCIA ─────────────────────
  // Mesma regra do Painel da Secretaria: o total só aparece quando não há
  // nada gritando, senão compete com o que a seção logo abaixo já diz.
  const fila: string[] = [];
  if (fiscal.total_urgentes > 0) {
    fila.push(`${fiscal.total_urgentes} ${fiscal.total_urgentes === 1
      ? "obrigação vencendo em breve" : "obrigações vencendo em breve"}`);
  }
  if (caixas.length > 0) {
    fila.push(`${caixas.length} ${caixas.length === 1 ? "caixa aberto" : "caixas abertos"}`);
  }
  if (fila.length === 0) return "Fiscal em dia e nenhum caixa aberto — tudo em ordem! 🙏";
  return `Nada urgente. Na fila: ${fila.join(" e ")}.`;
}
