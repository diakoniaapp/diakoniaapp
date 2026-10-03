import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODULOS, TELAS, anteriorValida, casarTela, montarContexto, preencher, registrarNaTrilha, tituloDaTela,
} from "./navegacao";

const rotulos = (p: string, final?: string) => montarContexto(p, final)!.migalhas.map(m => m.rotulo);
const alvos = (p: string) => montarContexto(p)!.migalhas.map(m => m.to ?? null);

describe("o registro cobre o app inteiro", () => {
  // As rotas vêm do próprio App.tsx: uma tela nova sem entrada em TELAS reprova aqui,
  // em vez de aparecer no sistema sem trilha nem nome (o defeito que este arquivo resolve).
  const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
  const dentroDoLayout = app.slice(app.indexOf("<AppLayout />"), app.indexOf('<Route path="*"'));
  const rotas = [...dentroDoLayout.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)]
    .filter(m => m[2] !== "Navigate" && m[1] !== "/")
    .map(m => m[1]);

  it("encontrou as rotas do App.tsx (sanidade do próprio teste)", () => {
    expect(rotas.length).toBeGreaterThan(80);
  });

  it("toda rota interna tem entrada", () => {
    const sem = rotas.filter(r => !TELAS.some(t => t.padrao === r));
    expect(sem, `rotas sem entrada em TELAS: ${sem.join(", ")}`).toEqual([]);
  });

  it("e não sobra entrada de rota que não existe mais", () => {
    const orfas = TELAS.map(t => t.padrao).filter(p => !rotas.includes(p));
    expect(orfas, `entradas sem rota no App.tsx: ${orfas.join(", ")}`).toEqual([]);
  });

  it("padrões únicos; todo pai existe e seus parâmetros existem no filho", () => {
    const padroes = TELAS.map(t => t.padrao);
    expect(new Set(padroes).size).toBe(padroes.length);
    for (const t of TELAS) {
      if (!t.pai) continue;
      expect(padroes, `${t.padrao} aponta para um pai inexistente: ${t.pai}`).toContain(t.pai);
      const dele = t.padrao.split("/").filter(s => s.startsWith(":"));
      for (const p of t.pai.split("/").filter(s => s.startsWith(":"))) {
        expect(dele, `${t.padrao}: o pai usa ${p}, que o filho não tem`).toContain(p);
      }
    }
  });

  it("não há ciclo de pais, e a cadeia é curta", () => {
    for (const t of TELAS) {
      let n = 0;
      for (let x: typeof t | undefined = t; x; x = TELAS.find(y => y.padrao === x!.pai)) {
        n += 1;
        expect(n, `ciclo ou cadeia longa em ${t.padrao}`).toBeLessThan(6);
      }
    }
  });
});

describe("casamento de rota", () => {
  it("estática antes da dinâmica: /ebd/relatorio-mensal não vira /ebd/:classeId", () => {
    expect(casarTela("/ebd/relatorio-mensal")!.tela.titulo).toBe("Relatório mensal geral");
    expect(casarTela("/ebd/abc-123")!.tela.titulo).toBe("Classe");
    expect(casarTela("/ebd/abc-123")!.params).toEqual({ classeId: "abc-123" });
  });
  it("ignora barra final, query e hash", () => {
    expect(casarTela("/financas/documentos/")!.tela.titulo).toBe("Central de Documentos");
    expect(casarTela("/financas/admin?aba=categorias")!.tela.titulo).toBe("Contas e categorias");
    expect(casarTela("/painel-tesouraria#ir-para")!.tela.titulo).toBe("Painel da Tesouraria");
  });
  it("rota desconhecida: nada", () => {
    expect(casarTela("/nao-existe")).toBeNull();
    expect(montarContexto("/nao-existe")).toBeNull();
    expect(tituloDaTela("/")).toBeNull();
  });
  it("preencher() troca os :param", () => {
    expect(preencher("/ebd/:classeId/campanhas", { classeId: "x y" })).toBe("/ebd/x%20y/campanhas");
  });
});

describe("a trilha (exemplos dela)", () => {
  it("Home › Financeiro › Fechamento › Central de Documentos", () => {
    expect(rotulos("/financas/documentos")).toEqual(["Home", "Financeiro", "Fechamento", "Central de Documentos"]);
    // o módulo e a seção são links: a seção abre o Painel já na aba certa
    expect(alvos("/financas/documentos")).toEqual(["/", "/painel-tesouraria", "/painel-tesouraria#fechamento", null]);
  });

  it("a última migalha é a tela atual, sem link", () => {
    const m = montarContexto("/financas/documentos")!.migalhas;
    expect(m[m.length - 1]).toMatchObject({ atual: true });
    expect(m[m.length - 1].to).toBeUndefined();
  });

  it("Home › Pessoas › Catálogo", () => {
    expect(rotulos("/membros")).toEqual(["Home", "Pessoas", "Catálogo"]);
    expect(alvos("/membros")).toEqual(["/", "/painel-pessoas", null]);
  });

  it("Diaconia: o módulo leva ao painel do ministério certo (parâmetro preenchido)", () => {
    const p = "/ministerios/m1/diaconia/a9/pessoas";
    expect(rotulos(p)).toEqual(["Home", "Diaconia", "Pessoas assistidas"]);
    expect(alvos(p)[1]).toBe("/ministerios/m1/painel");
    expect(rotulos(`${p.replace("/pessoas", "/chamada/relatorio")}`)).toEqual(
      ["Home", "Diaconia", "Pessoas assistidas", "Chamada de confirmação", "Relatório da chamada"]);
    expect(alvos(`${p.replace("/pessoas", "/chamada")}`)[2]).toBe("/ministerios/m1/diaconia/a9/pessoas");
  });

  it("a tela-casa do workspace mostra o nome do módulo e não repete", () => {
    expect(rotulos("/painel-tesouraria")).toEqual(["Home", "Financeiro"]);
    expect(rotulos("/painel-pessoas")).toEqual(["Home", "Pessoas"]);
    expect(montarContexto("/painel-tesouraria")!.migalhas.at(-1)).toMatchObject({ atual: true });
  });

  it("telas-filho aparecem na cadeia, cada ancestral com o seu link", () => {
    expect(rotulos("/financas/centro/c7/prestacao-contas")).toEqual(
      ["Home", "Financeiro", "Cadastros", "Centros de custo", "Centro de custo", "Prestação de contas do centro"]);
    expect(alvos("/financas/centro/c7/prestacao-contas")).toEqual(
      ["/", "/painel-tesouraria", "/painel-tesouraria#cadastros", "/financas/centros", "/financas/centro/c7", null]);
  });

  it("a tela informa o nome real e ele troca só a última migalha", () => {
    expect(rotulos("/financas/conta/abc", "Bradesco")).toEqual(["Home", "Financeiro", "Operações", "Contas correntes", "Bradesco"]);
    expect(rotulos("/financas/conta/abc", "  ")).toEqual(["Home", "Financeiro", "Operações", "Contas correntes", "Conta"]);
  });

  it("módulos sem tela-casa (Discipulado) mostram o nome como texto, sem link", () => {
    expect(rotulos("/ebd/c1/chamada")).toEqual(["Home", "Discipulado", "EBD", "Classe", "Chamada"]);
    expect(alvos("/ebd/c1/chamada")).toEqual(["/", null, "/ebd", "/ebd/c1", null]);
  });

  it("tela sem módulo (Agenda): Home › Agenda", () => {
    expect(rotulos("/eventos")).toEqual(["Home", "Agenda"]);
  });

  it("toda trilha começa em Home e termina na tela atual", () => {
    for (const t of TELAS) {
      const exemplo = t.padrao.replace(/:(\w+)/g, "x1");
      const m = montarContexto(exemplo)!.migalhas;
      expect(m[0]).toMatchObject({ rotulo: "Home", to: "/" });
      expect(m.filter(x => x.atual)).toHaveLength(1);
      expect(m[m.length - 1].atual, t.padrao).toBe(true);
      // nenhuma migalha com link para a própria tela atual
      expect(m.filter(x => x.to && x.to.split("#")[0] === exemplo), t.padrao).toEqual([]);
    }
  });
});

describe("destino do 'Voltar' quando não há histórico", () => {
  const f = (p: string) => montarContexto(p)!.fallback;
  it("tela de primeiro nível do Financeiro: 'Voltar para Financeiro', já na aba da tela", () => {
    expect(f("/financas/documentos")).toEqual({ to: "/painel-tesouraria#fechamento", rotulo: "Financeiro" });
    expect(f("/financas/executivo")).toEqual({ to: "/painel-tesouraria#gestao", rotulo: "Financeiro" });
  });
  it("tela de primeiro nível de Pessoas: 'Voltar para Pessoas'", () => {
    expect(f("/painel-pessoas")).toEqual({ to: "/", rotulo: "Home" }); // a casa do módulo volta pra Home
    expect(f("/membros")).toEqual({ to: "/painel-pessoas", rotulo: "Painel de Pessoas" });
  });
  it("tela-filha volta para a tela-pai, com o parâmetro", () => {
    expect(f("/financas/centro/c7")).toEqual({ to: "/financas/centros", rotulo: "Centros de custo" });
    expect(f("/ebd/c1/campanhas/k2/relatorio")).toEqual({ to: "/ebd/c1/campanhas/k2", rotulo: "Campanha" });
  });
  it("módulo sem casa e tela de topo: volta para a Home", () => {
    expect(f("/ebd")).toEqual({ to: "/", rotulo: "Home" });
    expect(f("/usuarios")).toEqual({ to: "/", rotulo: "Home" });
  });
  it("todo destino existe no registro ou é a Home", () => {
    for (const t of TELAS) {
      const d = montarContexto(t.padrao.replace(/:(\w+)/g, "x1"))!.fallback;
      expect(d.to === "/" || casarTela(d.to) !== null, `${t.padrao} → ${d.to}`).toBe(true);
    }
  });
});

describe("histórico interno: o voltar não tira a pessoa do sistema", () => {
  it("há tela anterior no app", () => {
    expect(anteriorValida({ 0: "/painel-tesouraria", 1: "/financas/documentos" }, 1, "/financas/documentos")).toBe("/painel-tesouraria");
  });
  it("primeira tela da aba (idx 0), ou posição sem registro: sem histórico", () => {
    expect(anteriorValida({ 0: "/financas/documentos" }, 0, "/financas/documentos")).toBeNull();
    expect(anteriorValida({ 5: "/financas/documentos" }, 5, "/financas/documentos")).toBeNull();
  });
  it("a anterior era o login ou outra tela pública: não volta pra lá", () => {
    for (const p of ["/auth", "/aceite-lgpd", "/primeiro-acesso", "/convite/abc", "/esqueci-senha"]) {
      expect(anteriorValida({ 0: p, 1: "/" }, 1, "/"), p).toBeNull();
    }
  });
  it("a anterior é a própria tela (só mudou a query): não conta", () => {
    expect(anteriorValida({ 0: "/financas/admin", 1: "/financas/admin?aba=categorias" }, 1, "/financas/admin")).toBeNull();
  });

  it("registrar: entrar numa tela nova apaga o 'avançar' antigo; voltar (POP) não", () => {
    let t = {};
    t = registrarNaTrilha(t, 0, "/a", "PUSH");
    t = registrarNaTrilha(t, 1, "/b", "PUSH");
    t = registrarNaTrilha(t, 2, "/c", "PUSH");
    expect(t).toEqual({ 0: "/a", 1: "/b", 2: "/c" });
    t = registrarNaTrilha(t, 1, "/b", "POP");           // voltou para /b
    expect(t).toEqual({ 0: "/a", 1: "/b", 2: "/c" });  // o /c continua válido (avançar)
    t = registrarNaTrilha(t, 2, "/d", "PUSH");          // foi para /d a partir de /b
    expect(t).toEqual({ 0: "/a", 1: "/b", 2: "/d" });
  });
  it("o fluxo dela: Painel da Tesouraria → Central de Documentos → voltar = Painel da Tesouraria", () => {
    let t = registrarNaTrilha({}, 3, "/painel-tesouraria", "REPLACE");
    t = registrarNaTrilha(t, 4, "/financas/documentos", "PUSH");
    expect(anteriorValida(t, 4, "/financas/documentos")).toBe("/painel-tesouraria");
    expect(tituloDaTela(anteriorValida(t, 4, "/financas/documentos")!)).toBe("Painel da Tesouraria");
  });
});

describe("módulos", () => {
  it("toda tela com módulo usa um módulo que existe", () => {
    for (const t of TELAS) if (t.modulo) expect(MODULOS[t.modulo], t.padrao).toBeDefined();
  });
  it("só o Financeiro usa seção", () => {
    for (const t of TELAS) if (t.secao) expect(t.modulo ?? "financeiro", t.padrao).toBe("financeiro");
  });
});
