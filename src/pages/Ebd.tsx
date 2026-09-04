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
  GraduationCap, ChevronRight, ChevronDown, Plus, Pencil, AlertCircle, FileText, Cake, Users, Phone, Flag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listarClasses, professoresPorClasse, todosOsMatriculados, listarCampanhas, resumoCampanha,
  novasMatriculasDoMes, visitantesDoMes, relatorioMensalFrequencia,
  type EbdClasse, type EbdProfessor, type AlunoMatriculado, type CampanhaEbd, type ResumoCampanha,
  type NovaMatricula, type VisitanteEbd, type FrequenciaAluno,
} from "@/services/ebdService";
import { formatarTelefoneSemDDI } from "@/lib/telefone";
import { ebdPorClasse, relatorioMensalGeralResumo, type EbdClasseLinha, type RelatorioMensalGeralResumo } from "@/services/ebdPainelService";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { useAuth } from "@/hooks/useAuth";
import { PaginaSkeleton } from "@/components/ListState";
import { Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao } from "@/components/painel/blocos";

/** Nome + idade de quem está ausente — só o que a lista de "clicar pra ver" precisa. */
interface PessoaAusente {
  pessoa_id: string;
  nome_completo: string;
  idade: number | null;
}

interface ClasseCard extends EbdClasse {
  qtd_matriculados: number;
  /** Todo mundo que cabe no perfil (idade/gênero), matriculado ou não —
   *  denominador certo da cobertura. Membro + congregado + visitante da
   *  EBD (quem já apareceu numa aula) — pedido dela: "volte a considerar
   *  MEMBROS + CONGREGADOS + VISITANTES DA EBD". */
  qtd_elegiveis: number;
  /** Do mesmo público de `qtd_elegiveis`, cabe no perfil e não está
   *  matriculado em NENHUMA classe — alimenta o painel "fora da EBD" por
   *  faixa etária (pedido dela: "liste os nomes, classificados pela faixa
   *  etária"). */
  pessoasAusentes: PessoaAusente[];
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
  const [frequenciaAlunos, setFrequenciaAlunos] = useState<(FrequenciaAluno & { classe_nome: string })[]>([]);
  const [novosLista, setNovosLista] = useState<NovaMatricula[]>([]);
  const [visitantesLista, setVisitantesLista] = useState<VisitanteEbd[]>([]);
  // Pedido dela: "coloque link para os indicadores" — só um painel aberto
  // por vez, senão a tela vira quatro listas empilhadas de uma vez.
  const [painelAberto, setPainelAberto] = useState<"presenca" | "novos" | "visitantes" | "foraDaEbd" | null>(null);
  // "Não ficou bom a lista de nomes" — os nomes de "Fora da EBD" ficam
  // escondidos por padrão, um acordeão por classe (mesmo padrão do "Ver
  // telefone"), não uma parede de nomes de cara.
  const [classesForaDaEbdAbertas, setClassesForaDaEbdAbertas] = useState<Set<string>>(new Set());

  useEffect(() => { carregar(); }, [mostrarInativas]);

  async function carregar() {
    setLoading(true);
    try {
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth() + 1;

      const [cs, porClasse, professores, mat, resumo, membrosAtivos, novos, visitantes] = await Promise.all([
        listarClasses(mostrarInativas),
        ebdPorClasse().catch((): EbdClasseLinha[] => []),
        professoresPorClasse().catch(() => new Map<string, EbdProfessor[]>()),
        todosOsMatriculados().catch(() => []),
        relatorioMensalGeralResumo(ano, mes).catch(() => null),
        // "Adesão": só MEMBRO — pedido dela: "deverá ter apenas MEMBROS".
        // Congregado, visitante e ex-membro ficam fora da conta.
        (async () => {
          const r = await supabase.from("membros").select("id", { count: "exact", head: true })
            .eq("status", "ativo").eq("tipo_pessoa", "membro");
          return r.count ?? 0;
        })().catch(() => 0),
        // "Novos: moste os novos" e "Visitantes: mostre os visitantes da
        // ebd" — as listas já vêm prontas; a contagem é só o tamanho delas,
        // não uma consulta à parte.
        novasMatriculasDoMes(ano, mes).catch((): NovaMatricula[] => []),
        visitantesDoMes(ano, mes).catch((): VisitanteEbd[] => []),
      ]);
      const semChamadaPorClasse = new Map<string, number>(
        porClasse.map(p => [p.classe_id, p.aulas_sem_chamada]),
      );
      setAlunos(mat);
      setResumoMes(resumo);
      setNovosLista(novos);
      setVisitantesLista(visitantes);

      const enriched: ClasseCard[] = [];
      for (const c of cs) {
        const { count: qtdMat } = await supabase
          .from("ebd_matriculas")
          .select("id", { count: "exact", head: true })
          .eq("classe_id", c.id)
          .eq("ativo", true);
        const { data: espsRaw } = await supabase.rpc("esperados_da_classe", { p_classe_id: c.id });
        // Membro + congregado + visitante da EBD (a própria RPC já traz só
        // essas três) — pedido dela: "volte a considerar MEMBROS +
        // CONGREGADOS + VISITANTES DA EBD".
        const esps = (espsRaw as any[] | null) ?? [];
        enriched.push({
          ...c,
          qtd_matriculados: qtdMat ?? 0,
          qtd_elegiveis: esps.length,
          pessoasAusentes: esps
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
        novosAlunosNoMes: novos.length,
      });

      // "Presença: mostre dos mais presentes para os mais ausentes" — taxa
      // de frequência de cada aluno no mês, juntando todas as classes
      // ativas. Uma chamada por classe (poucas classes, não vale montar
      // outra RPC "geral" só pra isso).
      const nomeDaClassePorId = new Map(cs.map(c => [c.id, c.nome]));
      const ativas = cs.filter(c => c.ativo);
      const porAluno = await Promise.all(
        ativas.map(c =>
          relatorioMensalFrequencia(c.id, ano, mes)
            .then(lista => lista.map(f => ({ ...f, classe_nome: nomeDaClassePorId.get(c.id) ?? "—" })))
            .catch((): (FrequenciaAluno & { classe_nome: string })[] => []),
        ),
      );
      // Sem chamada no mês = taxa nula, não zero — não dá pra dizer que
      // faltou quem nunca teve chamada pra faltar. Esses ficam por último,
      // não no topo dos "mais ausentes".
      setFrequenciaAlunos(
        porAluno.flat().sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1)),
      );

      // Campanhas de arrecadação — de TODAS as classes, não uma por vez
      // (`listarCampanhas()` sem classeId já devolve todas). "Acompanhamento
      // das campanhas que estão acontecendo nas classes", só as ativas —
      // encerrada não pede acompanhamento.
      const nomeDaClasse = new Map(cs.map(c => [c.id, c.nome]));
      const todasCampanhas = await listarCampanhas().catch((): CampanhaEbd[] => []);
      const campanhasAtivas = todasCampanhas.filter(c => c.ativo);
      const comResumo = await Promise.all(
        campanhasAtivas.map(async c => ({
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

  // Classes com pelo menos uma pessoa elegível — base do painel "fora da
  // EBD" por faixa etária (clique no indicador).
  const classesComElegiveis = useMemo(
    () => classes.filter(c => c.qtd_elegiveis > 0),
    [classes],
  );

  // "Fora da ebd tem um problema... mostra quem não está matriculado...
  // mas deveríamos verificar tbm quem está matriculado, mas faltando" —
  // ela tinha razão: matriculado que nunca aparece está tão fora da EBD
  // quanto quem nunca se matriculou. Taxa 0% (com chamada no mês) é "não
  // apareceu nenhuma vez" — taxa nula (sem chamada no mês) não entra aqui,
  // não dá pra dizer que faltou quem não teve chamada.
  const faltandoPorClasse = useMemo(() => {
    const mapa = new Map<string, (FrequenciaAluno & { classe_nome: string })[]>();
    for (const f of frequenciaAlunos) {
      if (f.taxa !== 0) continue;
      const lista = mapa.get(f.classe_nome) ?? [];
      lista.push(f);
      mapa.set(f.classe_nome, lista);
    }
    return mapa;
  }, [frequenciaAlunos]);

  // "Fora da EBD": de quem CABE numa classe pela idade — membro, congregado
  // ou visitante da EBD (pedido dela: "volte a considerar MEMBROS +
  // CONGREGADOS + VISITANTES DA EBD"). Pedido dela em cima do painel: "em
  // colunas: elegíveis - matriculados = % de ausentes (soma das
  // ausências)" — ausente aqui é as DUAS coisas somadas: quem nunca se
  // matriculou em classe nenhuma E quem está matriculado nesta classe mas
  // não apareceu a nenhuma aula com chamada no mês. Soma por classe
  // porque as faixas etárias não se sobrepõem (Berçário 0-3, Crianças
  // 3-8... ver ORDEM_PRIMEIRA_CLASSE_ADULTA em ebdService.ts): cada
  // pessoa elegível cai em no máximo uma classe.
  const foraDaEbd = useMemo(() => {
    const elegiveis = classes.reduce((s, c) => s + c.qtd_elegiveis, 0);
    const ausentes = classes.reduce(
      (s, c) => s + c.pessoasAusentes.length + (faltandoPorClasse.get(c.nome)?.length ?? 0),
      0,
    );
    return elegiveis > 0 ? Math.round((ausentes / elegiveis) * 100) : null;
  }, [classes, faltandoPorClasse]);

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

  function alternarClasseForaDaEbd(classeId: string) {
    setClassesForaDaEbdAbertas(prev => {
      const novo = new Set(prev);
      if (novo.has(classeId)) novo.delete(classeId); else novo.add(classeId);
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          <Stat label="Matriculados" valor={gerais?.matriculados ?? "—"} compacto />
          <Stat
            label="Presença"
            valor={resumoMes?.taxa_presenca != null ? `${resumoMes.taxa_presenca}%` : "—"}
            highlight compacto
            onClick={() => setPainelAberto(p => p === "presenca" ? null : "presenca")}
          />
          <Stat
            label="Novos" valor={gerais?.novosAlunosNoMes ?? "—"} compacto
            onClick={() => setPainelAberto(p => p === "novos" ? null : "novos")}
          />
          <Stat
            label="Visitantes" valor={resumoMes?.visitantes ?? "—"} compacto
            onClick={() => setPainelAberto(p => p === "visitantes" ? null : "visitantes")}
          />
          <Stat label="Adesão" valor={adesao !== null ? `${adesao}%` : "—"} compacto />
          <Stat
            label="Fora da EBD" valor={foraDaEbd !== null ? `${foraDaEbd}%` : "—"} compacto
            onClick={() => setPainelAberto(p => p === "foraDaEbd" ? null : "foraDaEbd")}
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
        <strong>Fora da EBD</strong>: de quem cabe na faixa etária de alguma classe (membros, congregados e
        visitantes da EBD), quantos nunca se matricularam ou estão matriculados mas não apareceram este mês.
        Clique em Presença, Novos, Visitantes ou Fora da EBD para ver o detalhe.
      </p>

      {/* Pedido dela: "coloque link para os indicadores" — cada painel abre
          sob o indicador clicado, um de cada vez. */}
      {painelAberto === "presenca" && (
        <div className="rounded-lg border bg-card divide-y -mt-2">
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Presença no mês — dos mais presentes para os mais ausentes ({frequenciaAlunos.length})
          </p>
          {frequenciaAlunos.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sem chamadas registradas este mês.</p>
          ) : frequenciaAlunos.map(f => (
            <div key={`${f.pessoa_id}-${f.classe_nome}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">{f.nome_completo}</p>
                <p className="text-xs text-muted-foreground truncate">{f.classe_nome}</p>
              </div>
              <span className="text-xs tabular-nums shrink-0">
                {f.taxa === null ? (
                  <span className="text-muted-foreground">sem chamada no mês</span>
                ) : (
                  <>
                    <strong>{f.taxa}%</strong>{" "}
                    <span className="text-muted-foreground">({f.presencas}/{f.oportunidades})</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {painelAberto === "novos" && (
        <div className="rounded-lg border bg-card divide-y -mt-2">
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Novas matrículas do mês ({novosLista.length})
          </p>
          {novosLista.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Nenhuma matrícula nova este mês.</p>
          ) : novosLista.map(n => (
            <div key={n.pessoa_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">{n.nome_completo}</p>
                <p className="text-xs text-muted-foreground truncate">{n.classe_nome}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(n.data_matricula + "T00:00").toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}

      {painelAberto === "visitantes" && (
        <div className="rounded-lg border bg-card divide-y -mt-2">
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Visitantes da EBD no mês ({visitantesLista.length})
          </p>
          {visitantesLista.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Nenhum visitante registrado este mês.</p>
          ) : visitantesLista.map((v, i) => (
            <div key={`${v.pessoa_id}-${v.data}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">{v.nome_completo}</p>
                <p className="text-xs text-muted-foreground truncate">{v.classe_nome}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(v.data + "T00:00").toLocaleDateString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}

      {painelAberto === "foraDaEbd" && (
        <div className="rounded-lg border bg-card divide-y -mt-2">
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Fora da EBD, por faixa etária — membros, congregados e visitantes da EBD, da mais nova para a mais
            velha. Ausentes = nunca se matriculou + está matriculado mas não apareceu este mês. Clique numa classe
            para ver os nomes.
          </p>
          {classesComElegiveis.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sem faixas com gente elegível.</p>
          ) : classesComElegiveis.map(c => {
            const faltando = faltandoPorClasse.get(c.nome) ?? [];
            // "elegíveis - matriculados = % de ausentes (soma das
            // ausências)" — pedido dela, em cima do painel: as colunas
            // fecham a conta em vez de deixar a subtração implícita.
            const ausentesTotal = c.pessoasAusentes.length + faltando.length;
            const matriculadosEfetivos = c.qtd_elegiveis - ausentesTotal;
            const pct = Math.round((ausentesTotal / c.qtd_elegiveis) * 100);
            const aberto = classesForaDaEbdAbertas.has(c.id);
            return (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => alternarClasseForaDaEbd(c.id)}
                  className="w-full px-3 py-2 space-y-1.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-sm truncate block">{c.nome}</span>
                      <span className="text-xs text-muted-foreground">{faixaTexto(c)}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${aberto ? "rotate-180" : ""}`} />
                  </span>
                  <span className="grid grid-cols-3 gap-1 text-center">
                    <span className="block">
                      <span className="block text-sm font-semibold tabular-nums">{c.qtd_elegiveis}</span>
                      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">Elegíveis</span>
                    </span>
                    <span className="block">
                      <span className="block text-sm font-semibold tabular-nums">{matriculadosEfetivos}</span>
                      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">Matriculados</span>
                    </span>
                    <span className="block">
                      <span className="block text-sm font-semibold tabular-nums text-warning-text">{pct}%</span>
                      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                        Ausentes ({ausentesTotal})
                      </span>
                    </span>
                  </span>
                </button>

                {aberto && (
                  <div className="px-3 pb-3 space-y-2 border-t pt-2 bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      {c.qtd_elegiveis} elegíveis − {matriculadosEfetivos} matriculados de verdade ={" "}
                      {ausentesTotal} ausentes ({pct}%): {c.pessoasAusentes.length} nunca se matricularam
                      {faltando.length > 0 && <> e {faltando.length} estão matriculados mas não apareceram este mês</>}.
                    </p>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nunca matriculados</p>
                      {c.pessoasAusentes.length === 0 ? (
                        <p className="text-xs text-success-text">Todos os elegíveis estão matriculados.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {c.pessoasAusentes.map(m => (
                            <div key={m.pessoa_id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{m.nome_completo}</span>
                              {m.idade !== null && <span className="shrink-0">{m.idade} anos</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Matriculados, mas não apareceram este mês
                      </p>
                      {faltando.length === 0 ? (
                        <p className="text-xs text-success-text">Nenhum matriculado com 0% de presença este mês.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {faltando.map(f => (
                            <div key={f.pessoa_id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{f.nome_completo}</span>
                              <span className="shrink-0">0/{f.oportunidades} aulas</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

                  {/* Pedido dela, no print do cartão: "crie botoes visuais:
                      abrir - editar classe - chamada" — o ">" e o lápis
                      sozinhos não diziam o que faziam; os três agora têm
                      ícone + rótulo, não só ícone com tooltip. */}
                  <div className="flex gap-1.5 pt-0.5">
                    <Button asChild size="sm" className="flex-1 gap-1.5 h-8 text-xs bg-gold hover:bg-gold/90 text-white border-0">
                      <Link to={`/ebd/${c.id}/chamada`}>
                        <GraduationCap className="w-3.5 h-3.5" /> Chamada
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs px-2.5">
                      <Link to={`/ebd/${c.id}`}>
                        <ChevronRight className="w-3.5 h-3.5" /> Abrir
                      </Link>
                    </Button>
                    {podeCriar && (
                      <Button
                        type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs px-2.5"
                        onClick={(e) => { e.preventDefault(); setClasseEditando(c); setFormOpen(true); }}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
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
