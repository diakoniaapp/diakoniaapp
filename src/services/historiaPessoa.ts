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
// ── DOIS PROBLEMAS DE BANCO QUE APARECERAM AO ESCREVER ISTO ─────────────────
//
// 1. `area_voluntarios` NAO declara chave estrangeira para `areas`. Sem ela o
//    PostgREST recusa o join: "Could not find a relationship between
//    area_voluntarios and areas in the schema cache". Por isso o nome da area
//    vem numa segunda consulta em vez de vir embutido.
//
// 2. E, pela mesma ausencia de chave, ha vinculo orfao: dos 88 membro_id
//    distintos em `area_voluntarios`, 36 nao existem em `membros`. Sao 41%
//    apontando para pessoas que nao estao la. Uma chave estrangeira teria
//    impedido; declarar uma agora exige limpar os orfaos antes, e o que fazer
//    com eles e decisao da igreja, nao deste arquivo.

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
    // Sem embed: `area_voluntarios` não declara chave estrangeira para
    // `areas`, então o PostgREST recusa o join com "Could not find a
    // relationship". O nome da área vem numa segunda consulta, logo abaixo.
    supabase.from("area_voluntarios")
      .select("area_id, data_inicio, funcao, status")
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

  // Segunda consulta, só para os nomes das áreas em que esta pessoa serve.
  // Uma ida a mais ao banco por ficha aberta; a alternativa seria declarar a
  // chave estrangeira que falta, e isso não se resolve daqui — ver a nota
  // sobre os vínculos órfãos no topo deste arquivo.
  const linhas = (servicos.data ?? []) as any[];
  const areaIds = [...new Set(linhas.map(s => s.area_id).filter(Boolean))];
  const nomeDaArea = new Map<string, { area: string; ministerio: string | null }>();

  if (areaIds.length > 0) {
    const { data: areas } = await supabase
      .from("areas")
      .select("id, nome, ministerios(nome)")
      .in("id", areaIds);
    for (const a of (areas ?? []) as any[]) {
      nomeDaArea.set(a.id, { area: a.nome, ministerio: a.ministerios?.nome ?? null });
    }
  }

  for (const s of linhas) {
    if (!s.data_inicio) continue;
    const nomes = nomeDaArea.get(s.area_id);
    if (!nomes) continue;
    const encerrado = s.status !== "ativa" && s.status !== "ativo";
    eventos.push({
      data: s.data_inicio,
      tipo: "servico",
      titulo: `Começou a servir em ${nomes.area}`,
      detalhe: [nomes.ministerio, encerrado ? "encerrado" : null].filter(Boolean).join(" · ") || null,
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
