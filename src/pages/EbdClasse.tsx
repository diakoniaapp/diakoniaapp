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
  PowerOff, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarClasse, esperadosDaClasse, matriculadosDaClasse,
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
      const [esp, mat] = await Promise.all([
        esperadosDaClasse(classeId),
        matriculadosDaClasse(classeId) as Promise<MatRow[]>,
      ]);
      setEsperados(esp);
      setMatriculados(mat);

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
  function foraDoPerfil(nasc: string | null | undefined, sexo: string | null | undefined): string | null {
    if (!classe) return null;
    if (!nasc) return "sem data de nascimento";
    const idade = calcIdade(nasc);
    if (idade === null) return "sem data de nascimento";
    if (classe.idade_min !== null && idade < classe.idade_min) return idade + " anos";
    if (classe.idade_max !== null && idade > classe.idade_max) return idade + " anos";
    if (classe.genero !== "misto" && sexo && sexo !== classe.genero) return String(sexo);
    return null;
  }
  const matFiltrados = matriculados.filter(m => m.membros?.nome_completo.toLowerCase().includes(filtroLower));


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
        <div className="flex gap-2 items-center">
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
          <Button asChild variant="outline" size="sm">
            <Link to={`/ebd/${classeId}/chamada`}>Fazer chamada</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/ebd/${classeId}/campanhas`}>Campanhas</Link>
          </Button>
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">Matriculados</p>
          <p className="text-2xl font-semibold text-success-text">{matriculados.length}</p>
        </CardContent></Card>
        {/* Esperados = quem falta. Zero aqui quer dizer classe completa, e
            não classe vazia — por isso o número apaga em vez de alarmar. */}
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">Esperados</p>
          <p className={`text-2xl font-semibold ${espFiltrados.length > 0 ? "text-warning-text" : "text-muted-foreground"}`}>
            {esperados.filter(e => !e.ja_matriculado).length}
          </p>
        </CardContent></Card>
        {/* "Não matriculados" contava 277 no Berçário: todo mundo da igreja
            que não é bebê. Trocado pelo total que CABE nesta classe, que é
            o denominador dos outros dois. */}
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">No perfil da classe</p>
          <p className="text-2xl font-semibold">{noPerfil}</p>
        </CardContent></Card>
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

      {/* Abas */}
      <Tabs defaultValue="matriculados" className="space-y-3">
        <TabsList>
          <TabsTrigger value="matriculados">Matriculados ({matFiltrados.length})</TabsTrigger>
          <TabsTrigger value="esperados">Esperados ({espFiltrados.length})</TabsTrigger>
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
                  {(() => {
                    const motivo = foraDoPerfil(m.membros?.data_nascimento, m.membros?.sexo);
                    return motivo ? (
                      <Badge variant="outline" className="mt-1 text-xs text-warning-text border-warning-line">
                        Fora do perfil da classe · {motivo}
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
                    Só entram pessoas ativas com data de nascimento preenchida,
                    que não sejam professores e que ainda não estejam em outra classe.
                  </p>
                </>
              )}
            </div>
          )}
          {espFiltrados.map((e) => (
            <Card key={e.pessoa_id}>
              <CardContent className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0 flex-1">
                  <NomePessoa id={e.pessoa_id} nome={e.nome_completo} className="font-medium truncate block" />
                  <p className="text-xs text-muted-foreground">
                    {e.idade ?? "?"} anos
                    {e.sexo && ` · ${e.sexo}`}
                  </p>
                </div>
                <Button
                  size="sm" onClick={() => handleMatricular(e.pessoa_id)}
                  disabled={busy} className="gap-1.5"
                >
                  <UserPlus className="w-4 h-4" /> Matricular
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

      </Tabs>

      {/* Dialog editar */}
      <ClasseForm
        open={editOpen}
        onOpenChange={setEditOpen}
        classe={classe}
        onSaved={recarregar}
      />

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
