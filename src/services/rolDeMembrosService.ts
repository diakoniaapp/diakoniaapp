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
 * Seis faixas sobre ~191 pessoas dão barras entre 20 e 43: nenhuma domina,
 * nenhuma some.
 */
const FAIXAS: { rotulo: string; idades: string; ate: number }[] = [
  { rotulo: "0–17",  idades: "crianças e adolescentes", ate: 17 },
  { rotulo: "18–29", idades: "jovens",                  ate: 29 },
  { rotulo: "30–44", idades: "adultos",                 ate: 44 },
  { rotulo: "45–59", idades: "adultos",                 ate: 59 },
  { rotulo: "60–74", idades: "idosos",                  ate: 74 },
  { rotulo: "75+",   idades: "idosos longevos",         ate: Infinity },
];

/** A partir daqui a pessoa é idosa pelo Estatuto do Idoso (Lei 10.741/2003). */
const IDADE_DE_IDOSO = 60;
/** A juventude termina aqui pelo Estatuto da Juventude (Lei 12.852/2013). */
const FIM_DA_JUVENTUDE = 29;

export interface FaixaEtaria {
  rotulo: string;
  /** "12 a 17 anos" — vai para o `title`, já que o rótulo é só o nome. */
  idades: string;
  feminino: number;
  masculino: number;
  /** Pessoas da faixa sem sexo registrado. Contadas, não escondidas. */
  semSexo: number;
  total: number;
}

export interface MovimentoNoAno {
  ano: number;
  entradas: number;
  /** Membros com status de saída e `data_saida` neste ano. */
  saidas: number;
}

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
  tipo_pessoa: string | null;
  status: string | null;
  sexo: string | null;
  data_nascimento: string | null;
  data_entrada: string | null;
  data_saida: string | null;
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
    .select("id, tipo_pessoa, status, sexo, data_nascimento, data_entrada, data_saida");

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

    if (p.sexo === "feminino")       { faixa.feminino++;  feminino++; }
    else if (p.sexo === "masculino") { faixa.masculino++; masculino++; }
    else                             { faixa.semSexo++;   semSexo++;  }
    faixa.total++;
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
  for (let a = primeiroDaJanela; a <= anoAtual; a++) porAno.push({ ano: a, entradas: 0, saidas: 0 });
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
    if (item) item.entradas++;
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
    if (item) item.saidas++;
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
