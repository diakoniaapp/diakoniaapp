// ============================================================
// PessoaCard.tsx
// Card completo de pessoa — mini-perfil com todos os vínculos
// ============================================================

import { useEffect, useState } from "react";
import { supabase, supabaseRel } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Shield, Church, MapPin, Calendar, Star, Pencil, MessageCircle, NotebookPen, Home as IconeCasa } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useAuth } from "@/hooks/useAuth";
import { cargosDaPessoa } from "@/services/diretoriaService";
import { familiaDaPessoa, PARENTESCO_LABEL } from "@/services/familiaService";
import { TIPO_PESSOA_LABEL, TIPO_PESSOA_COR, type TipoPessoa } from "@/lib/tipoPessoa";
import { Skeleton } from "@/components/ui/skeleton";
import { LinhaDoTempo } from "@/components/membros/LinhaDoTempo";
import { historiaDaPessoa, diasDesdeOUltimoContato, type EventoDaHistoria } from "@/services/historiaPessoa";
import { ROLE_LABEL } from "@/types/usuario";
import { normalizarTelefone, formatarTelefoneSemDDI } from "@/lib/telefone";

// ── Datas ─────────────────────────────────────────────────────
//
// Duas linhas para não trazer `date-fns` só por isto, e para a assinatura da
// saída sair no MESMO formato da assinatura da anotação pastoral logo abaixo
// dela na ficha ("26.08.2026 às 23h27"). Dois formatos de data na mesma tela
// fazem parecer que vieram de sistemas diferentes.

const dois = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-DD" → "20/08/2026". O `T00:00` evita o recuo de fuso. */
function soData(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Carimbo com hora, no formato da assinatura: "26.08.2026 às 23h27". */
function dataComHora(iso: string): string {
  const d = new Date(iso);
  return `${dois(d.getDate())}.${dois(d.getMonth() + 1)}.${d.getFullYear()}`
       + ` às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
}

// ── Tipos ─────────────────────────────────────────────────────

interface PessoaCompleta {
  id: string;
  nome_completo: string;
  nome_social: string | null;
  foto_url: string | null;
  tipo_pessoa: string;
  status: string;
  data_entrada: string | null;
  // A saída do rol e a assinatura de quem a registrou. Ver a migration
  // 20260828180000 — o carimbo é do gatilho, não do cliente.
  data_saida: string | null;
  saida_registrada_em: string | null;
  saida_registrada_por_nome: string | null;
  saida_registrada_por_funcao: string | null;
  created_at: string | null;
  origem_cadastro: string | null;
  email: string | null;
  telefone_celular: string | null;
  perfil_acesso: string | null;
  /**
   * O que a liderança anotou sobre o cuidado desta pessoa.
   *
   * Já existia na tabela e não aparecia em ficha nenhuma — era preciso abrir
   * o formulário de edição para ler. É justamente o que quem abre a ficha de
   * alguém quer saber, e por isso passou a ser mostrado aqui.
   */
  observacoes_pastorais: string | null;
}

interface CargoEstatutario {
  cargo: string;
  nivel: number;
  mandato: string | null;
}

interface MinisterioVinculo {
  ministerio_nome: string;
  funcao: string;
  cor: string | null;
}

interface AreaVinculo {
  ministerio_nome: string;
  area_nome: string;
  funcao: string;
}

// ── Helpers visuais ───────────────────────────────────────────

// Antes daqui saía congregado em VERDE e membro em AZUL, enquanto o
// catálogo mostrava dourado e cobre para as mesmas pessoas. Agora as duas
// telas leem do mesmo lugar — ver o comentário em lib/tipoPessoa.ts.
const TIPO_CONFIG: Record<string, { label: string; cor: string }> =
  Object.fromEntries(
    (Object.keys(TIPO_PESSOA_LABEL) as TipoPessoa[]).map(t => [
      t, { label: TIPO_PESSOA_LABEL[t], cor: TIPO_PESSOA_COR[t] },
    ]),
  );

const FUNCAO_CONFIG: Record<string, { label: string; cor: string }> = {
  // O roxo saiu. Ele não existe na paleta da igreja, e numa lista de
  // etiquetas ao lado de co-líder, tesoureiro e diácono ele dizia "isto
  // aqui é de outro sistema". Liderar é a função de maior peso da lista:
  // fica com a cor da casa. Mesmo caminho que QuadrosInstitucionais.tsx já
  // tinha tomado para a diretoria.
  lider:       { label: "Líder",       cor: "bg-primary/10 text-primary border-primary/30" },
  co_lider:    { label: "Co-líder",    cor: "bg-info-soft text-info-text border-info-line" },
  secretario:  { label: "Secretário",  cor: "bg-info-soft text-info-text border-info-line" },
  tesoureiro:  { label: "Tesoureiro",  cor: "bg-warning-soft text-warning-text border-warning-line" },
  voluntario:  { label: "Voluntário",  cor: "bg-success-soft text-success-text border-success-line" },
  diacono:     { label: "Diácono",     cor: "bg-warning-soft text-warning-text border-warning-line" },
  obreiro:     { label: "Obreiro",     cor: "bg-teal/15 text-teal border-teal/30" },
  colaborador: { label: "Colaborador", cor: "bg-gray-100 text-gray-600 border-gray-300" },
};

const PERFIL_CONFIG: Record<string, { label: string; cor: string }> = {
  admin:        { label: "Admin",        cor: "bg-primary/10 text-primary" },
  pastor:       { label: "Pastor",       cor: "bg-info-soft text-info-text" },
  secretaria:   { label: "Secretaria",   cor: "bg-info-soft text-info-text" },
  tesoureiro:   { label: "Tesoureiro",   cor: "bg-warning-soft text-warning-text" },
  lideranca:    { label: "Liderança",    cor: "bg-success-soft text-success-text" },
  voluntario:   { label: "Voluntário",   cor: "bg-gray-100 text-gray-600" },
  membro:       { label: "Membro",       cor: "bg-gray-100 text-gray-600" },
};

const NIVEL_CARGO_EMOJI: Record<number, string> = {
  1: "👑", 2: "⭐", 3: "📋", 4: "💰",
};

/**
 * Há quanto tempo a pessoa está na igreja — ou o silêncio, quando não se sabe.
 *
 * `data_entrada` carimbada pela importação de junho/2026 dizia, sobre gente
 * que a igreja conhece há anos, "na igreja há menos de 1 ano". A linha
 * "Chegou à igreja" da história já parou de aparecer nesses casos; este
 * rodapé repetia a mesma invenção com outras palavras, e por isso precisa da
 * mesma regra.
 *
 * O teste começa pela ORIGEM do cadastro, não pela distância entre as datas:
 * quem foi cadastrado aqui e chegou no mesmo dia tem as duas iguais, e isso é
 * verdade, não carimbo.
 */
function calcularTempo(p: {
  data_entrada: string | null; created_at: string | null;
  origem_cadastro: string | null; tipo_pessoa: string;
}): string {
  if (!p.data_entrada) return "Tempo de casa não registrado";

  // Membro sempre tem a data, porque ninguém entra no rol sem assembleia — e
  // assembleia tem data. Para ele o carimbo da importação não silencia nada.
  const ehMembro = p.tipo_pessoa === "membro";

  const carimbo =
    !ehMembro && p.origem_cadastro === "importacao" && !!p.created_at &&
    Math.abs(
      (new Date(p.data_entrada + "T00:00").getTime() - new Date(p.created_at).getTime())
      / 86_400_000,
    ) <= 7;
  if (carimbo) return "Tempo de casa não registrado";

  const anos = Math.floor((Date.now() - new Date(p.data_entrada).getTime()) / (365.25 * 86_400_000));

  // "Na igreja há 8 anos" seria impreciso para membro: a data conta desde a
  // ENTRADA NO ROL, e quem congregou dez anos antes de ser aclamado está na
  // igreja há muito mais tempo do que a frase diria.
  const oQue = ehMembro ? "No rol de membros há" : "Na igreja há";
  if (anos === 0) return `${oQue} menos de 1 ano`;
  return `${oQue} ${anos} ano${anos !== 1 ? "s" : ""}`;
}

// ── Componente Principal ──────────────────────────────────────

interface PessoaCardProps {
  pessoaId: string | null;
  open: boolean;
  onClose: () => void;
  /**
   * Quem abriu quer so consultar: esconde o lapis de edicao.
   *
   * Nao concede nada — a checagem de papel abaixo continua valendo por
   * cima. Serve ao Painel Pastoral, que mostra a ficha para a lideranca
   * pastoral sem oferecer o que e trabalho da secretaria.
   */
  somenteLeitura?: boolean;
}

export default function PessoaCard({ pessoaId, open, onClose, somenteLeitura = false }: PessoaCardProps) {
  const navigate = useNavigate();
  const { podeEditarPessoas, user, roles, hasRole } = useAuth();
  const { podeFazer, permissoes: permsCarregadas, loading: permsCarregando } = usePermissoes();
  // Mesmo piso usado no catalogo: conjunto vazio quer dizer consulta falhada,
  // nao usuario sem direito.
  const semResposta = permsCarregando || permsCarregadas.size === 0;
  const temDireito  = semResposta ? podeEditarPessoas : podeFazer("editar_pessoa");
  // O pedido de quem abriu so RESTRINGE; nunca amplia o direito.
  const podeEditar  = !somenteLeitura && temDireito;

  /**
   * Escrever observação pastoral é direito separado de editar a ficha.
   *
   * O pastor titular perdeu a edição do cadastro em 27/08/2026 — a regra
   * passou a ser "só admin e secretaria editam pessoas". Mas ele precisa
   * anotar o que conversou, e antes disso o único lugar onde a observação se
   * escrevia era o formulário de 6 passos, que ele não abre mais.
   *
   * Sem este bloco, a restrição teria tirado dele a única coisa que só ele
   * faz. O banco já sabe separar as duas: a política deixa o pastor gravar na
   * linha e o gatilho `zzz_pastor_so_observacoes` recusa qualquer outra
   * coluna.
   *
   * `somenteLeitura` NÃO bloqueia aqui, e é deliberado: quem abre a ficha
   * pelo Painel Pastoral está justamente fazendo cuidado pastoral.
   */
  const podeAnotar = semResposta ? podeEditarPessoas : podeFazer("editar_obs_pastorais");

  /**
   * Quem está anotando, para ficar gravado na linha.
   *
   * O nome sai do metadado da conta e cai no telefone quando não há — o login
   * aqui é por telefone, e `auth.users.email` é sintético
   * (`{dígitos}@app.diakonia`), então mostrá-lo seria pior que mostrar nada.
   *
   * A função é o PAPEL DE ACESSO, e não a função ministerial: o que a
   * anotação precisa registrar é em que capacidade a pessoa escreveu — quem
   * responde pela secretaria, quem responde pelo pastorado. Uma pessoa pode
   * ser diaconisa e secretária ao mesmo tempo, e quem lê a ficha quer saber
   * qual das duas estava anotando.
   */
  const [nomeDeQuemAnota, setNomeDeQuemAnota] = useState("Sem nome");
  /**
   * A função, curta, para assinar a anotação.
   *
   * Separada de `ROLE_LABEL` de propósito: lá "admin" é "Administrador",
   * palavra que ocupa metade da assinatura numa linha de 11px. Aqui a
   * assinatura é rodapé de um texto, não etiqueta de perfil — e "Admin" diz
   * a mesma coisa em cinco letras.
   *
   * `diakonia` mantém "Pastor titular" inteiro: encurtar para "Pastor"
   * apagaria a diferença entre os dois papéis, que no banco têm alcances
   * distintos (62 combinações contra 34).
   */
  const FUNCAO_CURTA: Record<string, string> = {
    admin: "Admin", secretaria: "Secretaria", diakonia: "Pastor titular",
    pastor: "Pastor titular", tesouraria: "Tesouraria",
    lideranca: "Liderança", voluntario: "Voluntário",
    membro: "Membro",
  };
  const funcaoDeQuemAnota =
    roles.map(r => FUNCAO_CURTA[r] ?? ROLE_LABEL[r] ?? r).join(" · ") || "Sem função";

  useEffect(() => {
    if (!user?.id) return;
    let cancelado = false;
    (async () => {
      // O nome vem do CADASTRO, e não do metadado da conta.
      //
      // Testado com dado real e o autor saiu como "5521983991229": o login é
      // por telefone, `auth.users.email` é sintético (`{dígitos}@app.diakonia`)
      // e `user_metadata.nome` está vazio para quem entrou por convite. Uma
      // anotação assinada por um número não diz quem escreveu.
      //
      // `profiles.pessoa_id` liga a conta à ficha, e é de lá que sai o nome
      // que a igreja usa — o mesmo caminho que a RPC do Painel de Acessos faz.
      const { data } = await supabase
        .from("profiles")
        .select("nome, membros:pessoa_id(nome_completo)")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelado) return;
      const doCadastro = (data as any)?.membros?.nome_completo as string | undefined;
      setNomeDeQuemAnota(
        doCadastro?.trim() || (data as any)?.nome?.trim() || "Sem nome",
      );
    })();
    return () => { cancelado = true; };
  }, [user?.id]);

  // Fecha a ficha e abre o formulário na tela de Pessoas.
  //
  // O parâmetro `?abrir=<id>` já existia e já fazia exatamente isso — não
  // precisou de rota nem de estado novo. Renderizar o MembroForm aqui dentro
  // seria um diálogo sobre outro, e o formulário tem seis passos: não cabe.
  function irParaEdicao() {
    if (!pessoaId) return;
    onClose();
    navigate(`/membros?abrir=${pessoaId}`);
  }
  const [pessoa, setPessoa]         = useState<PessoaCompleta | null>(null);
  const [cargos, setCargos]         = useState<CargoEstatutario[]>([]);
  const [ministerios, setMinerios]  = useState<MinisterioVinculo[]>([]);
  const [areas, setAreas]           = useState<AreaVinculo[]>([]);
  const [historia, setHistoria]     = useState<EventoDaHistoria[]>([]);

  /**
   * As anotações pastorais, da mais nova para a mais antiga.
   *
   * Saem da MESMA consulta que a linha do tempo — `historiaDaPessoa` já traz
   * tudo o que está gravado sobre a pessoa. Uma segunda consulta só para
   * estas seria mais uma ida ao banco por ficha aberta e mais um lugar onde
   * as duas listas poderiam discordar.
   */
  const anotacoes = historia
    .filter(e => e.tipo === "anotacao")
    // Mais recente sempre em cima. `historiaDaPessoa` já devolve nessa ordem,
    // mas ela ordena a LINHA DO TEMPO: se um dia alguém a inverter para
    // contar a vida do começo, este bloco viraria junto sem ninguém notar.
    // A garantia fica aqui, ao lado de quem depende dela.
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
    .map(e => {
      const d = new Date(e.data);
      /**
       * "Telma | Admin - 26.08.2026 às 20h48".
       *
       * PRIMEIRO nome, e não o nome inteiro. Numa igreja de 295 pessoas quem
       * lê a ficha sabe de quem se trata pelo primeiro nome somado à função,
       * e "Telma Rodrigues de Souza · Administrador" gastaria a linha toda
       * numa assinatura que é rodapé de um texto, não o texto.
       *
       * O nome COMPLETO continua gravado na linha, para quando for preciso
       * responder "quem escreveu isto" sem ambiguidade.
       */
      const primeiroNome = (e.autorNome ?? "").trim().split(/\s+/)[0] || "";
      const funcao = (e.autorFuncao ?? "").trim() || "Sem função";
      const dataHora =
        `${dois(d.getDate())}.${dois(d.getMonth() + 1)}.${d.getFullYear()}` +
        ` às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
      return {
        id: e.refId ?? null,
        texto: e.detalhe ?? "",
        detalhe: e.detalhe,
        // Sem nome gravado — anotação antiga ou escrita por caminho que não o
        // informou — a assinatura não inventa um: fica só função e data.
        assinatura: primeiroNome
          ? `${primeiroNome} | ${funcao} - ${dataHora}`
          : `${funcao} - ${dataHora}`,
      };
    });
  const [familia, setFamilia]       = useState<{ nome: string; parentesco: string; responsavel: boolean } | null>(null);
  const [loading, setLoading]       = useState(false);
  const [anotando, setAnotando]     = useState(false);
  /** Id da anotação em edição — só o administrador chega aqui. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [anotacaoParaApagar, setAnotacaoParaApagar] =
    useState<{ id: string; texto: string } | null>(null);

  /**
   * Corrigir e apagar anotação é só do administrador.
   *
   * Pelo papel, e não por permissão: apagar é a operação sem volta, e é a
   * convenção deste banco — dezenas de tabelas dão INSERT e UPDATE a vários
   * papéis e DELETE só ao admin. As políticas `admin_update_anotacao` e
   * `admin_delete_anotacao` dizem o mesmo do lado de lá, e é ELA que manda:
   * se um dia divergirem, a tela oferece um botão que o banco recusa.
   */
  const ehAdmin = hasRole("admin");
  const [rascunho, setRascunho]     = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);

  /**
   * Grava a observação pastoral, e só ela.
   *
   * O `.select()` não é enfeite: a política de UPDATE de `membros` é de
   * admin+secretaria, e o pastor passa por outra (`pastor_acessa_obs_pastorais`).
   * Se alguém mexer numa das duas, o UPDATE barrado voltaria como SUCESSO com
   * zero linhas — e a tela diria "salvo" sobre nada. É o padrão do projeto,
   * em `lib/escritaConferida.ts`.
   *
   * Manda UMA coluna de propósito. O gatilho do banco recusaria as outras de
   * qualquer forma, mas mandar só o que se quer mudar evita depender disso e
   * torna o erro impossível em vez de evitável.
   */
  async function salvarObservacoes() {
    if (!pessoa) return;
    const texto = rascunho.trim();
    if (!texto) { setAnotando(false); return; }

    setSalvandoObs(true);
    const r = conferir(
      await supabase
        .from("visita_historico")
        .insert({
          visitante_id: pessoa.id,
          tipo: "anotacao_pastoral",
          observacao: texto,
          registrado_por: user?.id ?? null,
          // Nome e função gravados como TEXTO, no momento da escrita. Papel
          // muda: quem anota hoje como Secretária pode ser Pastora em dois
          // anos, e a anotação não pode mudar de autor junto. Ver o COMMENT
          // da coluna no banco.
          registrado_por_nome:   nomeDeQuemAnota,
          registrado_por_funcao: funcaoDeQuemAnota,
        })
        .select("id"),
      "A anotação pastoral",
    );
    setSalvandoObs(false);
    if (!r.ok) return toast.error(r.erro);

    // A linha do tempo é a fonte: recarregá-la é o que faz a anotação
    // aparecer, e evita manter uma cópia em estado que possa divergir.
    setHistoria(await historiaDaPessoa(pessoa.id));
    setRascunho("");
    setAnotando(false);
    toast.success("Anotação registrada.");
  }

  /**
   * Corrige o texto de uma anotação, e só ele.
   *
   * Data e autor NÃO são tocados: quem conserta um erro de digitação não vira
   * autor da anotação. A política do banco impõe o mesmo pelo `WITH CHECK`.
   */
  async function salvarEdicao() {
    if (!pessoa || !editandoId) return;
    const texto = rascunho.trim();
    if (!texto) return toast.error("A anotação não pode ficar vazia. Para removê-la, use Excluir.");

    setSalvandoObs(true);
    const r = conferir(
      await supabase
        .from("visita_historico")
        .update({ observacao: texto })
        .eq("id", editandoId)
        .select("id"),
      "A anotação",
    );
    setSalvandoObs(false);
    if (!r.ok) return toast.error(r.erro);
    setHistoria(await historiaDaPessoa(pessoa.id));
    setEditandoId(null);
    setRascunho("");
    toast.success("Anotação corrigida.");
  }

  async function apagarAnotacao() {
    if (!pessoa || !anotacaoParaApagar) return;
    setSalvandoObs(true);
    // `.select()` também no DELETE: sem política que permita, ele volta como
    // sucesso com zero linhas — e a tela diria "excluída" sobre nada.
    const r = conferir(
      await supabase
        .from("visita_historico")
        .delete()
        .eq("id", anotacaoParaApagar.id)
        .select("id"),
      "A anotação",
    );
    setSalvandoObs(false);
    if (!r.ok) return toast.error(r.erro);
    setHistoria(await historiaDaPessoa(pessoa.id));
    setAnotacaoParaApagar(null);
    toast.success("Anotação excluída.");
  }

  useEffect(() => {
    if (!pessoaId || !open) return;

    /**
     * Abrir uma ficha e logo outra misturava as duas.
     *
     * Esta carga faz SETE consultas em sequência e escrevia o resultado de
     * cada uma sem perguntar se ainda era a ficha aberta. Trocando de pessoa
     * no meio, as respostas da anterior chegavam depois e sobrescreviam:
     * `setPessoa` é a PRIMEIRA, então o nome no topo já era o novo enquanto
     * família, história e ministérios ainda eram do anterior.
     *
     * Foi assim que a ficha de Julia Akemi Silva Hosoume apareceu com
     * "Família Cavalcante Dias" — ela tem um vínculo só, e é Hosoume.
     *
     * Numa ficha que mostra observação pastoral, atribuir o registro de uma
     * pessoa a outra não é detalhe de renderização.
     */
    let cancelado = false;

    const carregar = async () => {
      setLoading(true);

      // Pessoa
      const { data: p } = await supabase
        .from("membros")
        .select("id,nome_completo,nome_social,foto_url,tipo_pessoa,status,data_entrada,data_saida,saida_registrada_em,saida_registrada_por_nome,saida_registrada_por_funcao,email,telefone_celular,perfil_acesso,observacoes_pastorais,created_at,origem_cadastro")
        .eq("id", pessoaId)
        .single();
      if (cancelado) return;
      setPessoa(p ?? null);

      // Cargo de diretoria — vem da função na ficha. Ver diretoriaService.ts.
      const cargosDela = await cargosDaPessoa(pessoaId);
      if (cancelado) return;
      setCargos(cargosDela);

      // A história vem junto com o resto: ela é o corpo da ficha agora,
      // não um extra que se busca depois de a tela já estar montada.
      const historiaDela = await historiaDaPessoa(pessoaId);
      if (cancelado) return;
      setHistoria(historiaDela);

      // A familia vem do mesmo servico que o formulario usa. Consultar
      // `vinculos_familiares` aqui de novo daria duas leituras da mesma
      // coisa, e a chance de discordarem no dia em que uma mudasse.
      const fam = await familiaDaPessoa(pessoaId);
      if (cancelado) return;
      setFamilia(fam ? {
        nome: fam.familia.nome_familia,
        parentesco: (PARENTESCO_LABEL[fam.vinculo.parentesco] ?? fam.vinculo.parentesco).toLowerCase(),
        responsavel: fam.vinculo.responsavel_familia,
      } : null);

      // ── Onde a pessoa serve ────────────────────────────────────────
      //
      // Contado em produção: ministerio_membros tem 0 linhas e
      // pessoa_participacao tem 0 linhas. Os vínculos de verdade — 113 —
      // estão em area_voluntarios. Esta ficha vinha mostrando "nenhum
      // ministério" para TODO MUNDO, em silêncio, porque perguntava nas
      // duas tabelas vazias.
      //
      // As duas continuam sendo lidas: se um dia forem povoadas, o que
      // estiver lá aparece. Mas quem responde hoje é area_voluntarios.
      //
      // Com embed: a chave estrangeira para `areas` existe desde 19/08/2026
      // (migration 20260819110000), e o PostgREST voltou a aceitar o join.
      // As duas consultas que moravam aqui viraram uma.
      const { data: av } = await supabase
        .from("area_voluntarios")
        .select("area_id, funcao, status, areas(id, nome, ministerios(nome, cor))")
        .eq("membro_id", pessoaId)
        // .eq e nao .in(["ativa","ativo"]): status e o enum atuacao_status, e
        // "ativo" NAO e um valor dele — so "ativa" e "encerrada". Passar um
        // valor invalido nao filtra a mais: o Postgres rejeita a consulta
        // INTEIRA com "invalid input value for enum", e a ficha mostrava
        // "sem vinculos" para quem serve em duas areas.
        .eq("status", "ativa");

      const { data: mm } = await supabaseRel
        .from("ministerio_membros")
        .select("funcao, ministerios(nome, cor)")
        .eq("membro_id", pessoaId)
        .eq("ativo", true);
      // TABELA AUSENTE EM PRODUCAO — ver migration 20260528_estrutura_organizacional.sql
      const { data: pp } = await supabase
        .from("pessoa_participacao")
        .select("funcao, ministerios(nome, cor)")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .is("area_id", null);

      const todosMin = [
        ...(av ?? []).filter((r: any) => r.areas?.ministerios).map((r: any) => ({
          ministerio_nome: r.areas.ministerios.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.areas.ministerios.cor ?? null,
        })),
        ...(mm ?? []).map((r: any) => ({
          ministerio_nome: r.ministerios?.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.ministerios?.cor ?? null,
        })),
        ...(pp ?? []).filter((r: any) => r.ministerios).map((r: any) => ({
          ministerio_nome: r.ministerios?.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.ministerios?.cor ?? null,
        })),
      ];
      // Dedup por nome
      const uniqMin = todosMin.filter(
        (m, i, arr) => arr.findIndex(x => x.ministerio_nome === m.ministerio_nome) === i
      );
      if (cancelado) return;
      setMinerios(uniqMin);

      // Áreas
      // TABELA AUSENTE EM PRODUCAO — ver migration 20260528_estrutura_organizacional.sql
      const { data: pa } = await supabase
        .from("pessoa_participacao")
        .select("funcao, areas(nome, ministerios(nome))")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .not("area_id", "is", null);
      if (cancelado) return;
      setAreas([
        ...(av ?? []).filter((r: any) => r.areas).map((r: any) => ({
          ministerio_nome: r.areas.ministerios?.nome ?? "–",
          area_nome: r.areas.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
        })),
        ...(pa ?? []).filter((r: any) => r.areas).map((r: any) => ({
          ministerio_nome: (r.areas as any).ministerios?.nome ?? "–",
          area_nome: (r.areas as any).nome ?? "–",
          funcao: r.funcao ?? "voluntario",
        })),
      ]);

      setLoading(false);
    };
    carregar();
    return () => { cancelado = true; };
  }, [pessoaId, open]);

  const tipoCfg  = TIPO_CONFIG[(pessoa?.tipo_pessoa as string) ?? ""] ?? TIPO_CONFIG.visitante;
  const perfilCfg = PERFIL_CONFIG[(pessoa?.perfil_acesso as string) ?? ""] ?? PERFIL_CONFIG.membro;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil da pessoa</DialogTitle>
        </DialogHeader>

        {loading || !pessoa ? (
          <div className="space-y-4 py-2" aria-busy="true">
            <span className="sr-only">Carregando a ficha…</span>
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-24" />
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-4" style={{ width: `${70 - i * 12}%` }} />)}
          </div>
        ) : (
          <div className="space-y-5">

            {/* Cabeçalho: foto + nome + status.
                Sem foto nao entra nada no lugar: as iniciais eram um
                circulo de 64px repetindo a letra que ja esta no nome ao
                lado. Foto de verdade identifica; duas letras nao. */}
            <div className="flex items-center gap-4">
              {pessoa.foto_url && (
                <img src={pessoa.foto_url} alt={pessoa.nome_completo}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {/* O lápis ao lado do nome, e não num rodapé.

                    A ficha abre a partir de um nome clicado em qualquer tela —
                    na chamada da EBD, na escala, no acolhimento. Quem chega
                    aqui muitas vezes chega porque viu algo errado no cadastro,
                    e sem esta saída teria de fechar, ir a Pessoas, buscar de
                    novo e só então editar.

                    Só aparece para quem pode editar: a tela de Pessoas barra
                    quem não tem `editar_pessoa`, e um lápis que leva a uma
                    tela que não deixa fazer nada é pior que lápis nenhum. */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="font-serif font-semibold text-base leading-tight truncate">
                    {pessoa.nome_social ?? pessoa.nome_completo}
                  </h2>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={irParaEdicao}
                      title={`Editar a ficha de ${pessoa.nome_social ?? pessoa.nome_completo}`}
                      aria-label={`Editar a ficha de ${pessoa.nome_social ?? pessoa.nome_completo}`}
                      className="shrink-0 text-muted-foreground hover:text-primary p-1 -m-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {pessoa.nome_social && (
                  <p className="text-xs text-muted-foreground truncate">{pessoa.nome_completo}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Badge variant="outline" className={`text-xs h-4 px-1.5 ${tipoCfg.cor}`}>
                    {tipoCfg.label}
                  </Badge>
                  {pessoa.perfil_acesso && (
                    <Badge variant="outline" className={`text-xs h-4 px-1.5 ${perfilCfg.cor}`}>
                      <Shield className="w-2.5 h-2.5 mr-1" />{perfilCfg.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* ── Saiu do rol ──────────────────────────────────────────
                A ficha de um ex-membro precisa dizer isso ANTES de
                qualquer outra coisa: quem abre a ficha de alguém que foi
                transferido e lê ministérios, escalas e família sem essa
                linha lê um cadastro ativo.

                A assinatura vem junto e não é enfeite — tirar alguém do
                rol é ato de assembleia, e a ficha guarda quem registrou.
                Ela é gravada pelo gatilho `a_assina_saida_do_rol`, e não
                pelo formulário: neste projeto o navegador fala direto com
                o banco, e assinatura que o cliente escreve é assinatura
                que o cliente pode omitir.

                `inativo` NÃO entra aqui: ausência não é saída, e a
                pessoa continua no rol. */}
            {["transferido", "desligado", "falecido"].includes(pessoa.status) && (
              <div className="rounded-lg border border-warning-line bg-warning-soft/60 px-3 py-2 space-y-0.5">
                <p className="text-sm text-warning-text">
                  <strong className="font-semibold">
                    {pessoa.status === "transferido" ? "Transferido"
                      : pessoa.status === "desligado" ? "Desligado"
                      : "Falecido"}
                  </strong>
                  {pessoa.data_saida
                    ? <> em {soData(pessoa.data_saida)}</>
                    : <> — sem data de saída registrada</>}
                </p>
                {/* Miúda e esmaecida, como a assinatura da anotação
                    pastoral: é procedência, não conteúdo. */}
                {pessoa.saida_registrada_por_nome && (
                  <p className="text-[11px] italic text-muted-foreground">
                    registrado por {pessoa.saida_registrada_por_nome.split(" ")[0]}
                    {pessoa.saida_registrada_por_funcao && ` | ${pessoa.saida_registrada_por_funcao}`}
                    {pessoa.saida_registrada_em && ` — ${dataComHora(pessoa.saida_registrada_em)}`}
                  </p>
                )}
              </div>
            )}

            {/* ── Há quanto tempo ninguém fala com esta pessoa ──────────

                Uma linha, e é a que muda o que se faz nos próximos cinco
                minutos. Só aparece a partir de 30 dias: abaixo disso não há
                nada a dizer, e um aviso que aparece sempre deixa de ser
                aviso. */}
            {(() => {
              const dias = diasDesdeOUltimoContato(historia);
              if (dias === null || dias < 30) return null;
              const muito = dias >= 180;
              return (
                <div className={`rounded-lg border px-3 py-2 text-sm ${
                  muito ? "border-warning-line bg-warning-soft text-warning-text"
                        : "border-border bg-muted/50 text-muted-foreground"}`}>
                  Último contato há <strong>{dias} dias</strong>
                  {muito && " — mais de meio ano"}
                </div>
              );
            })()}

            {/* ── Falar com a pessoa ────────────────────────────────────

                A ficha mostrava há quanto tempo ninguém falava com alguém e
                não oferecia como falar. O telefone já vinha na consulta e
                não aparecia em lugar nenhum.

                `<a>` e não `window.open`: navegadores e o WebView do celular
                tratam `window.open` como pop-up e bloqueiam em silêncio —
                foi o que deixou mudo o botão de felicitação do Painel
                Pastoral até 26/08/2026. */}
            {pessoa.telefone_celular && (
              <a
                href={`https://wa.me/${normalizarTelefone(pessoa.telefone_celular)}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Enviar mensagem para ${pessoa.nome_social ?? pessoa.nome_completo} no WhatsApp`}
                className="flex items-center gap-2 rounded-lg border border-success-line bg-success-soft/50
                           px-3 py-2 text-sm text-success-text transition-colors hover:bg-success-soft
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="font-medium">Falar no WhatsApp</span>
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                  {formatarTelefoneSemDDI(pessoa.telefone_celular)}
                </span>
              </a>
            )}

            {/* ── A família ─────────────────────────────────────────────
                A ficha não mostrava família nenhuma. Era a ausência que
                deixava a contradição invisível: o rodapé dizia "sem
                vínculos" e não havia nada na tela para desmentir.

                E é informação que quem abre uma ficha procura — "de quem
                essa pessoa é filha?" é a primeira pergunta sobre uma
                criança, e a Julia Hosoume é o caso que expôs isto.

                Quando não há família, o bloco aparece assim mesmo, em vez
                de sumir: 97 pessoas ativas estão sem vínculo familiar hoje,
                e some-lo esconderia justamente a pendência que o Painel da
                Secretaria existe para mostrar. */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <IconeCasa className="w-3 h-3" /> Família
              </div>
              {familia ? (
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">{familia.nome}</span>
                  <span className="text-muted-foreground">
                    {" "}· esta pessoa é {familia.parentesco}
                    {familia.responsavel && " · responsável"}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-2">
                  Sem família cadastrada.
                </p>
              )}
            </div>

            {/* ── Observações pastorais ─────────────────────────────────

                Já estavam gravadas e só eram legíveis abrindo o formulário
                de edição — ou seja, invisíveis para quem só quer entender
                quem é a pessoa antes de procurá-la.

                `whitespace-pre-line` porque são texto escrito à mão, com
                quebras que o autor pôs de propósito. */}
            {(pessoa.observacoes_pastorais?.trim() || anotacoes.length > 0 || podeAnotar) && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {/* Sem contador. Um "1" solto ao lado do título lia-se como
                      numeração da anotação, não como quantidade — e com a
                      lista logo abaixo, contar é redundante. */}
                  <NotebookPen className="w-3 h-3" /> Anotações pastorais
                  {podeAnotar && !anotando && (
                    <button
                      type="button"
                      // Sempre em branco: cada anotação é NOVA. Prefixar com a
                      // anterior convidaria a apagá-la, que é justamente o que
                      // o campo único fazia.
                      onClick={() => { setRascunho(""); setAnotando(true); }}
                      className="ml-auto normal-case tracking-normal text-primary hover:underline"
                    >
                      Anotar
                    </button>
                  )}
                </div>

                {anotando ? (
                  <div className="space-y-2">
                    <Textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      rows={5}
                      autoFocus
                      placeholder="O que a igreja precisa lembrar sobre esta pessoa."
                      className="text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" onClick={salvarObservacoes} disabled={salvandoObs}>
                        {salvandoObs ? "Salvando..." : "Salvar"}
                      </Button>
                      <Button
                        type="button" size="sm" variant="ghost"
                        onClick={() => setAnotando(false)} disabled={salvandoObs}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Da mais recente para a mais antiga: quem abre a ficha
                    quer saber o que se sabe HOJE sobre a pessoa. */}
                {anotacoes.map((a, i) => (
                  <div key={a.id ?? i} className="rounded-lg border bg-muted/40 px-3 py-2">
                    {editandoId === a.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={rascunho}
                          onChange={(e) => setRascunho(e.target.value)}
                          rows={4} autoFocus className="text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={salvarEdicao} disabled={salvandoObs}>
                            {salvandoObs ? "Salvando..." : "Salvar"}
                          </Button>
                          <Button
                            type="button" size="sm" variant="ghost"
                            onClick={() => setEditandoId(null)} disabled={salvandoObs}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-line">{a.detalhe}</p>
                        {/* Miúda, itálica e esmaecida: a assinatura situa a
                            anotação sem disputar leitura com ela. O que importa
                            na tela é o que foi escrito. */}
                        <p className="text-[11px] italic text-muted-foreground/70 mt-1 tabular-nums flex items-center gap-2">
                          <span>{a.assinatura}</span>
                          {/* Só o administrador, e só aqui. As ações vêm em
                              corpo miúdo junto da assinatura, e não como
                              botões: corrigir anotação é exceção, não o que
                              se faz ao abrir uma ficha. */}
                          {ehAdmin && a.id && (
                            <span className="ml-auto flex items-center gap-2 not-italic shrink-0">
                              <button
                                type="button"
                                onClick={() => { setRascunho(a.texto); setEditandoId(a.id); setAnotando(false); }}
                                className="text-primary hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnotacaoParaApagar({ id: a.id!, texto: a.texto })}
                                className="text-destructive-text hover:underline"
                              >
                                Excluir
                              </button>
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                ))}

                {/* ── O texto que existia antes do histórico ─────────────
                    9 pessoas tinham anotação no campo único, sem data e sem
                    autor. Não foi migrada para o histórico: inventar quem
                    escreveu e quando seria repetir o defeito que a própria
                    mudança conserta. Fica aqui, dita pelo que é. */}
                {pessoa.observacoes_pastorais?.trim() && (
                  <div className="rounded-lg border border-dashed px-3 py-2">
                    <p className="text-sm whitespace-pre-line">
                      {pessoa.observacoes_pastorais.trim()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Anotação anterior ao histórico — sem data nem autor registrados
                    </p>
                  </div>
                )}

                {!anotando && anotacoes.length === 0 && !pessoa.observacoes_pastorais?.trim() && (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-2">
                    Nada anotado ainda.
                  </p>
                )}
              </div>
            )}

            {/* ── A história ────────────────────────────────────────────

                Ela vem antes dos cargos e dos ministérios de propósito.
                "Onde a pessoa se encaixa" é organograma; "o que aconteceu
                com ela" é cuidado pastoral, e é a pergunta de quem abre a
                ficha de alguém.

                Material: 283 registros de contato cobrindo 276 das 282
                pessoas, 141 mudanças de vínculo, 113 entradas em áreas e as
                datas de consagração — tudo já gravado, e nada disso
                aparecia em lugar nenhum do sistema. */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="w-3 h-3" /> História
              </div>
              <LinhaDoTempo eventos={historia.filter(e => e.tipo !== "anotacao")} />
            </div>

            {/* Cargo estatutário (Diretoria) */}
            {cargos.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/[0.07] px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Diretoria Estatutária
                </p>
                {cargos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{NIVEL_CARGO_EMOJI[c.nivel] ?? "📌"}</span>
                    <span className="text-sm font-medium text-primary">{c.cargo}</span>
                    {c.mandato && (
                      <span className="text-xs text-primary/70 ml-auto">
                        Mandato {c.mandato}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Ministérios */}
            {ministerios.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Church className="w-3 h-3" /> Ministérios
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ministerios.map((m, i) => {
                    const fCfg = FUNCAO_CONFIG[m.funcao] ?? FUNCAO_CONFIG.voluntario;
                    return (
                      <div key={i} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background">
                        <span className="font-medium truncate max-w-[140px]">{m.ministerio_nome}</span>
                        <Badge variant="outline" className={`text-xs h-3.5 px-1 ${fCfg.cor}`}>
                          {fCfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Áreas */}
            {areas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="w-3 h-3" /> Áreas de atuação
                </div>
                <div className="space-y-1">
                  {areas.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{a.area_nome}</span>
                      <span>em</span>
                      <span>{a.ministerio_nome}</span>
                      <Badge variant="outline" className="text-xs h-3.5 px-1 ml-auto">
                        {FUNCAO_CONFIG[a.funcao]?.label ?? a.funcao}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé: tempo + contato */}
            <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{calcularTempo(pessoa)}</span>
              </div>
              {/* "Sem vínculos cadastrados" era o texto daqui, e mentia.
                  Isto conta ministério, área e cargo — nada de família. Só que
                  "vínculo" é a palavra que ESTE sistema usa para laço
                  familiar: a tabela é `vinculos_familiares`, o passo 3 do
                  formulário de pessoa se chama VÍNCULOS e o diálogo é o
                  `VinculosDialog`.

                  Resultado: a ficha da Julia Hosoume dizia "sem vínculos"
                  enquanto o formulário mostrava, na mesma pessoa, "Família
                  Hosoume · Filho(a)". Os dois estavam certos e um deles
                  usava a palavra do outro. */}
              {ministerios.length === 0 && areas.length === 0 && cargos.length === 0 && (
                <span className="flex items-center gap-1 text-warning-text">
                  <Star className="w-3.5 h-3.5" />
                  Não serve em nenhum ministério
                </span>
              )}
            </div>

          </div>
        )}
      </DialogContent>

      {/* Confirmação com `AlertDialog`, e nunca `confirm()` nativo.
          Em navegador embarcado — que é onde a igreja usa o sistema no
          celular — a caixa nativa é bloqueada e devolve "cancelou" sem
          perguntar: o botão simplesmente não faria nada. Ver Risco 3 do
          CLAUDE.md. */}
      <AlertDialog
        open={!!anotacaoParaApagar}
        onOpenChange={(v) => { if (!v) setAnotacaoParaApagar(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta anotação?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* O texto aparece na pergunta: apagar memória pastoral pelo
                  id, sem ver o que se apaga, é como o "Teste" e a anotação de
                  março ficam parecidos na hora do clique. */}
              <span className="block rounded-md border bg-muted/40 px-3 py-2 my-2 text-sm whitespace-pre-line text-foreground">
                {anotacaoParaApagar?.texto}
              </span>
              Não há como desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvandoObs}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); apagarAnotacao(); }}
              disabled={salvandoObs}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {salvandoObs ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
