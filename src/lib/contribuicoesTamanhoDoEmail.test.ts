// ─── O e-mail com a lista de nomes cabe no Gmail (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O defeito que isto previne: com 285 nomes a tabela fazia o HTML chegar a 124 KB, e o Gmail CORTA mensagens acima de ~102 KB ("[Mensagem cortada]") — a lista de nomes, a parte mais longa e a última,
// ficava escondida atrás do "ver mensagem inteira". A marcação das linhas foi enxugada (o estilo mora uma vez na tabela). Medido com os dados reais: 285 nomes + todos os blocos = ~72 KB.
import { describe, expect, it } from "vitest";
import { analisarContribuicoes, analisarSemContribuicao, resumirBase, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";
import { IDS_DOS_BLOCOS } from "../../supabase/functions/_shared/contribuicoes/blocos";
import { montarEmailDeContribuicoes } from "../../supabase/functions/_shared/contribuicoes/email";

const LIMITE_DO_GMAIL = 102_000;
const periodo = { ini: "2026-04-28", fim: "2026-10-27" };

function cenario(contribuintes: number, semContribuicao: number) {
  const linhas: LinhaDeContribuicao[] = [];
  const pessoas: PessoaDaBase[] = [];
  const nomes = new Map<string, string>();
  for (let i = 0; i < contribuintes; i++) {
    const id = `c${i}`; nomes.set(id, `Fulano de Tal Sobrenome Comprido ${i}`);
    pessoas.push({ id, nome: nomes.get(id)!, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null });
    for (let m = 5; m <= 9; m++) linhas.push({ pessoa_id: id, data: `2026-0${m}-10`, valor: 100, categoria: "Dizimos" });   // recorrente: 5 meses completos
  }
  for (let i = 0; i < semContribuicao; i++) pessoas.push({ id: `s${i}`, nome: `Beltrano da Silva Sobrenome Comprido ${i}`, tipo_pessoa: "congregado", status: "ativo", data_nascimento: "1980-01-01", familia_id: null });
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
  const a = analisarContribuicoes(linhas, periodo);
  return { a, sem, nominal: listasNominaisDoEmail(linhas, periodo, nomes, sem, "quantidade"), linhas };
}
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("o HTML com a lista de nomes fica abaixo do corte do Gmail", () => {
  it("o caso real (≈ 135 + 133 nomes) com TODOS os blocos: bem abaixo de 102 KB", () => {
    const { a, sem, nominal } = cenario(135, 133);
    const e = montarEmailDeContribuicoes(a, { blocos: IDS_DOS_BLOCOS, base: resumirBase(sem), nominal, baseAnalisada: "membros_congregados" });
    expect(bytes(e.html)).toBeLessThan(LIMITE_DO_GMAIL);
    expect(bytes(e.html)).toBeLessThan(90_000);   // folga: a base cresce
  });
  it("uma igreja maior (300 + 300 nomes) ainda cabe", () => {
    const { a, sem, nominal } = cenario(300, 300);
    const e = montarEmailDeContribuicoes(a, { blocos: IDS_DOS_BLOCOS, base: resumirBase(sem), nominal, baseAnalisada: "membros_congregados" });
    expect(bytes(e.html)).toBeLessThan(LIMITE_DO_GMAIL);
  });
  it("cada linha da lista tem poucas centenas de bytes (o estilo mora uma vez, na tabela)", () => {
    const { a, nominal } = cenario(200, 0);
    const sem = montarEmailDeContribuicoes(a, { blocos: ["resumo"] });
    const com = montarEmailDeContribuicoes(a, { blocos: ["resumo", "contribuintes_nominal"], nominal });
    const porLinha = (bytes(com.html) - bytes(sem.html)) / 200;
    expect(porLinha).toBeLessThan(260);
  });
  it("a lista segue inteira: todos os nomes e o último número de posição aparecem", () => {
    const { a, nominal } = cenario(135, 0);
    const e = montarEmailDeContribuicoes(a, { blocos: ["contribuintes_nominal"], nominal });
    expect((e.html.match(/<tr/g) ?? []).length).toBeGreaterThanOrEqual(136);   // 135 linhas + o cabeçalho
    expect(e.html).toContain(">135<");
    expect(e.html).toContain("Fulano de Tal Sobrenome Comprido 134");
  });
  it("a âncora para a prévia rolar até a lista existe quando há nomes, e só então", () => {
    const { a, nominal } = cenario(5, 0);
    expect(montarEmailDeContribuicoes(a, { blocos: ["contribuintes_nominal"], nominal }).html).toContain('id="lista-de-nomes"');
    expect(montarEmailDeContribuicoes(a, { blocos: ["resumo"] }).html).not.toContain("lista-de-nomes");
  });
  it("o zebrado e o cabeçalho continuam: colunas #, Nome, Contribuições e Perfil de contribuição", () => {
    const { a, nominal } = cenario(4, 0);
    const h = montarEmailDeContribuicoes(a, { blocos: ["contribuintes_nominal"], nominal }).html;
    for (const col of [">#<", ">Nome<", ">Contribuições<", ">Perfil de contribuição<"]) expect(h).toContain(col);
    expect(h).toContain("bgcolor=");
  });
});
