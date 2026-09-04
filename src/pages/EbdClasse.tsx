// ─── EbdClasse.tsx — Detalhe de uma classe ─────────────────────────────────
import { useEffect, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, UserPlus, UserMinus, Users, GraduationCap, Search, Pencil, Trash2,
  PowerOff, RotateCcw, ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarClasse, esperadosDaClasse, matriculadosDaClasse, moverParaClasse,
  alertasIdadeDaClasse, temProgressaoPorIdade, manterNaClasse, listarClasses,
  type EbdAlertaIdade,
  matricular, desmatricular, excluirClasse, desativarClasse, reativarClasse,
  type EbdClasse, type EbdEsperado,
} from "@/services/ebdService";
import { supabase } from "@/integrations/supabase/client";
import { ClasseForm } from "@/components/ebd/ClasseForm";
import { ProfessoresBloco } from "@/components/ebd/ProfessoresBloco";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PaginaSkeleton } from "@/components/ListState";

interface MatRow {
  id: string;
  data_matricula: string;
  pessoa_id: string;
  membros: { id: string; nome_completo: string; sexo: string | null; data_nascimento: string | null } | null;
}

function calcIdade(dn: string | null): number | null {
  if (!dn) return null;
  return Math.floor((Date.now() - new Date(dn).getTime()) / (365.25 * 86_400_000));
}

export default function EbdClasse() {
  const { classeId = "" } = useParams();
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [esperados, setEsperados] = useState<EbdEsperado[]>([]);
  /** Quem está prestes a ser trazido de outra classe. Null = diálogo fechado. */
  const [aMover, setAMover] = useState<EbdEsperado | null>(null);
  /** Alunos DESTA classe que passaram do teto de idade dela. */
  const [alertasIdade, setAlertasIdade] = useState<EbdAlertaIdade[]>([]);
  const [progredindo, setProgredindo] = useState<string | null>(null);
  /** Nome de cada classe, para dizer PARA ONDE o aluno vai. A view devolve
   *  só o id da sugerida. */
  const [nomeClassePorId, setNomeClassePorId] = useState<Record<string, string>>({});
  const [matriculados, setMatriculados] = useState<MatRow[]>([]);

  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const { hasRole } = useAuth();
  const podeEditar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const navigate = useNavigate();

  useEffect(() => { recarregar(); }, [classeId]);

  async function recarregar() {
    if (!classeId) return;
    setLoading(true);
    try {
      const c = await carregarClasse(classeId);
      setClasse(c);
      const [esp, mat, alertas, todasAsClasses] = await Promise.all([
        esperadosDaClasse(classeId),
        matriculadosDaClasse(classeId) as Promise<MatRow[]>,
        alertasIdadeDaClasse(classeId),
        listarClasses(true),
      ]);
      setEsperados(esp);
      setMatriculados(mat);
      setAlertasIdade(alertas);
      setNomeClassePorId(Object.fromEntries(todasAsClasses.map(c => [c.id, c.nome])));

      // A lista de "sem classe" saiu daqui em 20/08/2026.
      //
      // Ela trazia TODA pessoa ativa que não estava nesta classe nem na faixa
      // dela — 277 nomes na tela do Berçário, entre eles adultos e idosos.
      // Nenhum deles tem qualquer relação com uma classe de 0 a 3 anos.
      //
      // Quem abre a ficha de uma classe pergunta "quem é desta classe?".
      // Uma lista de 277 pessoas que NÃO são responde outra pergunta, e
      // ainda custava uma consulta a todos os membros a cada abertura.
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar classe");
    } finally {
      setLoading(false);
    }
  }

  async function handleMatricular(pessoaId: string) {
    setBusy(true);
    try {
      await matricular(pessoaId, classeId);
      toast.success("Matrícula registrada");
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao matricular");
    } finally { setBusy(false); }
  }

  /**
   * Trazer para cá quem já está em outra classe.
   *
   * Não é o mesmo que matricular: o índice único do banco é
   * `(pessoa_id, classe_id)`, então um INSERT deixaria a pessoa ATIVA nas
   * duas classes — em duas listas de chamada, contada duas vezes.
   *
   * `moverParaClasse` chama a RPC `mover_aluno_classe`, que já existia no
   * banco e encerra a anterior e cria a nova na mesma transação. Cheguei a
   * criar uma segunda função para isso antes de conferir — ver a migration
   * 20260828230000, que a apaga.
   */
  async function handleMover() {
    if (!aMover) return;
    setBusy(true);
    try {
      await moverParaClasse(aMover.pessoa_id, classeId);
      toast.success(`${aMover.nome_completo} veio para esta classe`);
      setAMover(null);
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao mover");
    } finally { setBusy(false); }
  }

  async function handleDesativarClasse() {
    if (!classe) return;
    setBusy(true);
    try {
      await desativarClasse(classe.id);
      toast.success("Classe desativada — mantida no histórico");
      navigate("/ebd");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao desativar");
    } finally { setBusy(false); }
  }

  async function handleReativarClasse() {
    if (!classe) return;
    setBusy(true);
    try {
      await reativarClasse(classe.id);
      toast.success("Classe reativada");
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao reativar");
    } finally { setBusy(false); }
  }

  async function handleExcluirClasse() {
    if (!classe) return;
    setBusy(true);
    try {
      await excluirClasse(classe.id);
      toast.success("Classe excluída");
      navigate("/ebd");
    } catch (e: any) {
      // Erro do trigger é vindo como mensagem
      toast.error(e?.message ?? "Erro ao excluir");
    } finally { setBusy(false); }
  }

  /**
   * As duas saídas de quem passou da faixa: subir ou ficar.
   *
   * "Manter" grava `progressao_dispensada_em` e é o que faz o aviso sumir.
   * Sem ele o alerta reaparece para sempre — e alerta que não some vira
   * paisagem, até o dia em que aparece alguém que precisa mudar e ninguém
   * repara. A idade é regra, não sentença: há o adolescente que fica mais um
   * ano com a turma onde tem amigos.
   */
  async function handleManterNaClasse(a: EbdAlertaIdade) {
    setProgredindo(a.pessoa_id);
    const r = await manterNaClasse(a.pessoa_id);
    setProgredindo(null);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível registrar a decisão.");
    toast.success(`${a.nome_completo} continua nesta classe.`);
    await recarregar();
  }

  async function handleProgredir(a: EbdAlertaIdade) {
    if (!a.classe_sugerida_id) return;
    setProgredindo(a.pessoa_id);
    try {
      await moverParaClasse(a.pessoa_id, a.classe_sugerida_id);
      toast.success(`${a.nome_completo} mudou de classe.`);
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao mover");
    } finally { setProgredindo(null); }
  }

  async function handleDesmatricular(matriculaId: string) {
    setBusy(true);
    try {
      await desmatricular(matriculaId);
      toast.success("Pessoa removida da classe");
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (loading) {
    return <PaginaSkeleton />;
  }

  if (!classe) {
    return <div className="p-8 text-center text-muted-foreground">
      Classe não encontrada. <Link to="/ebd" className="text-primary underline">Voltar</Link>
    </div>;
  }

  const filtroLower = filtro.trim().toLowerCase();
  // "Esperados" passa a ser só quem AINDA NÃO está matriculado aqui.
  //
  // Antes a lista trazia os dois, e quem já estava dentro vinha com etiqueta
  // "Matriculado" e sem botão — ocupando espaço para repetir o que a aba ao
  // lado já diz. No Berçário, "Esperados (1)" e "Matriculados (1)" eram a
  // mesma Laura, e a aba sugeria trabalho onde não havia nenhum.
  //
  // Agora a aba responde uma pergunta só: quem falta chamar.
  const espFiltrados = esperados
    .filter(e => !e.ja_matriculado)
    .filter(e => e.nome_completo.toLowerCase().includes(filtroLower));

  // Quem cabe aqui e não está em classe nenhuma — os que dependem só de um
  // clique. Separado de `espFiltrados` porque são perguntas diferentes:
  // a aba mostra TODO MUNDO que cabe, o cartão conta quem falta acolher.
  const semClasse = esperados.filter(e => !e.ja_matriculado && !e.outra_classe_id);

  // Os que já têm classe, DENTRO do que a busca deixou passar: a frase que
  // abre a conta precisa somar com a lista que está na tela, e não com a
  // lista inteira.
  const emOutraClasse = espFiltrados.filter(e => e.outra_classe_id);
  /** Quem falta acolher, já filtrado pela busca. É este o número da aba. */
  const semClasseFiltrados = espFiltrados.length - emOutraClasse.length;

  // Todos que cabem no perfil, dentro e fora. É o denominador que dá sentido
  // aos outros dois números.
  const noPerfil = esperados.length;

  /**
   * Por que alguém matriculado pode estar fora do perfil da classe.
   *
   * "Matriculados + Esperados" nem sempre fecha com "No perfil", e a razão é
   * real: existe gente matriculada que não caberia hoje. Na Classe Isac
   * Rodrigues (40–99 anos, homens) há um aluno de 36 — entrou pelo botão
   * "Matricular mesmo assim" da antiga aba "Sem classe", que saiu daqui.
   *
   * Isso não é erro a esconder nem linha a remover: pode ser decisão da
   * igreja. Mas precisa aparecer, senão a aritmética da tela fica sem
   * explicação e ninguém percebe que alguém está na classe errada. O painel
   * já sinaliza o mesmo caso em "Alunos fora da faixa EBD".
   */
  function foraDoPerfil(
    nasc: string | null | undefined,
    sexo: string | null | undefined,
  ): { tipo: "idade" | "sexo" | "sem_data"; texto: string } | null {
    if (!classe) return null;
    // O SEXO vem primeiro agora. Antes, a falta de data de nascimento
    // devolvia cedo e escondia o desencontro de sexo: um homem sem data na
    // Classe Professora Edna aparecia como "sem data de nascimento", que é
    // verdade e não é o problema dele ali.
    if (classe.genero !== "misto" && sexo && sexo !== classe.genero) {
      return { tipo: "sexo", texto: String(sexo) };
    }
    if (!nasc) return { tipo: "sem_data", texto: "sem data de nascimento" };
    const idade = calcIdade(nasc);
    if (idade === null) return { tipo: "sem_data", texto: "sem data de nascimento" };
    if (classe.idade_min !== null && idade < classe.idade_min) return { tipo: "idade", texto: idade + " anos" };
    if (classe.idade_max !== null && idade > classe.idade_max) return { tipo: "idade", texto: idade + " anos" };
    return null;
  }
  const matFiltrados = matriculados.filter(m => m.membros?.nome_completo.toLowerCase().includes(filtroLower));

  /**
   * O aviso de progressão, por aluno — e só nas classes da escada.
   *
   * Ele morava no painel do módulo, longe de quem dá aula. Passou para a
   * matrícula porque é a professora daquela turma quem decide se o aluno sobe
   * ou fica, e ela abre a lista de chamada, não o índice da EBD.
   *
   * `temProgressaoPorIdade` corta de Adultos em diante: lá a idade não decide
   * mais a classe, e o aviso seria ruído permanente para quem nunca vai mudar.
   * Ver a constante no ebdService, com as ordens medidas.
   */
  const avisaProgressao = !!classe && temProgressaoPorIdade(classe);
  const alertaPorPessoa: Record<string, EbdAlertaIdade> = avisaProgressao
    ? Object.fromEntries(alertasIdade.map(a => [a.pessoa_id, a]))
    : {};


  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon"><Link to="/ebd"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <div>
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-gold" />
              {classe.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              {classe.idade_min ?? 0}–{classe.idade_max ?? "+"} anos · {classe.genero === "misto" ? "Misto" : classe.genero === "feminino" ? "Mulheres" : "Homens"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* "Fazer chamada" é a ação de todo domingo — mesma ênfase (dourado,
              cheia) que já ganhou nos cartões do índice de classes; o resto
              aqui é ocasional (editar, relatório, campanhas), por isso fica
              em contorno, sem competir com ela. */}
          <Button asChild size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white border-0">
            <Link to={`/ebd/${classeId}/chamada`}>
              <GraduationCap className="w-3.5 h-3.5" /> Fazer chamada
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/ebd/${classeId}/relatorio-mensal`}>Relatório mensal</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/ebd/${classeId}/campanhas`}>Campanhas</Link>
          </Button>
          {podeEditar && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
              {classe.ativo ? (
                <Button variant="outline" size="sm" onClick={() => setConfirmDeactivate(true)} className="gap-1.5 text-warning-text hover:text-warning-text" title="Mantém no histórico, oculta da lista padrão">
                  <PowerOff className="w-3.5 h-3.5" /> Desativar
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleReativarClasse} disabled={busy} className="gap-1.5 text-success-text hover:text-success-text" title="Volta a aparecer na lista de classes ativas">
                  <RotateCcw className="w-3.5 h-3.5" /> Reativar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1.5 text-destructive hover:text-destructive" title="Apaga permanentemente — bloqueado se houver matriculados ou aulas">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Professores */}
      <ProfessoresBloco classeId={classeId} />

      {/* Filtro */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar pessoa por nome..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      {/* "Sem classe seriam os esperados" — ela notou: o cartão "Matriculados"
          e o cartão "Sem classe" só repetiam os números que já aparecem nos
          rótulos das abas logo abaixo (Matriculados (N) / Esperados (N)).
          Os 3 cartões de estatística saíram; "No perfil da classe" — o
          único que não duplicava nada — virou esta frase, o denominador
          por escrito em vez de um cartão à parte. */}
      <p className="text-xs text-muted-foreground -mt-1">
        <strong>{noPerfil}</strong> pessoas cabem no perfil desta classe (idade/gênero) — entre matriculadas
        aqui, matriculadas em outra classe, ou ainda sem classe nenhuma.
      </p>

      {/* Abas */}
      <Tabs defaultValue="matriculados" className="space-y-3">
        <TabsList>
          <TabsTrigger value="matriculados">Matriculados ({matFiltrados.length})</TabsTrigger>
          {/* ── O número conta quem FALTA, não quantas linhas há ──────────
              Eu tinha feito o contrário: o rótulo somava as linhas listadas,
              incluindo quem já está em outra classe, para o número nunca
              discordar da lista.

              Corrigido a pedido, e a razão é melhor que a minha: quem já tem
              classe não é trabalho pendente. Somá-lo faz a aba anunciar um
              esforço que não existe — e é justamente o número de quem está
              SEM classe que a professora usa para saber quanto falta.

              O rótulo não fica mentindo porque a frase logo abaixo diz, com
              todas as letras, que a lista traz também os já alocados. */}
          <TabsTrigger value="esperados">Esperados ({semClasseFiltrados})</TabsTrigger>
        </TabsList>

        {/* Matriculados */}
        <TabsContent value="matriculados" className="space-y-2">
          {matFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum matriculado ainda. Use a aba "Esperados" para matricular alunos.
            </p>
          )}
          {matFiltrados.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <NomePessoa
                    id={m.pessoa_id}
                    nome={m.membros?.nome_completo}
                    className="font-medium block"
                  />
                  <p className="text-xs text-muted-foreground">
                    {calcIdade(m.membros?.data_nascimento ?? null) ?? "?"} anos
                    {m.membros?.sexo && ` · ${m.membros.sexo}`}
                    {" · matriculado em "}{new Date(m.data_matricula).toLocaleDateString("pt-BR")}
                  </p>
                  {/* ── Passou da faixa: o aviso do professor ───────────────
                      Vem antes do "fora do perfil" porque é o acionável: um
                      diz que há o que fazer e oferece as duas saídas, o outro
                      é constatação.

                      Quando os dois valem, mostrar os dois seria dizer a mesma
                      coisa duas vezes — "12 anos" numa classe de 9 a 11 é o
                      motivo do primeiro e o texto do segundo. Por isso o
                      segundo só aparece quando não há aviso de progressão. */}
                  {(() => {
                    const a = alertaPorPessoa[m.pessoa_id];
                    if (a) {
                      const destino = a.classe_sugerida_id ? nomeClassePorId[a.classe_sugerida_id] : null;
                      const ocupado = progredindo === a.pessoa_id;
                      return (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-xs font-normal text-warning-text border-warning-line bg-warning-soft/40
                                       max-w-full whitespace-normal text-left leading-snug"
                            title={a.passou_da_faixa_em
                              ? `Passou da idade máxima em ${new Date(a.passou_da_faixa_em + "T00:00:00").toLocaleDateString("pt-BR")}`
                              : undefined}
                          >
                            Passou da faixa{destino ? ` — vai para ${destino}` : ""}
                          </Badge>
                          {destino && (
                            <Button
                              type="button" size="sm" variant="outline"
                              className="h-7 gap-1 text-xs"
                              disabled={busy || ocupado}
                              onClick={() => handleProgredir(a)}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              {ocupado ? "Movendo..." : "Mover"}
                            </Button>
                          )}
                          {/* A idade é regra, não sentença: há o adolescente
                              que fica mais um ano com a turma onde tem amigos.
                              Sem uma forma de dizer "este fica", o aviso
                              reaparece para sempre — e aviso que não some vira
                              paisagem. */}
                          <button
                            type="button"
                            disabled={busy || ocupado}
                            onClick={() => handleManterNaClasse(a)}
                            title={`Manter ${a.nome_completo} nesta classe`}
                            className="text-xs underline text-muted-foreground hover:text-foreground"
                          >
                            Manter
                          </button>
                        </div>
                      );
                    }
                    // ── O que ainda é "fora do perfil" numa classe de adulto
                    //
                    // De Adultos em diante a idade não decide mais a classe —
                    // é a mesma regra do aviso de progressão. Então dizer que
                    // alguém de 59 anos está "fora do perfil" de uma classe de
                    // 26 a 56 é apontar um desencontro que a igreja já decidiu
                    // não corrigir. Ruído permanente, na ficha de quem nunca
                    // vai mudar de classe.
                    //
                    // O SEXO continua valendo, e é o que sobra: a Classe
                    // Professora Edna é de mulheres e a Isac de homens. Um
                    // homem na Edna está fora de perfil de verdade, com ou sem
                    // progressão por idade.
                    //
                    // "Sem data de nascimento" também sai daqui: sem idade em
                    // jogo, a falta dela não diz nada sobre ESTA classe. A
                    // lacuna continua contada na fila de cadastros a corrigir,
                    // que é onde alguém pode resolvê-la.
                    const motivo = foraDoPerfil(m.membros?.data_nascimento, m.membros?.sexo);
                    const mostraMotivo = motivo && (motivo.tipo === "sexo" || avisaProgressao);
                    return mostraMotivo ? (
                      <Badge variant="outline" className="mt-1 text-xs text-warning-text border-warning-line">
                        Fora do perfil da classe · {motivo.texto}
                      </Badge>
                    ) : null;
                  })()}
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleDesmatricular(m.id)}
                  disabled={busy}
                  className="text-destructive"
                >
                  <UserMinus className="w-4 h-4 mr-1" /> Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Esperados (faixa etária) */}
        <TabsContent value="esperados" className="space-y-2">
{/* ── A conta da aba, aberta ───────────────────────────────────────
              O número da aba conta as LINHAS que estão abaixo dela — listar
              94 nomes sob um rótulo que diz 80 seria a divergência que este
              projeto já pagou caro (ver o cabeçalho de pendenciasCadastro.ts:
              uma faixa dizia 21 sobre uma lista de 22 linhas).

              Mas "94 esperados" também não pode ser lido como "94 para
              matricular". Então a conta fica aberta aqui embaixo, sobre o
              MESMO conjunto que a busca filtrou — senão a frase discordaria
              da lista assim que alguém digitasse no campo acima. */}
          {emOutraClasse.length > 0 && (
            <p className="text-xs text-muted-foreground">
              A lista traz também{" "}
              <strong className="font-medium text-foreground">{emOutraClasse.length}</strong>{" "}
              {emOutraClasse.length === 1 ? "pessoa que já está" : "pessoas que já estão"}{" "}
              em outra classe, esmaecida{emOutraClasse.length === 1 ? "" : "s"} e fora da
              conta acima — para nenhum nome do perfil desta classe ficar sem
              resposta.
            </p>
          )}
          {/* Dois vazios diferentes, e confundi-los seria ruim: uma classe
              completa e uma classe sem candidato pedem coisas opostas de
              quem lê. */}
          {espFiltrados.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8 space-y-1">
              {noPerfil > 0 ? (
                <p>Todos que cabem nesta classe já estão matriculados.</p>
              ) : (
                <>
                  <p>Ninguém no perfil desta classe ainda.</p>
                  {/* O perfil precisa ser dito: "faixa etária" fazia pensar
                      só em idade, e a classe também filtra por sexo — numa
                      classe de senhoras os homens da faixa não aparecem, e
                      sem esta frase isso parece defeito. */}
                  <p className="text-xs">
                    {classe.idade_min ?? 0}–{classe.idade_max ?? "+"} anos ·{" "}
                    {classe.genero === "misto" ? "ambos os sexos" : classe.genero}.
                    Só entram pessoas ativas com data de nascimento preenchida
                    e que não sejam professores desta classe.
                  </p>
                </>
              )}
            </div>
          )}
          {/* ── Onde cada pessoa do perfil está ─────────────────────────────
              A aba escondia quem já estava em outra classe, e sumir é a pior
              resposta para quem coordena: a professora que procura um aluno de
              12 anos e não o encontra não sabe se ele não existe, se está sem
              data de nascimento, ou se está na classe ao lado.

              Agora aparece todo mundo do perfil, cada um com o lugar onde
              está. Quem já tem classe fica esmaecido e com o botão em contorno
              — presente para consulta, sem competir com quem depende de um
              clique. */}
          {espFiltrados.map((e) => {
            const alocado = !!e.outra_classe_id;
            const ensina = e.outra_classe_papel === "professor";
            const aluno = e.sexo === "feminino" ? "Aluna" : "Aluno";
            return (
              <Card key={e.pessoa_id} className={alocado ? "bg-muted/30" : undefined}>
                <CardContent className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <NomePessoa id={e.pessoa_id} nome={e.nome_completo} className="font-medium truncate block w-full" />
                    <p className="text-xs text-muted-foreground">
                      {e.idade ?? "?"} anos
                      {e.sexo && ` · ${e.sexo}`}
                    </p>
                    {alocado && (
                      <Badge
                        variant="outline"
                        className={`mt-1 text-xs font-normal ${ensina
                          ? "border-info-line text-info-text"
                          : "border-border text-muted-foreground"}`}
                      >
                        {ensina ? "Ensina em" : `${aluno} em`} {e.outra_classe_nome}
                      </Badge>
                    )}
                  </div>
                  {alocado ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setAMover(e)}
                      disabled={busy} className="gap-1.5 shrink-0"
                      title={`Trazer de ${e.outra_classe_nome} para esta classe`}
                    >
                      <ArrowRightLeft className="w-4 h-4" /> Trazer
                    </Button>
                  ) : (
                    <Button
                      size="sm" onClick={() => handleMatricular(e.pessoa_id)}
                      disabled={busy} className="gap-1.5 shrink-0"
                    >
                      <UserPlus className="w-4 h-4" /> Matricular
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

      </Tabs>

      {/* Dialog editar */}
      <ClasseForm
        open={editOpen}
        onOpenChange={setEditOpen}
        classe={classe}
        onSaved={recarregar}
      />

      {/* ── Confirmar a transferência ────────────────────────────────────
          Trazer alguém de outra classe TIRA a pessoa de lá — é decisão de
          duas classes, não de uma. Um clique sem pergunta esvaziaria a lista
          de chamada da colega sem que ela soubesse.

          AlertDialog e não confirm(): a caixa nativa é bloqueada em navegador
          embarcado, devolve "cancelou" sem perguntar, e o botão simplesmente
          não faria nada no celular — ver Risco 3 do CLAUDE.md. */}
      <AlertDialog open={!!aMover} onOpenChange={(o) => !o && setAMover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trazer para esta classe?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{aMover?.nome_completo}</strong>{" "}
              {aMover?.outra_classe_papel === "professor"
                ? "ensina"
                : aMover?.sexo === "feminino" ? "é aluna" : "é aluno"} em{" "}
              <strong>{aMover?.outra_classe_nome}</strong>.
              {aMover?.outra_classe_papel === "professor" ? (
                <> Continuará ensinando lá e passará a estudar em{" "}
                  <strong>{classe.nome}</strong>.</>
              ) : (
                <> A matrícula em <strong>{aMover?.outra_classe_nome}</strong> será
                  encerrada e a pessoa passará a constar na lista de chamada de{" "}
                  <strong>{classe.nome}</strong>. O histórico da classe anterior
                  é preservado.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleMover} disabled={busy}>
              Trazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar desativação (soft) */}
      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar classe?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{classe.nome}</strong> será ocultada da lista padrão de classes,
              mas todo o histórico (matrículas, chamadas, campanhas) será preservado.
              <br /><br />
              Você pode <strong>reativar</strong> a qualquer momento mostrando classes desativadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDesativarClasse}
              className="bg-warning text-white hover:bg-warning/90"
              disabled={busy}
            >
              {busy ? "..." : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir classe?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{classe.nome}</strong>?
              <br /><br />
              A exclusão será bloqueada pelo banco se houver matriculados ou aulas
              registradas. Use "Editar" e desative a classe se preferir mantê-la
              no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExcluirClasse}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
            >
              {busy ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
