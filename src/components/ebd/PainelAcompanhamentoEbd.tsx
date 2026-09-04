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
// Toda a aritmética mora nas quatro RPCs da migration
// 20260826140000_painel_de_acompanhamento_da_ebd.sql.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, AlertCircle, TrendingUp, TrendingDown,
  ClipboardList, Loader2, FileText,
} from "lucide-react";
import { toast } from "sonner";
// O cartao de numero vivia aqui, duplicado do PainelPastoral e do PGM.
import { Indicador, FaixaDeIndicadores } from "@/components/painel/blocos";
import {
  ebdResumo, ebdPorFaixa, faixasExtremas,
  type EbdResumo, type EbdFaixa,
} from "@/services/ebdPainelService";

export function PainelAcompanhamentoEbd() {
  const [resumo, setResumo] = useState<EbdResumo | null>(null);
  const [faixas, setFaixas] = useState<EbdFaixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      // Só as duas agregações que a tela desenha. `ebdPorClasse` e
      // `ebdAlunosAusentes` saíram junto com os blocos que alimentavam —
      // buscar o que ninguém vê é duas idas ao banco por nada.
      const [r, f] = await Promise.all([ebdResumo(), ebdPorFaixa()]);
      setResumo(r); setFaixas(f);
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
  const semChamada = resumo.aulas_sem_chamada;
  const semTaxa = resumo.aulas_com_chamada === 0;

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

      {/* Números do topo */}
      <FaixaDeIndicadores colunas={5}>
        <Indicador rotulo="Alunos" valor={resumo.alunos_matriculados} tom="info" />
        <Indicador rotulo="Classes ativas" valor={resumo.classes_ativas} tom="info" />
        <Indicador rotulo="Com chamada" valor={resumo.aulas_com_chamada} tom="celebracao" />
        <Indicador rotulo="Frequência" valor={semTaxa ? "—" : `${resumo.taxa_presenca}%`} tom="success" />
        <Indicador rotulo="Visitantes" valor={resumo.visitantes} tom="neutro" />
      </FaixaDeIndicadores>

      {/* Homens x mulheres */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            Homens e mulheres
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Balanca
            titulo="Matriculados"
            esquerdaRotulo="Homens" esquerdaValor={resumo.homens_matriculados}
            direitaRotulo="Mulheres" direitaValor={resumo.mulheres_matriculadas}
          />
          <Balanca
            titulo="Presenças registradas"
            esquerdaRotulo="Homens" esquerdaValor={resumo.homens_presentes}
            direitaRotulo="Mulheres" direitaValor={resumo.mulheres_presentes}
            vazio="Nenhuma presença registrada ainda."
          />
        </CardContent>
      </Card>

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

          {resumo.alunos_sem_data_nasc > 0 && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {resumo.alunos_sem_data_nasc} aluno{resumo.alunos_sem_data_nasc > 1 ? "s" : ""} sem
              data de nascimento — aparece{resumo.alunos_sem_data_nasc > 1 ? "m" : ""} na faixa
              própria, não some{resumo.alunos_sem_data_nasc > 1 ? "m" : ""} da conta.
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

// ─── Helpers de UI ─────────────────────────────────────────────────────────


/**
 * Barra de proporção entre dois grupos.
 *
 * Os números vêm escritos ao lado da barra de propósito: uma barra sozinha
 * comunica proporção, mas esconde a escala — 3 contra 1 e 300 contra 100
 * desenham igual.
 */
function Balanca({
  titulo, esquerdaRotulo, esquerdaValor, direitaRotulo, direitaValor, vazio,
}: {
  titulo: string;
  esquerdaRotulo: string; esquerdaValor: number;
  direitaRotulo: string; direitaValor: number;
  vazio?: string;
}) {
  const total = esquerdaValor + direitaValor;
  if (total === 0) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
        <p className="text-sm text-muted-foreground">{vazio ?? "Sem dados."}</p>
      </div>
    );
  }
  const pctE = Math.round((esquerdaValor / total) * 100);
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      <div className="flex items-center gap-2 text-sm mb-1 flex-wrap">
        <span className="tabular-nums"><strong>{esquerdaValor}</strong> {esquerdaRotulo}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums"><strong>{direitaValor}</strong> {direitaRotulo}</span>
        <span className="text-xs text-muted-foreground">({pctE}% / {100 - pctE}%)</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-muted">
        <div className="bg-info" style={{ width: `${pctE}%` }} aria-hidden />
        <div className="bg-celebracao" style={{ width: `${100 - pctE}%` }} aria-hidden />
      </div>
    </div>
  );
}
