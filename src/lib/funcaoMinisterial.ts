// ─── funcaoMinisterial.ts — a função da pessoa na igreja ───────────────────
//
// NÃO confundir com acesso ao sistema. São duas coisas que a conversa do dia a
// dia chama de "perfil" e que vivem em tabelas diferentes:
//
//   membros.funcao_ministerial   a função  — um diácono que nunca abriu o app
//   user_roles.role              o acesso  — uma secretária sem função nenhuma
//
// A lista é a desta igreja, não a de um manual: distingue pastor titular de
// auxiliar e 1º de 2º tesoureiro, que é como a igreja fala de si mesma.

export type FuncaoMinisterial =
  // Pastorado — os quatro recebem lembrete de consagração na agenda pastoral
  | "pastor_titular"
  | "pastor_auxiliar"
  | "pastor_missionario"
  | "pastor"
  | "diacono"
  // Diretoria — cargos de mandato, com vigência
  | "vice_presidente_1"
  | "vice_presidente_2"
  | "tesoureiro_1"
  | "tesoureiro_2"
  | "secretaria_1"
  | "secretaria_2"
  // Serviço
  | "ministro"
  | "lider_area"
  | "professor_ebd"
  | "voluntario"
  | "membro"
  // ── Aposentados ──────────────────────────────────────────────────────────
  // Continuam no enum do banco porque doze pessoas os usam, e continuam sendo
  // lidos e exibidos corretamente. Só não aparecem para escolha em cadastro
  // novo. Mesmo padrão de ROLE_LABEL, onde "diakonia" é lido como Pastor e
  // não é oferecido.
  | "lider"
  | "tesoureiro"
  | "secretario"
  | "evangelista"
  | "missionario"
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
  coluna?: "data_consagracao_pastoral" | "data_ordenacao_diaconal";
  /** Rótulo do campo de data. */
  rotuloData?: string;
  /** Fora da lista de escolha; mantido para ler cadastro antigo. */
  aposentada?: true;
}

const CONSAGRACAO_PASTORAL = {
  tipoData: "consagracao" as const,
  coluna: "data_consagracao_pastoral" as const,
  rotuloData: "Consagração pastoral",
};

export const FUNCAO_MINISTERIAL: Record<FuncaoMinisterial, Funcao> = {
  pastor_titular:     { label: "Pastor Titular",      ...CONSAGRACAO_PASTORAL },
  pastor_auxiliar:    { label: "Pastor Auxiliar",     ...CONSAGRACAO_PASTORAL },
  pastor_missionario: { label: "Pastor Missionário",  ...CONSAGRACAO_PASTORAL },
  pastor:             { label: "Pastor",              ...CONSAGRACAO_PASTORAL },

  // Ordenação diaconal é ato próprio, com nome próprio: "consagração" e
  // "ordenação" não são sinônimos, e o campo diz o que a igreja diz.
  diacono:            { label: "Diácono",             tipoData: "consagracao",
                        coluna: "data_ordenacao_diaconal", rotuloData: "Ordenação diaconal" },

  vice_presidente_1: { label: "1º Vice Presidente", tipoData: "vigencia" },
  vice_presidente_2: { label: "2º Vice Presidente", tipoData: "vigencia" },
  tesoureiro_1:      { label: "1º Tesoureiro",      tipoData: "vigencia" },
  tesoureiro_2:      { label: "2º Tesoureiro",      tipoData: "vigencia" },
  secretaria_1:      { label: "1ª Secretária",      tipoData: "vigencia" },
  secretaria_2:      { label: "2ª Secretária",      tipoData: "vigencia" },

  ministro:      { label: "Ministro(a)",         tipoData: "vigencia" },
  lider_area:    { label: "Líder de Área",       tipoData: "vigencia" },
  professor_ebd: { label: "Professor(a) de EBD", tipoData: "vigencia" },

  voluntario: { label: "Voluntário", tipoData: "nenhuma" },
  membro:     { label: "Membro",     tipoData: "nenhuma" },

  // Aposentadas — lidas, nunca oferecidas.
  lider:       { label: "Líder",       tipoData: "vigencia", aposentada: true },
  tesoureiro:  { label: "Tesoureiro",  tipoData: "vigencia", aposentada: true },
  secretario:  { label: "Secretário",  tipoData: "vigencia", aposentada: true },
  evangelista: { label: "Evangelista", tipoData: "nenhuma",  aposentada: true },
  missionario: { label: "Missionário", tipoData: "nenhuma",  aposentada: true },
  presbitero:  { label: "Presbítero",  tipoData: "nenhuma",  aposentada: true },
  coordenador: { label: "Coordenador", tipoData: "vigencia", aposentada: true },
  obreiro:     { label: "Obreiro",     tipoData: "vigencia", aposentada: true },
};

/**
 * A ordem da lista de escolha: pastorado, diretoria, serviço, e o "sem função"
 * no fim. Não é hierarquia de valor — é a ordem em que a secretaria procura.
 */
export const FUNCOES_EM_ORDEM: FuncaoMinisterial[] = [
  "pastor_titular", "pastor_auxiliar", "pastor_missionario", "pastor", "diacono",
  "vice_presidente_1", "vice_presidente_2",
  "tesoureiro_1", "tesoureiro_2",
  "secretaria_1", "secretaria_2",
  "ministro", "lider_area", "professor_ebd",
  "voluntario", "membro",
];

/** As quatro que recebem lembrete de consagração — espelha o filtro da view. */
export const FUNCOES_PASTORAIS: FuncaoMinisterial[] = [
  "pastor_titular", "pastor_auxiliar", "pastor_missionario", "pastor",
];

/** "membro" é a ausência de função, não uma função. */
export const temFuncao = (f?: string | null): boolean =>
  !!f && f !== "membro" && f in FUNCAO_MINISTERIAL;

export const rotuloFuncao = (f?: string | null): string =>
  (f && FUNCAO_MINISTERIAL[f as FuncaoMinisterial]?.label) || "";

/** Verdadeiro para valor que saiu da lista mas ainda está em cadastro. */
export const funcaoAposentada = (f?: string | null): boolean =>
  !!f && !!FUNCAO_MINISTERIAL[f as FuncaoMinisterial]?.aposentada;
