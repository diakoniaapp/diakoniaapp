// ─── historiaPessoa.ts ───────────────────────────────────────────────────────
// A história de uma pessoa na igreja, montada a partir do que já está gravado.
//
// ── POR QUE ISTO PRECISOU EXISTIR ────────────────────────────────────────────
//
// A ficha respondia "quem é" e "onde se encaixa". Não respondia "o que
// aconteceu com essa pessoa" — que é a pergunta de quem cuida.
//
// E não era por falta de dado. Contado no banco de produção:
//
//   visita_historico ... 283 registros, cobrindo 276 das 282 pessoas
//   historico_membro ... 141 registros de mudança de tipo
//   area_voluntarios ... 113 vínculos, cada um com data de início
//   membros ............ data de entrada, consagração, ordenação
//
// Tudo isso estava gravado e nada disso aparecia em lugar nenhum. A igreja
// registrou 283 contatos pastorais e depois não tinha onde lê-los.
//
// ── E UM ACHADO PIOR NO CAMINHO ──────────────────────────────────────────────
//
// O PessoaCard lia ministérios de `ministerio_membros` e `pessoa_participacao`.
// As duas têm ZERO linhas em produção. Os 113 vínculos de verdade estão em
// `area_voluntarios`. Ou seja: a ficha vinha mostrando "nenhum ministério"
// para todo mundo, silenciosamente, porque perguntava na tabela errada.
//
// ── A REGRA DA LINHA DO TEMPO ────────────────────────────────────────────────
//
// Só entra o que TEM DATA e o que MUDOU alguma coisa. "Cadastro atualizado"
// não é evento na vida de ninguém; "tornou-se membro" é. Uma linha do tempo
// que registra cada salvamento de formulário vira um log de auditoria, e log
// de auditoria não conta história — esconde.
//
// ── DOIS PROBLEMAS DE BANCO QUE APARECERAM AO ESCREVER ISTO — RESOLVIDOS ────
//
// Ficam registrados porque explicam a forma que este arquivo teve por um
// tempo, e porque a mesma armadilha pode voltar em outra tabela.
//
// 1. `area_voluntarios` nao declarava chave estrangeira para `areas`, e o
//    PostgREST recusava o join: "Could not find a relationship between
//    area_voluntarios and areas in the schema cache". O nome da area vinha
//    numa segunda consulta. **Resolvido em 19/08/2026** (migration
//    20260819110000): tres chaves criadas, e o embed voltou a funcionar.
//
// 2. Pela mesma ausencia de chave havia vinculo orfao: dos 88 membro_id
//    distintos, 36 nao existiam em `membros` — 41% apontando para gente que
//    nao estava la. **Os 36 foram gravados em `log_exclusoes` e removidos**
//    na mesma migration. Sobraram 77 vinculos e zero orfaos, e agora a
//    chave impede que voltem.

import { supabase } from "@/integrations/supabase/client";

export type TipoEvento =
  | "entrada"        // chegou à igreja
  | "promocao"       // mudou de vínculo (visitante → congregado → membro)
  | "consagracao"    // consagração ou ordenação
  | "servico"        // começou a servir numa área
  | "contato"        // conversa, visita, mensagem — alguém falou com a pessoa
  /**
   * A linha nasceu com o cadastro, e ninguém falou com ninguém.
   *
   * Separado de `contato` porque `diasDesdeOUltimoContato` conta contatos, e
   * contar isto dava "último contato há 85 dias" quando o que passaram foram
   * 85 dias desde a IMPORTAÇÃO. Medido em 26/08/2026: das 289 linhas de
   * `visita_historico`, 274 são este carimbo e só 15 são contato de verdade —
   * e 267 pessoas não têm nenhum outro registro.
   *
   * E só aparece na linha do tempo quando ela ficaria VAZIA sem ele. Como a
   * linha ordena do mais recente para o mais antigo e a importação é de
   * junho/2026, ele encabeçava a história de quem entrou no rol em 2018 —
   * artefato técnico no lugar do primeiro fato da vida da pessoa na igreja.
   */
  | "cadastro"
  /**
   * Anotação pastoral escrita por uma pessoa sobre outra.
   *
   * Tipo próprio porque ela não vive na linha do tempo: tem bloco dedicado na
   * ficha, com autor e função de quem escreveu. Misturá-la aos eventos faria
   * a mesma anotação aparecer duas vezes na mesma tela.
   */
  | "anotacao";

export interface EventoDaHistoria {
  data: string;              // ISO, para ordenar
  tipo: TipoEvento;
  titulo: string;
  detalhe?: string | null;
  /** "Telma Souza · Administrador" — só nas anotações pastorais. */
  autor?: string | null;
}

/** Colunas de data em `membros` que marcam um ato da vida ministerial. */
const ATOS: Array<[string, string]> = [
  ["data_consagracao_pastoral",   "Consagração pastoral"],
  ["data_ordenacao_presbiteral",  "Ordenação presbiteral"],
  ["data_ordenacao_diaconal",     "Ordenação diaconal"],
  ["data_consagracao_missionaria","Consagração missionária"],
];

const ROTULO_CONTATO: Record<string, string> = {
  // "Primeiro culto" era o rótulo daqui, e afirmava um fato que ninguém
  // presenciou. Medido em 26/08/2026: 274 pessoas têm este registro, e nas
  // 274 a data do contato é a data em que a LINHA foi criada — não houve
  // culto nenhum, houve cadastro. A observação de todas dizia, literalmente,
  // "Primeiro culto - cadastro inicial": a metade verdadeira estava lá o
  // tempo todo, e o título escolheu a outra.
  cadastro:          "Cadastro criado",
  whatsapp:          "Mensagem no WhatsApp",
  ligacao:           "Ligação",
  visita_presencial: "Visita presencial",
  email:             "E-mail",
  retorno_culto:     "Voltou ao culto",
  evento:            "Participou de um evento",
  observacao:        "Anotação pastoral",
  anotacao_pastoral: "Anotação pastoral",
  // Gravados pelo painel HOJE quando alguem cumprimenta a data. Um rotulo
  // por tipo, e nao um "Felicitação" generico: na vida de quem le a ficha,
  // completar 40 anos e completar 20 anos de igreja sao coisas distintas.
  felicitacao_aniversario: "Parabéns de aniversário",
  felicitacao_casamento:   "Parabéns de bodas",
  felicitacao_membresia:   "Parabéns pelos anos de igreja",
  felicitacao_pastorado:   "Parabéns pelos anos de pastorado",
};

/**
 * Traduz "Tipo alterado de congregado para membro" para "Tornou-se membro".
 *
 * O texto do banco descreve a OPERAÇÃO no cadastro; a linha do tempo quer o
 * FATO na vida da pessoa. São coisas diferentes, e a segunda é a que
 * interessa a quem abre a ficha.
 */
function fraseDaPromocao(descricao: string | null): string {
  const m = /para\s+(\w+)/i.exec(descricao ?? "");
  const destino = m?.[1]?.toLowerCase();
  if (destino === "membro")     return "Tornou-se membro";
  if (destino === "congregado") return "Tornou-se congregado";
  if (destino === "visitante")  return "Passou a visitante";
  return descricao ?? "Mudança de vínculo";
}

export async function historiaDaPessoa(pessoaId: string): Promise<EventoDaHistoria[]> {
  const eventos: EventoDaHistoria[] = [];

  const [pessoa, mudancas, contatos, servicos] = await Promise.all([
    supabase.from("membros")
      .select("data_entrada, created_at, origem_cadastro, tipo_pessoa, data_consagracao_pastoral, data_ordenacao_presbiteral, data_ordenacao_diaconal, data_consagracao_missionaria")
      .eq("id", pessoaId).maybeSingle(),
    supabase.from("historico_membro")
      .select("tipo, descricao, data")
      .eq("membro_id", pessoaId),
    supabase.from("visita_historico")
      .select("tipo, observacao, created_at, registrado_por_nome, registrado_por_funcao")
      .eq("visitante_id", pessoaId),
    // area_voluntarios, e não ministerio_membros nem pessoa_participacao:
    // essas duas estão vazias em produção. Ver o comentário no topo.
    //
    // O nome da área e o do ministério vêm embutidos: desde que a chave
    // estrangeira existe, o PostgREST aceita o join e a segunda consulta
    // que morava aqui embaixo deixou de ser necessária.
    supabase.from("area_voluntarios")
      .select("area_id, data_inicio, funcao, status, areas(nome, ministerios(nome))")
      .eq("membro_id", pessoaId),
  ]);

  const p = pessoa.data as Record<string, string | null> | null;

  /**
   * O carimbo da importação, à espera de saber se há mais alguma coisa.
   *
   * Só entra na linha do tempo se ela ficaria vazia sem ele — ver a nota no
   * laço dos contatos.
   */
  let carimboAdiado: EventoDaHistoria | null = null;

  /**
   * "Chegou à igreja" só quando a data significa isso.
   *
   * Na importação de junho/2026 muita `data_entrada` recebeu o dia da própria
   * importação. A ficha então anunciava, sobre uma criança de 11 anos que a
   * igreja conhece há anos, que ela chegou há dois meses — e a liderança
   * poderia agir pastoralmente sobre isso.
   *
   * Medido em 26/08/2026: dos 65 congregados ativos, NENHUM tem
   * `data_entrada` anterior ao cadastro; 25 têm o carimbo e 40 não têm data.
   *
   * A dúvida só existe para linha importada. Quem foi cadastrado aqui tem
   * `data_entrada` posta por alguém, e coincidir com o dia do cadastro é o
   * caso NORMAL — a secretaria cadastra hoje quem chegou hoje. Por isso o
   * teste começa por `origem_cadastro`, e não pela distância entre as datas:
   * a heurística sozinha apagaria justamente a chegada verdadeira.
   *
   * As 158 pessoas cuja data é bem anterior ao cadastro continuam com a
   * linha: aquela data a importação trouxe de verdade, e escondê-la seria
   * trocar uma invenção por outra.
   */
  const carimboDaImportacao =
    p?.origem_cadastro === "importacao" &&
    !!p?.data_entrada && !!p?.created_at &&
    Math.abs(
      (new Date(p.data_entrada + "T00:00").getTime() - new Date(p.created_at).getTime())
      / 86_400_000,
    ) <= 7;

  /**
   * Para MEMBRO, `data_entrada` não é "chegou à igreja" — é a entrada no ROL.
   *
   * Ninguém vira membro sem passar por assembleia, e a assembleia tem data.
   * Por isso todo membro tem a coluna preenchida, e por isso ela é fato
   * registrado, não estimativa: o rótulo passa a dizer o que a data significa.
   *
   * A distinção importa na leitura pastoral. "Chegou à igreja em 2018" e
   * "entrou no rol de membros em 2018" descrevem coisas diferentes — quem
   * congrega há dez anos e foi aclamado ano passado tem as duas datas
   * distantes, e a ficha dizia a segunda com o nome da primeira.
   *
   * Para congregado e visitante a coluna não tem esse respaldo: não há
   * assembleia por trás, e na importação ela recebeu o dia do próprio
   * cadastro. Medido em 26/08/2026: dos 65 congregados ativos, NENHUM tem
   * data anterior ao cadastro.
   */
  const ehMembro = p?.tipo_pessoa === "membro";
  const rotuloEntrada = ehMembro ? "Entrou no rol de membros" : "Chegou à igreja";

  // O carimbo só cala a linha de quem NÃO é membro. Para membro a data veio
  // da assembleia, e coincidir com a semana da importação não a torna falsa.
  if (p?.data_entrada && (ehMembro || !carimboDaImportacao)) {
    eventos.push({ data: p.data_entrada, tipo: "entrada", titulo: rotuloEntrada });
  }

  for (const [coluna, rotulo] of ATOS) {
    const d = p?.[coluna];
    if (d) eventos.push({ data: d, tipo: "consagracao", titulo: rotulo });
  }

  for (const m of mudancas.data ?? []) {
    if (!m.data) continue;

    /**
     * A promoção carimbada pela importação também sai.
     *
     * Mesmo sintoma do carimbo de cadastro, vindo de outra tabela: a ficha de
     * Alberto Pereira Olimpio mostrava "Tornou-se membro · 02 de jun. de
     * 2026" ACIMA de "Entrou no rol de membros · 25 de fev. de 2018". Ele é
     * membro desde 2018; junho de 2026 é o dia em que a linha foi importada.
     *
     * Medido em 26/08/2026: `historico_membro` tem 113 linhas datadas em
     * junho, espalhadas pelos 10 dias em que a importação rodou, e 101 em
     * agosto — estas últimas são promoções feitas aqui, por gente, e ficam.
     *
     * Não se perde informação: para membro, "Entrou no rol de membros" conta
     * a mesma coisa com a data certa. A data verdadeira da promoção dos
     * importados não existe em lugar nenhum, e inventá-la era o defeito.
     */
    const promocaoCarimbada =
      p?.origem_cadastro === "importacao" && m.data < "2026-07-01";
    if (promocaoCarimbada) continue;

    eventos.push({ data: m.data, tipo: "promocao", titulo: fraseDaPromocao(m.descricao) });
  }

  for (const c of contatos.data ?? []) {
    if (!c.created_at) continue;
    /**
     * O carimbo de cadastro não é contato — mas só quando é carimbo.
     *
     * Para quem foi cadastrado AQUI a linha `cadastro` marca a chegada de um
     * visitante ao culto, e isso é encontro de verdade: é o começo do
     * acolhimento e conta como contato. Para quem veio da importação ela
     * marca a criação da linha no banco, e nada mais.
     *
     * Sem esta distinção a ficha de Alberto Pereira Olimpio dizia "último
     * contato há 85 dias" — que são exatamente os dias entre a importação,
     * em 02/06, e hoje.
     */
    const carimbo = c.tipo === "cadastro" && p?.origem_cadastro === "importacao";

    /**
     * O carimbo da importação fica de fora QUANDO HÁ HISTÓRIA DE VERDADE.
     *
     * Ele não era só irrelevante — ele liderava. A linha ordena do mais
     * recente para o mais antigo, e a importação é de junho de 2026: o
     * artefato técnico aparecia ACIMA de "entrou no rol de membros em 2018",
     * encabeçando a narrativa pastoral de quem está na igreja há oito anos.
     *
     * A regra pedida foi "para membros", e esta é a mesma coisa dita pela
     * causa em vez de pelo grupo: só desordena quem tem o que desordenar.
     * Membro sempre cai aqui, porque ninguém entra no rol sem assembleia e a
     * assembleia deixa data. Congregado como a Julia, cujo único registro é o
     * carimbo, fica com ele — tirá-lo daria uma ficha que diz "nada
     * registrado" sobre alguém que a igreja acabou de cadastrar.
     *
     * Guardado em `carimboAdiado` e decidido no fim, porque neste ponto do
     * laço ainda não se sabe o que mais existe.
     */
    if (carimbo) {
      carimboAdiado = {
        data: c.created_at,
        tipo: "cadastro",
        titulo: ROTULO_CONTATO[c.tipo ?? ""] ?? "Contato",
        detalhe: c.observacao,
      };
      continue;
    }

    // A anotação pastoral tem bloco próprio na ficha, com autor e função.
    // Marcada aqui para o PessoaCard poder separá-la dos demais eventos —
    // ela não entra na linha do tempo, senão apareceria duas vezes na tela.
    const ehAnotacao = c.tipo === "anotacao_pastoral";

    eventos.push({
      data: c.created_at,
      tipo: ehAnotacao ? "anotacao" : "contato",
      titulo: ROTULO_CONTATO[c.tipo ?? ""] ?? "Contato",
      detalhe: c.observacao,
      autor: ehAnotacao
        ? [c.registrado_por_nome, c.registrado_por_funcao].filter(Boolean).join(" · ") || null
        : null,
    });
  }

  // Uma ida ao banco a menos por ficha aberta: os nomes já vieram juntos.
  const linhas = (servicos.data ?? []) as any[];

  for (const s of linhas) {
    if (!s.data_inicio) continue;
    // Sem nome de área não há frase que faça sentido ("Começou a servir
    // em —"), então a linha fica de fora. Com a chave estrangeira isso
    // não deve acontecer; se acontecer, é dado que não devia existir.
    if (!s.areas?.nome) continue;
    const encerrado = s.status !== "ativa" && s.status !== "ativo";
    eventos.push({
      data: s.data_inicio,
      tipo: "servico",
      titulo: `Começou a servir em ${s.areas.nome}`,
      detalhe: [s.areas.ministerios?.nome ?? null, encerrado ? "encerrado" : null]
        .filter(Boolean).join(" · ") || null,
    });
  }

  // Sozinho, o carimbo é melhor que o silêncio: para quem só foi cadastrado
  // ainda não há história, e uma ficha em branco não diz nem isso.
  //
  // As anotações NÃO contam para esta decisão: elas têm bloco próprio na
  // ficha e são filtradas da linha do tempo. Contá-las fazia a linha ficar
  // vazia — "ainda não há nada registrado" logo abaixo de duas anotações
  // recém-escritas, porque o carimbo tinha sido suprimido por causa delas.
  const naLinhaDoTempo = eventos.filter(e => e.tipo !== "anotacao").length;
  if (naLinhaDoTempo === 0 && carimboAdiado) eventos.push(carimboAdiado);

  // Mais recente primeiro: quem abre a ficha quer saber o que aconteceu por
  // último, não como tudo começou. A origem continua ali, no fim.
  return eventos.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

/** Há quanto tempo foi o último contato, em dias. `null` se nunca houve. */
export function diasDesdeOUltimoContato(eventos: EventoDaHistoria[]): number | null {
  const ultimo = eventos.find(e => e.tipo === "contato");
  if (!ultimo) return null;
  return Math.floor((Date.now() - new Date(ultimo.data).getTime()) / 86_400_000);
}
