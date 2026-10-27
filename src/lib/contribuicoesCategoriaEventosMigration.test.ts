// ─── Migration da categoria "Eventos e Vendas" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────
// Trava as garantias da migration (leitura do texto: ela não foi ensaiada contra o banco): cria a categoria uma vez só, move SÓ Ofertas sem pessoa do favorecido Cielo (sempre venda), fora de período
// fechado/aprovado, não toca nas ofertas para Missões nem em lançamentos com pessoa, e tem rollback. Também prova que a categoria nova sai sozinha dos indicadores da Central de Doadores.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarContribuicoes, tipoDaContribuicao } from "../../supabase/functions/_shared/contribuicoes/analise";

const sql = readFileSync("supabase/migrations/20261027230000_categoria_eventos_e_vendas.sql", "utf8");
const comentarios = (sql.match(/^--.*$/gm) ?? []).join("\n");
const codigo = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

describe("a migration da categoria Eventos e Vendas", () => {
  it("cria a categoria de entrada em Outras Receitas (decisão dela), uma única vez (idempotente)", () => {
    expect(codigo).toMatch(/INSERT INTO public\.fin_categorias[\s\S]*'Eventos e Vendas', 'entrada', 'outras_receitas'/);
    expect(codigo).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM public\.fin_categorias WHERE nome = 'Eventos e Vendas' AND tipo = 'entrada'\)/);
  });
  it("move só: Ofertas, sem pessoa, do favorecido Cielo (sempre venda), desde 2026 — e fora de período fechado ou aprovado", () => {
    for (const parte of ["oferta.nome = 'Ofertas'", "l.pessoa_id IS NULL", "f.nome ILIKE '%cielo%'", "l.data >= DATE '2026-01-01'", "'fechado', 'aprovado'"]) expect(codigo).toContain(parte);
    expect(codigo).not.toContain("~*");   // não depende mais de palavra de venda no texto
  });
  it("não toca em Ofertas para Missões nem em dízimos (a categoria de origem é só 'Ofertas')", () => {
    expect(codigo).not.toMatch(/Ofertas para Miss/);
    expect(codigo).not.toMatch(/Dizimos/);
  });
  it("diz no cabeçalho o defeito, a medição, a alternativa descartada, o ensaio e o rollback", () => {
    for (const t of ["DEFEITO", "MEDIÇÃO", "ALTERNATIVA DESCARTADA", "ENSAIO", "ROLLBACK", "65", "R$ 7.982,34", "Outras Receitas"]) expect(comentarios).toContain(t);
  });
  it("o rollback existe, devolve a Ofertas e só apaga a categoria se ficar vazia", () => {
    const rb = readFileSync("docs/CATEGORIA_EVENTOS_E_VENDAS_ROLLBACK.sql", "utf8");
    expect(rb).toContain("SET categoria_id = (SELECT id FROM public.fin_categorias WHERE nome = 'Ofertas'");
    expect(rb).toContain("NOT EXISTS (SELECT 1 FROM public.fin_lancamentos");
  });
});

describe("a categoria nova sai sozinha dos indicadores de contribuição", () => {
  it("'Eventos e Vendas' não é contribuição", () => {
    expect(tipoDaContribuicao("Eventos e Vendas")).toBeNull();
    for (const c of ["Dizimos", "Ofertas", "Ofertas para Missões"]) expect(tipoDaContribuicao(c)).not.toBeNull();
  });
  it("uma venda por cartão deixa de somar no Arrecadado e nas Ofertas", () => {
    const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
    const antes = analisarContribuicoes([{ pessoa_id: null, data: "2026-08-10", valor: 100, categoria: "Ofertas" }, { pessoa_id: null, data: "2026-08-11", valor: 70, categoria: "Ofertas" }], periodo);
    const depois = analisarContribuicoes([{ pessoa_id: null, data: "2026-08-10", valor: 100, categoria: "Ofertas" }, { pessoa_id: null, data: "2026-08-11", valor: 70, categoria: "Eventos e Vendas" }], periodo);
    expect(antes.arrecadado).toBe(170);
    expect(depois.arrecadado).toBe(100);
    expect(depois.porTipo.oferta).toBe(100);
  });
});
