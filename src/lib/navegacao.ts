// ─── lib/navegacao.ts — onde estou, de onde vim, como volto ───────────────────
//
// Pedido dela (03/10/2026): "frequentemente perco o contexto — entro numa tela e não
// consigo identificar de onde vim, onde estou, como voltar; acabo usando o menu lateral
// para me localizar". Medido no código antes de mexer (89 telas internas):
//   · 59 telas tinham um "voltar" próprio com DESTINO FIXO — vários apontavam para
//     `/financas` (Contas correntes), uma tela que nem está mais no menu: quem chegou
//     pelo Painel da Tesouraria clicava na seta e caía em outro lugar;
//   · só 1 tela tinha trilha de navegação;
//   · 52 de 89 não tinham nome no cabeçalho do celular (apareciam como "Diakonia");
//   · 64 só se alcançam por dentro de outra tela (não estão no menu).
//
// Este arquivo é o REGISTRO ÚNICO das telas: título, módulo (workspace), seção dentro do
// módulo e tela-pai. A barra de contexto (components/layout/BarraDeContexto.tsx) lê
// daqui e aparece sozinha no topo de toda tela interna. Uma rota nova só precisa de uma
// linha na tabela abaixo — e um teste falha se esquecerem (ver navegacao.test.ts).
//
// Aqui só há regra, sem React e sem rede.

export type ModuloKey =
  | "financeiro" | "pessoas" | "diaconia" | "discipulado"
  | "pastoral" | "secretaria" | "lideranca" | "sistema";

export interface Modulo {
  key: ModuloKey;
  rotulo: string;
  /** A tela "casa" do workspace; pode ter `:param` (preenchido com os da rota atual). */
  home?: string;
}

export const MODULOS: Record<ModuloKey, Modulo> = {
  financeiro:  { key: "financeiro",  rotulo: "Financeiro",  home: "/painel-tesouraria" },
  pessoas:     { key: "pessoas",     rotulo: "Pessoas",     home: "/painel-pessoas" },
  // A Diaconia é um ministério como os outros: o painel dela é o painel do ministério.
  diaconia:    { key: "diaconia",    rotulo: "Diaconia",    home: "/ministerios/:ministerioId/painel" },
  discipulado: { key: "discipulado", rotulo: "Discipulado" },
  pastoral:    { key: "pastoral",    rotulo: "Pastoral",    home: "/painel-pastoral" },
  secretaria:  { key: "secretaria",  rotulo: "Secretaria",  home: "/painel-secretaria" },
  lideranca:   { key: "lideranca",   rotulo: "Liderança" },
  sistema:     { key: "sistema",     rotulo: "Sistema" },
};

/** As quatro abas do workspace Financeiro (Painel da Tesouraria). */
export const SECOES_FINANCEIRO = {
  operacoes: "Operações",
  gestao: "Gestão",
  cadastros: "Cadastros",
  fechamento: "Fechamento",
} as const;
export type SecaoFinanceiro = keyof typeof SECOES_FINANCEIRO;

export interface Tela {
  /** Padrão da rota, como em App.tsx (`/ebd/:classeId/chamada`). */
  padrao: string;
  titulo: string;
  modulo?: ModuloKey;
  /** Aba do Painel da Tesouraria a que a tela pertence (só no Financeiro). */
  secao?: SecaoFinanceiro;
  /** Tela de onde esta se abre. Os `:param` do pai têm de existir no padrão desta. */
  pai?: string;
}

const T = (padrao: string, titulo: string, modulo?: ModuloKey, extra: Partial<Tela> = {}): Tela =>
  ({ padrao, titulo, modulo, ...extra });

export const TELAS: Tela[] = [
  // ── Pessoas ──────────────────────────────────────────────────────────────
  T("/painel-pessoas", "Painel de Pessoas", "pessoas"),
  T("/membros", "Catálogo", "pessoas", { pai: "/painel-pessoas" }),
  T("/visitantes", "Visitantes", "pessoas", { pai: "/painel-pessoas" }),
  T("/visitantes/:id", "Acolhimento", "pessoas", { pai: "/visitantes" }),
  T("/familias", "Famílias", "pessoas", { pai: "/painel-pessoas" }),
  T("/ministerios", "Ministérios", "pessoas", { pai: "/painel-pessoas" }),
  T("/ministerios/:ministerioId/painel", "Painel do ministério", "pessoas", { pai: "/ministerios" }),
  T("/ministerios/:ministerioId/voluntarios", "Voluntários", "pessoas", { pai: "/ministerios/:ministerioId/painel" }),
  T("/areas", "Equipes", "pessoas", { pai: "/ministerios" }),
  T("/organograma", "Organograma", "pessoas", { pai: "/painel-pessoas" }),
  T("/membresia", "Membresia", "pessoas", { pai: "/painel-pessoas" }),
  T("/membresia/:id", "Processo de membresia", "pessoas", { pai: "/membresia" }),

  // ── Diaconia (a home do módulo é o painel do ministério) ─────────────────
  T("/painel-diaconia", "Painel da Diaconia", "diaconia"),
  T("/ministerios/:ministerioId/diaconia/:areaId/pessoas", "Pessoas assistidas", "diaconia"),
  T("/ministerios/:ministerioId/diaconia/:areaId/chamada", "Chamada de confirmação", "diaconia",
    { pai: "/ministerios/:ministerioId/diaconia/:areaId/pessoas" }),
  T("/ministerios/:ministerioId/diaconia/:areaId/chamada/relatorio", "Relatório da chamada", "diaconia",
    { pai: "/ministerios/:ministerioId/diaconia/:areaId/chamada" }),

  // ── Discipulado ──────────────────────────────────────────────────────────
  T("/ebd", "EBD", "discipulado"),
  T("/ebd/relatorio-mensal", "Relatório mensal geral", "discipulado", { pai: "/ebd" }),
  T("/ebd/:classeId", "Classe", "discipulado", { pai: "/ebd" }),
  T("/ebd/:classeId/chamada", "Chamada", "discipulado", { pai: "/ebd/:classeId" }),
  T("/ebd/:classeId/chamada/relatorio", "Relatório da aula", "discipulado", { pai: "/ebd/:classeId" }),
  T("/ebd/:classeId/relatorio-mensal", "Relatório mensal da classe", "discipulado", { pai: "/ebd/:classeId" }),
  T("/ebd/:classeId/campanhas", "Campanhas", "discipulado", { pai: "/ebd/:classeId" }),
  T("/ebd/:classeId/campanhas/:campanhaId", "Campanha", "discipulado", { pai: "/ebd/:classeId/campanhas" }),
  T("/ebd/:classeId/campanhas/:campanhaId/relatorio", "Relatório da campanha", "discipulado",
    { pai: "/ebd/:classeId/campanhas/:campanhaId" }),
  T("/pgm", "Pequenos Grupos", "discipulado"),
  T("/pgm/:grupoId", "Grupo", "discipulado", { pai: "/pgm" }),
  T("/pgm/:grupoId/reuniao/:reuniaoId", "Reunião do grupo", "discipulado", { pai: "/pgm/:grupoId" }),
  T("/pgm/:grupoId/reuniao/:reuniaoId/relatorio", "Relatório da reunião", "discipulado",
    { pai: "/pgm/:grupoId/reuniao/:reuniaoId" }),
  T("/admin/campanhas", "Campanhas espirituais", "discipulado"),

  // ── Pastoral e Secretaria ────────────────────────────────────────────────
  T("/painel-pastoral", "Painel Pastoral", "pastoral"),
  T("/agenda-pastoral", "Agenda pastoral", "pastoral", { pai: "/painel-pastoral" }),
  T("/painel-estrategico", "Crescimento", "pastoral", { pai: "/painel-pastoral" }),
  T("/painel-secretaria", "Painel da Secretaria", "secretaria"),

  // ── Liderança ────────────────────────────────────────────────────────────
  T("/governanca", "Reuniões e Atas", "lideranca"),
  T("/governanca/reuniao/:id", "Reunião", "lideranca", { pai: "/governanca" }),
  T("/governanca/assembleia/:id", "Assembleia", "lideranca", { pai: "/governanca" }),
  T("/assuntos", "Assuntos", "lideranca"),
  T("/assunto/:id", "Assunto", "lideranca", { pai: "/assuntos" }),
  T("/estrutura", "Estrutura", "lideranca"),

  // ── Agenda (transversal: sem módulo, é item de topo do menu) ─────────────
  T("/eventos", "Agenda"),

  // ── Financeiro — abas do Painel da Tesouraria: Operações · Gestão · Cadastros · Fechamento
  T("/painel-tesouraria", "Painel da Tesouraria", "financeiro"),
  // Operações
  T("/financas", "Contas correntes", "financeiro", { secao: "operacoes" }),
  T("/financas/conta/:contaId", "Conta", "financeiro", { pai: "/financas" }),
  T("/financas/relatorio-contas", "Relatório de contas", "financeiro", { pai: "/financas" }),
  T("/financas/agenda", "Agenda financeira", "financeiro", { secao: "operacoes" }),
  T("/financas/doacoes", "Doações", "financeiro", { secao: "operacoes" }),
  // Gestão
  T("/financas/insights", "Insights", "financeiro", { secao: "gestao" }),
  T("/financas/executivo", "Visão Executiva", "financeiro", { secao: "gestao" }),
  T("/financas/dre", "DRE Eclesiástica", "financeiro", { secao: "gestao" }),
  T("/financas/dre/:ano", "DRE do ano", "financeiro", { pai: "/financas/dre" }),
  // Cadastros
  T("/financas/admin", "Contas e categorias", "financeiro", { secao: "cadastros" }),
  T("/financas/recorrencias", "Recorrências", "financeiro", { secao: "cadastros" }),
  T("/financas/centros", "Centros de custo", "financeiro", { secao: "cadastros" }),
  T("/financas/centro/:centroId", "Centro de custo", "financeiro", { pai: "/financas/centros" }),
  T("/financas/centro/:centroId/prestacao-contas", "Prestação de contas do centro", "financeiro",
    { pai: "/financas/centro/:centroId" }),
  T("/financas/orcamento", "Orçamento", "financeiro", { secao: "cadastros" }),
  T("/financas/estoque", "Estoque", "financeiro", { secao: "cadastros" }),
  T("/financas/projetos", "Projetos", "financeiro", { secao: "cadastros" }),
  T("/financas/projeto/:id", "Projeto", "financeiro", { pai: "/financas/projetos" }),
  T("/financas/fornecedores", "Favorecidos", "financeiro", { secao: "cadastros" }),
  T("/financas/fornecedor/:id", "Favorecido", "financeiro", { pai: "/financas/fornecedores" }),
  T("/financas/folha", "Calculadoras (Folha)", "financeiro", { secao: "cadastros" }),
  T("/financas/doadores", "Doadores", "financeiro", { secao: "cadastros" }),
  T("/financas/doadores/:pessoaId", "Doador", "financeiro", { pai: "/financas/doadores" }),
  // Fechamento
  T("/financas/fiscal", "Módulo Fiscal", "financeiro", { secao: "fechamento" }),
  T("/financas/relatorio", "Malote Contábil", "financeiro", { secao: "fechamento" }),
  T("/financas/relatorio/:ano/:mes", "Malote do mês", "financeiro", { pai: "/financas/relatorio" }),
  T("/financas/documentos", "Central de Documentos", "financeiro", { secao: "fechamento" }),
  T("/financas/auditoria-anexos", "Auditoria de documentos", "financeiro", { secao: "fechamento" }),
  T("/financas/reunioes", "Reuniões Financeiras", "financeiro", { secao: "fechamento" }),
  T("/financas/prestacao-de-contas", "Prestação de Contas", "financeiro", { secao: "fechamento" }),
  // Bazar e Cantina e Espaços moram no grupo Financeiro do menu
  T("/arrecadacao", "Bazar e Cantina", "financeiro"),
  T("/arrecadacao/espacos", "Espaços do Bazar", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/reservas/nova", "Nova reserva", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/reserva/:id", "Reserva", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/caixa/:id", "Caixa", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/produtos/:espacoId", "Produtos", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/manutencao", "Manutenção", "financeiro", { pai: "/arrecadacao" }),
  T("/arrecadacao/checklist-templates", "Modelos de checklist", "financeiro", { pai: "/arrecadacao" }),
  T("/locais", "Espaços", "financeiro"),

  // ── Sistema ──────────────────────────────────────────────────────────────
  T("/usuarios", "Usuários", "sistema"),
  T("/admin/recuperacao-senha", "Recuperar senha", "sistema"),
  T("/admin/lgpd", "LGPD", "sistema"),
  T("/admin/identidade", "Identidade", "sistema"),
  T("/admin/documentos", "Documentos", "sistema"),
  T("/admin/importacao", "Importação de membros", "sistema"),
  T("/admin/exportacao", "Exportação", "sistema"),
  T("/admin/resumo-semanal", "Resumo semanal por e-mail", "sistema"),
];

// ── casamento de rota ───────────────────────────────────────────────────────

const semBarraFinal = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const soCaminho = (p: string) => semBarraFinal(p.split(/[?#]/)[0]);

function regexDe(padrao: string): RegExp {
  const corpo = padrao.split("/").map(seg =>
    seg.startsWith(":") ? "([^/]+)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
  return new RegExp(`^${corpo}$`);
}
const nomesDeParametros = (padrao: string) => padrao.split("/").filter(s => s.startsWith(":")).map(s => s.slice(1));

// Estáticas antes das dinâmicas: `/ebd/relatorio-mensal` não pode cair em `/ebd/:classeId`.
const ORDENADAS = [...TELAS].sort((a, b) => nomesDeParametros(a.padrao).length - nomesDeParametros(b.padrao).length);
const POR_PADRAO = new Map(TELAS.map(t => [t.padrao, t]));

export interface TelaCasada { tela: Tela; params: Record<string, string> }

export function casarTela(pathname: string): TelaCasada | null {
  const caminho = soCaminho(pathname);
  for (const tela of ORDENADAS) {
    const m = regexDe(tela.padrao).exec(caminho);
    if (!m) continue;
    const nomes = nomesDeParametros(tela.padrao);
    return { tela, params: Object.fromEntries(nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** Preenche `/ebd/:classeId` com os parâmetros da rota atual. */
export function preencher(padrao: string, params: Record<string, string>): string {
  return padrao.split("/").map(s => (s.startsWith(":") ? encodeURIComponent(params[s.slice(1)] ?? "") : s)).join("/");
}

/** Título curto de qualquer caminho (cabeçalho do celular, "voltar para …"). */
export function tituloDaTela(pathname: string): string | null {
  return casarTela(pathname)?.tela.titulo ?? null;
}

// ── a trilha ────────────────────────────────────────────────────────────────

export interface Migalha {
  rotulo: string;
  /** Sem `to`: texto (o módulo não tem tela-casa, ou é a tela atual). */
  to?: string;
  atual?: boolean;
  /** Para a barra escolher o ícone do módulo. */
  modulo?: ModuloKey;
}

export interface Contexto {
  tela: Tela;
  modulo?: Modulo;
  migalhas: Migalha[];
  /** Para onde "Voltar" vai quando NÃO há histórico, e como se chama o destino. */
  fallback: { to: string; rotulo: string };
}

const hashDaSecao = (s?: SecaoFinanceiro) => (s ? `#${s}` : "");

/**
 * Home › Módulo › [Seção] › … telas-pai … › tela atual.
 *
 * `rotuloFinal` troca o título genérico da última migalha pelo nome real do que está
 * aberto ("Bradesco" em vez de "Conta") — a tela informa via `useRotuloDaTela`.
 */
export function montarContexto(pathname: string, rotuloFinal?: string | null): Contexto | null {
  const c = casarTela(pathname);
  if (!c) return null;
  const { tela, params } = c;

  // a cadeia de telas, da mais alta para a atual
  const cadeia: Tela[] = [];
  for (let t: Tela | undefined = tela, guarda = 0; t && guarda < 10; t = t.pai ? POR_PADRAO.get(t.pai) : undefined, guarda++) {
    cadeia.unshift(t);
  }
  const raiz = cadeia[0];
  const modulo = (tela.modulo ?? raiz.modulo) ? MODULOS[(tela.modulo ?? raiz.modulo)!] : undefined;
  const secao = cadeia.map(t => t.secao).find(Boolean);
  // A casa do módulo pode ter `:param` (Diaconia → painel do ministério). Sem todos os
  // parâmetros na rota atual (ex.: `/painel-diaconia`, que só redireciona), não há como
  // montar o link — melhor sem link do que `/ministerios//painel`.
  const homeResolvivel = !!modulo?.home && nomesDeParametros(modulo.home).every(n => !!params[n]);
  const homeDoModulo = homeResolvivel ? preencher(modulo!.home!, params) : undefined;

  const migalhas: Migalha[] = [{ rotulo: "Home", to: "/" }];
  const ehACasa = !!homeDoModulo && soCaminho(pathname) === homeDoModulo;

  if (modulo) {
    // a própria tela-casa do módulo mostra o NOME DO MÓDULO como última migalha
    migalhas.push(ehACasa
      ? { rotulo: modulo.rotulo, atual: true, modulo: modulo.key }
      : { rotulo: modulo.rotulo, to: homeDoModulo, modulo: modulo.key });
  }
  if (!ehACasa) {
    if (modulo?.key === "financeiro" && secao) {
      migalhas.push({ rotulo: SECOES_FINANCEIRO[secao], to: `${homeDoModulo}${hashDaSecao(secao)}` });
    }
    cadeia.forEach((t, i) => {
      const ultima = i === cadeia.length - 1;
      // a tela-casa do módulo já apareceu como o módulo
      if (homeDoModulo && preencher(t.padrao, params) === homeDoModulo) return;
      migalhas.push(ultima
        ? { rotulo: rotuloFinal?.trim() || t.titulo, atual: true }
        : { rotulo: t.titulo, to: preencher(t.padrao, params) });
    });
  }

  // fallback do "Voltar": a tela-pai; senão o módulo (na seção, se houver); senão a Home
  let fallback: Contexto["fallback"] = { to: "/", rotulo: "Home" };
  if (tela.pai) {
    const pai = POR_PADRAO.get(tela.pai);
    if (pai) fallback = { to: preencher(pai.padrao, params), rotulo: pai.titulo };
  } else if (!ehACasa && homeDoModulo) {
    fallback = { to: `${homeDoModulo}${modulo.key === "financeiro" ? hashDaSecao(secao) : ""}`, rotulo: modulo.rotulo };
  }
  if (ehACasa) fallback = { to: "/", rotulo: "Home" };

  return { tela, modulo, migalhas, fallback };
}

// ── histórico interno ───────────────────────────────────────────────────────

/** Caminhos por posição no histórico do navegador (`history.state.idx`). */
export type Trilha = Record<number, string>;

const FORA_DO_APP = /^\/(auth|convite|reset|esqueci-senha|primeiro-acesso|aceite-lgpd)(\/|$)/;

/**
 * A tela anterior DENTRO do app, ou `null` se o "voltar" do navegador não leva a lugar
 * útil (primeira tela da aba, link colado, tela anterior era o login, ou é a mesma
 * tela). Sem isso um `navigate(-1)` cego tirava a pessoa do sistema.
 */
export function anteriorValida(trilha: Trilha, idx: number, pathAtual: string): string | null {
  if (idx <= 0) return null;
  const anterior = trilha[idx - 1];
  if (!anterior) return null;
  const a = soCaminho(anterior);
  if (FORA_DO_APP.test(a)) return null;
  if (a === soCaminho(pathAtual)) return null;
  return anterior;
}

/** Atualiza a trilha ao entrar numa tela. Ir para uma tela NOVA (push/replace) invalida
 *  o "avançar" que existia depois dela; voltar (pop) não mexe no que está à frente. */
export function registrarNaTrilha(
  trilha: Trilha, idx: number, path: string, tipo: "PUSH" | "REPLACE" | "POP",
): Trilha {
  const nova: Trilha = { ...trilha };
  if (tipo !== "POP") for (const k of Object.keys(nova)) if (Number(k) > idx) delete nova[Number(k)];
  nova[idx] = path;
  return nova;
}
