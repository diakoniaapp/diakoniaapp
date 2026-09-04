// ─── Ebd.tsx — Painel da EBD ────────────────────────────────────────────────
//
// Pedido dela, depois de ver a primeira versão dos cartões: "transforme
// esse módulo em painel da EBD, será a tela de trabalho da pessoa
// responsável por esta área" — e "uma faixa fixa, como temos no painel
// pastoral... que seja os filtros para levar para as classes".
//
// Mesmo desenho do Painel Pastoral (ver PainelPastoral.tsx,
// components/painel/blocos.tsx): cabeçalho `sticky`, uma faixa de
// `Indicador`es SEM número — cada um só leva a uma seção — e as seções em
// si, cada uma com `TituloDaSecao`. **Sem número na faixa é decisão dela
// mesma, de 27/08/2026, registrada em PainelPastoral.tsx**: um algarismo
// solto no topo compete com o conteúdo e não diz nada sozinho — "292" não
// explica, a seção explica.
//
// Três seções: "classes" (os cartões), "professores" (o rol de quem
// leciona, com telefone sob pedido — ver comentário na seção) e
// "aniversariantes". Chegou a ter uma quarta, "alunos" — o rol completo,
// 89 nomes — a pedido dela mesma ("todos os matriculados... devem
// aparecer"). Ela viu e voltou atrás: "não quero os nomes todos... apenas
// os que fazem aniversário no mês". `todosOsMatriculados()` continua
// sendo a fonte — só não vira mais lista própria, alimenta unicamente os
// aniversariantes.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, ChevronRight, Plus, Pencil, AlertCircle, FileText, Cake, Users, Phone, Flag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listarClasses, professoresPorClasse, todosOsMatriculados, listarCampanhas, resumoCampanha,
  type EbdClasse, type EbdProfessor, type AlunoMatriculado, type CampanhaEbd, type ResumoCampanha,
} from "@/services/ebdService";
import { formatarTelefoneSemDDI } from "@/lib/telefone";
import { ebdPorClasse, relatorioMensalGeralResumo, type EbdClasseLinha, type RelatorioMensalGeralResumo } from "@/services/ebdPainelService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";
import { Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao } from "@/components/painel/blocos";

/** Nome + idade de um membro ausente — só o que a lista de "clicar pra ver" precisa. */
interface MembroAusente {
  pessoa_id: string;
  nome_completo: string;
  idade: number | null;
}

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  /** Todo mundo que cabe no perfil (idade/gênero), matriculado ou não —
   *  denominador certo da cobertura. */
  qtd_elegiveis: number;
  /** Cabe no perfil e não está matriculado em NENHUMA classe — quem falta
   *  convidar. Alimenta o indicador "fora da EBD". */
  qtd_livres: number;
  /** Só MEMBRO (não congregado), pra faixa mais ausente — pedido dela:
   *  "porcentagem de faixa etária mais ausente da EBD (membros apenas)". */
  membrosAusentes: MembroAusente[];
  membrosElegiveis: number;
  aulasSemChamada: number;
  professores: EbdProfessor[];
}

interface IndicadoresGerais {
  matriculados: number;
  membrosAtivos: number;
  novosAlunosNoMes: number;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const scrollMt = "scroll-mt-[190px] sm:scroll-mt-[150px]";

export default function Ebd() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [classes, setClasses] = useState<ClasseCard[]>([]);
  const [alunos, setAlunos] = useState<AlunoMatriculado[]>([]);
  const [resumoMes, setResumoMes] = useState<RelatorioMensalGeralResumo | null>(null);
  const [gerais, setGerais] = useState<IndicadoresGerais | null>(null);
  const [campanhas, setCampanhas] = useState<(CampanhaEbd & { classe_nome: string | null; resumo: ResumoCampanha | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [classeEditando, setClasseEditando] = useState<EbdClasse | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  // Telefone não aparece de cara — pedido dela: "com opção de ver
  // telefone". Cada linha guarda o próprio estado: revelar o telefone de
  // uma professora não revela o de todas.
  const [telefonesVisiveis, setTelefonesVisiveis] = useState<Set<string>>(new Set());
  // Pedido dela: "para a porcentagem dos ausentes, permita visualizar o
  // nome clicando na informação" — o indicador é só o número; os nomes só
  // aparecem se alguém pedir.
  const [mostrarAusentes, setMostrarAusentes] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativas]);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);

      const [cs, porClasse, professores, mat, resumo, membrosAtivos, novosAlunos] = await Promise.all([
        listarClasses(mostrarInativas),
        ebdPorClasse().catch((): EbdClasseLinha[] => []),
        professoresPorClasse().catch(() => new Map<string, EbdProfessor[]>()),
        todosOsMatriculados().catch(() => []),
        relatorioMensalGeralResumo(hoje.getFullYear(), hoje.getMonth() + 1).catch(() => null),
        // "Adesão": só MEMBRO — pedido dela: "deverá ter apenas MEMBROS".
        // Congregado, visitante e ex-membro ficam fora da conta.
        (async () => {
          const r = await supabase.from("membros").select("id", { count: "exact", head: true })
            .eq("status", "ativo").eq("tipo_pessoa", "membro");
          return r.count ?? 0;
        })().catch(() => 0),
        // "Novos alunos": matrículas ativas abertas desde o dia 1 deste mês,
        // em classe ativa.
        (async () => {
          const r = await supabase.from("ebd_matriculas")
            .select("id, ebd_classes!inner(ativo)", { count: "exact", head: true })
            .eq("ativo", true).eq("ebd_classes.ativo", true)
            .gte("data_matricula", primeiroDiaDoMes);
          return r.count ?? 0;
        })().catch(() => 0),
      ]);
      const semChamadaPorClasse = new Map<string, number>(
        porClasse.map(p => [p.classe_id, p.aulas_sem_chamada]),
      );
      setAlunos(mat);
      setResumoMes(resumo);

      const enriched: ClasseCard[] = [];
      for (const c of cs) {
        const { count: qtdMat } = await supabase
          .from("ebd_matriculas")
          .select("id", { count: "exact", head: true })
          .eq("classe_id", c.id)
          .eq("ativo", true);
        const { data: espsRaw } = await supabase.rpc("esperados_da_classe", { p_classe_id: c.id });
        const esps = (espsRaw as any[] | null) ?? [];
        const soMembros = esps.filter(e => e.tipo_pessoa === "membro");
        enriched.push({
          ...c,
          qtd_matriculados: qtdMat ?? 0,
          qtd_elegiveis: esps.length,
          qtd_livres: esps.filter(e => !e.ja_matriculado && !e.outra_classe_id).length,
          membrosElegiveis: soMembros.length,
          membrosAusentes: soMembros
            .filter(e => !e.ja_matriculado && !e.outra_classe_id)
            .map(e => ({ pessoa_id: e.pessoa_id, nome_completo: e.nome_completo, idade: e.idade })),
          aulasSemChamada: semChamadaPorClasse.get(c.id) ?? 0,
          professores: professores.get(c.id) ?? [],
        });
      }
      setClasses(enriched);
      setGerais({
        matriculados: enriched.reduce((s, c) => s + c.qtd_matriculados, 0),
        membrosAtivos,
        novosAlunosNoMes: novosAlunos,
      });

      // Campanhas de arrecadação — de TODAS as classes, não uma por vez
      // (`listarCampanhas()` sem classeId já devolve todas). "Acompanhamento
      // das campanhas que estão acontecendo nas classes", só as ativas —
      // encerrada não pede acompanhamento.
      const nomeDaClasse = new Map(cs.map(c => [c.id, c.nome]));
      const todasCampanhas = await listarCampanhas().catch((): CampanhaEbd[] => []);
      const ativas = todasCampanhas.filter(c => c.ativo);
      const comResumo = await Promise.all(
        ativas.map(async c => ({
          ...c,
          classe_nome: c.classe_id ? (nomeDaClasse.get(c.classe_id) ?? null) : null,
          resumo: await resumoCampanha(c.id).catch(() => null),
        })),
      );
      setCampanhas(comResumo);
    } finally {
      setLoading(false);
    }
  }

  // "Adesão": fração dos MEMBROS ativos da igreja que estão matriculados
  // em alguma classe — o quanto a EBD alcança da própria igreja, não só de
  // quem já é aluno. Só membro, não congregado — pedido dela.
  const adesao = gerais && gerais.membrosAtivos > 0
    ? Math.round((gerais.matriculados / gerais.membrosAtivos) * 100)
    : null;

  // "Fora da EBD": de quem CABE numa classe pela idade (elegível em
  // alguma faixa), quantos ainda não estão matriculados em NENHUMA —
  // pedido dela: "quantos membros deveriam estar na ebd e nao estão".
  // Soma por classe porque as faixas etárias não se sobrepõem (Berçário
  // 0-3, Crianças 3-8... ver ORDEM_PRIMEIRA_CLASSE_ADULTA em
  // ebdService.ts): cada pessoa elegível cai em no máximo uma classe.
  const foraDaEbd = useMemo(() => {
    const elegiveis = classes.reduce((s, c) => s + c.qtd_elegiveis, 0);
    const livres = classes.reduce((s, c) => s + c.qtd_livres, 0);
    return elegiveis > 0 ? Math.round((livres / elegiveis) * 100) : null;
  }, [classes]);

  // "Faixa etária mais ausente da EBD (membros apenas)": entre as classes
  // com pelo menos um membro elegível, qual tem a MAIOR fração de membros
  // que cabem na faixa e não estão matriculados em nenhuma classe.
  // "Não ficou bom mostrando 100% ausente Crianças... pois fala-se de
  // membros" — ela tinha razão: Crianças tem 1 (UM) membro elegível, e esse
  // único ausente virava "100%" — o mesmo problema de "aula sem chamada"
  // (uma amostra pequena demais produzindo um número que parece grave e não
  // é). MINIMO_ELEGIVEIS corta faixa com gente de menos pra dizer algo —
  // Adultos (90 elegíveis, 64 ausentes) é o achado de verdade que "100%" de
  // 1 pessoa estava escondendo.
  const MINIMO_ELEGIVEIS_PARA_FAIXA_AUSENTE = 5;
  const faixaMaisAusente = useMemo(() => {
    let melhor: { classe: ClasseCard; percentual: number } | null = null;
    for (const c of classes) {
      if (c.membrosElegiveis < MINIMO_ELEGIVEIS_PARA_FAIXA_AUSENTE) continue;
      const percentual = Math.round((c.membrosAusentes.length / c.membrosElegiveis) * 100);
      if (!melhor || percentual > melhor.percentual) melhor = { classe: c, percentual };
    }
    return melhor;
  }, [classes]);

  const aniversariantes = useMemo(() => {
    const mesAtual = new Date().getMonth();
    return alunos
      .filter(a => a.data_nascimento && new Date(a.data_nascimento + "T00:00").getMonth() === mesAtual)
      .sort((a, b) =>
        new Date(a.data_nascimento! + "T00:00").getDate() - new Date(b.data_nascimento! + "T00:00").getDate(),
      );
  }, [alunos]);

  // Rol de professores, todas as classes juntas — derivado do que já foi
  // carregado (cada classe já traz os próprios professores), sem consulta
  // extra ao banco.
  const professoresDoMinisterio = useMemo(() => {
    return classes
      .flatMap(c => c.professores.map(p => ({ ...p, classe_nome: c.nome })))
      .sort((a, b) =>
        (a.membros?.nome_completo ?? "").localeCompare(b.membros?.nome_completo ?? "", "pt-BR"),
      );
  }, [classes]);

  function alternarTelefone(professorId: string) {
    setTelefonesVisiveis(prev => {
      const novo = new Set(prev);
      if (novo.has(professorId)) novo.delete(professorId); else novo.add(professorId);
      return novo;
    });
  }

  function faixaTexto(c: EbdClasse) {
    if (c.idade_min == null && c.idade_max == null) return "Sem faixa";
    if (c.idade_max == null) return `${c.idade_min}+ anos`;
    if (c.idade_min == null) return `até ${c.idade_max} anos`;
    return `${c.idade_min}–${c.idade_max} anos`;
  }

  function generoTexto(g: string) {
    return g === "masculino" ? "Homens"
         : g === "feminino"  ? "Mulheres"
         : "Misto";
  }

  function nomesDosProfessores(profs: EbdProfessor[]): string | null {
    if (profs.length === 0) return null;
    return profs.map(p => p.membros?.nome_completo).filter(Boolean).join(", ");
  }

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Cabeçalho fixo — mesmo padrão do Painel Pastoral ────────────── */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-gold shrink-0" />
            Painel da EBD
          </h1>
          {podeCriar && (
            <Button size="sm" onClick={() => { setClasseEditando(null); setFormOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Nova classe
            </Button>
          )}
        </div>

        <FaixaDeIndicadores colunas={4}>
          <Indicador
            rotulo="Classes" tom="gold" icone={GraduationCap}
            onClick={() => irParaSecao("classes")} descricao="Ir para as classes"
          />
          <Indicador
            rotulo="Professores" tom="info" icone={Users}
            onClick={() => irParaSecao("professores")} descricao="Ir para os professores"
          />
          <Indicador
            rotulo="Campanhas" tom="violeta" icone={Flag}
            onClick={() => irParaSecao("campanhas")} descricao="Ir para as campanhas de arrecadação"
          />
          <Indicador
            rotulo="Aniversariantes" tom="celebracao" icone={Cake}
            onClick={() => irParaSecao("aniversariantes")} descricao="Ir para aniversariantes do mês"
          />
        </FaixaDeIndicadores>

        {/* Pedido dela: "indicadores precisa ser fixo" — os números vitais
            ficam grudados no topo junto com os atalhos, não numa seção que
            rola pra fora de vista. Compactos de propósito: é cabeçalho, não
            o conteúdo principal da tela. */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
          <Stat label="Matriculados" valor={gerais?.matriculados ?? "—"} compacto />
          <Stat
            label="Presença"
            valor={resumoMes?.taxa_presenca != null ? `${resumoMes.taxa_presenca}%` : "—"}
            highlight compacto
          />
          <Stat label="Novos" valor={gerais?.novosAlunosNoMes ?? "—"} compacto />
          <Stat label="Visitantes" valor={resumoMes?.visitantes ?? "—"} compacto />
          <Stat label="Adesão" valor={adesao !== null ? `${adesao}%` : "—"} compacto />
          <Stat label="Fora da EBD" valor={foraDaEbd !== null ? `${foraDaEbd}%` : "—"} compacto />
          <Stat
            label={faixaMaisAusente ? `Ausente: ${faixaMaisAusente.classe.nome}` : "Faixa mais ausente"}
            valor={faixaMaisAusente ? `${faixaMaisAusente.percentual}%` : "—"}
            compacto
            onClick={faixaMaisAusente ? () => setMostrarAusentes(v => !v) : undefined}
          />
        </div>
      </div>

      {/* Os últimos precisam de uma frase — um "%" sozinho não diz o que
          está sendo comparado com o quê. Fica fora do cabeçalho fixo, de
          propósito: é explicação, não algo que precisa estar sempre à
          vista. */}
      <p className="text-xs text-muted-foreground -mt-3">
        <strong>Adesão</strong>: {gerais?.matriculados ?? 0} de {gerais?.membrosAtivos ?? 0} membros ativos da
        igreja estão numa classe.{" "}
        <strong>Fora da EBD</strong>: de quem cabe na faixa etária de alguma classe, quantos ainda não foram
        matriculados em nenhuma.{" "}
        {faixaMaisAusente && (
          <>
            <strong>Faixa mais ausente</strong>: entre as classes com pelo menos {MINIMO_ELEGIVEIS_PARA_FAIXA_AUSENTE} membros
            elegíveis, {faixaMaisAusente.classe.nome} é onde a maior fração ainda não está matriculada —{" "}
            {faixaMaisAusente.classe.membrosAusentes.length} de {faixaMaisAusente.classe.membrosElegiveis} membros
            ({faixaMaisAusente.percentual}%).
          </>
        )}
      </p>

      {/* Pedido dela: "permita visualizar o nome clicando na informação" — os
          nomes só aparecem se alguém clicar no indicador acima. */}
      {mostrarAusentes && faixaMaisAusente && (
        <div className="rounded-lg border bg-card divide-y -mt-2">
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Membros de {faixaMaisAusente.classe.nome} ausentes da EBD ({faixaMaisAusente.classe.membrosAusentes.length})
          </p>
          {faixaMaisAusente.classe.membrosAusentes.map(m => (
            <div key={m.pessoa_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="truncate">{m.nome_completo}</span>
              {m.idade !== null && <span className="text-xs text-muted-foreground shrink-0">{m.idade} anos</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── Classes ──────────────────────────────────────────────────────── */}
      <section id="classes" className={scrollMt}>
        <TituloDaSecao icone={GraduationCap}>Classes</TituloDaSecao>

        <div className="flex items-center justify-between gap-2 mb-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} />
            Mostrar desativadas
          </label>
          <Button asChild size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
            <Link to="/ebd/relatorio-mensal">
              <FileText className="w-3.5 h-3.5" /> Relatório mensal
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const cobertura = c.qtd_elegiveis > 0
              ? Math.round((c.qtd_matriculados / c.qtd_elegiveis) * 100)
              : 0;
            const nomesProf = nomesDosProfessores(c.professores);
            return (
              <Card key={c.id} className={`rounded-lg ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor ?? "#cfa451" }} />
                      <span className="font-medium text-sm truncate">{c.nome}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {!c.ativo && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-warning-soft text-warning-text border-warning-line">
                          Desativada
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {generoTexto(c.genero)}
                      </Badge>
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {faixaTexto(c)}{nomesProf ? ` · ${nomesProf}` : ""}
                  </p>

                  {c.aulasSemChamada > 0 && (
                    <p className="text-xs text-warning-text flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {c.aulasSemChamada} {c.aulasSemChamada === 1 ? "aula" : "aulas"} sem chamada
                    </p>
                  )}

                  <p className="text-xs">
                    <strong>{c.qtd_matriculados}</strong> matriculado{c.qtd_matriculados === 1 ? "" : "s"}
                    <span className="text-muted-foreground"> · {cobertura}% do perfil</span>
                  </p>

                  <div className="flex gap-1.5 pt-0.5">
                    <Button asChild size="sm" className="flex-1 gap-1.5 h-7 text-xs bg-gold hover:bg-gold/90 text-white border-0">
                      <Link to={`/ebd/${c.id}/chamada`}>
                        <GraduationCap className="w-3.5 h-3.5" /> Chamada
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-7 w-7 p-0" title="Abrir classe">
                      <Link to={`/ebd/${c.id}`}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                    {podeCriar && (
                      <Button
                        type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                        onClick={(e) => { e.preventDefault(); setClasseEditando(c); setFormOpen(true); }}
                        title="Editar classe"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Professores ──────────────────────────────────────────────────── */}
      <section id="professores" className={scrollMt}>
        <TituloDaSecao icone={Users} tom="info" contagem={professoresDoMinisterio.length}>
          Professores
        </TituloDaSecao>

        {professoresDoMinisterio.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma classe tem professor cadastrado ainda.
          </p>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {professoresDoMinisterio.map(p => {
              const telefoneVisivel = telefonesVisiveis.has(p.id);
              const telefone = p.membros?.telefone_celular ?? null;
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.membros?.nome_completo ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.classe_nome}{p.tipo !== "principal" ? ` · ${p.tipo}` : ""}
                    </p>
                  </div>
                  {telefone ? (
                    telefoneVisivel ? (
                      <a
                        href={`https://wa.me/${telefone.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-success-text shrink-0 flex items-center gap-1 hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" /> {formatarTelefoneSemDDI(telefone)}
                      </a>
                    ) : (
                      <Button
                        type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => alternarTelefone(p.id)}
                      >
                        <Phone className="w-3.5 h-3.5" /> Ver telefone
                      </Button>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">Sem telefone</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Campanhas de arrecadação ─────────────────────────────────────── */}
      <section id="campanhas" className={scrollMt}>
        <TituloDaSecao icone={Flag} tom="violeta" contagem={campanhas.length}>
          Campanhas de arrecadação em andamento
        </TituloDaSecao>

        {campanhas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma campanha de arrecadação ativa no momento.
          </p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {campanhas.map(c => {
              const meta = c.resumo?.meta ?? c.meta_valor;
              const arrecadado = c.resumo?.arrecadado ?? 0;
              const pct = meta > 0 ? Math.min(100, Math.round((arrecadado / meta) * 100)) : 0;
              const conteudo = (
                <Card className="rounded-lg">
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{c.nome}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {c.classe_nome ?? "Igreja toda"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Até {new Date(c.data_fim + "T00:00").toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-xs">
                      <strong>{arrecadado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                      <span className="text-muted-foreground">
                        {" "}de {meta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {pct}%
                      </span>
                    </p>
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-violeta/80" style={{ width: `${pct}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
              return c.classe_id ? (
                <Link key={c.id} to={`/ebd/${c.classe_id}/campanhas`} className="block">{conteudo}</Link>
              ) : (
                <div key={c.id}>{conteudo}</div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Aniversariantes do mês ──────────────────────────────────────── */}
      <section id="aniversariantes" className={scrollMt}>
        <TituloDaSecao icone={Cake} tom="celebracao" contagem={aniversariantes.length}>
          Aniversariantes de {MESES[new Date().getMonth()]}
        </TituloDaSecao>

        {aniversariantes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum aluno matriculado faz aniversário este mês.
          </p>
        ) : (
          <div className="rounded-lg border bg-card divide-y">
            {aniversariantes.map(a => {
              const dia = new Date(a.data_nascimento! + "T00:00").getDate();
              return (
                <div key={a.pessoa_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-celebracao-text tabular-nums w-14 shrink-0">
                    {dia} {MESES_ABREV[new Date().getMonth()]}
                  </span>
                  <span className="truncate flex-1">{a.nome_completo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{a.classe_nome}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ClasseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        classe={classeEditando}
        onSaved={carregar}
      />
    </div>
  );
}

function Stat({ label, valor, highlight, compacto, onClick }: {
  label: string; valor: number | string; highlight?: boolean; compacto?: boolean; onClick?: () => void;
}) {
  const classes = `border rounded-md text-center w-full ${compacto ? "py-1 px-1" : "py-2 px-2"} ${highlight ? "border-gold bg-gold/5" : ""} ${onClick ? "hover:bg-muted transition-colors cursor-pointer" : ""}`;
  const conteudo = (
    <>
      <p className={`font-semibold tabular-nums ${highlight ? "text-gold" : ""} ${compacto ? "text-sm" : "text-lg"}`}>
        {valor}
      </p>
      <p className={`uppercase tracking-wide text-muted-foreground truncate ${compacto ? "text-[9px]" : "text-[10px]"}`}>
        {label}
      </p>
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className={classes}>{conteudo}</button>;
  }
  return <div className={classes}>{conteudo}</div>;
}
