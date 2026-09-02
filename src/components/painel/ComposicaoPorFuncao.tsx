// ─── A composição da equipe, por função ───────────────────────────────────
//
// ── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// A igreja pediu painéis com a particularidade de cada ministério, um a um. A
// Música parecia pedir um módulo próprio — e medindo, a particularidade dela
// não era um módulo: era que **`funcao` guarda o instrumento**. Guitarrista,
// Contrabaixista, Baterista, Tecladista/Trompetista, Violão, Vocal.
//
// Medindo os onze antes de escrever, a resposta mudou de forma:
//
//   Música                6 funções próprias — todas instrumentos
//   Administração         5 — Apoio, Atendimento, Planejamento, Líder, Co-líder
//   Comunhão/Integração   3 — Introdução, Recepção, Líder
//   Oração                2 — Abertura, Transmissão (e ZERO genéricos)
//   Diaconia              1 — Cozinha
//   Comunicação           1 — Criador de Conteúdo
//   Evangelismo, Educação Cristã, Famílias   nenhuma
//
// Ou seja: função é um campo usado de verdade por oito dos onze, e o que
// faltava não era uma seção da Música — era esta, que serve os onze e que na
// Música é onde mais significa.
//
// ── O NÚMERO QUE JUSTIFICA O ALERTA ────────────────────────────────────────
//
// **80 dos 128 vínculos ativos não têm função** — 62%. A Comunhão, maior
// equipe da igreja, tem 25 de 44 assim. Quem lidera não monta uma escala de
// recepção sem saber quem faz o quê, e hoje essa informação não aparecia em
// tela nenhuma.
//
// ── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
//
// Não separa "Líder" e "Co-líder" das demais, embora sejam hierarquia e não
// trabalho. Separá-las exigiria uma lista de nomes especiais no código, e a
// igreja é quem escreve essas palavras no cadastro — amanhã pode ser
// "Coordenador". Aparecem junto, e quem lidera lê sem dificuldade.

import { Badge } from "@/components/ui/badge";
import { UserCog } from "lucide-react";
import type { VoluntarioDoMinisterio } from "@/services/painelMinisterioService";

/** As palavras que o cadastro usa quando NÃO se registrou função nenhuma. */
const GENERICAS = new Set(["", "voluntário", "voluntario"]);

// ── A COLUNA `funcao` GUARDA TRÊS COISAS MISTURADAS ────────────────────────
//
// Isto já estava documentado em `MinisterioVoluntarios.tsx`, e eu não li antes
// de escrever este arquivo — a primeira versão mostrava "Recepção · 16" e
// "Introdução · 1" no painel da Comunhão como se fossem funções. São os nomes
// das duas ÁREAS dela, que vazaram para a coluna.
//
// Contado no banco: "Voluntário" 46 vezes (o padrão que o formulário grava),
// nomes de área 17 vezes, e as funções de verdade — Líder, Co-líder, Apoio,
// Planejamento, Atendimento, e os instrumentos da Música.
//
// Nome de área na coluna de função não diz nada que a linha já não diga: a
// pessoa serve na Recepção, e o que ela FAZ na recepção continua desconhecido.
// Por isso conta como ausência, e não como função.

export interface Funcao {
  nome: string;
  pessoas: number;
}

/**
 * Agrupa por função, contando PESSOAS e não vínculos.
 *
 * Quem serve em duas áreas do mesmo ministério com a mesma função apareceria
 * duas vezes numa contagem ingênua — e a pergunta que a tela responde é
 * "quantos bateristas eu tenho", não "quantas linhas há na tabela".
 */
export function composicao(voluntarios: VoluntarioDoMinisterio[]): {
  funcoes: Funcao[];
  semFuncao: number;
  total: number;
} {
  const porFuncao = new Map<string, Set<string>>();
  const semFuncao = new Set<string>();
  const todos = new Set<string>();

  // Os nomes de área DESTE ministério, para reconhecer os que vazaram para a
  // coluna de função. Sai dos próprios voluntários: eles trazem `area_nome`, e
  // pedir as áreas ao banco de novo seria uma consulta para saber o que já
  // está na mão.
  const nomesDeArea = new Set(
    voluntarios.map((v) => (v.area_nome ?? "").trim().toLowerCase()).filter(Boolean),
  );

  for (const v of voluntarios) {
    todos.add(v.pessoa_id);
    const f = (v.funcao ?? "").trim();
    const chave = f.toLowerCase();
    if (GENERICAS.has(chave) || nomesDeArea.has(chave)) { semFuncao.add(v.pessoa_id); continue; }
    if (!porFuncao.has(f)) porFuncao.set(f, new Set());
    porFuncao.get(f)!.add(v.pessoa_id);
  }

  // Quem tem função numa área e é genérico noutra conta como tendo função:
  // a pergunta é se a igreja sabe o que a pessoa faz, e sabe.
  for (const s of porFuncao.values()) for (const p of s) semFuncao.delete(p);

  return {
    funcoes: [...porFuncao.entries()]
      .map(([nome, s]) => ({ nome, pessoas: s.size }))
      .sort((a, b) => b.pessoas - a.pessoas || a.nome.localeCompare(b.nome, "pt-BR")),
    semFuncao: semFuncao.size,
    total: todos.size,
  };
}

export function ComposicaoPorFuncao({ voluntarios }: {
  voluntarios: VoluntarioDoMinisterio[];
}) {
  const { funcoes, semFuncao } = composicao(voluntarios);

  // Sem função nenhuma registrada e sem ninguém a cobrar, o bloco não tem o
  // que dizer — e um bloco vazio é pior que a ausência dele.
  if (funcoes.length === 0 && semFuncao === 0) return null;

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

      {semFuncao > 0 && (
        <p className="text-xs text-warning-text mt-2">
          {semFuncao === 1
            ? "1 pessoa sem função definida no cadastro."
            : `${semFuncao} pessoas sem função definida no cadastro.`}
          {funcoes.length === 0 && " Nenhuma função foi registrada neste ministério."}
        </p>
      )}
    </div>
  );
}
