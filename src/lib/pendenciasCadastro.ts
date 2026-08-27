// ─── pendenciasCadastro.ts — o que falta num cadastro, e o que isso custa ───
//
// ── POR QUE ISTO É UM ARQUIVO, E NÃO DUAS LISTAS ───────────────────────────
//
// O mesmo recorte é usado em dois lugares que trabalham de formas opostas:
//
//   · o aviso no painel CONTA no servidor, com `count: exact, head: true`;
//   · a tela de Pessoas FILTRA no cliente, sobre a lista já carregada.
//
// São duas linguagens — `.is("telefone_celular", null)` de um lado,
// `!m.telefone_celular` do outro — dizendo a mesma coisa. Escrever cada uma
// no seu arquivo é combinar que elas discordem: basta alguém acrescentar
// `status = 'ativo'` a uma e esquecer a outra, e o aviso passa a anunciar um
// número que a lista não mostra. Hoje mesmo isso aconteceu neste projeto, com
// a agenda: a faixa dizia 21 e a lista embaixo dela tinha 22 linhas.
//
// Aqui as duas versões ficam na MESMA linha da MESMA entrada, uma debaixo da
// outra, onde a diferença salta aos olhos de quem editar.
//
// ── POR QUE SÓ CONTRADIÇÃO, E NÃO "CAMPO VAZIO" ────────────────────────────
//
// Medido em 26/08/2026, entre os 294 cadastros ativos:
//
//   sem telefone .................  64   22%
//   casado sem data de casamento .  ~35   12%
//   membro sem data de entrada ...  ~54   18%
//   sem data de nascimento .......  86   29%
//
// A regra original era só CONTRADIÇÃO, nunca campo em branco, e "sem data de
// nascimento" tinha ficado de fora por isso: não há nada no cadastro que
// permita à secretaria descobrir a data sozinha — só perguntando à pessoa.
// O receio era criar uma lista que não se resolve trabalhando, e alerta que
// não zera para de ser lido.
//
// **O receio se mostrou infundado, e está medido.** A pendência entrou
// depois, e em pouco mais de um dia caiu de 84 para 53 pessoas: 37
// congregados resolvidos. A lista era trabalhável; o que faltava era ela
// existir. Fica registrado porque a regra "só contradição" continua valendo
// para o resto — a exceção é que campo em branco entra quando alguém PODE ir
// atrás dele, e aqui a secretaria podia.
//
// Cada entrada tem consequência nomeável — que é o que a `consequencia` diz.
// "Falta um campo" não move ninguém; "não aparecem nas bodas do mês" move.

/** O bastante de uma pessoa para decidir se ela tem a pendência. */
export interface PessoaParaPendencia {
  status?: string | null;
  telefone_celular?: string | null;
  /** Marcada quando a pessoa não tem telefone próprio e isso está correto. */
  telefone_dispensado?: boolean | null;
  estado_civil?: string | null;
  data_casamento?: string | null;
  tipo_pessoa?: string | null;
  data_entrada?: string | null;
  tipo_entrada?: string | null;
  data_nascimento?: string | null;
  /** Dia e mês de quem não teve o ano registrado. Ver lib/idade.ts. */
  nascimento_dia_mes?: string | null;
  sexo?: string | null;
}

export interface PendenciaCadastro {
  /** Vai na URL: `/membros?pendencia=sem-telefone`. */
  chave: string;
  /** Cabeçalho do aviso na tela de Pessoas, quando o filtro está ligado. */
  rotulo: string;
  /** Frase completa do painel, já no singular ou plural certo. */
  texto: (n: number) => string;
  /** O que se perde enquanto não for corrigido. */
  consequencia: string;
  /** Impede QUALQUER cuidado de chegar, não só um recurso. Sobe e ganha cor. */
  destaque?: boolean;
  /**
   * O recorte na consulta que conta (servidor).
   *
   * Traz o `status` junto de propósito, em vez de deixá-lo numa query base:
   * assim esta linha e a `combina` abaixo dizem a MESMA coisa inteira, e dá
   * para conferir uma contra a outra sem sair da entrada.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtrarConsulta: (q: any) => any;
  /** O MESMO recorte, na lista já carregada (cliente). */
  combina: (m: PessoaParaPendencia) => boolean;
}

export const PENDENCIAS_CADASTRO: PendenciaCadastro[] = [
  {
    chave: "sem-telefone",
    rotulo: "Sem telefone cadastrado",
    destaque: true,
    texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} sem telefone cadastrado`,
    // Quem não tem telefone não recebe aniversário, não recebe convite, não
    // entra em nenhuma jornada de cuidado. Não é um campo em branco: é uma
    // pessoa fora de alcance.
    //
    // Salvo quem tem `telefone_dispensado`. Uma criança de um mês não tem
    // celular e nunca vai ter tão cedo — mas a igreja fala com ela pelo
    // telefone da mãe. Ela não está fora de alcance, está na lista errada.
    // Eram 23 crianças em 63 nomes, e 20 delas com parente com telefone.
    consequencia: "a igreja não tem como falar com elas",
    filtrarConsulta: q => q.eq("status", "ativo").is("telefone_celular", null).eq("telefone_dispensado", false),
    combina:         m => m.status === "ativo" && !m.telefone_celular && !m.telefone_dispensado,
  },
  {
    chave: "casado-sem-data",
    rotulo: "Casados sem data de casamento",
    texto: n => `${n} ${n === 1 ? "pessoa casada" : "pessoas casadas"} sem data de casamento`,
    consequencia: "não aparecem nas bodas do mês",
    filtrarConsulta: q => q.eq("status", "ativo").eq("estado_civil", "casado").is("data_casamento", null),
    combina:         m => m.status === "ativo" && m.estado_civil === "casado" && !m.data_casamento,
  },
  {
    chave: "membro-sem-entrada",
    rotulo: "Membros sem data de entrada",
    texto: n => `${n} ${n === 1 ? "membro" : "membros"} sem data de entrada`,
    consequencia: "ficam de fora do tempo de casa",
    filtrarConsulta: q => q.eq("status", "ativo").eq("tipo_pessoa", "membro").is("data_entrada", null),
    combina:         m => m.status === "ativo" && m.tipo_pessoa === "membro" && !m.data_entrada,
  },
  {
    chave: "sem-tipo-entrada",
    rotulo: "Membros sem tipo de entrada",
    texto: n => `${n} ${n === 1 ? "membro" : "membros"} sem tipo de entrada`,
    // A coluna `tipo_entrada` nasceu em 27/08/2026 — aclamação, batismo,
    // reconciliação ou transferência —, então esta pendência começa valendo
    // para quase todo o rol: 260 dos 261 membros ativos.
    //
    // **Ela fica logo abaixo de "sem data de entrada" de propósito**, e as
    // duas se sobrepõem: dos 260 sem tipo, 81 também não têm data. Não é
    // duplicação — é o mesmo trabalho. A ata da assembleia que registra
    // QUANDO alguém entrou registra COMO na mesma linha, e quem abrir a
    // ficha para preencher uma preenche a outra sem custo adicional.
    //
    // Por isso o recorte NÃO exclui quem está sem data. Excluir faria a
    // pessoa aparecer só depois de a data ser preenchida, obrigando a
    // secretaria a voltar à mesma ata duas vezes.
    consequencia: "não se sabe se vieram por batismo, carta ou aclamação",
    filtrarConsulta: q => q.eq("status", "ativo").eq("tipo_pessoa", "membro").is("tipo_entrada", null),
    combina:         m => m.status === "ativo" && m.tipo_pessoa === "membro" && !m.tipo_entrada,
  },
  // ── O nascimento, em duas filas ──────────────────────────────────────────
  //
  // Era uma pendência só, "sem data de nascimento", e o comentário dela dizia
  // 84 pessoas — 35 membros, 46 congregados e 3 visitantes, medido em
  // 27/08/2026. **Remedido em 27/08/2026, à tarde: são 52** — 41 membros, 9
  // congregados e 3 visitantes. A secretaria resolveu 37 congregados desde
  // que a lista existe. O número velho ficou registrado aqui porque a queda é
  // a prova de que a fila é trabalhável, que era a dúvida quando ela nasceu.
  //
  // Agora são duas, porque passaram a existir TRÊS estados e não dois: quem
  // tem tudo, quem tem só o dia e o mês, e quem não tem nada. A coluna
  // `nascimento_dia_mes` (migration 20260828210000) recebe o meio.
  //
  // A ordem entre elas não é arbitrária. "Sem nada" vem primeiro porque é a
  // que impede TUDO — inclusive a felicitação, que é o que a igreja
  // efetivamente faz. "Só falta o ano" vem depois porque, resolvida a
  // primeira metade, o que sobra bloqueia dois indicadores e nenhuma ação.
  //
  // E a segunda continua sendo pendência de propósito: a regra da casa é
  // cadastro completo. Meia data é uma estação para a fila não ficar parada
  // inteira — não é o destino, e a lista tem de continuar dizendo isso.
  {
    chave: "sem-data-nascimento",
    rotulo: "Sem data de nascimento",
    texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} sem data de nascimento`,
    // Nem o dia nem o mês. Enquanto for assim, a pessoa não recebe
    // felicitação de aniversário, não tem faixa de EBD, não entra na pirâmide
    // etária e — no caso dos congregados — **a regra dos 9 anos não consegue
    // julgar se ela é candidata ao batismo**. Ela não fica de fora da lista de
    // candidatos por não ter idade; fica de fora por ser indecidível, que é
    // diferente e ninguém vê.
    consequencia: "ficam fora dos aniversários, da EBD e da fila do batismo",
    filtrarConsulta: q => q.eq("status", "ativo").is("data_nascimento", null).is("nascimento_dia_mes", null),
    combina:         m => m.status === "ativo" && !m.data_nascimento && !m.nascimento_dia_mes,
  },
  {
    chave: "sem-ano-de-nascimento",
    rotulo: "Sem o ano de nascimento",
    texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} com o aniversário sem o ano`,
    // Estas já recebem felicitação — o dia e o mês bastam para isso, e é por
    // isso que valeu aceitar meia data. O que o ano ainda compra é IDADE, e
    // idade só decide duas coisas: a faixa da pirâmide etária e a regra dos 9
    // anos. Dizer isso com precisão é o que impede a secretaria de tratar as
    // duas filas com a mesma urgência.
    consequencia: "ficam fora da pirâmide etária e da fila do batismo",
    filtrarConsulta: q => q.eq("status", "ativo").not("nascimento_dia_mes", "is", null),
    combina:         m => m.status === "ativo" && !!m.nascimento_dia_mes,
  },
  {
    chave: "sem-estado-civil",
    rotulo: "Sem estado civil",
    texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} sem estado civil`,
    // Fica ANTES de "sem sexo" de propósito: é a pendência que gera outra.
    // Enquanto o estado civil estiver vazio, ninguém pergunta pela data de
    // casamento — então parte dos 61 "casados sem data" de hoje pode estar
    // escondida aqui, invisível às duas contagens.
    consequencia: "enquanto estiver vazio, ninguém pergunta pela data de casamento",
    filtrarConsulta: q => q.eq("status", "ativo").is("estado_civil", null),
    combina:         m => m.status === "ativo" && !m.estado_civil,
  },
  {
    chave: "sem-sexo",
    rotulo: "Sem sexo registrado",
    texto: n => `${n} ${n === 1 ? "pessoa" : "pessoas"} sem sexo registrado`,
    // As classes da EBD têm perfil de faixa etária E sexo — ver
    // `esperados_da_classe`. Sem o campo, a pessoa não é esperada em classe
    // nenhuma, e some da chamada sem que ninguém tenha decidido isso.
    consequencia: "a EBD monta as classes por faixa e sexo, e elas não entram",
    filtrarConsulta: q => q.eq("status", "ativo").is("sexo", null),
    combina:         m => m.status === "ativo" && !m.sexo,
  },
];

export function pendenciaPorChave(chave: string | null | undefined): PendenciaCadastro | undefined {
  if (!chave) return undefined;
  return PENDENCIAS_CADASTRO.find(p => p.chave === chave);
}
