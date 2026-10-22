// ─── catalogo.ts — os blocos que o resumo semanal sabe montar e o padrão de cada perfil ───────────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): a igreja decide QUEM recebe (por perfil), O QUE recebe (quais blocos) e EM QUE ORDEM, sem depender do desenvolvedor. As escolhas ficam no banco
// (`resumo_semanal_perfis` / `resumo_semanal_blocos`); este arquivo é o que o código SABE montar — um bloco novo continua pedindo código (a frase e o número), mas ligar, desligar e reordenar não.
//
// ARQUIVO PURO (mora em `_shared`, como o resto do código que duas funções dividem), sem import de Deno nem de React: as Edge Functions o importam (`../_shared/resumoSemanal/catalogo.ts`) e a tela de configuração também (via `src/lib/resumoSemanalCatalogo.ts`) — UMA lista só, os dois lados
// não divergem. Um teste cobre as regras (`src/lib/resumoSemanalConfig.test.ts`).

export type Perfil = "administracao" | "tesouraria" | "secretaria" | "pastoral";
/** A ordem em que os perfis de UMA pessoa se somam (a Administração primeiro). */
export const PERFIS: readonly Perfil[] = ["administracao", "tesouraria", "secretaria", "pastoral"];
export const ROTULO_DO_PERFIL: Record<Perfil, string> = {
  administracao: "Administração", tesouraria: "Tesouraria", secretaria: "Secretaria", pastoral: "Pastoral",
};
/** Quem recebe como cada perfil (papéis de `user_roles`). Só informativo: a conta é feita em SQL (`resumo_semanal_pessoas_por_perfil`). */
export const PAPEIS_DO_PERFIL: Record<Perfil, readonly string[]> = {
  administracao: ["admin", "diakonia"], tesouraria: ["tesouraria"], secretaria: ["secretaria"], pastoral: ["pastor"],
};

export type Grupo = "pastoral" | "secretaria" | "tesouraria";

export interface DefinicaoDoBloco {
  id: string;
  grupo: Grupo;
  titulo: string;
  /** o que a administração lê ao escolher */
  descricao: string;
  /** `false` = ainda não existe no e-mail (aparece desligado e travado na tela, para ela ver o que vem) */
  disponivel: boolean;
  /** ligado quando a configuração nunca foi salva */
  padrao: boolean;
}

/** A ordem desta lista é a ordem padrão dentro de cada grupo. */
export const BLOCOS: readonly DefinicaoDoBloco[] = [
  // ── Pastoral
  { id: "aniversariantes", grupo: "pastoral", titulo: "Aniversariantes", descricao: "Aniversariantes e casais em bodas da semana (domingo a sábado).", disponivel: true, padrao: true },
  { id: "visitantes", grupo: "pastoral", titulo: "Visitantes", descricao: "Visitantes ativos sem contato há mais de 7 dias.", disponivel: true, padrao: true },
  { id: "batismo", grupo: "pastoral", titulo: "Batismo", descricao: "Congregados ativos a partir de 9 anos: candidatos ao batismo.", disponivel: true, padrao: true },
  // ── Secretaria
  { id: "membresias", grupo: "secretaria", titulo: "Membresias", descricao: "Solicitações de membresia em andamento.", disponivel: true, padrao: true },
  { id: "governanca", grupo: "secretaria", titulo: "Governança", descricao: "Atas pendentes de reuniões concluídas e pautas em rascunho.", disponivel: true, padrao: true },
  { id: "pessoas_sem_telefone", grupo: "secretaria", titulo: "Pessoas sem telefone", descricao: "Pessoas ativas sem celular cadastrado (e sem dispensa).", disponivel: true, padrao: true },
  // ── Tesouraria
  { id: "contas_atrasadas", grupo: "tesouraria", titulo: "Contas atrasadas", descricao: "Obrigações em aberto que já venceram (menos pagamentos automáticos), como no painel.", disponivel: true, padrao: true },
  { id: "vencimentos_semana", grupo: "tesouraria", titulo: "Vencimentos da semana", descricao: "O que vence de hoje até o sábado, fora os pagamentos automáticos.", disponivel: true, padrao: true },
  { id: "debitos_automaticos", grupo: "tesouraria", titulo: "Débitos automáticos", descricao: "Débitos previstos na semana, os aguardando o banco e as possíveis falhas.", disponivel: true, padrao: true },
  { id: "reembolsos", grupo: "tesouraria", titulo: "Reembolsos", descricao: "Reembolsos aprovados que a igreja ainda deve pagar.", disponivel: true, padrao: true },
  { id: "saldo_contas", grupo: "tesouraria", titulo: "Saldo das contas", descricao: "Saldo nas contas ativas, com cada conta.", disponivel: true, padrao: true },
  { id: "centros_orcamento", grupo: "tesouraria", titulo: "Centros acima do orçamento", descricao: "Centros de custo que passaram do orçamento.", disponivel: true, padrao: true },
  { id: "fiscal", grupo: "tesouraria", titulo: "Obrigações fiscais", descricao: "Obrigações do módulo fiscal atrasadas ou vencendo em breve.", disponivel: true, padrao: false },
  { id: "caixas_abertos", grupo: "tesouraria", titulo: "Caixas abertos", descricao: "Caixas da Arrecadação ainda abertos.", disponivel: true, padrao: false },
  { id: "prontidao_malote", grupo: "tesouraria", titulo: "Prontidão do Malote", descricao: "Quanto do mês está pronto para a contabilidade.", disponivel: false, padrao: false },
  { id: "documentos_pendentes", grupo: "tesouraria", titulo: "Documentos pendentes", descricao: "Despesas com documentação incompleta.", disponivel: false, padrao: false },
  { id: "recursos_reservados", grupo: "tesouraria", titulo: "Recursos reservados", descricao: "Reservado × livre, com o Fundo Missionário.", disponivel: false, padrao: false },
];

export const MOTIVO_EM_PREPARACAO =
  "Em preparação: depende do cálculo que o app faz na tela (regra documental e Fundo Missionário) — entra quando o e-mail puder ler o MESMO cálculo, para não mostrar um número diferente do da tela.";

export const definicaoDoBloco = (id: string): DefinicaoDoBloco | undefined => BLOCOS.find(b => b.id === id);

/** Os blocos que um perfil pode escolher: o próprio grupo; a Administração escolhe de todos. */
export function blocosDoPerfil(perfil: Perfil): DefinicaoDoBloco[] {
  return perfil === "administracao" ? [...BLOCOS] : BLOCOS.filter(b => b.grupo === perfil);
}

// ─── a configuração: o que está salvo + o padrão do catálogo ────────────────────────────────────────────────────────────────────

export interface BlocoConfigurado { bloco: string; ativo: boolean; ordem: number }
export interface PerfilConfigurado { perfil: Perfil; ativo: boolean; blocos: BlocoConfigurado[] }
export interface ConfigSalva {
  perfis: { perfil: string; ativo: boolean }[];
  blocos: { perfil: string; bloco: string; ativo: boolean; ordem: number }[];
}

/**
 * Junta o salvo com o padrão. Regras:
 *  · perfil sem linha = recebe (ligado);
 *  · bloco com linha salva usa o `ativo` e a `ordem` salvos; bloco SEM linha (um bloco novo do código) entra depois dos salvos, na ordem do catálogo, com o `padrao` dele;
 *  · linha salva de bloco que o código não conhece mais é ignorada;
 *  · bloco "em preparação" nunca fica ativo, mesmo que o banco diga que sim.
 * O resultado vem com `ordem` 1..n contínua.
 */
export function mesclarConfig(salva: ConfigSalva | null | undefined): PerfilConfigurado[] {
  return PERFIS.map(perfil => {
    const linhaDoPerfil = salva?.perfis.find(p => p.perfil === perfil);
    const doPerfil = blocosDoPerfil(perfil);
    const salvos = (salva?.blocos ?? []).filter(b => b.perfil === perfil && doPerfil.some(d => d.id === b.bloco)).sort((a, b) => a.ordem - b.ordem);
    const semLinha = doPerfil.filter(d => !salvos.some(s => s.bloco === d.id));
    const todos: { bloco: string; ativo: boolean }[] = [
      ...salvos.map(s => ({ bloco: s.bloco, ativo: s.ativo })),
      ...semLinha.map(d => ({ bloco: d.id, ativo: d.padrao })),
    ];
    return {
      perfil,
      ativo: linhaDoPerfil ? linhaDoPerfil.ativo : true,
      blocos: todos.map((b, i) => ({ bloco: b.bloco, ativo: b.ativo && !!definicaoDoBloco(b.bloco)?.disponivel, ordem: i + 1 })),
    };
  });
}

/**
 * Os blocos que UMA pessoa recebe, na ordem: percorre os perfis dela na ordem de `PERFIS` (só os que estão ligados), pega os blocos ativos de cada um na ordem escolhida e tira os repetidos
 * (quem é Tesouraria e Secretaria vê um bloco uma vez só). Pessoa sem perfil ligado ou sem bloco ativo = lista vazia (não se manda e-mail vazio).
 */
export function blocosDaPessoa(perfisDaPessoa: readonly string[], config: readonly PerfilConfigurado[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const perfil of PERFIS) {
    if (!perfisDaPessoa.includes(perfil)) continue;
    const c = config.find(x => x.perfil === perfil);
    if (!c || !c.ativo) continue;
    for (const b of [...c.blocos].sort((a, z) => a.ordem - z.ordem)) {
      if (!b.ativo || vistos.has(b.bloco)) continue;
      vistos.add(b.bloco);
      saida.push(b.bloco);
    }
  }
  return saida;
}

/** O que vai para o banco: só perfis e blocos conhecidos, ordem 1..n. */
export function paraSalvar(config: readonly PerfilConfigurado[]): PerfilConfigurado[] {
  return config.filter(p => PERFIS.includes(p.perfil)).map(p => ({
    perfil: p.perfil, ativo: p.ativo,
    blocos: p.blocos.filter(b => !!definicaoDoBloco(b.bloco)).map((b, i) => ({ bloco: b.bloco, ativo: b.ativo && !!definicaoDoBloco(b.bloco)?.disponivel, ordem: i + 1 })),
  }));
}
