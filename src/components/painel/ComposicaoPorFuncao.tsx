// ─── A composição da equipe, por posto ────────────────────────────────────
//
// ── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// A igreja pediu painéis com a particularidade de cada ministério. A Música
// parecia pedir um módulo próprio — e medindo, a particularidade dela não era
// um módulo: era que a função guardava o INSTRUMENTO. Guitarrista,
// Contrabaixista, Baterista, Tecladista, Trompetista, Violão.
//
// ── A REESCRITA DE 03/09/2026 ──────────────────────────────────────────────
//
// A primeira versão lia `area_voluntarios.funcao`, texto livre, e por isso
// passava a vida a filtrar lixo: uma lista de palavras genéricas, uma lista
// de nomes de área, comparação sem acento nem caixa. Mesmo assim mostrou
// "Recepção · 16" como se fosse função — o nome da própria área.
//
// Agora lê o POSTO, que a área declara e o banco protege: nome de área,
// genérico e "Líder" não entram no catálogo porque um gatilho e um CHECK os
// recusam. Toda a filtragem defensiva deste arquivo pôde sair — não porque se
// decidiu confiar, mas porque passou a haver quem garanta.
//
// ── O QUE CONTINUA VERDADE ─────────────────────────────────────────────────
//
// Conta PESSOAS, não vínculos: quem é guitarrista em Músicos e em Vocal é um
// guitarrista, não dois. E quem tem posto numa área e nenhum noutra já
// respondeu à pergunta — não entra na fila de quem falta.

import { Badge } from "@/components/ui/badge";
import { UserCog } from "lucide-react";
import { Link } from "react-router-dom";
import type { VoluntarioDoMinisterio } from "@/services/painelMinisterioService";
import { chave, type PostosDoMinisterio } from "@/services/postos";

export interface Funcao {
  nome: string;
  pessoas: number;
}

/**
 * Agrupa por posto, contando pessoas.
 *
 * `postos` nulo é o estado de carregamento, e devolve lista vazia com
 * `semFuncao` zero — a tela não desenha nada. É deliberado: anunciar "17 sem
 * posto" antes de os dados chegarem seria alarmar com o próprio atraso.
 */
export function composicao(
  voluntarios: VoluntarioDoMinisterio[],
  postos: PostosDoMinisterio | null,
): { funcoes: Funcao[]; semFuncao: number; total: number } {
  const todos = new Set(voluntarios.map(v => v.pessoa_id));
  if (!postos) return { funcoes: [], semFuncao: 0, total: todos.size };

  // id do posto → nome, montado uma vez a partir do catálogo de cada área.
  const nomeDoPosto = new Map<string, string>();
  for (const lista of postos.catalogo.values()) {
    for (const p of lista) nomeDoPosto.set(p.id, p.nome);
  }

  const porPosto = new Map<string, Set<string>>();
  const comAlgum = new Set<string>();

  for (const v of voluntarios) {
    if (!v.area_id) continue;
    const vinculoId = postos.vinculo.get(chave(v.pessoa_id, v.area_id));
    if (!vinculoId) continue;

    for (const o of postos.ocupacoes.get(vinculoId) ?? []) {
      const nome = nomeDoPosto.get(o.area_funcao_id);
      if (!nome) continue;
      if (!porPosto.has(nome)) porPosto.set(nome, new Set());
      porPosto.get(nome)!.add(v.pessoa_id);
      comAlgum.add(v.pessoa_id);
    }
  }

  return {
    funcoes: [...porPosto.entries()]
      .map(([nome, s]) => ({ nome, pessoas: s.size }))
      .sort((a, b) => b.pessoas - a.pessoas || a.nome.localeCompare(b.nome, "pt-BR")),
    semFuncao: [...todos].filter(p => !comAlgum.has(p)).length,
    total: todos.size,
  };
}

export function ComposicaoPorFuncao({ voluntarios, postos, ministerioId }: {
  voluntarios: VoluntarioDoMinisterio[];
  postos: PostosDoMinisterio | null;
  ministerioId: string;
}) {
  const { funcoes, semFuncao } = composicao(voluntarios, postos);

  // Sem função nenhuma registrada e sem ninguém a cobrar, o bloco não tem o
  // que dizer — e um bloco vazio é pior que a ausência dele.
  if (funcoes.length === 0 && semFuncao === 0) return null;

  // `funcoes.length === 0` significa "ninguém OCUPA posto nenhum" — e isso
  // acontecia tanto quando o catálogo não existia quanto quando existia e
  // ninguém tinha sido ligado ainda. A Recepção provou a diferença: 4 postos
  // no catálogo, 43 pessoas, zero ligações — "nenhum posto foi registrado"
  // seria falso ali. A pergunta certa é sobre o CATÁLOGO, não sobre quem já
  // foi ligado.
  const catalogoExiste = !!postos && [...postos.catalogo.values()].some(l => l.length > 0);

  return (
    <div className="rounded-md border bg-card px-3 py-2.5 mb-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserCog className="w-4 h-4 shrink-0 text-muted-foreground" />
        Quem faz o quê
      </p>

      {funcoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {funcoes.map(f => (
            <Badge key={f.nome} variant="outline" className="text-xs font-normal">
              {f.nome} · {f.pessoas}
            </Badge>
          ))}
        </div>
      )}

      {/* O número leva ao trabalho. Antes ele parava aqui: a tela contava
          "11 sem função" em três lugares diferentes e nenhum deles abria a
          lista de quem eram — quem lidera lia o número e ia procurar as
          pessoas uma a uma, por baixo de um menu de três pontos. */}
      {semFuncao > 0 && (
        <p className="text-xs mt-2">
          <Link
            to={`/ministerios/${ministerioId}/voluntarios?sem=posto`}
            className="text-warning-text underline underline-offset-2 hover:text-foreground
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {semFuncao === 1
              ? "1 pessoa sem posto definido"
              : `${semFuncao} pessoas sem posto definido`}
          </Link>
          <span className="text-muted-foreground">
            {!catalogoExiste
              ? " — nenhum posto foi registrado neste ministério ainda."
              : " — abrir a lista para preencher."}
          </span>
        </p>
      )}
    </div>
  );
}
