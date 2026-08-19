// ─── funcaoMinisterial.ts — a função da pessoa na igreja ───────────────────
//
// NÃO confundir com acesso ao sistema. São duas coisas que a conversa do dia a
// dia chama de "perfil" e que vivem em tabelas diferentes:
//
//   membros.funcao_ministerial   a função  — um diácono que nunca abriu o app
//   user_roles.role              o acesso  — uma secretária sem função nenhuma
//
// O enum já existia no banco, com os treze valores abaixo, preenchido nas 283
// pessoas com "membro" e lido por ninguém. Este arquivo é o que faltava para
// ele virar informação.

export type FuncaoMinisterial =
  | "membro"
  | "voluntario"
  | "lider"
  | "pastor"
  | "professor_ebd"
  | "tesoureiro"
  | "secretario"
  | "evangelista"
  | "missionario"
  | "diacono"
  | "presbitero"
  | "coordenador"
  | "obreiro";

/**
 * Qual data acompanha cada função.
 *
 * `consagracao` — ato único, que acontece uma vez e não expira. A coluna é
 *   própria de cada função, e não uma data genérica: `funcao_desde` teria de
 *   significar consagração pastoral numa linha e posse de tesoureiro na outra,
 *   e ninguém saberia, olhando o banco, o que aquela data celebra.
 *
 * `vigencia`   — função exercida por período, com início e fim. O fim é
 *   histórico por decisão: registra que a pessoa foi tesoureira de 2023 a 2025
 *   e não gera alerta, pendência nem fila.
 *
 * `nenhuma`    — "membro" é o padrão do enum: quer dizer que não há função.
 *   Voluntário também não tem investidura formal aqui.
 */
export type TipoData = "consagracao" | "vigencia" | "nenhuma";

interface Funcao {
  label: string;
  tipoData: TipoData;
  /** Coluna da data de consagração, quando houver. */
  coluna?: "data_consagracao_pastoral"
         | "data_ordenacao_diaconal"
         | "data_ordenacao_presbiteral"
         | "data_consagracao_missionaria";
  /** Rótulo do campo de data — "consagração" e "ordenação" não são sinônimos. */
  rotuloData?: string;
}

export const FUNCAO_MINISTERIAL: Record<FuncaoMinisterial, Funcao> = {
  membro:        { label: "Membro",            tipoData: "nenhuma" },
  voluntario:    { label: "Voluntário",        tipoData: "nenhuma" },

  pastor:        { label: "Pastor",            tipoData: "consagracao",
                   coluna: "data_consagracao_pastoral",     rotuloData: "Consagração pastoral" },
  presbitero:    { label: "Presbítero",        tipoData: "consagracao",
                   coluna: "data_ordenacao_presbiteral",    rotuloData: "Ordenação presbiteral" },
  diacono:       { label: "Diácono",           tipoData: "consagracao",
                   coluna: "data_ordenacao_diaconal",       rotuloData: "Ordenação diaconal" },
  evangelista:   { label: "Evangelista",       tipoData: "consagracao",
                   coluna: "data_consagracao_missionaria",  rotuloData: "Consagração" },
  missionario:   { label: "Missionário",       tipoData: "consagracao",
                   coluna: "data_consagracao_missionaria",  rotuloData: "Comissionamento" },

  lider:         { label: "Líder",             tipoData: "vigencia" },
  coordenador:   { label: "Coordenador",       tipoData: "vigencia" },
  tesoureiro:    { label: "Tesoureiro",        tipoData: "vigencia" },
  secretario:    { label: "Secretário",        tipoData: "vigencia" },
  obreiro:       { label: "Obreiro",           tipoData: "vigencia" },
  professor_ebd: { label: "Professor de EBD",  tipoData: "vigencia" },
};

/**
 * Ordem de exibição: do ministério ordenado para a função de mandato, e o
 * "sem função" por último. Não é hierarquia de valor — é a ordem em que a
 * secretaria procura, que começa por quem tem consagração registrada.
 */
export const FUNCOES_EM_ORDEM: FuncaoMinisterial[] = [
  "pastor", "presbitero", "diacono", "evangelista", "missionario",
  "lider", "coordenador", "tesoureiro", "secretario", "obreiro", "professor_ebd",
  "voluntario", "membro",
];

/** "membro" é a ausência de função, não uma função. */
export const temFuncao = (f?: string | null): boolean =>
  !!f && f !== "membro" && f in FUNCAO_MINISTERIAL;

export const rotuloFuncao = (f?: string | null): string =>
  (f && FUNCAO_MINISTERIAL[f as FuncaoMinisterial]?.label) || "";
