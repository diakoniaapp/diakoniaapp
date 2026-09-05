// ─── PainelAcompanhamentoEbd.tsx — o acompanhamento da EBD, como bloco ─────
//
// Nasceu como tela própria em `/ebd/acompanhamento` e virou componente em
// 26/08/2026: o acompanhamento da EBD é parte do cuidado pastoral, e mandar
// a liderança para outra tela contrariava a ideia do Painel Pastoral — a
// semana inteira num lugar só.
//
// **Carrega os próprios dados, com estado próprio.** O Painel Pastoral já
// dispara seis consultas na montagem; pendurar mais quatro no mesmo
// `Promise.all` faria os blocos pastorais esperarem por agregações da EBD que
// ninguém pediu para ver primeiro. Aqui elas correm à parte, e o bloco se
// desenha quando ficar pronto.
//
// ── A DECISÃO QUE ATRAVESSA TODOS OS NÚMEROS ───────────────────────────────
//
// **Aula sem chamada não é aula em que todos faltaram.** As duas são
// indistinguíveis no dado bruto, e confundi-las faz o painel acusar uma
// evasão que não houve.
//
// Medido em produção em 26/08/2026: 12 aulas registradas, 3 com chamada.
// Pelas 12 a frequência apareceria como ~4,8%; pelas 3 reais, 19,4%.
//
// Por isso "aulas sem chamada" é um número visível, e não uma correção
// escondida no meio de uma conta — a lacuna é o achado pastoral: mostra em
// que classe o registro parou.
//
// Toda a aritmética morava nas quatro RPCs da migration
// 20260826140000_painel_de_acompanhamento_da_ebd.sql — mas essas somam
// "desde sempre", sem período. Ela pediu, olhando este bloco ao lado do
// botão "Relatório mensal": "quero os mesmos indicadores do relatório
// mensal". Trocado pelas RPCs período-livre de EbdRelatorioMensalGeral.tsx
// (migrations 20260904300000/310000), fixas no mês atual — o mesmo recorte
// que o relatório abre por padrão — para os dois números baterem quando ela
// for de um pro outro.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, TrendingUp, TrendingDown,
  ClipboardList, Loader2, FileText,
} from "lucide-react";
import { toast } from "sonner";
// O cartao de numero vivia aqui, duplicado do PainelPastoral e do PGM.
import { Indicador, FaixaDeIndicadores } from "@/components/painel/blocos";
import {
  relatorioGeralResumo, relatorioGeralPorFaixa, faixasExtremas,
  type RelatorioMensalGeralResumo, type EbdFaixa,
} from "@/services/ebdPainelService";
import { novasMatriculasDoMes } from "@/services/ebdService";

export function PainelAcompanhamentoEbd() {
  const [resumo, setResumo] = useState<RelatorioMensalGeralResumo | null>(null);
  const [faixas, setFaixas] = useState<EbdFaixa[]>([]);
  const [novosNoMes, setNovosNoMes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth() + 1;
      const inicioDoMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fimDoMes = new Date(ano, mes, 1).toISOString().slice(0, 10);

      const [r, f, novos] = await Promise.all([
        relatorioGeralResumo(inicioDoMes, fimDoMes),
        relatorioGeralPorFaixa(inicioDoMes, fimDoMes),
        novasMatriculasDoMes(inicioDoMes, fimDoMes),
      ]);
      setResumo(r);
      // Mesmos nomes de campo de `EbdFaixa`, só que `relatorioGeralPorFaixa`
      // devolve `presentes`/`ausentes` em vez de `presencas`/`ausencias` —
      // adapta aqui pra reaproveitar `faixasExtremas()` e o render de baixo
      // sem duplicar os dois.
      setFaixas(f.map(x => ({
        faixa: x.faixa, ordem: x.ordem, matriculados: x.matriculados,
        presencas: x.presentes, ausencias: x.ausentes, taxa: x.taxa,
      })));
      setNovosNoMes(novos.length);
      setFalhou(false);
    } catch (e: any) {
      // Um bloco que falha não pode derrubar o painel inteiro nem sumir em
      // silêncio: avisa, e o resto da tela segue de pé.
      setFalhou(true);
      toast.error(e?.message ?? "Erro ao carregar o acompanhamento da EBD");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o acompanhamento da EBD…
        </CardContent>
      </Card>
    );
  }

  if (falhou || !resumo) {
    return (
      <Card className="border-warning-line">
        <CardContent className="py-4 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-warning-text flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Não foi possível carregar o acompanhamento da EBD.
          </p>
          <Button size="sm" variant="outline" onClick={carregar}>Tentar de novo</Button>
        </CardContent>
      </Card>
    );
  }

  const { maisPresente, maisAusente } = faixasExtremas(faixas);
  const semChamada = resumo.aulas_total - resumo.aulas_com_chamada;
  const semTaxa = resumo.aulas_com_chamada === 0;
  const semDataNasc = faixas.find(f => f.faixa === "Sem data de nascimento")?.matriculados ?? 0;

  return (
    <div className="space-y-4">
      {/* Pedido dela: "relatório mensal para todas as classes, que conversa
          com o painel pastoral" — este link é a conversa. O relatório em si
          (impressão + WhatsApp) mora em EbdRelatorioMensalGeral.tsx; aqui
          fica só o acesso, pra não duplicar a mesma soma em dois lugares. */}
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to="/ebd/relatorio-mensal">
            <FileText className="w-3.5 h-3.5" /> Relatório mensal
          </Link>
        </Button>
      </div>

      {/* Aviso que precede qualquer número de frequência.
          Sem ele, "19,4%" leria como "a EBD esvaziou". Com ele, lê como "a
          chamada foi feita em 3 das 12 aulas, e nessas 3 a frequência foi
          19,4%" — que é verdadeiro e acionável. */}
      {semChamada > 0 && (
        <div className="rounded-md border border-warning-line bg-warning-soft/50 px-3 py-2">
          <p className="text-sm text-warning-text flex items-start gap-2">
            <ClipboardList className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>{semChamada} de {resumo.aulas_total} aulas não tiveram chamada registrada.</strong>{" "}
              Elas ficam fora de todo cálculo de frequência — aula sem chamada não é aula
              em que todos faltaram. As taxas abaixo usam apenas as {resumo.aulas_com_chamada} aulas
              com presença registrada.
            </span>
          </p>
        </div>
      )}

      {/* Números do topo — os mesmos sete do relatório mensal
          (EbdRelatorioMensalGeral.tsx), pedido dela pra baterem quando ela
          for de um pro outro. `colunas={4}` porque `FaixaDeIndicadores` só
          tem entrada até 6 no mapa de colunas — sete vira 4+3, mesma
          densidade que o relatório já usa (`grid-cols-4`) pro mesmo grupo. */}
      <FaixaDeIndicadores colunas={4}>
        <Indicador rotulo="Classes ativas" valor={resumo.classes_ativas} tom="info" />
        <Indicador rotulo="Matriculados" valor={resumo.matriculados} tom="info" />
        <Indicador rotulo="Aulas c/ chamada" valor={`${resumo.aulas_com_chamada}/${resumo.aulas_total}`} tom="celebracao" />
        <Indicador rotulo="Presença média" valor={semTaxa ? "—" : `${resumo.taxa_presenca}%`} tom="success" />
        <Indicador rotulo="Ausentes" valor={resumo.ausentes} tom="warning" />
        <Indicador rotulo="Visitantes" valor={resumo.visitantes} tom="neutro" />
        <Indicador rotulo="Novos alunos" valor={novosNoMes} tom="celebracao" />
      </FaixaDeIndicadores>

      {/* "Homens e mulheres" saiu daqui: media matriculados/presenças por
          sexo a partir de `ebd_painel_resumo()` (desde sempre, sem
          período), campo que o resumo período-livre de cima não tem. Ela
          pediu "os mesmos indicadores do relatório mensal" — o relatório
          não tem esse recorte, e duplicar uma consulta à parte só pra
          preservar um bloco que ninguém pediu para manter contrariaria o
          próprio pedido. Se fizer falta, é uma pergunta nova, não uma
          suposição minha. */}

      {/* Faixa etária */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Por faixa etária
            <Badge variant="outline" className="text-xs">{faixas.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(maisPresente || maisAusente) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {maisPresente && (
                <div className="rounded-md border border-success-line bg-success-soft/40 px-3 py-2 min-w-0">
                  <p className="text-xs uppercase tracking-wide text-success-text flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Mais frequente
                  </p>
                  <p className="font-medium text-sm mt-0.5 truncate">{maisPresente.faixa}</p>
                  <p className="text-xs text-muted-foreground">{maisPresente.taxa}% de presença</p>
                </div>
              )}
              {maisAusente && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 min-w-0">
                  <p className="text-xs uppercase tracking-wide text-warning-text flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" /> Mais ausente
                  </p>
                  <p className="font-medium text-sm mt-0.5 truncate">{maisAusente.faixa}</p>
                  <p className="text-xs text-muted-foreground">{maisAusente.taxa}% de presença</p>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="text-left font-medium py-1.5">Faixa</th>
                  <th className="text-right font-medium py-1.5">Alunos</th>
                  <th className="text-right font-medium py-1.5">Presenças</th>
                  <th className="text-right font-medium py-1.5">Faltas</th>
                  <th className="text-right font-medium py-1.5">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {faixas.map(f => (
                  <tr key={f.faixa} className="border-b last:border-0">
                    <td className="py-1.5">{f.faixa}</td>
                    <td className="py-1.5 text-right tabular-nums">{f.matriculados}</td>
                    <td className="py-1.5 text-right tabular-nums">{f.presencas}</td>
                    <td className="py-1.5 text-right tabular-nums">{f.ausencias}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {f.taxa === null ? <span className="text-muted-foreground">—</span> : `${f.taxa}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {semDataNasc > 0 && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {semDataNasc} aluno{semDataNasc > 1 ? "s" : ""} sem
              data de nascimento — aparece{semDataNasc > 1 ? "m" : ""} na faixa
              própria, não some{semDataNasc > 1 ? "m" : ""} da conta.
            </p>
          )}
        </CardContent>
      </Card>

      {/*
        "Por classe" e "Alunos que mais faltaram" foram desativados em
        26/08/2026, a pedido.

        O Painel Pastoral serve para ver o contexto geral: quantos alunos,
        como está a frequência, qual faixa etária está se afastando. A lista
        das oito classes e a dos alunos que mais faltaram são o detalhe — e
        detalhe, aqui, compete com o resto da tela.

        Nada foi apagado. As RPCs `ebd_painel_por_classe` e
        `ebd_painel_alunos_ausentes` continuam no banco, e `ebdPorClasse` /
        `ebdAlunosAusentes` continuam no serviço. Para trazer os blocos de
        volta: reincluir as duas buscas no `Promise.all` de `carregar()` e
        desenhar as listas.
      */}
    </div>
  );
}

