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
  | "contato";       // conversa, visita, mensagem

export interface EventoDaHistoria {
  data: string;              // ISO, para ordenar
  tipo: TipoEvento;
  titulo: string;
  detalhe?: string | null;
}

/** Colunas de data em `membros` que marcam um ato da vida ministerial. */
const ATOS: Array<[string, string]> = [
  ["data_consagracao_pastoral",   "Consagração pastoral"],
  ["data_ordenacao_presbiteral",  "Ordenação presbiteral"],
  ["data_ordenacao_diaconal",     "Ordenação diaconal"],
  ["data_consagracao_missionaria","Consagração missionária"],
];

const ROTULO_CONTATO: Record<string, string> = {
  cadastro:          "Primeiro culto",
  whatsapp:          "Mensagem no WhatsApp",
  ligacao:           "Ligação",
  visita_presencial: "Visita presencial",
  email:             "E-mail",
  retorno_culto:     "Voltou ao culto",
  evento:            "Participou de um evento",
  observacao:        "Anotação pastoral",
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
      .select("data_entrada, data_consagracao_pastoral, data_ordenacao_presbiteral, data_ordenacao_diaconal, data_consagracao_missionaria")
      .eq("id", pessoaId).maybeSingle(),
    supabase.from("historico_membro")
      .select("tipo, descricao, data")
      .eq("membro_id", pessoaId),
    supabase.from("visita_historico")
      .select("tipo, observacao, created_at")
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

  if (p?.data_entrada) {
    eventos.push({ data: p.data_entrada, tipo: "entrada", titulo: "Chegou à igreja" });
  }

  for (const [coluna, rotulo] of ATOS) {
    const d = p?.[coluna];
    if (d) eventos.push({ data: d, tipo: "consagracao", titulo: rotulo });
  }

  for (const m of mudancas.data ?? []) {
    if (!m.data) continue;
    eventos.push({ data: m.data, tipo: "promocao", titulo: fraseDaPromocao(m.descricao) });
  }

  for (const c of contatos.data ?? []) {
    if (!c.created_at) continue;
    eventos.push({
      data: c.created_at,
      tipo: "contato",
      titulo: ROTULO_CONTATO[c.tipo ?? ""] ?? "Contato",
      detalhe: c.observacao,
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
