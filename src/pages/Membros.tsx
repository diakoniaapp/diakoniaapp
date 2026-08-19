import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Link2, Briefcase, Sparkles, BarChart3, MoreHorizontal, MessageCircle, IdCard, Cake, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
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
import ContatoResultadoDialog from "@/components/membros/ContatoResultadoDialog";
import { logHistorico } from "@/lib/historicoFluxo";
import { formatarTelefoneSemDDI, normalizarTelefone, telefoneValido } from "@/lib/telefone";
import { rotuloFuncao, temCargo } from "@/lib/funcaoMinisterial";

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
    /** Cargo na igreja — ver lib/funcaoMinisterial.ts. NÃO é acesso ao sistema. */
    funcao_ministerial?: string | null;
    perfil_acesso:
      | "admin"
      | "pastor"
      | "secretaria"
      | "tesoureiro"
      | "lideranca"
      | "professor_ebd"
      | "voluntario"
      | "membro";
    // Registro do ultimo contato pastoral. As colunas ja existiam no banco e
    // eram lidas pelo `select("*")`, mas nao estavam declaradas aqui — por isso
    // a lista nunca soube que possuia essa informacao.
    ultimo_contato_em?: string | null;
    ultimo_contato_tipo?: string | null;
    ultimo_contato_observacao?: string | null;
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
function AcoesPessoa({ m, onEditar, onVinculos, onAtuacoes, onVisitante, onContato, mostrarEditar = true }: {
  m: Membro;
  onEditar:    (m: Membro) => void;
  onVinculos:  (m: Membro) => void;
  onAtuacoes:  (m: Membro) => void;
  onVisitante: (m: Membro) => void;
  onContato:   (m: Membro) => void;
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
          {/* A ficha da pessoa ja existia e ninguem sabia.
              A pagina /visitantes/:id carrega com buscarVisitante(id), que e
              `.from("membros").eq("id", id)` — SEM filtro de tipo. Ela abre
              qualquer registro da tabela, membro inclusive, e ja distingue:
              quatro blocos estao fechados atras de !isCongregadoOuMembro.
              Estava pronta, funcionando para membros, e nenhuma tela levava
              ate ela. Primeira posicao do menu porque e a resposta para "quem
              e essa pessoa e o que ja se conversou com ela" — a pergunta que
              se faz antes de qualquer uma das outras acoes daqui.
              O nome da rota continua dizendo "visitantes", o que e estranho
              para um membro de 20 anos. Renomear mexeria em navegacao; fica
              como divida assumida, e nao como motivo para deixar a ficha
              inalcancavel mais um dia. */}
          <DropdownMenuItem asChild>
            <Link to={`/visitantes/${m.id}`}>
              <IdCard className="w-4 h-4 mr-2 text-muted-foreground" />
              Ver ficha
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Registrar contato voltou a ser só de visitante.
              Eu tinha estendido a ação a todo mundo por achar que os campos
              ultimo_contato_* zerados eram uma oportunidade desperdiçada. Não
              eram: acompanhamento por contato é a régua do acolhimento — quem
              chegou, quem foi procurado, quem sumiu —, e ela não se aplica a
              quem já é da casa. Aberta para as 281, a ação virava um "sem
              contato" permanente ao lado de gente que a igreja vê toda semana,
              e transformava presença em dívida.
              O dado continua existindo, a ação continua inteira; muda só quem
              a recebe: os visitantes, que são para quem a pergunta "alguém já
              falou com essa pessoa?" tem resposta útil. */}
          {m.tipo_pessoa === "visitante" && (
            <DropdownMenuItem onClick={() => onContato(m)}>
              <MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" />
              Registrar contato
            </DropdownMenuItem>
          )}
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

/**
 * Onde a pessoa está ligada na igreja: ministério, liderança, classe de EBD.
 *
 * Estes cinco campos — areas, lider_ministerios, lider_areas, classe_ebd e
 * classes_professor — JÁ eram carregados em toda abertura da tela, por cinco
 * consultas que rodavam a cada visita, e nenhum aparecia. A lista mostrava
 * nome, tipo, telefone e último contato de 281 pessoas exatamente iguais entre
 * si.
 *
 * Com isto, uma varredura da lista responde a pergunta que a lista não
 * respondia: quem está ligado a alguma coisa, e quem não está a nada.
 *
 * Liderança vem primeiro porque muda o que a linha significa: quem lidera o
 * Louvor não é "mais um do Louvor". Depois o ministério, depois a EBD — da
 * responsabilidade para a participação.
 */
function vinculos(m: Membro): string[] {
  const fora: string[] = [];

  const lidera = [...(m.lider_ministerios ?? []), ...(m.lider_areas ?? [])];
  if (lidera.length) fora.push(`Lidera ${lidera[0]}`);
  else if (m.areas?.length) fora.push(m.areas[0]);

  if (m.classes_professor?.length) fora.push(`Ensina ${m.classes_professor[0]}`);
  else if (m.classe_ebd) fora.push(m.classe_ebd);

  return fora;
}

/**
 * Quantos dias faltam para o próximo aniversário. Hoje = 0.
 *
 * `data_nascimento` já vinha no `select("*")` e não aparecia em lugar
 * nenhum desta tela. Só 106 das 283 pessoas têm a data preenchida, e
 * apenas duas fazem aniversário nos próximos sete dias — é justamente por
 * ser raro que a marca vale: duas linhas marcadas numa página saltam aos
 * olhos, enquanto uma marca em toda linha não diria nada.
 *
 * Comparação por dia e mês, sem construir data com o ano corrente: 29 de
 * fevereiro viraria 1º de março em ano comum, e a pessoa sumiria da
 * semana em que faz aniversário.
 */
/**
 * Texto comparável: minúsculas e sem acento.
 *
 * A busca comparava o texto cru, e com isso falhava calada justo onde mais
 * se busca. Dos 83 cadastros que têm bairro, 57 moram em bairro com acento
 * — Praça da Bandeira (37), Maracanã (17), São Cristóvão, Inhaúma. Quem
 * digita "praca" ou "maracana", que é o que se digita com pressa e sem
 * pensar no acento, recebia "Nenhuma pessoa encontrada" e concluía que a
 * igreja não tem ninguém lá.
 *
 * NFD separa a letra do acento; o intervalo removido é o dos diacríticos
 * combinantes. "João" e "Joao" viram a mesma coisa dos dois lados da
 * comparação — no que a pessoa digita e no que está no cadastro.
 */
function comparavel(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function diasAteAniversario(nascimento?: string | null): number | null {
  if (!nascimento) return null;
  const [, mes, dia] = nascimento.split("-").map(Number);
  if (!mes || !dia) return null;

  const hoje = new Date();
  for (let i = 0; i <= 366; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    if (d.getMonth() + 1 === mes && d.getDate() === dia) return i;
  }
  return null;
}

/**
 * Classes de EBD que atendem criança. Serve de segunda via para quem está
 * matriculado e não tem data de nascimento no cadastro.
 *
 * Hoje isso alcança zero pessoas a mais, e vale a pena registrar por quê: o
 * único caso — Benicio Oliveira, sem data de nascimento, classe Crianças —
 * tem a matrícula com `ativo = false`, e a consulta desta tela só traz
 * matrícula ativa. Quer dizer que a segunda via está certa e não tem o que
 * pegar; no dia em que entrar uma criança sem data e com matrícula ativa,
 * ela conta.
 */
const CLASSES_INFANTIS = ["Berçário", "Crianças", "Juniores"];

/**
 * Criança: menos de 12 anos, ou matriculada em classe infantil da EBD.
 *
 * Duas fontes porque nenhuma das duas cobre sozinha. Data de nascimento
 * existe em 106 dos 283 cadastros; matrícula infantil ativa, em 11. Juntas
 * dão 15 — as matrículas infantis são de crianças que também têm data.
 * Doze anos é onde a EBD daqui separa Juniores de Adolescentes — o corte é o
 * da igreja, não uma definição genérica de infância.
 */
function ehCrianca(m: Membro): boolean {
  if (m.classe_ebd && CLASSES_INFANTIS.includes(m.classe_ebd)) return true;
  if (!m.data_nascimento) return false;

  const nasc = new Date(m.data_nascimento + "T00:00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const antesDoAniversario =
    hoje.getMonth() < nasc.getMonth() ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate());
  if (antesDoAniversario) anos--;

  return anos < 12;
}

/** Faz aniversário dentro do mês corrente — a pergunta que a secretaria faz. */
function aniversarioNesteMes(nascimento?: string | null): boolean {
  if (!nascimento) return false;
  return Number(nascimento.split("-")[1]) === new Date().getMonth() + 1;
}

/**
 * O bolinho ao lado do nome. Aparece só na semana do aniversário, porque é
 * quando ele muda o que alguém faria: ligar hoje, e não "algum dia".
 */
function MarcaAniversario({ nascimento }: { nascimento?: string | null }) {
  const dias = diasAteAniversario(nascimento);
  if (dias === null || dias > 7) return null;

  const texto = dias === 0 ? "Faz aniversário hoje"
              : dias === 1 ? "Faz aniversário amanhã"
              : `Faz aniversário em ${dias} dias`;

  return (
    <span
      title={texto}
      aria-label={texto}
      className={`inline-flex items-center gap-1 shrink-0 text-xs font-normal ${
        dias === 0 ? "text-warning" : "text-muted-foreground"
      }`}
    >
      <Cake className="w-3.5 h-3.5" aria-hidden />
      {dias === 0 ? "hoje" : `${dias}d`}
    </span>
  );
}

/**
 * Telefone legível e acionável.
 *
 * Duas coisas mudaram. A tabela mostrava "5521975224438" — ninguém lê isso
 * como telefone nem consegue ditar em voz alta —, e `formatarTelefone` já
 * existia em lib/telefone.ts sem nenhum uso aqui. O "+55" foi embora: é
 * igual nas 283 linhas, e o que distingue uma da outra é o DDD.
 *
 * E o número virou link de WhatsApp. Esta é uma tela de cuidado: entre ver
 * o telefone e falar com a pessoa havia copiar, trocar de aplicativo e
 * colar. O link não envia nada — abre a conversa e quem escreve é a pessoa.
 */
function Telefone({ numero }: { numero?: string | null }) {
  if (!numero) return <span className="text-muted-foreground">—</span>;

  const legivel = formatarTelefoneSemDDI(numero);
  if (!telefoneValido(numero)) {
    // Número quebrado no cadastro: mostra o que há, mas não oferece uma
    // conversa que abriria vazia do outro lado.
    return (
      <span className="text-muted-foreground" title="Número incompleto no cadastro">
        {legivel || numero}
      </span>
    );
  }

  return (
    <a
      href={`https://wa.me/${normalizarTelefone(numero)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-muted-foreground hover:text-success hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      title={`Abrir conversa no WhatsApp com ${legivel}`}
    >
      {legivel}
    </a>
  );
}

// UltimoContato saiu junto com a coluna. Enquanto os 283 cadastros
// tiverem zero contatos registrados, ele só sabe escrever "Nunca" — e um
// componente que devolve a mesma palavra para todo mundo não é um
// componente, é um texto fixo caro. Está no histórico do git, com a régua
// de cores (cinza até 30 dias, âmbar depois) pronta para quando a coluna
// voltar a distinguir uma pessoa da outra.

type CampoOrdem = "nome" | "tipo" | "funcao" | "bairro";

/**
 * Cabeçalho de coluna que ordena.
 *
 * O botão ocupa a célula inteira para que o alvo seja a coluna, e não as
 * quatro letras de "Tipo". A seta só aparece na coluna ativa; nas outras fica
 * um ícone neutro que só surge no hover, senão três setas competiriam pela
 * atenção sem que nenhuma estivesse valendo.
 *
 * `aria-sort` no <th> é o que faz um leitor de tela anunciar "ordenado de
 * forma crescente" — sem ele, quem não vê a seta não tem como saber a ordem.
 */
function Cabecalho({ campo, rotulo, ordem, aoOrdenar, largura }: {
  campo: CampoOrdem;
  rotulo: string;
  ordem: { campo: CampoOrdem; desc: boolean };
  aoOrdenar: (c: CampoOrdem) => void;
  largura?: string;
}) {
  const ativo = ordem.campo === campo;
  const Icone = !ativo ? ChevronsUpDown : ordem.desc ? ChevronDown : ChevronUp;

  return (
    <th
      scope="col"
      className={`font-medium p-0 ${largura ?? ""}`}
      aria-sort={ativo ? (ordem.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        title={`Ordenar por ${rotulo.toLowerCase()}`}
        className="group w-full flex items-center gap-1 px-3 py-2 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {rotulo}
        <Icone
          className={`w-3.5 h-3.5 shrink-0 ${ativo ? "" : "opacity-0 group-hover:opacity-60"}`}
          aria-hidden
        />
      </button>
    </th>
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
    // Filtro de cuidado. Nao e um modulo nem uma tela: e mais uma opcao na
    // mesma barra de filtros, respondendo a pergunta que o pastor faz e que a
    // lista nao respondia — "de quem ninguem cuida ha tempo?".
    /** Recorte de quem se está olhando: todas, elas, eles, as crianças. */
    const [grupoFiltro, setGrupoFiltro] = useState<string>("todos");
    const [vinculosPessoa, setVinculosPessoa] = useState<Membro | null>(null);
    const [atuacoesPessoa, setAtuacoesPessoa] = useState<Membro | null>(null);
    const [visitantePessoa, setVisitantePessoa] = useState<Membro | null>(null);
    const [contatoPessoa, setContatoPessoa] = useState<Membro | null>(null);
    const [salvandoContato, setSalvandoContato] = useState(false);
    const [error, setError] = useState<string | null>(null);

  // Registrar contato com qualquer pessoa.
  //
  // Grava nos MESMOS campos que a tela de Visitantes ja usava
  // (ultimo_contato_em / tipo / observacao) e no MESMO historico
  // (visita_historico, via logHistorico). Nenhuma tabela nova: o que faltava
  // nao era estrutura, era a acao estar ao alcance de quem cuida.
  const registrarContato = async (pessoa: Membro, tipo: string, observacao: string) => {
    setSalvandoContato(true);
    // Ver o comentario em QuemNinguemProcurou: o update direto nesta tabela
    // falhava em silencio para o papel "lideranca", que e o de 4 dos 6
    // usuarios. A funcao do banco confere o papel e devolve se gravou.
    const { data: gravou, error: err } = await supabase.rpc("registrar_contato", {
      p_pessoa: pessoa.id,
      p_tipo: tipo,
      p_obs: observacao || null,
    });

    if (err) {
      toast.error(err.message);
      setSalvandoContato(false);
      return;
    }
    if (!gravou) {
      toast.error("Não foi possível registrar o contato desta pessoa.");
      setSalvandoContato(false);
      return;
    }

    // "observacao" e o canal generico do historico. O `tipo` que vem do dialogo
    // NAO e canal — e o resultado ("Respondeu", "Não respondeu"), e por isso
    // entra no texto. Em Visitantes o canal era fixo em "whatsapp"; aqui o
    // contato pode ter sido conversa no culto, ligacao ou recado, e afirmar
    // WhatsApp seria registrar algo que nao aconteceu.
    await logHistorico(pessoa.id, "observacao", tipo + (observacao ? ` — ${observacao}` : ""));
    toast.success(`Contato registrado para ${pessoa.nome_completo.split(" ")[0]}`);
    setSalvandoContato(false);
    setContatoPessoa(null);
    load();
  };

  // Paginação: 281 cadastros renderizados de uma vez davam 34.553px de
  // rolagem e 848 botões numa página só. Quem procura alguém usa a busca;
  // quem varre a lista não deveria percorrer 47 telas.
  const POR_PAGINA = 20;
  const [pagina, setPagina] = useState(1);
  const buscaRef = useRef<HTMLInputElement>(null);
  const topoRef = useRef<HTMLDivElement>(null);

  /**
   * Ordenação da tabela. A lista sempre veio ordenada por nome, do banco, e
   * não havia como pedir outra coisa: com 283 pessoas em 15 páginas,
   * "quantos congregados temos" ou "quem é do Maracanã" exigia virar página
   * por página. Cabeçalho de tabela que não ordena é rótulo, não controle.
   */
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; desc: boolean }>({
    campo: "nome",
    desc: false,
  });

  const ordenarPor = (campo: CampoOrdem) =>
    setOrdem((o) => (o.campo === campo ? { campo, desc: !o.desc } : { campo, desc: false }));
    const [searchParams, setSearchParams] = useSearchParams();

  // ── Tratar parâmetros de query ao carregar ──────────────────────────────────
  useEffect(() => {
        // `?cuidado=` foi embora com o filtro de contato. Links antigos que
        // ainda tragam o parâmetro caem na lista inteira em vez de num filtro
        // que não existe mais — e o parâmetro é limpo da barra de endereço,
        // para ninguém guardar um favorito que promete algo que a tela não faz.
        if (searchParams.get("cuidado")) {
                searchParams.delete("cuidado");
                setSearchParams(searchParams, { replace: true });
        }
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

  // Duas etapas de propósito. `baseFiltrados` é "quem está em jogo" — busca,
  // tipo e perfil. É sobre ele que os atalhos contam, para que os números que
  // eles mostram nunca contradigam o que a tela está exibindo: com o tipo em
  // "Visitante", o atalho não pode prometer 217 pessoas para procurar.
  const baseFiltrados = useMemo(() => membros.filter((m) => {
        const q = comparavel(search).trim();
        // Dígitos da busca contra dígitos do telefone. O banco guarda
        // "5521998623415" e a tela mostra "(21) 99862-3415"; sem isto, buscar
        // pelo número que apareceu na tela do celular não encontrava ninguém —
        // e essa é a busca de quem foi ligado de volta e quer saber quem é.
        const qDigitos = search.replace(/\D/g, "");
        const matchSearch =
                !q ||
                comparavel(m.nome_completo).includes(q) ||
                comparavel(m.bairro).includes(q) ||
                (m.cpf ?? "").includes(q) ||
                (qDigitos.length >= 3 && (m.telefone_celular ?? "").replace(/\D/g, "").includes(qDigitos));
        const matchTipo = tipoFiltro === "todos" || m.tipo_pessoa === tipoFiltro;

        // O filtro de perfil de acesso saiu. Ele lia `membros.perfil_acesso`,
        // que é coluna legada: o formulário grava null nela de propósito desde
        // que o acesso passou a viver em `user_roles`. O que sobrou ali é
        // resíduo da importação de junho — 140 "membro", 2 "pastor", 1
        // "lideranca" —, enquanto as pessoas com acesso de verdade são 6.
        // O filtro oferecia Tesoureiro e Professor EBD, que não existem como
        // papel em lugar nenhum do sistema, e não encontrava o admin real.
        return matchSearch && matchTipo;
  }), [membros, search, tipoFiltro]);

  const filtered = useMemo(() => baseFiltrados.filter((m) => {

        // Sexo e criança não se excluem: uma menina entra em "Feminino" e em
        // "Crianças". São recortes de quem se quer olhar, não uma divisão da
        // igreja em três caixas.
        return grupoFiltro === "todos" ? true
             : grupoFiltro === "criancas" ? ehCrianca(m)
             : m.sexo === grupoFiltro;
  }).sort((a, b) => {
        // Quem não tem bairro vai para o fim nas DUAS direções. Inverter a
        // ordem é pedir "de Z a A", não "mostre primeiro os 200 sem bairro" —
        // uma tela cheia de vazio não é resposta para nenhuma das duas.
        if (ordem.campo === "bairro") {
          const va = !!a.bairro?.trim(), vb = !!b.bairro?.trim();
          if (va !== vb) return va ? -1 : 1;
        }

        // Quem não tem cargo vai para o fim nas duas direções, pelo mesmo
        // motivo do bairro: inverter é pedir "de Z a A", não "mostre primeiro
        // as 283 pessoas sem cargo nenhum".
        if (ordem.campo === "funcao") {
          const ca = temCargo(a.funcao_ministerial), cb = temCargo(b.funcao_ministerial);
          if (ca !== cb) return ca ? -1 : 1;
        }

        const chave = (m: Membro) =>
          ordem.campo === "tipo"     ? ({ membro: "1", congregado: "2", visitante: "3" })[m.tipo_pessoa]
          : ordem.campo === "funcao" ? comparavel(rotuloFuncao(m.funcao_ministerial))
          : ordem.campo === "bairro" ? comparavel(m.bairro)
          : comparavel(m.nome_completo);

        const primario = chave(a).localeCompare(chave(b));

        // Empate sempre desfeito pelo nome, em ordem crescente e independente
        // da direção: sem isso, ordenar por tipo deixaria os 149 congregados na
        // ordem em que o banco devolveu — que muda entre consultas, e a lista
        // pareceria embaralhar sozinha a cada clique.
        return (ordem.desc ? -primario : primario)
            || comparavel(a.nome_completo).localeCompare(comparavel(b.nome_completo));
  }), [baseFiltrados, grupoFiltro, ordem]);

  // Os quatro atalhos, contados aqui uma vez e não dentro do JSX — o mesmo
  // `baseFiltrados` alimenta os números e a tabela.
  //
  // Cada um carrega no title a regra que usa: rótulo de uma palavra cabe no
  // chip mas não diz o critério, e filtro cujo critério não se sabe é número
  // em que não se confia.
  //
  // ATENÇÃO AO QUE ESTES NÚMEROS NÃO DIZEM: `sexo` está preenchido em 132 dos
  // 283 cadastros. As outras 151 pessoas não aparecem em "Feminino" nem em
  // "Masculino" — não porque falte gente, mas porque falta campo. Feminino e
  // Masculino não somam 283, e não deveriam parecer que somam.
  const atalhos = useMemo(() => [
    { id: "todos",     rotulo: "Todas",     n: baseFiltrados.length,
      dica: "Todas as pessoas que passam pelos filtros atuais" },
    { id: "feminino",  rotulo: "Feminino",  n: baseFiltrados.filter(m => m.sexo === "feminino").length,
      dica: "Sexo feminino no cadastro. Quem está com o campo em branco não entra aqui" },
    { id: "masculino", rotulo: "Masculino", n: baseFiltrados.filter(m => m.sexo === "masculino").length,
      dica: "Sexo masculino no cadastro. Quem está com o campo em branco não entra aqui" },
    { id: "criancas",  rotulo: "Crianças",  n: baseFiltrados.filter(ehCrianca).length,
      dica: "Menos de 12 anos pela data de nascimento, ou matriculada em Berçário, Crianças ou Juniores" },
  ], [baseFiltrados]);

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
    onContato:   setContatoPessoa,
  };

  const filtrando =
    search.trim() !== "" || tipoFiltro !== "todos" || grupoFiltro !== "todos";

  const limparFiltros = () => {
    setSearch("");
    setTipoFiltro("todos");
    setGrupoFiltro("todos");
    buscaRef.current?.focus();
  };

  /**
   * Trocar de página levava para o mesmo lugar onde o dedo estava: o rodapé.
   * Chegava-se ao topo da página 2 rolando de volta a tela inteira, e a
   * primeira pessoa da nova página — que é o motivo de ter virado a página —
   * ficava acima do campo de visão.
   *
   * `window.scrollTo` não serviria: quem rola nesta aplicação é o <main>, e
   * não a janela (window.scrollY é sempre 0). Rolar a sentinela para a vista
   * funciona sem que esta tela precise saber qual ancestral tem a barra.
   */
  const irParaPagina = (p: number) => {
    setPagina(p);
    topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Voltar à primeira página quando o resultado muda: continuar na página 7
  // de uma busca que agora tem 3 resultados deixaria a tela vazia.
  //
  // A ordem entra na lista pelo mesmo motivo: ordenar por bairro estando na
  // página 7 mostraria a fatia 121–140 de uma lista que acabou de ser
  // reembaralhada — quem pediu "por bairro" quer ver o começo, não o meio.
  useEffect(() => { setPagina(1); }, [search, tipoFiltro, grupoFiltro, ordem]);

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
                    <div className="p-4 md:p-8 space-y-4" ref={topoRef}>
                            <div className="flex flex-col md:flex-row md:flex-wrap gap-3 md:items-center">
                                      {/* min-w-[220px]: os três seletores têm largura fixa de 224px cada, e
                                                      numa janela estreita — ou com a barra lateral aberta — eles tomavam
                                                      a linha inteira e espremiam a busca até caber só a lupa. Com o
                                                      mínimo e o flex-wrap acima, os seletores descem para a segunda
                                                      linha em vez de engolir o campo mais usado da tela. */}
                                      <div className="relative flex-1 min-w-[220px] max-w-md">
                                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                  {/* O rótulo dizia "nome, CPF ou bairro". CPF está preenchido em DOIS
                                                      dos 283 cadastros — a busca anunciava um campo que praticamente não
                                                      existe e calava sobre o que existe em 217 deles: o telefone. Continua
                                                      procurando por CPF para os dois que têm; só parou de prometer. */}
                                                  <Input
                                                                  ref={buscaRef}
                                                                  className="pl-9 pr-10"
                                                                  placeholder="Buscar por nome, telefone ou bairro..."
                                                                  value={search}
                                                                  onChange={(e) => setSearch(e.target.value)}
                                                                  // Esc limpa — hábito de qualquer campo de busca, e assim o foco já
                                                                  // fica no lugar certo para a próxima tentativa.
                                                                  onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
                                                                />
                                                  {/* No celular não há Esc: apagar letra por letra era a única saída
                                                      de uma busca que não achou nada. */}
                                                  {search && (
                                                    <button
                                                      type="button"
                                                      aria-label="Limpar busca"
                                                      onClick={() => { setSearch(""); buscaRef.current?.focus(); }}
                                                      className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                      <X className="w-4 h-4" />
                                                    </button>
                                                  )}
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
                                      {/* Sobraram a busca e o tipo de pessoa. Saíram dois seletores:
                                      
                                          "Situação do cadastro" — aniversário do mês e sem telefone. Eram
                                          perguntas de manutenção de cadastro no meio de uma tela de
                                          consulta, e a segunda já tem lugar próprio no painel de cadastros
                                          incompletos.
                                      
                                          "Perfil de Acesso" — lia membros.perfil_acesso, coluna legada
                                          em que o formulário grava null de propósito desde que o acesso
                                          passou a viver em user_roles. O que restava ali era resíduo da
                                          importação de junho: 140 "membro", 2 "pastor", 1 "lideranca",
                                          enquanto as pessoas com acesso de verdade são 6 e nenhuma delas
                                          aparecia. Oferecia ainda Tesoureiro e Professor EBD, que não
                                          existem como papel em lugar nenhum do sistema. Um filtro que
                                          responde errado é pior do que filtro nenhum: quem administra
                                          acesso vai a /usuarios, onde o dado é o certo. */}
                            </div>
                    
                            {/* ── Atalhos com número ─────────────────────────────────
                                Três seletores lado a lado dizem o que É POSSÍVEL
                                perguntar, e nenhum diz o que a lista tem para
                                responder. Era preciso abrir "Cuidado", escolher uma
                                opção e contar linha por linha para descobrir que 94
                                pessoas dão para procurar hoje — número que já estava
                                ali, recalculado a cada carregamento e mostrado em
                                lugar nenhum.

                                Os atalhos são o MESMO estado do seletor de Cuidado, e
                                não um filtro paralelo: clicar no atalho muda o
                                seletor, e mudar o seletor acende o atalho. Dois
                                controles capazes de se contradizer seriam piores que
                                nenhum. Clicar no que já está aceso volta para "Todas". */}
                            {!loading && !error && membros.length > 0 && (
                              <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de filtro">
                                {atalhos.map((a) => {
                                  const ativo = grupoFiltro === a.id;
                                  return (
                                    <button
                                      key={a.id}
                                      type="button"
                                      aria-pressed={ativo}
                                      title={a.dica}
                                      aria-label={`${a.rotulo}: ${a.n}. ${a.dica}`}
                                      onClick={() => setGrupoFiltro(ativo ? "todos" : a.id)}
                                      className={`min-h-[44px] px-3 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                        ativo
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background hover:bg-muted border-border"
                                      }`}
                                    >
                                      <span className="font-semibold tabular-nums">{a.n}</span>{" "}
                                      <span className={ativo ? "" : "text-muted-foreground"}>{a.rotulo}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                      {/* Quantas sobraram, e a saída. A paginação dizia "1–20 de 94", mas só
                          aparece quando há mais de uma página: uma busca com 12 resultados não
                          trazia número nenhum. E com três seletores e um atalho ligados ao mesmo
                          tempo, desfazer significava lembrar de tudo que se tinha tocado. */}
                      {!loading && !error && filtrando && filtered.length > 0 && (
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span aria-live="polite">
                            <span className="font-medium text-foreground tabular-nums">{filtered.length}</span>{" "}
                            {filtered.length === 1 ? "pessoa" : "pessoas"} de {membros.length}
                          </span>
                          <button
                            type="button"
                            onClick={limparFiltros}
                            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            Limpar filtros
                          </button>
                        </div>
                      )}

                      {loading ? (
                                    <ListSkeleton className="grid gap-3" count={5} />
                                  ) : error ? (
                                    <ErrorState onRetry={load} />
                                  ) : filtered.length === 0 ? (
                                    // Beco sem saída vira porta: dizer "nada encontrado" e parar aí obriga
                                    // a desfazer no braço filtro por filtro para voltar a ver a lista.
                                    <EmptyState
                                      message={filtrando ? "Nenhuma pessoa com esses filtros" : "Nenhuma pessoa cadastrada"}
                                      action={filtrando ? (
                                        <Button variant="outline" onClick={limparFiltros}>Limpar filtros</Button>
                                      ) : undefined}
                                    />
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
                                                                                                          {/* No desktop o nome é o botão que abre o cadastro; no celular era
                                                                                                              texto morto. Tocar no nome é o gesto óbvio, e o lápis de 44px ao
                                                                                                              lado era o único caminho — a mesma lista respondia a coisas
                                                                                                              diferentes conforme o aparelho.
                                                                                                              O nome é <button> dentro do <p>, e não o cartão inteiro clicável:
                                                                                                              o cartão contém o link do WhatsApp e o menu de ações, e um alvo
                                                                                                              grande por cima deles roubaria o toque de ambos. */}
                                                                                                          <p className="font-medium min-w-0">
                                                                                                            <button
                                                                                                              type="button"
                                                                                                              onClick={() => { setEditing(m); setOpen(true); }}
                                                                                                              className="flex items-center gap-2 min-w-0 max-w-full text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                                                                                            >
                                                                                                              <span className="truncate">{m.nome_completo}</span>
                                                                                                              <MarcaAniversario nascimento={m.data_nascimento} />
                                                                                                            </button>
                                                                                                          </p>
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
                                                                                                          {/* O telefone saiu do amontoado "telefone • email • bairro", que era
                                                                                                              montado com join e virava um bloco de texto cru. No celular, que é
                                                                                                              onde este cartão aparece, o número é a única coisa desta linha que
                                                                                                              leva a algum lugar: um toque abre a conversa. Email e bairro seguem
                                                                                                              depois, em cinza, como o contexto que são. */}
                                                                                                          {(() => {
                                                                                                            // Sem telefone, o traço do componente colava no bairro ("—Praça da
                                                                                                            // Bandeira"). Aqui o traço só aparece quando NÃO HÁ nada nesta linha —
                                                                                                            // que é quando ele quer dizer alguma coisa.
                                                                                                            const resto = [m.email, m.bairro].filter(Boolean);
                                                                                                            return (
                                                                                                              <div className="text-sm truncate">
                                                                                                                {m.telefone_celular && <Telefone numero={m.telefone_celular} />}
                                                                                                                {resto.length > 0 && (
                                                                                                                  <span className="text-muted-foreground">
                                                                                                                    {m.telefone_celular ? " · " : ""}{resto.join(" · ")}
                                                                                                                  </span>
                                                                                                                )}
                                                                                                                {!m.telefone_celular && resto.length === 0 && (
                                                                                                                  <span className="text-muted-foreground">—</span>
                                                                                                                )}
                                                                                                              </div>
                                                                                                            );
                                                                                                          })()}
                                                                                                          {/* Os vínculos também entram no cartão. A tabela do desktop passou a
                                                                                                              mostrar ministério, liderança e EBD; deixar o celular sem eles faria
                                                                                                              a mesma lista responder coisas diferentes conforme o aparelho — e o
                                                                                                              celular é onde a liderança abre isto, em pé, durante o culto. */}
                                                                                                          {(() => {
                                                                                                            const v = vinculos(m);
                                                                                                            return v.length > 0 ? (
                                                                                                              <div className="text-xs text-muted-foreground truncate mt-0.5">{v.join(" · ")}</div>
                                                                                                            ) : null;
                                                                                                          })()}
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
                            {/* Sem `overflow-hidden` no invólucro. Ele existia só para aparar os
                                cantos da tabela dentro da borda arredondada, e um ancestral com
                                overflow diferente de `visible` vira o contexto de rolagem do
                                `position: sticky` — o cabeçalho colava numa caixa que nunca rola,
                                ou seja, não colava em nada. Medido: com ele, o <thead> descia de
                                y=266 para y=-134 ao rolar 400px. Os cantos voltam pelo
                                arredondamento das próprias células das pontas. */}
                            {!loading && !error && filtered.length > 0 && (
                              <div className="hidden md:block rounded-lg border">
                                <table className="w-full text-sm">
                                  <caption className="sr-only">
                                    Pessoas cadastradas — {filtered.length} no filtro atual,
                                    mostrando {inicio + 1} a {Math.min(inicio + POR_PAGINA, filtered.length)}
                                  </caption>
                                  {/* Cabeçalho grudado no topo: são 20 linhas por página, a tabela
                                      passa da altura da tela, e ao chegar na décima pessoa não se
                                      sabia mais qual coluna era qual. */}
                                  <thead className="bg-muted/50 sticky top-0 z-10 [&>tr>th:first-child]:rounded-tl-lg [&>tr>th:last-child]:rounded-tr-lg">
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <Cabecalho campo="nome"   rotulo="Nome"   ordem={ordem} aoOrdenar={ordenarPor} />
                                      <Cabecalho campo="tipo"   rotulo="Tipo"   ordem={ordem} aoOrdenar={ordenarPor} largura="w-28" />
                                      {/* Hoje as 283 pessoas estão como "membro", que no enum quer dizer
                                          "sem cargo" — a coluna nasce vazia de propósito. Não repete a
                                          mesma palavra em toda linha, como fazia o "Nunca" do último
                                          contato: quem não tem cargo não ganha nada, e cada diácono ou
                                          presbítero cadastrado aparece sozinho na coluna, que é quando
                                          ela passa a valer o espaço. */}
                                      <Cabecalho campo="funcao" rotulo="Função" ordem={ordem} aoOrdenar={ordenarPor} largura="w-36 hidden lg:table-cell" />
                                      <th scope="col" className="font-medium px-3 py-2 w-40">Telefone</th>
                                      {/* Bairro só a partir de 1024px. Entre 768 e 1024 as quatro colunas
                                          fixas somavam mais largura do que sobrava para o nome, e "Agatha
                                          Victoria Vieira de Castro" virava "Agatha Victoria V...". Numa
                                          lista de pessoas, o nome é a última coisa que pode ser cortada. */}
                                      <Cabecalho campo="bairro" rotulo="Bairro" ordem={ordem} aoOrdenar={ordenarPor} largura="w-40 hidden xl:table-cell" />
                                      <th scope="col" className="font-medium px-3 py-2 w-16">
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
                                            className="block w-full min-w-0 py-2 text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                                            onClick={() => { setEditing(m); setOpen(true); }}
                                          >
                                            <span className="flex items-center gap-2 min-w-0">
                                              <span className="truncate">{m.nome_completo}</span>
                                              <MarcaAniversario nascimento={m.data_nascimento} />
                                            </span>
                                            {/* Segunda linha só quando há o que dizer. Quem não
                                                serve, não lidera e não estuda não ganha um "—":
                                                a ausência da linha já é a informação, e um traço
                                                em 200 linhas seria só ruído. */}
                                            {(() => {
                                              const v = vinculos(m);
                                              return v.length > 0 ? (
                                                <span className="block truncate text-xs font-normal text-muted-foreground mt-0.5">
                                                  {v.join(" · ")}
                                                </span>
                                              ) : null;
                                            })()}
                                          </button>
                                        </th>
                                        <td className="px-3 py-0">
                                          {/* Aqui a etiqueta NÃO é só da exceção — e o comentário que estava
                                              nesta célula media a coisa errada: dizia "274 dos 279 são membros
                                              ativos", confundindo tipo com situação. Contado no banco são 132
                                              membros, 149 congregados e 2 visitantes. Metade da igreja não é
                                              exceção. Com a célula em branco para membro, a coluna dizia
                                              "congregado ou nada", e o branco tinha de ser adivinhado. Agora
                                              todos têm o seu: membro em texto discreto, por ser o esperado;
                                              congregado e visitante em etiqueta, por mudarem o que se faz com
                                              a pessoa. Situação diferente de "ativo" (2 em 283) segue vencendo
                                              as duas, porque nesse caso é o que há de mais urgente a dizer. */}
                                          {m.tipo_pessoa !== "membro" ? (
                                            <Badge variant="outline" className={tipoPessoaColor[m.tipo_pessoa]}>
                                              {tipoPessoaLabel[m.tipo_pessoa]}
                                            </Badge>
                                          ) : m.status !== "ativo" ? (
                                            <StatusMembroBadge status={m.status} compact />
                                          ) : (
                                            <span className="text-muted-foreground">Membro</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-0 hidden lg:table-cell">
                                          {temCargo(m.funcao_ministerial) && (
                                            <span className="text-sm">{rotuloFuncao(m.funcao_ministerial)}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-0 text-muted-foreground tabular-nums whitespace-nowrap">
                                          <Telefone numero={m.telefone_celular} />
                                        </td>
                                        {/* "Último contato" saiu e o bairro voltou.
                                            A coluna de contato lia "Nunca" nas 283 linhas: uma
                                            coluna em que todas as células dizem a mesma coisa não
                                            informa nada e ainda ocupa 160px em toda página. A
                                            pergunta pastoral continua na tela, no atalho "Dá para
                                            procurar", que é onde ela vira uma lista de gente, e na
                                            ficha de cada pessoa. Quando houver contatos
                                            registrados de verdade, a coluna volta a discriminar e
                                            pode voltar — o componente está no histórico do git.
                                            O bairro volta por um motivo prático: a busca casa por
                                            bairro. Procurar "maracana" trazia 17 pessoas sem
                                            mostrar em lugar nenhum por que aquelas 17. */}
                                        <td className="px-3 py-0 text-muted-foreground hidden xl:table-cell">
                                          <span className="block truncate">{m.bairro || "—"}</span>
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
                                // pb-16 só no celular: o botão flutuante de "Nova pessoa"
                                // fica fixo no canto inferior direito e cobria a maior
                                // parte de "Próxima" — medido, sobravam 15% da largura
                                // clicáveis, o resto do toque ia para o botão de cima.
                                // Com 283 pessoas em 15 páginas, o caminho para a frente
                                // estava embaixo de outro botão. O espaço extra empurra a
                                // paginação para cima do flutuante no fim da rolagem.
                                className="flex items-center justify-between gap-3 pt-1 pb-16 md:pb-0"
                                aria-label="Paginação da lista de pessoas"
                              >
                                <Button
                                  variant="outline"
                                  className="min-h-[44px]"
                                  disabled={paginaAtual === 1}
                                  onClick={() => irParaPagina(Math.max(1, paginaAtual - 1))}
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
                                  onClick={() => irParaPagina(Math.min(totalPaginas, paginaAtual + 1))}
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

                    {/* O mesmo dialogo usado na tela de Visitantes. Ele ja
                        perguntava "como foi o contato?" e aceitava observacao;
                        so nao estava disponivel fora dali. */}
                    <ContatoResultadoDialog
                              open={!!contatoPessoa}
                              onOpenChange={(v) => { if (!v) setContatoPessoa(null); }}
                              nomeVisitante={contatoPessoa?.nome_completo ?? ""}
                              saving={salvandoContato}
                              onConfirm={async (tipo, obs) => {
                                if (contatoPessoa) await registrarContato(contatoPessoa, tipo, obs);
                              }}
                            />
              </div>
          );
          }
