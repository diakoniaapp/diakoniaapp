// ─── rolDeMembrosService.ts — a forma do rol e o movimento dele ────────────
//
// ── POR QUE NÃO SE CHAMA membresiaService ──────────────────────────────────
//
// Porque esse nome já é de outro: `services/membresiaService.ts` é o módulo
// das SOLICITAÇÕES de membresia — entrada por batismo, transferência,
// desligamento —, com carta, assinatura e assembleia. Ele está construído e
// nunca foi usado (`solicitacoes_membresia` tem 0 linhas em 26/08/2026), o
// que o torna fácil de não notar e péssimo de sobrescrever.
//
// São dois assuntos de verdade diferentes: lá é o PROCESSO de uma pessoa
// entrar ou sair; aqui é a FOTOGRAFIA de quem está dentro e do movimento.
//
// Só leitura. Dois blocos do Painel Pastoral, pedidos em 26/08/2026:
//
//   1. **A forma do rol** — pirâmide etária cruzada com sexo.
//   2. **Movimento de membros** — entradas acima do eixo, saídas abaixo.
//
// ── DE ONDE VEM A SAÍDA ────────────────────────────────────────────────────
//
// Telma definiu saída como **transferido, desligado ou falecido** — os três
// status de `membro_status` que a ficha já oferecia. `inativo` fica de fora:
// é ausência temporária ("Ausente", na tela), e a pessoa continua no rol.
//
// O que faltava era a DATA. Até 26/08/2026 não havia nenhuma coluna de saída
// em `membros`, e sem data uma saída não tem ano onde pousar — a metade de
// baixo deste gráfico não podia existir. A migration `20260828180000` criou
// `data_saida` e a assinatura de quem registrou, e o formulário da pessoa
// passou a pedir a data quando um dos três status é escolhido.
//
// **`updated_at` não serve como substituto**, e vale dizer por quê: é a data
// do último salvamento de qualquer campo. Usá-la como data de saída repetiria
// o defeito que a ficha da pessoa acabou de perder na migration
// `20260827220000` — um carimbo técnico apresentado como fato da vida da
// pessoa.
//
// Quem tem status de saída e ainda não tem data continua contado, num rodapé
// à parte, e nunca vira barra. Em 26/08/2026 isso era 1 pessoa (um falecido
// vindo da importação).
//
// `solicitacoes_membresia` também tem tipos de saída e `data_conclusao`, e
// chegou a ser a fonte desta metade. Saiu quando ficou claro que o caminho
// real é editar a ficha: era uma consulta a mais, numa tabela com zero linhas,
// para responder o que `membros.data_saida` responde direto.
//
// ── A COLUNA DA DATA DE ENTRADA ────────────────────────────────────────────
//
// É `data_entrada`, e só ela. `membros.data_membro` existe no esquema e o
// CLAUDE.md a cita como a data gravada na promoção a membro — mas está
// **vazia nas 227 linhas**. `data_entrada` tem 160 preenchidas, de 1941 a
// 2026. Ler as duas e preferir uma daria o mesmo resultado com mais código.

import { supabase } from "@/integrations/supabase/client";
import { idadeEm } from "@/lib/idade";

/** Quantos anos o gráfico mostra. Antes disso vira uma linha de texto. */
export const ANOS_NA_JANELA = 10;

/**
 * Os status de `membros` que significam saída do rol.
 *
 * `inativo` **não** entra: inativo é quem parou de frequentar e continua
 * membro — sair do rol é outra coisa, e passa por assembleia.
 */
const STATUS_DE_SAIDA = ["transferido", "desligado", "falecido"] as const;

/**
 * As faixas da pirâmide, da mais nova para a mais velha.
 *
 * `ate` é o último ano ainda dentro da faixa. A última é aberta.
 *
 * ── AS DUAS TENTATIVAS, E POR QUE ESTA VOLTOU ─────────────────────────────
 *
 * Em 27/08/2026 estas faixas foram trocadas pela escada da EBD — Berçário,
 * Crianças, Juniores, Adolescentes, Jovens, Adultos, Maiores de 60 — e
 * voltaram no mesmo dia. O motivo está medido:
 *
 *   · **"Adultos (26–59)" é uma faixa de 34 anos** e engolia 84 das 210
 *     pessoas: 40% numa barra só. A pirâmide virava duas barras grandes e
 *     cinco tocos, e o formato que ela existe para mostrar sumia.
 *
 *   · **Berçário obrigava a mudar a base.** Sobre o rol, a faixa tinha ZERO
 *     — ninguém é batizado aos dois anos. Para ela ter conteúdo, a pirâmide
 *     passava a cobrir o rebanho inteiro, e a cobertura caía de 191 em 226
 *     membros (85%) para 210 em 294 pessoas (71%), porque 48 dos 65
 *     congregados não têm data de nascimento.
 *
 * As faixas da EBD servem ao que foram feitas: repartir crianças para
 * ensinar. O rol é população adulta — só 1 membro tem menos de 9 anos.
 *
 * ── DE ONDE VÊM ESTES CORTES ──────────────────────────────────────────────
 *
 * São referências brasileiras, não importadas:
 *
 *   · **60** é o corte de idoso no Estatuto do Idoso (Lei 10.741/2003). Os
 *     estudos congregacionais americanos cortam em 65, ancorados na
 *     aposentadoria de lá; aqui isso esconderia 20 pessoas que a própria
 *     lei do país já conta como idosas.
 *   · **29** fecha a juventude no Estatuto da Juventude (Lei 12.852/2013).
 *
 * Sete faixas sobre ~215 pessoas: nenhuma domina, e a única que ficou
 * aberta (90+) começa onde a diferença passa a ser de cuidado.
 */
const FAIXAS: { rotulo: string; idades: string; ate: number }[] = [
  { rotulo: "0–17",  idades: "crianças e adolescentes", ate: 17 },
  { rotulo: "18–29", idades: "jovens",                  ate: 29 },
  { rotulo: "30–44", idades: "adultos",                 ate: 44 },
  { rotulo: "45–59", idades: "adultos",                 ate: 59 },
  { rotulo: "60–74", idades: "idosos",                  ate: 74 },
  { rotulo: "75–89", idades: "idosos longevos",         ate: 89 },
  // ── Por que 90+ ganhou faixa própria ──────────────────────────────────
  //
  // "75+" era uma faixa aberta e escondia gente demais: medido em
  // 27/08/2026, dos 25 membros acima de 75, **11 tinham 90 anos ou mais** —
  // quase metade —, incluindo duas centenárias. Uma barra só dizia
  // "idosos" sobre uma pessoa de 76 e outra de 100, que são realidades
  // pastorais diferentes: uma vai à igreja, a outra recebe visita em casa.
  //
  // É a única faixa que fica aberta, porque tem de ficar — mas agora
  // começa onde a diferença passa a ser de cuidado, e não só de idade.
  { rotulo: "90+",   idades: "90 anos ou mais",         ate: Infinity },
];

/** A partir daqui a pessoa é idosa pelo Estatuto do Idoso (Lei 10.741/2003). */
const IDADE_DE_IDOSO = 60;
/** A juventude termina aqui pelo Estatuto da Juventude (Lei 12.852/2013). */
const FIM_DA_JUVENTUDE = 29;

/** Quem está numa faixa. O bastante para listar e abrir a ficha. */
export interface PessoaNaFaixa {
  id: string;
  nome: string;
  idade: number;
}

export interface FaixaEtaria {
  rotulo: string;
  /** "12 a 17 anos" — vai para o `title`, já que o rótulo é só o nome. */
  idades: string;
  feminino: number;
  masculino: number;
  /** Pessoas da faixa sem sexo registrado. Contadas, não escondidas. */
  semSexo: number;
  total: number;
  /**
   * Quem são, por lado da pirâmide.
   *
   * A pirâmide dizia "35" e não dizia quem. Agora o cursor sobre a barra
   * abre a lista, e cada nome abre a ficha — a pergunta que vem depois de
   * "somos uma igreja de 60+?" é sempre "quem são eles?".
   *
   * **Os contadores acima saem do tamanho destas listas**, e não de um
   * incremento paralelo: dois caminhos para o mesmo número é como o número
   * e a lista passam a discordar.
   */
  pessoas: {
    masculino: PessoaNaFaixa[];
    feminino: PessoaNaFaixa[];
    semSexo: PessoaNaFaixa[];
  };
}

/**
 * Quem entrou ou saiu num ano.
 *
 * A linha tem a mesma forma dos dois lados do eixo: **data, nome, e como**.
 *
 * `quando` abre a linha porque é a coluna que se percorre numa lista
 * ordenada por data; `tipo` a fecha porque qualifica o que aconteceu —
 * batismo ou transferência de um lado, falecimento ou desligamento do
 * outro. Era só o motivo da saída até 27/08/2026, quando a entrada ganhou
 * tipo próprio e as duas listas passaram a se ler igual.
 */
export interface PessoaNoAno {
  id: string;
  nome: string;
  /**
   * "14/03" — o dia e o mês, e só.
   *
   * O ano não entra porque **já é a barra de onde o cartão saiu**. Escrevê-lo
   * em cada linha seria repetir 22 vezes o que o eixo diz uma vez.
   *
   * Vai ANTES do nome na tela: numa lista ordenada por data, a data é a
   * coluna que se percorre, e nomes de comprimento variável no começo da
   * linha deixariam as datas serrilhadas à direita.
   */
  quando: string;
  /**
   * COMO foi o movimento, depois do nome.
   *
   * Na saída: transferido, desligado ou falecido — sempre presente, porque
   * sai do próprio `status`.
   *
   * Na entrada: aclamação, batismo, reconciliação ou transferência. **Vem
   * vazio na maioria**, e é assim que tem de ser: a coluna `tipo_entrada`
   * nasceu em 27/08/2026, e os 184 membros que já tinham data de entrada
   * não têm tipo registrado. Linha sem tipo mostra só a data e o nome, em
   * vez de "não registrado" repetido vinte vezes no mesmo cartão.
   */
  tipo?: string;
  /**
   * A data crua, em ISO, só para ordenar.
   *
   * `quando` não serve: "14/03" e "02/07" ordenam pelo dia antes do mês.
   */
  data: string;
}

export interface MovimentoNoAno {
  ano: number;
  entradas: number;
  /** Membros com status de saída e `data_saida` neste ano. */
  saidas: number;
  /** Os contadores acima saem do tamanho destas listas — nunca de um
   *  incremento paralelo, que é como número e lista passam a discordar. */
  pessoasEntrada: PessoaNoAno[];
  pessoasSaida: PessoaNoAno[];
}

/**
 * "2026-03-14" → "14/03".
 *
 * Era "14 de março", por extenso. Encurtou porque a data passou a abrir a
 * linha: por extenso ela ocupava metade da largura do cartão e empurrava o
 * nome — que é o conteúdo — para a segunda linha em quase todo mundo.
 *
 * Fatiar a string em vez de construir um `Date`: a coluna é `date` e vem
 * sempre como "AAAA-MM-DD". Um `new Date` aqui reabriria a armadilha do
 * fuso, que faz 1º de janeiro virar 31 de dezembro.
 */
function diaEMes(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "";
  const mes = iso.slice(5, 7);
  const dia = iso.slice(8, 10);
  if (!/^\d\d$/.test(mes) || !/^\d\d$/.test(dia)) return "";
  return `${dia}/${mes}`;
}

/** O motivo da saída, em uma palavra, para a lista do cartão. */
const MOTIVO_DA_SAIDA: Record<string, string> = {
  transferido: "transferido",
  desligado:   "desligado",
  falecido:    "falecido",
};

/**
 * O tipo de entrada, na mesma forma que o motivo da saída: minúscula, uma
 * palavra, depois do nome.
 *
 * Os valores são os do enum `tipo_entrada_rol`. **Profissão de fé não está
 * aqui** porque não é uma forma de entrar: antecede o batismo e é
 * pré-requisito dele — ver a migration `20260828200000`.
 */
const TIPO_DE_ENTRADA: Record<string, string> = {
  aclamacao:     "aclamação",
  batismo:       "batismo",
  reconciliacao: "reconciliação",
  transferencia: "transferência",
};

export interface IndicadoresMembresia {
  /** As três formas de vínculo, todas com `status = 'ativo'`. */
  rol: { membros: number; congregados: number; visitantes: number };

  /**
   * A pirâmide, sobre os MEMBROS ATIVOS — o rol.
   *
   * Chegou a cobrir o rebanho inteiro, por algumas horas em 27/08/2026,
   * enquanto as faixas eram as da EBD; voltou junto com elas. Ver a nota em
   * `FAIXAS` para o porquê — em resumo, a cobertura caía de 85% para 71% em
   * troca de dezenove crianças.
   */
  composicao: {
    /** Da mais nova para a mais velha. A tela desenha ao contrário. */
    faixas: FaixaEtaria[];
    /** Quem tem data de nascimento — a base real da pirâmide. */
    comDataNascimento: number;
    /** Quem não tem. Não entra em faixa nenhuma, e a tela diz isso. */
    semDataNascimento: number;
    feminino: number;
    masculino: number;
    semSexo: number;
    /** O maior valor de célula da pirâmide — a escala das barras. */
    maiorCelula: number;
    /**
     * A leitura que a pirâmide desenha e que ninguém extrai olhando barras.
     *
     * Três números, que é a redução que os estudos de composição de igreja
     * costumam fazer. Aqui eles são fortes: medido em 27/08/2026, quase um
     * terço do rol tem 60 anos ou mais, contra um em cada oito entre 18 e
     * 29 — quase três idosos para cada jovem adulto.
     *
     * As porcentagens NÃO são calculadas aqui de propósito: a tela precisa
     * do denominador (`comDataNascimento`) para dizer sobre quantos elas
     * valem, e mandar só o percentual pronto convidaria a exibi-lo sem essa
     * ressalva.
     */
    idadeMediana: number | null;
    maioresDe60: number;
    jovens: number;
  };

  movimento: {
    /** Um item por ano da janela, inclusive os anos com zero dos dois lados. */
    porAno: MovimentoNoAno[];
    /** A maior barra dos DOIS lados: as duas metades dividem a escala. */
    maior: number;

    entradas: {
      /** Entradas registradas ANTES da janela. Uma linha, não um gráfico. */
      anteriores: number;
      /** O ano mais antigo com entrada registrada. Nulo se não houver. */
      anoMaisAntigo: number | null;
      comAno: number;
      /** Membros ativos sem `data_entrada`. O buraco que o bloco confessa. */
      semAno: number;
    };

    saidas: {
      /** Saídas com data, somadas — dentro e fora da janela. */
      comAno: number;
      /**
       * Quem saiu do rol e ainda não tem `data_saida` — vindo da
       * importação, ou de um registro feito antes de a data existir.
       * Contado à parte, nunca desenhado: sem ano não há barra.
       */
      semAno: number;
    };
  };
}

interface LinhaPessoa {
  id: string;
  nome_completo: string;
  tipo_pessoa: string | null;
  status: string | null;
  sexo: string | null;
  data_nascimento: string | null;
  data_entrada: string | null;
  data_saida: string | null;
  tipo_entrada: string | null;
}

/** Os quatro primeiros dígitos de "AAAA-MM-DD", sem passar por `Date`. */
function anoDe(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ano = Number(String(iso).slice(0, 4));
  return Number.isFinite(ano) && ano > 1000 ? ano : null;
}

/**
 * Uma consulta só, em `membros`.
 *
 * Ela traz TODAS as pessoas, e não só as ativas: as saídas moram justamente
 * nas não-ativas. A repartição é feita aqui, no navegador — são
 * ~295 linhas, e assim a regra de faixa etária fica ao lado da constante que
 * a define, em vez de espalhada em seis agregações SQL.
 */
export async function indicadoresMembresia(): Promise<IndicadoresMembresia> {
  const { data, error } = await supabase
    .from("membros")
    .select("id, nome_completo, tipo_pessoa, status, sexo, data_nascimento, data_entrada, data_saida, tipo_entrada");

  if (error) throw error;
  const pessoas = (data ?? []) as LinhaPessoa[];

  // ── O rol: só quem está ativo ────────────────────────────────────────────
  const rol = { membros: 0, congregados: 0, visitantes: 0 };
  for (const p of pessoas) {
    if (p.status !== "ativo") continue;
    if (p.tipo_pessoa === "membro") rol.membros++;
    else if (p.tipo_pessoa === "congregado") rol.congregados++;
    else if (p.tipo_pessoa === "visitante") rol.visitantes++;
  }

  // A pirâmide E as entradas são do ROL: membros ativos. Congregado ainda
  // não entrou, e quem saiu já não está.
  const membros = pessoas.filter(p => p.tipo_pessoa === "membro" && p.status === "ativo");


  // ── A pirâmide ───────────────────────────────────────────────────────────
  const faixas: FaixaEtaria[] = FAIXAS.map(f => ({
    rotulo: f.rotulo, idades: f.idades, feminino: 0, masculino: 0, semSexo: 0, total: 0,
    pessoas: { masculino: [], feminino: [], semSexo: [] },
  }));
  let comDataNascimento = 0, semDataNascimento = 0;
  let feminino = 0, masculino = 0, semSexo = 0;
  let maioresDe60 = 0, jovens = 0;
  const idades: number[] = [];

  for (const p of membros) {
    const idade = idadeEm(p.data_nascimento);
    if (idade === null) { semDataNascimento++; continue; }
    comDataNascimento++;
    idades.push(idade);
    if (idade >= IDADE_DE_IDOSO) maioresDe60++;
    // 18 a 29: a faixa da sucessão. Crianças não entram — a pergunta é
    // quantos adultos jovens o rol tem, não quantos menores.
    if (idade >= 18 && idade <= FIM_DA_JUVENTUDE) jovens++;

    const i = FAIXAS.findIndex(f => idade <= f.ate);
    // `findIndex` só devolveria -1 com idade negativa (data no futuro); a
    // última faixa é aberta. Cair na última é o comportamento seguro.
    const faixa = faixas[i === -1 ? faixas.length - 1 : i];

    // Guarda a pessoa no lado dela. Os contadores saem daqui no fim, para
    // o número da barra e a lista do cartão nunca poderem discordar.
    const quem = { id: p.id, nome: p.nome_completo, idade };
    if (p.sexo === "feminino")       { faixa.pessoas.feminino.push(quem);  feminino++; }
    else if (p.sexo === "masculino") { faixa.pessoas.masculino.push(quem); masculino++; }
    else                             { faixa.pessoas.semSexo.push(quem);   semSexo++;  }
  }

  // Os contadores, derivados das listas — e a ordem em que os nomes serão
  // lidos: do mais velho para o mais novo, como a própria pirâmide.
  for (const f of faixas) {
    for (const lado of [f.pessoas.masculino, f.pessoas.feminino, f.pessoas.semSexo]) {
      lado.sort((a, b) => b.idade - a.idade || a.nome.localeCompare(b.nome, "pt-BR"));
    }
    f.masculino = f.pessoas.masculino.length;
    f.feminino  = f.pessoas.feminino.length;
    f.semSexo   = f.pessoas.semSexo.length;
    f.total     = f.masculino + f.feminino + f.semSexo;
  }

  const maiorCelula = Math.max(
    1, ...faixas.map(f => Math.max(f.feminino, f.masculino, f.semSexo)),
  );

  // Mediana, e não média: a média de idade se deixa puxar por um punhado de
  // pessoas muito velhas ou muito novas. A mediana responde "metade do
  // rebanho tem mais de tantos anos", que é a frase que se quer dizer.
  //
  // Com número par de pessoas, a média das duas do meio, arredondada — uma
  // mediana de 46,5 anos não diz nada a mais que 47.
  const ordenadas = [...idades].sort((a, b) => a - b);
  const idadeMediana = ordenadas.length === 0
    ? null
    : ordenadas.length % 2 === 1
      ? ordenadas[(ordenadas.length - 1) / 2]
      : Math.round((ordenadas[ordenadas.length / 2 - 1] + ordenadas[ordenadas.length / 2]) / 2);

  // ── A janela de anos ─────────────────────────────────────────────────────
  const anoAtual = new Date().getFullYear();
  const primeiroDaJanela = anoAtual - (ANOS_NA_JANELA - 1);

  const porAno: MovimentoNoAno[] = [];
  for (let a = primeiroDaJanela; a <= anoAtual; a++) {
    porAno.push({ ano: a, entradas: 0, saidas: 0, pessoasEntrada: [], pessoasSaida: [] });
  }
  const naJanela = (ano: number) => porAno.find(x => x.ano === ano);

  // ── Entradas ─────────────────────────────────────────────────────────────
  let anteriores = 0, comAnoEntrada = 0, semAnoEntrada = 0;
  let anoMaisAntigo: number | null = null;

  for (const p of membros) {
    const ano = anoDe(p.data_entrada);
    if (ano === null) { semAnoEntrada++; continue; }

    comAnoEntrada++;
    if (anoMaisAntigo === null || ano < anoMaisAntigo) anoMaisAntigo = ano;
    if (ano < primeiroDaJanela) { anteriores++; continue; }
    // Data de entrada no futuro não tem casa na janela. Somá-la a
    // "anteriores" seria mentira; fica de fora, e o total que a tela usa
    // para dizer quantos o gráfico cobre continua sendo `comAnoEntrada`.
    const item = naJanela(ano);
    if (item) {
      item.pessoasEntrada.push({
        id: p.id, nome: p.nome_completo,
        quando: diaEMes(p.data_entrada), data: p.data_entrada ?? "",
        tipo: TIPO_DE_ENTRADA[p.tipo_entrada ?? ""],
      });
    }
  }

  // ── Saídas ───────────────────────────────────────────────────────────────
  //
  // Quem tem status de saída **e** `data_saida` vira barra no ano; quem tem o
  // status e não tem a data fica contado à parte, e a tela diz isso.
  //
  // Só `tipo_pessoa = 'membro'`: este gráfico é do ROL. Um congregado marcado
  // como falecido é uma perda para a igreja e não é uma saída do rol — ele
  // nunca esteve nele.
  let comAnoSaida = 0, semAnoSaida = 0;

  for (const p of pessoas) {
    if (p.tipo_pessoa !== "membro") continue;
    if (!p.status || !(STATUS_DE_SAIDA as readonly string[]).includes(p.status)) continue;

    const ano = anoDe(p.data_saida);
    if (ano === null) { semAnoSaida++; continue; }
    comAnoSaida++;
    const item = naJanela(ano);
    if (item) {
      // A saída ganha a data pelo mesmo motivo que a entrada — as duas
      // listas são a mesma coisa vista dos dois lados do eixo, e uma sem
      // data ao lado da outra com data pareceria dado faltando.
      item.pessoasSaida.push({
        id: p.id, nome: p.nome_completo,
        quando: diaEMes(p.data_saida),
        tipo: MOTIVO_DA_SAIDA[p.status ?? ""] ?? "saiu do rol",
        data: p.data_saida ?? "",
      });
    }
  }

  // Contadores derivados das listas, e a ordem em que os nomes serão lidos:
  // **por data, do começo do ano para o fim**.
  //
  // A lista é a narrativa de um ano, e um ano se lê de janeiro para
  // dezembro. Ordenar por nome não dizia nada sobre um movimento, e do mais
  // recente para o mais antigo obrigava a ler o ano de trás para a frente.
  //
  // O empate — várias pessoas no mesmo dia, o que é a REGRA aqui, porque a
  // assembleia recebe em grupo (oito entraram em 03/12/2023) — cai no nome,
  // para a lista não embaralhar a cada carregamento da tela.
  //
  // A comparação é entre datas ISO ("2026-03-14"), que ordenam corretamente
  // como texto. O campo `quando` NÃO serve: "14/03" e "02/07" ordenariam
  // pelo dia antes do mês.
  const maisAntigoPrimeiro = (x: PessoaNoAno, y: PessoaNoAno) =>
    x.data.localeCompare(y.data) || x.nome.localeCompare(y.nome, "pt-BR");

  for (const a of porAno) {
    a.pessoasEntrada.sort(maisAntigoPrimeiro);
    a.pessoasSaida.sort(maisAntigoPrimeiro);
    a.entradas = a.pessoasEntrada.length;
    a.saidas   = a.pessoasSaida.length;
  }

  const maior = Math.max(1, ...porAno.map(x => Math.max(x.entradas, x.saidas)));

  return {
    rol,
    composicao: {
      faixas, comDataNascimento, semDataNascimento,
      feminino, masculino, semSexo, maiorCelula,
      idadeMediana, maioresDe60, jovens,
    },
    movimento: {
      porAno,
      maior,
      entradas: { anteriores, anoMaisAntigo, comAno: comAnoEntrada, semAno: semAnoEntrada },
      saidas:   { comAno: comAnoSaida, semAno: semAnoSaida },
    },
  };
}
