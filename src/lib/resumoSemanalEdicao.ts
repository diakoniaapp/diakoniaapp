// ─── lib/resumoSemanalEdicao.ts — as operações da tela de conteúdo do resumo semanal (puras, testadas) ─────────────────────────────────────────────
import { definicaoDoBloco, paraSalvar, type BlocoConfigurado, type PerfilConfigurado } from "@/lib/resumoSemanalCatalogo";

const renumerar = (blocos: BlocoConfigurado[]): BlocoConfigurado[] => blocos.map((b, i) => ({ ...b, ordem: i + 1 }));

/** Sobe (-1) ou desce (+1) um bloco na lista; nas pontas não faz nada. */
export function moverBloco(blocos: BlocoConfigurado[], bloco: string, delta: -1 | 1): BlocoConfigurado[] {
  const ordenados = [...blocos].sort((a, b) => a.ordem - b.ordem);
  const i = ordenados.findIndex(b => b.bloco === bloco);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ordenados.length) return renumerar(ordenados);
  [ordenados[i], ordenados[j]] = [ordenados[j], ordenados[i]];
  return renumerar(ordenados);
}

/** Liga ou desliga um bloco. Bloco "em preparação" não liga. */
export function alternarBloco(blocos: BlocoConfigurado[], bloco: string, ativo: boolean): BlocoConfigurado[] {
  if (ativo && !definicaoDoBloco(bloco)?.disponivel) return blocos;
  return blocos.map(b => (b.bloco === bloco ? { ...b, ativo } : b));
}

export function trocarPerfil(config: PerfilConfigurado[], perfil: string, mudar: (p: PerfilConfigurado) => PerfilConfigurado): PerfilConfigurado[] {
  return config.map(p => (p.perfil === perfil ? mudar(p) : p));
}

/** O que a tela mudou em relação ao que está salvo? (comparação pelo que iria para o banco) */
export const houveMudanca = (atual: PerfilConfigurado[], salvo: PerfilConfigurado[]): boolean => JSON.stringify(paraSalvar(atual)) !== JSON.stringify(paraSalvar(salvo));

/** Quantos blocos ativos o perfil tem (para o rótulo da aba). */
export const quantosAtivos = (p: PerfilConfigurado) => p.blocos.filter(b => b.ativo).length;
