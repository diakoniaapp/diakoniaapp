// ─── Teste da Home: a tira não pode mentir sobre a página ─────────────────
//
// Existe por causa de um defeito real, e não por zelo.
//
// Ao fundir "Para celebrar" e "Convide alguém" numa Agenda só, a seção nova
// herdou o lugar da segunda — o último da página — enquanto `ATALHOS`
// continuou anunciando-a em terceiro. Nada reclamou: o `tsc` passou, o build
// passou, o salto do atalho funcionou. Só levava a um lugar inesperado.
//
// É a classe de defeito mais cara deste projeto: a tela afirmando com
// confiança algo que não corresponde ao que está embaixo. Uma tira FIXA é uma
// promessa sobre a forma da página, e quem rola em vez de clicar é justamente
// quem descobre a promessa quebrada.
//
// ── POR QUE LÊ O ARQUIVO EM VEZ DE MONTAR O COMPONENTE ─────────────────────
//
// Renderizar a Home exigiria fingir o Supabase, o `useAuth`, o `usePermissoes`
// e mais quatro serviços — e o que se quer verificar é uma propriedade
// ESTÁTICA do código, não do comportamento em execução. Ler os `id`s na ordem
// em que aparecem no JSX responde à pergunta exata, sem cenário nenhum.
//
// A contrapartida honesta: isto casa texto, então uma reescrita grande do JSX
// pode fazer o teste parar de encontrar o que procura. Daí a primeira
// verificação — se a extração vier vazia, o teste falha em vez de passar
// alegando que "estão todos na ordem".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ATALHOS } from "./Home";

/** Os `id`s das seções, na ordem em que o JSX as escreve. */
function idsNaPagina(): string[] {
  const fonte = readFileSync(join(__dirname, "Home.tsx"), "utf8");
  // Só o corpo: a lista `ATALHOS` também tem `id: "…"`, e casaria antes.
  const corpo = fonte.slice(fonte.indexOf("export default function Home"));
  return [...corpo.matchAll(/<(?:Secao|section) id="([a-z-]+)"/g)].map(m => m[1]);
}

describe("Home — a tira e a página", () => {
  const naPagina = idsNaPagina();

  it("a extração encontrou as seções", () => {
    // Sem isto, uma mudança que quebrasse o padrão faria os outros testes
    // passarem comparando duas listas vazias.
    expect(naPagina.length).toBeGreaterThanOrEqual(5);
  });

  it("a tira anuncia as seções na ordem em que elas aparecem", () => {
    expect(ATALHOS.map(a => a.id)).toEqual(naPagina);
  });

  it("todo atalho leva a uma seção que existe", () => {
    const orfaos = ATALHOS.filter(a => !naPagina.includes(a.id)).map(a => a.id);
    expect(orfaos).toEqual([]);
  });

  it("toda seção tem atalho — nenhuma fica inalcançável pela tira", () => {
    const semAtalho = naPagina.filter(id => !ATALHOS.some(a => a.id === id));
    expect(semAtalho).toEqual([]);
  });

  it("os ids não se repetem — `irParaSecao` acha o primeiro e pararia nele", () => {
    expect(new Set(naPagina).size).toBe(naPagina.length);
  });
});
