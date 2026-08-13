import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Link2, Briefcase, Sparkles, BarChart3, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { MembroForm } from "@/components/membros/MembroForm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VinculosPessoaDialog } from "@/components/familias/VinculosPessoaDialog";
import AtuacoesDialog from "@/components/membros/AtuacoesDialog";
import VisitanteDialog from "@/components/membros/VisitanteDialog";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import { StatusMembroBadge } from "@/components/membros/StatusMembroBadge";

export interface Membro {
    id: string;
    nome_completo: string;
    cpf: string | null;
    data_nascimento: string | null;
    telefone_celular: string | null;
    email: string | null;
    bairro: string | null;
    status: "ativo" | "inativo" | "transferido" | "falecido" | "desligado";
    estado_civil: string | null;
    // Campos calculados na query (não persistem na tabela)
    areas?: string[];
    classe_ebd?: string | null;
    classes_professor?: string[];   // Classes onde é professor
    lider_ministerios?: string[];   // Ministérios que lidera (ou co-lidera)
    lider_areas?: string[];          // Áreas que lidera (ou co-lidera)
    data_casamento: string | null;
    data_entrada: string | null;
    observacoes_pastorais: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    cidade: string | null;
    cep: string | null;
    sexo: string | null;
    tipo_pessoa: "membro" | "congregado" | "visitante";
    perfil_acesso:
      | "admin"
      | "pastor"
      | "secretaria"
      | "tesoureiro"
      | "lideranca"
      | "professor_ebd"
      | "voluntario"
      | "membro";
    status_acolhimento?: string | null;
    responsavel_id?: string | null;
    como_conheceu?: string | null;
    quem_convidou_id?: string | null;
    como_conheceu_descricao?: string | null;
}

const statusColor: Record<string, string> = {
    ativo: "bg-success/15 text-success border-success/30",
    inativo: "bg-muted text-muted-foreground border-border",
    transferido: "bg-warning/15 text-warning border-warning/30",
    desligado: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700",
    falecido: "bg-destructive/10 text-destructive border-destructive/30",
};

const tipoPessoaLabel: Record<string, string> = {
    membro: "Membro",
    congregado: "Congregado",
    visitante: "Visitante",
};

const tipoPessoaColor: Record<string, string> = {
    membro: "bg-primary/10 text-primary border-primary/30",
    congregado: "bg-accent/15 text-accent-foreground border-accent/30",
    visitante: "bg-warning/15 text-warning border-warning/30",
};

// O indicador de status de acesso saiu da listagem. Alem de ser um icone mudo
// disputando espaco com o nome, ele disparava uma consulta ao Supabase POR
// PESSOA — com a lista inteira renderizada, eram 281 requisicoes so para
// desenhar 281 escudinhos. Essa informacao tem tela propria em /usuarios.

// Uma acao visivel — editar — mais um menu para as secundarias. Antes eram ate
// quatro icones sem rotulo, que ninguem entende sem passar o mouse, e no celular
// nao ha mouse. Dentro do menu cada acao tem nome em vez de simbolo.
//
// Fica em componente proprio porque cartao (celular) e tabela (desktop) usam o
// mesmo conjunto: duplicar o menu seria garantir que um dia so um dos dois ganhe
// uma acao nova.
function AcoesPessoa({ m, onEditar, onVinculos, onAtuacoes, onVisitante, mostrarEditar = true }: {
  m: Membro;
  onEditar:    (m: Membro) => void;
  onVinculos:  (m: Membro) => void;
  onAtuacoes:  (m: Membro) => void;
  onVisitante: (m: Membro) => void;
  /** Na tabela do desktop o nome ja abre a edicao; o lapis so repetiria. */
  mostrarEditar?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {mostrarEditar && (
      <Button
        variant="ghost" size="icon" className="h-11 w-11"
        aria-label={`Editar ${m.nome_completo}`}
        title="Editar"
        onClick={() => onEditar(m)}
      >
        <Pencil className="w-4 h-4" />
      </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost" size="icon" className="h-11 w-11"
            aria-label={`Mais ações para ${m.nome_completo}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onVinculos(m)}>
            <Link2 className="w-4 h-4 mr-2 text-muted-foreground" />
            Vínculos familiares
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAtuacoes(m)}>
            <Briefcase className="w-4 h-4 mr-2 text-muted-foreground" />
            Atuações voluntárias
          </DropdownMenuItem>
          {m.tipo_pessoa === "visitante" && (
            <DropdownMenuItem onClick={() => onVisitante(m)}>
              <Sparkles className="w-4 h-4 mr-2 text-warning" />
              Acompanhar visitante
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Membros() {
    const { canEdit, hasRole } = useAuth();
    const [membros, setMembros] = useState<Membro[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Membro | null>(null);
    const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
    const [perfilFiltro, setPerfilFiltro] = useState<string>("todos");
    const [vinculosPessoa, setVinculosPessoa] = useState<Membro | null>(null);
    const [atuacoesPessoa, setAtuacoesPessoa] = useState<Membro | null>(null);
    const [visitantePessoa, setVisitantePessoa] = useState<Membro | null>(null);
    const [error, setError] = useState<string | null>(null);

  // Paginação: 281 cadastros renderizados de uma vez davam 34.553px de
  // rolagem e 848 botões numa página só. Quem procura alguém usa a busca;
  // quem varre a lista não deveria percorrer 47 telas.
  const POR_PAGINA = 20;
  const [pagina, setPagina] = useState(1);
  const buscaRef = useRef<HTMLInputElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();

  // ── Tratar parâmetros de query ao carregar ──────────────────────────────────
  useEffect(() => {
        if (searchParams.get("novo") === "1" && canEdit) {
                setEditing(null);
                setOpen(true);
                searchParams.delete("novo");
                searchParams.delete("t");
                setSearchParams(searchParams, { replace: true });
        }
  }, [searchParams, canEdit, setSearchParams]);

  const load = async () => {
        setLoading(true);
        setError(null);
        const [
                { data, error },
                { data: areaVolList },
                { data: areasNames },
                { data: ebdMap },
                { data: ebdProfList },
                { data: ebdClassesAll },
                { data: minLideres },
                { data: areasLideres },
        ] = await Promise.all([
                supabase.from("membros").select("*").order("nome_completo"),
                supabase.from("area_voluntarios").select("membro_id, status, area_id"),
                supabase.from("areas").select("id, nome, lider_id, co_lider_id, ministerio_id"),
                supabase
                  .from("ebd_matriculas")
                  .select("pessoa_id, ebd_classes(nome)")
                  .eq("ativo", true),
                supabase
                  .from("ebd_professores")
                  .select("pessoa_id, classe_id, ativo")
                  .eq("ativo", true),
                supabase.from("ebd_classes").select("id, nome"),
                supabase.from("ministerios").select("id, nome, lider_id, co_lider_id"),
                supabase.from("areas").select("id, nome, lider_id, co_lider_id"),
        ]);

        if (error) {
                toast.error(error.message);
                setError(error.message);
        }

        // Indexar por id
        const nomePorArea = new Map<string, string>();
        (areasNames ?? []).forEach((a: any) => { if (a?.id && a?.nome) nomePorArea.set(a.id, a.nome); });

        // Professores EBD: agrupa por pessoa
        const nomePorClasseEbd = new Map<string, string>();
        (ebdClassesAll ?? []).forEach((c: any) => { if (c?.id && c?.nome) nomePorClasseEbd.set(c.id, c.nome); });
        const profPorPessoa = new Map<string, string[]>();
        (ebdProfList ?? []).forEach((p: any) => {
                const nome = nomePorClasseEbd.get(p.classe_id);
                if (!nome) return;
                if (!profPorPessoa.has(p.pessoa_id)) profPorPessoa.set(p.pessoa_id, []);
                profPorPessoa.get(p.pessoa_id)!.push(nome);
        });

        // Liderança de ministério (lider_id OU co_lider_id)
        const minLideresPorPessoa = new Map<string, string[]>();
        (minLideres ?? []).forEach((m: any) => {
                [m.lider_id, m.co_lider_id].forEach((uid: string | null) => {
                        if (!uid || !m.nome) return;
                        if (!minLideresPorPessoa.has(uid)) minLideresPorPessoa.set(uid, []);
                        if (!minLideresPorPessoa.get(uid)!.includes(m.nome)) {
                                minLideresPorPessoa.get(uid)!.push(m.nome);
                        }
                });
        });

        // Liderança de área (lider_id OU co_lider_id)
        const areaLideresPorPessoa = new Map<string, string[]>();
        (areasLideres ?? []).forEach((a: any) => {
                [a.lider_id, a.co_lider_id].forEach((uid: string | null) => {
                        if (!uid || !a.nome) return;
                        if (!areaLideresPorPessoa.has(uid)) areaLideresPorPessoa.set(uid, []);
                        if (!areaLideresPorPessoa.get(uid)!.includes(a.nome)) {
                                areaLideresPorPessoa.get(uid)!.push(a.nome);
                        }
                });
        });
        
        const areasPorPessoa = new Map<string, string[]>();
        (areaVolList ?? []).forEach((av: any) => {
                const st = String(av.status ?? "").toLowerCase();
                if (st !== "ativa" && st !== "ativo") return;
                const nome = nomePorArea.get(av.area_id);
                if (!nome) return;
                if (!areasPorPessoa.has(av.membro_id)) areasPorPessoa.set(av.membro_id, []);
                areasPorPessoa.get(av.membro_id)!.push(nome);
        });
        const classePorPessoa = new Map<string, string>();
        (ebdMap ?? []).forEach((em: any) => {
                if (em.ebd_classes?.nome) classePorPessoa.set(em.pessoa_id, em.ebd_classes.nome);
        });

        const lista = ((data ?? []) as any[]).map((m: any) => ({
                ...m,
                areas: areasPorPessoa.get(m.id) ?? [],
                classe_ebd: classePorPessoa.get(m.id) ?? null,
                classes_professor: profPorPessoa.get(m.id) ?? [],
                lider_ministerios: minLideresPorPessoa.get(m.id) ?? [],
                lider_areas: areaLideresPorPessoa.get(m.id) ?? [],
        })) as Membro[];
        setMembros(lista);
        setLoading(false);

        // ── Tratar param "abrir": abre automaticamente a ficha da pessoa ──────────
        const abrirId = searchParams.get("abrir");
        if (abrirId && canEdit) {
                const pessoa = lista.find((m) => m.id === abrirId);
                if (pessoa) {
                          setEditing(pessoa);
                          setOpen(true);
                          toast.success(`Ficha de ${pessoa.nome_completo.split(" ")[0]} aberta — crie o acesso abaixo!`, { duration: 5000 });
                }
                searchParams.delete("abrir");
                setSearchParams(searchParams, { replace: true });
        }
  };

  useEffect(() => {
        load();
  }, []);

  const filtered = useMemo(() => membros.filter((m) => {
        const q = search.toLowerCase();
        const matchSearch =
                !q ||
                m.nome_completo.toLowerCase().includes(q) ||
                (m.cpf ?? "").includes(q) ||
                (m.bairro ?? "").toLowerCase().includes(q);
        const matchTipo = tipoFiltro === "todos" || m.tipo_pessoa === tipoFiltro;
        const matchPerfil = perfilFiltro === "todos" || m.perfil_acesso === perfilFiltro;
        return matchSearch && matchTipo && matchPerfil;
  }), [membros, search, tipoFiltro, perfilFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filtered.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visiveis = filtered.slice(inicio, inicio + POR_PAGINA);

  // Um unico conjunto de acoes para cartao e tabela. Duplicar o menu nos dois
  // lugares seria garantir que um dia so um deles ganhe uma acao nova.
  const acoes = {
    onEditar:    (m: Membro) => { setEditing(m); setOpen(true); },
    onVinculos:  setVinculosPessoa,
    onAtuacoes:  setAtuacoesPessoa,
    onVisitante: setVisitantePessoa,
  };

  // Voltar à primeira página quando o resultado muda: continuar na página 7
  // de uma busca que agora tem 3 resultados deixaria a tela vazia.
  useEffect(() => { setPagina(1); }, [search, tipoFiltro, perfilFiltro]);

  // Foco na busca ao abrir: quem entra em Pessoas quase sempre vem procurar
  // alguém. Só no desktop — em celular abriria o teclado por cima da lista.
  useEffect(() => {
        if (window.matchMedia("(min-width: 768px)").matches) buscaRef.current?.focus();
  }, []);

  return (
        <div>
              <PageHeader
                        title="Pessoas"
                        description={`${membros.length} cadastrados • ${membros.filter((m) => m.status === "ativo").length} ativos`}
                        actions={
                                    canEdit && (
                                                  <div className="flex gap-2">
                                                                <Button
                                                                                  onClick={() => {
                                                                                                      setEditing(null);
                                                                                                      setOpen(true);
                                                                                    }}
                                                                                  className="gap-2"
                                                                                >
                                                                                <Plus className="w-4 h-4" /> Nova pessoa
                                                                </Button>
                                                                <Button asChild variant="outline" className="gap-2">
                                                                                <Link to="/visitantes"><BarChart3 className="w-4 h-4" /> <span translate="no">Painel</span></Link>
                                                                </Button>
                                                  </div>
                        )
                }
                    />
                    <div className="p-4 md:p-8 space-y-4">
                            <div className="flex flex-col md:flex-row gap-3 md:items-center">
                                      <div className="relative max-w-md flex-1">
                                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                  <Input
                                                                  ref={buscaRef}
                                                                  className="pl-9"
                                                                  placeholder="Buscar por nome, CPF ou bairro..."
                                                                  value={search}
                                                                  onChange={(e) => setSearch(e.target.value)}
                                                                />
                                      </div>
                                      <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                                                  <SelectTrigger className="md:w-56">
                                                                <SelectValue placeholder="Tipo de pessoa" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                                <SelectItem value="todos">Todos os tipos</SelectItem>
                                                                <SelectItem value="membro">Membro</SelectItem>
                                                                <SelectItem value="congregado">Congregado</SelectItem>
                                                                <SelectItem value="visitante">Visitante</SelectItem>
                                                  </SelectContent>
                                      </Select>
                                      <Select value={perfilFiltro} onValueChange={setPerfilFiltro}>
                                                  <SelectTrigger className="md:w-56">
                                                                <SelectValue placeholder="Perfil de Acesso" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                                <SelectItem value="todos">Todos os perfis</SelectItem>
                                                                <SelectItem value="admin">Admin</SelectItem>
                                                                <SelectItem value="pastor">Pastor</SelectItem>
                                                                <SelectItem value="secretaria">Secretaria</SelectItem>
                                                                <SelectItem value="tesoureiro">Tesoureiro</SelectItem>
                                                                <SelectItem value="lideranca">Liderança</SelectItem>
                                                                <SelectItem value="professor_ebd">Professor EBD</SelectItem>
                                                                <SelectItem value="voluntario">Voluntário</SelectItem>
                                                                <SelectItem value="membro">Membro</SelectItem>
                                                  </SelectContent>
                                      </Select>
                            </div>
                    
                      {loading ? (
                                    <ListSkeleton className="grid gap-3" count={5} />
                                  ) : error ? (
                                    <ErrorState onRetry={load} />
                                  ) : filtered.length === 0 ? (
                                    <EmptyState message="Nenhuma pessoa encontrada" />
                                  ) : (
                                    // md:hidden — no desktop entra a tabela logo abaixo.
                                    <div className="grid gap-3 md:hidden">
                                      {visiveis.map((m) => (
                                                    // min-w-0: item de grid nao encolhe abaixo do min-content do
                                                    // conteudo. Sem isso, nome longo e etiquetas esticavam o cartao
                                                    // muito alem da tela do celular.
                                                    <Card key={m.id} className="min-w-0 shadow-card-soft hover:shadow-elevated transition-shadow">
                                                                    <CardContent className="p-4 flex items-center gap-x-3">
                                                                                      {/* O circulo de iniciais saiu. Ele nao identificava ninguem:
                                                                                          numa lista ordenada por nome, "AD" aparecia tres vezes
                                                                                          seguidas, e a inicial ja esta na primeira letra do nome,
                                                                                          logo ao lado. Em troca ocupava 48px mais 16px de
                                                                                          espacamento e um circulo colorido por linha — 20 manchas
                                                                                          de cor por pagina competindo com o texto que importa.
                                                                                          Sem ele o cartao volta a caber numa linha so. */}
                                                                                      <div className="flex-1 min-w-0">
                                                                                                          {/* O nome ocupa a linha inteira e as etiquetas descem para a
                                                                                                              seguinte. Quando dividiam a mesma linha flex, as etiquetas
                                                                                                              venciam a disputa por espaco e o nome — a informacao que
                                                                                                              identifica a pessoa — era truncado ate virar "Adriana ...". */}
                                                                                                          <p className="font-medium truncate">{m.nome_completo}</p>
                                                                                                          {/* Etiqueta marca excecao, nao regra. "Membro" aparecia na
                                                                                                              maioria dos 281 cadastros e "Ativo" em 273 deles — uma marca
                                                                                                              presente em 97% dos casos nao informa nada. Aqui so aparece
                                                                                                              quem foge do padrao, e no maximo uma por linha. */}
                                                                                                          {(m.tipo_pessoa !== "membro" || m.status !== "ativo") && (
                                                                                                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                                                              {m.tipo_pessoa !== "membro" ? (
                                                                                                                <Badge variant="outline" className={tipoPessoaColor[m.tipo_pessoa]}>
                                                                                                                  {tipoPessoaLabel[m.tipo_pessoa]}
                                                                                                                </Badge>
                                                                                                              ) : (
                                                                                                                <StatusMembroBadge status={m.status} compact />
                                                                                                              )}
                                                                                                            </div>
                                                                                                          )}
                                                                                                          <div className="text-sm text-muted-foreground truncate">
                                                                                                            {[m.telefone_celular, m.email, m.bairro].filter(Boolean).join(" • ") || "—"}
                                                                                                            </div>
                                                                                                          {/* Etiquetas de vinculo — EBD, professor, lider, areas — saem
                                                                                                              da listagem. Sao contexto de ficha: ninguem procura uma pessoa
                                                                                                              por classe de EBD nesta tela, e chegavam a seis por linha,
                                                                                                              competindo com o nome. Continuam na ficha e no filtro de perfil. */}
                                                                                        </div>
                                                                      {/* Uma acao visivel — editar — mais um menu para as secundarias.
                                                                          Antes eram ate quatro icones sem rotulo, que ninguem entende
                                                                          sem passar o mouse, e no celular nao ha mouse. Dentro do menu
                                                                          cada acao tem nome em vez de simbolo. O indicador de acesso
                                                                          tambem saiu da linha: era um quarto icone, mudo. */}
                                                                      {canEdit && <AcoesPessoa m={m} {...acoes} />}
                                                                    </CardContent>
                                                    </Card>
                                                  ))}
                                    </div>
                            )}

                            {/* ── Tabela: 768px para cima ──────────────────────────────
                                Medido em 1416px: o nome recebia 955px de largura e usava
                                330px — cerca de 600px vazios por linha. So nove pessoas
                                cabiam sem rolar, e uma pagina de 20 levava 2,1 telas.
                                A tabela usa esse espaco para colunas de verdade (tipo,
                                situacao, telefone, bairro) em vez de concatenar tudo com
                                bolinhas, e dobra quantas pessoas aparecem de uma vez.
                                No celular a tabela nao entra: os cartoes continuam. */}
                            {!loading && !error && filtered.length > 0 && (
                              <div className="hidden md:block rounded-lg border overflow-hidden">
                                <table className="w-full text-sm">
                                  <caption className="sr-only">
                                    Pessoas cadastradas — {filtered.length} no filtro atual,
                                    mostrando {inicio + 1} a {Math.min(inicio + POR_PAGINA, filtered.length)}
                                  </caption>
                                  <thead className="bg-muted/50">
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th scope="col" className="font-medium px-3 py-2">Nome</th>
                                      <th scope="col" className="font-medium px-3 py-2 w-32">Tipo</th>
                                      <th scope="col" className="font-medium px-3 py-2 w-40">Telefone</th>
                                      <th scope="col" className="font-medium px-3 py-2 w-44">Bairro</th>
                                      <th scope="col" className="font-medium px-3 py-2 w-24">
                                        <span className="sr-only">Ações</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visiveis.map((m) => (
                                      <tr key={m.id} className="border-t hover:bg-muted/40 transition-colors">
                                        <th scope="row" className="font-normal text-left px-3 py-0 max-w-0">
                                          {/* Botao de verdade, e nao onClick na <tr>: alcancavel por
                                              Tab e anunciado como acao. Alvo esticado sobre a linha
                                              nao serve aqui — <tr> com position: relative nao e
                                              confiavel entre navegadores. */}
                                          <button
                                            type="button"
                                            // py-3 leva o botao aos 44px de altura da linha. Sem
                                            // isso ele media 20px — so a altura do texto — e virava
                                            // um alvo estreito no meio de uma linha alta, alem de
                                            // ficar abaixo dos 24px minimos da WCAG 2.5.8.
                                            className="block w-full min-w-0 py-3 text-left truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                            onClick={() => { setEditing(m); setOpen(true); }}
                                          >
                                            {m.nome_completo}
                                          </button>
                                        </th>
                                        <td className="px-3 py-0">
                                          {/* Etiqueta so na excecao, como nos cartoes. */}
                                          {m.tipo_pessoa !== "membro" ? (
                                            <Badge variant="outline" className={tipoPessoaColor[m.tipo_pessoa]}>
                                              {tipoPessoaLabel[m.tipo_pessoa]}
                                            </Badge>
                                          ) : m.status !== "ativo" ? (
                                            <StatusMembroBadge status={m.status} compact />
                                          ) : null}
                                          {/* Celula vazia, e nao "—": 274 dos 279 sao membros
                                              ativos, entao a coluna virava uma fileira de tracos.
                                              Traco numa tabela le como dado; vazio le como "nada
                                              a notar", que e o que se quer dizer aqui. Em telefone
                                              e bairro o traco fica, porque ali a ausencia importa:
                                              sem telefone ninguem consegue ser contatado. */}
                                        </td>
                                        <td className="px-3 py-0 text-muted-foreground tabular-nums">
                                          {m.telefone_celular || "—"}
                                        </td>
                                        <td className="px-3 py-0 text-muted-foreground max-w-0 truncate">
                                          {m.bairro || "—"}
                                        </td>
                                        <td className="px-3 py-0">
                                          {/* Sem o lapis aqui: nesta tabela o nome ja e o
                                              botao que abre a edicao. Eram 20 lapis por
                                              pagina repetindo uma acao que ja existe a
                                              dois centimetros de distancia — 20 icones a
                                              menos numa tela que tinha 85. */}
                                          {canEdit && <AcoesPessoa m={m} {...acoes} mostrarEditar={false} />}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {!loading && !error && totalPaginas > 1 && (
                              <nav
                                className="flex items-center justify-between gap-3 pt-1"
                                aria-label="Paginação da lista de pessoas"
                              >
                                <Button
                                  variant="outline"
                                  className="min-h-[44px]"
                                  disabled={paginaAtual === 1}
                                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                                >
                                  Anterior
                                </Button>
                                <span
                                  className="text-sm text-muted-foreground tabular-nums"
                                  aria-live="polite"
                                >
                                  {(paginaAtual - 1) * POR_PAGINA + 1}–
                                  {Math.min(paginaAtual * POR_PAGINA, filtered.length)} de {filtered.length}
                                </span>
                                <Button
                                  variant="outline"
                                  className="min-h-[44px]"
                                  disabled={paginaAtual === totalPaginas}
                                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                                >
                                  Próxima
                                </Button>
                              </nav>
                            )}
                    </div>
              
                    <MembroForm open={open} onOpenChange={setOpen} membro={editing} onSaved={load} />
                    <VinculosPessoaDialog
                              open={!!vinculosPessoa}
                              onOpenChange={(v) => {
                                          if (!v) setVinculosPessoa(null);
                              }}
                              pessoa={vinculosPessoa}
                            />
                    <AtuacoesDialog
                              open={!!atuacoesPessoa}
                              onOpenChange={(v) => {
                                          if (!v) setAtuacoesPessoa(null);
                              }}
                              pessoa={atuacoesPessoa}
                            />
                    <VisitanteDialog
                              open={!!visitantePessoa}
                              onOpenChange={(v) => { if (!v) setVisitantePessoa(null); }}
                              pessoa={visitantePessoa}
                              onSaved={load}
                            />
              </div>
          );
          }
