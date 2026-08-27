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
 * **Por que 0–17 e não 9–17.** O batismo se dá a partir dos 9 anos, então
 * seria tentador começar a pirâmide ali. Mas a pirâmide mostra quem ESTÁ no
 * rol, não quem pode entrar: se houver um membro de 7 anos, ele precisa
 * aparecer em algum lugar. Uma faixa que começa aos 9 o esconderia.
 */
const FAIXAS: { rotulo: string; ate: number }[] = [
  { rotulo: "0–17",  ate: 17 },
  { rotulo: "18–29", ate: 29 },
  { rotulo: "30–44", ate: 44 },
  { rotulo: "45–59", ate: 59 },
  { rotulo: "60–74", ate: 74 },
  { rotulo: "75+",   ate: Infinity },
];

export interface FaixaEtaria {
  rotulo: string;
  feminino: number;
  masculino: number;
  /** Membros da faixa sem sexo registrado. Contados, não escondidos. */
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

  // A pirâmide e as entradas são do ROL: membros ativos. Congregado ainda
  // não entrou, e quem saiu já não está.
  const membros = pessoas.filter(p => p.tipo_pessoa === "membro" && p.status === "ativo");

  // ── A pirâmide ───────────────────────────────────────────────────────────
  const faixas: FaixaEtaria[] = FAIXAS.map(f => ({
    rotulo: f.rotulo, feminino: 0, masculino: 0, semSexo: 0, total: 0,
  }));
  let comDataNascimento = 0, semDataNascimento = 0;
  let feminino = 0, masculino = 0, semSexo = 0;

  for (const p of membros) {
    const idade = idadeEm(p.data_nascimento);
    if (idade === null) { semDataNascimento++; continue; }
    comDataNascimento++;

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
    },
    movimento: {
      porAno,
      maior,
      entradas: { anteriores, anoMaisAntigo, comAno: comAnoEntrada, semAno: semAnoEntrada },
      saidas:   { comAno: comAnoSaida, semAno: semAnoSaida },
    },
  };
}
