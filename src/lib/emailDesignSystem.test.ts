// ─── O Design System de E-mails (23/10/2026) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "ao receber qualquer e-mail enviado pelo sistema, o usuário deve identificar imediatamente que foi gerado pelo DiakoniaApp". Estes testes travam o que faz isso valer:
// TODOS os e-mails (boas-vindas, resumo diário, resumo semanal, alertas) saem da MESMA moldura — mesmo cabeçalho, mesma largura, mesmo rodapé —, o texto do cadastro é sempre escapado, nenhum
// e-mail tem cor fora da paleta e nenhuma função escreve o próprio `<html>`. Quem criar um e-mail novo e não passar pela moldura quebra o teste de "nenhuma função escreve o próprio HTML".
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as D from "../../supabase/functions/_shared/email/desenho";
import { htmlDasAtas, htmlDosVisitantes } from "../../supabase/functions/_shared/email/alertas";
import { lerNomeDaIgreja } from "../../supabase/functions/_shared/email/identidade";
import { montarEmailDiario } from "../../supabase/functions/_shared/pagamentos/emailDiario";
import { montarItensDoDia, type CandidataDoDia } from "../../supabase/functions/_shared/pagamentos/itensDoDia";
import { montarBlocos, montarHtml as htmlSemanal, type Digest } from "../../supabase/functions/_shared/resumoSemanal/blocos";
import { CONFIG_PADRAO, modeloPadrao, montarMensagem, type IdentidadeDaIgreja } from "@/lib/mensagensVisitante";

const IGREJA = "Quarta Igreja Batista do Rio de Janeiro";
const LINHA = "23793381286000782713695000063305975520000010000";

const cand = (o: Partial<CandidataDoDia> = {}): CandidataDoDia => ({
  id: "l1", data: "2026-10-22", valor: 189.9, dias_para_vencer: 0, fornecedor_id: "f1", fornecedor_nome: "Vivo Internet", pessoa_nome: null, descricao: "Internet",
  categoria: "Telefonia", centro: "Administração", chave_pix: null, tipo_chave_pix: null, ultimo_envio: null,
  anexos: [{ tipo: "boleto", nome: "b.pdf", dados: { versao: 1, linhaDigitavel: LINHA, valor: 189.9, vencimento: "2026-10-22", codigoValido: true } }], ...o,
});
const digest = (): Digest => ({
  pastoral: { aniversarios_semana: 2, bodas_semana: 0, visitantes_sem_contato: 1, candidatos_batismo: 0 },
  secretaria: { sem_telefone: 0, membresia_em_andamento: 0, atas_pendentes: 0, pautas_rascunho: 0 },
  tesouraria: { fiscal_atrasados: 0, fiscal_urgentes: 0, caixas_abertos: 0, aprovacoes_pendentes: 0, centros_criticos: 0 },
  gerado_em: "2026-10-25T12:00:00Z",
});
const ig = (): IdentidadeDaIgreja => ({ nome: IGREJA, site: "", redes: [], endereco: "", telefone: "", email: "", resumo: "", missao: "" } as unknown as IdentidadeDaIgreja);

/** Um exemplar de cada e-mail que o sistema envia, todos com a igreja no cabeçalho. */
const todos: Record<string, string> = {
  "resumo diário": montarEmailDiario(montarItensDoDia([cand()]), { hojeYmd: "2026-10-22", hora: 7, igreja: IGREJA }).html,
  "resumo semanal": htmlSemanal("2026-10-25T12:00:00Z", montarBlocos(["aniversariantes", "visitantes"], digest()), undefined, IGREJA),
  "alerta de visitante": htmlDosVisitantes([{ id: "v", nome_completo: "Maria", telefone_celular: null, dias_sem_contato: 3, ultimo_contato_em: null, created_at: "2026-10-19" }], IGREJA),
  "alerta de ata": htmlDasAtas([{ id: "a", titulo: "Reunião da Diretoria", tipo: "diretoria", data_reuniao: "2026-10-10", dias_sem_ata: 12, secretaria_nome: "Ana" }], IGREJA),
  "boas-vindas": montarMensagem(modeloPadrao("primeira_visita", "email"), { config: CONFIG_PADRAO, igreja: ig(), eventos: [], visitante: { nome: "Maria da Silva", culto: "Culto da Manhã" } }).html ?? "",
};

describe("todo e-mail do sistema sai da mesma moldura", () => {
  for (const [nome, html] of Object.entries(todos)) {
    describe(nome, () => {
      it("documento completo, em português, legível no celular", () => {
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain('lang="pt-BR"');
        expect(html).toContain('name="viewport"');
        expect(html).toContain(`max-width:${D.LARGURA}px`);
      });
      it("cabeçalho: a marca do DiakoniaApp e o nome da igreja", () => {
        expect(html).toContain(">DiakoniaApp</p>");
        expect(html).toContain(IGREJA);
      });
      it("o rodapé institucional é exatamente o mesmo", () => {
        expect(html).toContain(D.rodape());
        for (const frase of [D.RODAPE.nome, D.RODAPE.slogan, D.RODAPE.descricao, D.RODAPE.direitos]) expect(html).toContain(frase);
      });
      it("só usa cores da paleta", () => {
        const paleta = new Set<string>();
        const junta = (o: unknown) => { if (typeof o === "string") { if (o.startsWith("#")) paleta.add(o.toLowerCase()); } else if (o && typeof o === "object") Object.values(o).forEach(junta); };
        junta(D.COR);
        paleta.add("#ffffff"); paleta.add("#8b8577");   // texto do botão e a linha de autoria do rodapé
        const usadas = (html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map(c => c.toLowerCase());
        // a boas-vindas guarda os tokens dela em CORES (mesmos valores de fundo/texto/suave/link/título)
        for (const c of usadas) expect(paleta.has(c) || ["#2b2b2b", "#6f6a5f", "#8a5a12", "#6b4b10", "#f6f3ec"].includes(c)).toBe(true);
      });
    });
  }

  it("o rodapé diz exatamente o que ela pediu", () => {
    expect(D.RODAPE.slogan).toBe("Conectando pessoas, organizando o propósito.");
    expect(D.RODAPE.descricao).toBe("Sistema desenvolvido para apoiar a gestão administrativa, financeira e ministerial das igrejas.");
    expect(D.RODAPE.direitos).toBe("© 2026 DiakoniaApp");
  });
});

describe("os componentes escapam o que vem do cadastro", () => {
  const veneno = "<script>alert(1)</script> & \"aspas\"";
  const html = D.moldura({ assunto: veneno, igreja: veneno, aviso: veneno, preheader: veneno, corpo: [
    D.saudacao(veneno), D.paragrafo(veneno), D.blocoDeObservacao(veneno), D.secao(veneno, veneno),
    D.cartao(veneno, ""), D.cartaoDeAlerta({ titulo: veneno, linhas: [veneno] }),
    D.indicadores([{ icone: veneno, rotulo: veneno, valor: veneno }]),
    D.cartaoDePagamento({ etiqueta: veneno, titulo: veneno, subtitulo: veneno, valor: veneno, status: { texto: veneno, tom: "atencao" }, fatos: [{ rotulo: veneno, valor: veneno }], codigo: { rotulo: veneno, texto: veneno }, notas: [veneno], alerta: { texto: veneno, tom: "aviso" } }),
    D.cartaoDeSaldo({ nome: veneno, saldo: veneno, situacao: veneno }),
    D.blocoDeAprovacao({ titulo: veneno, descricao: veneno, fatos: [{ rotulo: veneno, valor: veneno }], url: "https://portal.diakoniaapp.com.br" }),
    D.cartaoDeLista({ titulo: veneno, frase: veneno, itens: [veneno], tom: "ok" }),
  ].join("") });
  it("nenhuma tag nem aspas soltas vindas do texto", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;aspas&quot;");
  });
  it("só http(s) vira link ou botão", () => {
    expect(D.urlSegura("javascript:alert(1)")).toBeNull();
    expect(D.urlSegura("data:text/html,x")).toBeNull();
    expect(D.urlSegura("https://portal.diakoniaapp.com.br")).toBe("https://portal.diakoniaapp.com.br");
    expect(D.botao("javascript:alert(1)", "Clique")).toBe("");
  });
  it("o alerta de visitante e o de ata escapam o nome e o título (antes iam crus no HTML)", () => {
    const v = htmlDosVisitantes([{ id: "v", nome_completo: "<b>X</b>", telefone_celular: null, dias_sem_contato: 3, ultimo_contato_em: null, created_at: "2026-10-19" }]);
    expect(v).not.toContain("<b>X</b>");
    const a = htmlDasAtas([{ id: "a", titulo: "<i>Y</i>", tipo: "d", data_reuniao: "2026-10-10", dias_sem_ata: 12, secretaria_nome: null }]);
    expect(a).not.toContain("<i>Y</i>");
  });
});

describe("os cartões", () => {
  it("indicadores: dois por linha, e um número ímpar não quebra a grade", () => {
    const tres = D.indicadores([{ icone: "🧾", rotulo: "A", valor: "1" }, { icone: "🔴", rotulo: "B", valor: "2" }, { icone: "📅", rotulo: "C", valor: "3" }]);
    expect((tres.match(/<tr><td width="50%"/g) ?? []).length).toBe(2);   // as duas linhas da grade (as tabelas de dentro de cada cartão não contam)
    expect((tres.match(/width="50%"/g) ?? []).length).toBe(4);
  });
  it("cartão de pagamento mostra valor, status e fatos", () => {
    const c = D.cartaoDePagamento({ titulo: "Light", valor: "R$ 10,00", status: { texto: "vence hoje", tom: "aviso" }, fatos: [{ icone: "📅", rotulo: "Vencimento", valor: "22/10/2026" }] });
    for (const t of ["Light", "R$ 10,00", "vence hoje", "Vencimento", "22/10/2026"]) expect(c).toContain(t);
  });
  it("sem nome de igreja o cabeçalho traz só a marca (o e-mail não deixa de sair)", () => {
    const h = D.moldura({ assunto: "x", corpo: "" });
    expect(h).toContain("DiakoniaApp");
    expect(h).not.toContain("null");
  });
});

describe("lerNomeDaIgreja", () => {
  const cliente = (resposta: unknown, quebra = false) => ({ from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => { if (quebra) throw new Error("boom"); return resposta; } }) }) }) }) }) });
  it("devolve o nome da Identidade ativa", async () => expect(await lerNomeDaIgreja(cliente({ data: { nome_igreja: "  QIBRJ " } }))).toBe("QIBRJ"));
  it("sem linha, sem nome ou com erro: null (o e-mail sai só com a marca)", async () => {
    expect(await lerNomeDaIgreja(cliente({ data: null }))).toBeNull();
    expect(await lerNomeDaIgreja(cliente({ data: { nome_igreja: "  " } }))).toBeNull();
    expect(await lerNomeDaIgreja(cliente(null, true))).toBeNull();
  });
});

describe("nenhuma função de e-mail escreve o próprio HTML", () => {
  const raiz = "supabase/functions";
  const arquivos: string[] = [];
  const anda = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) anda(p); else if (p.endsWith(".ts")) arquivos.push(p); } };
  anda(raiz);
  it("só a moldura do Design System abre um documento (<!doctype / <html>)", () => {
    const infratores = arquivos.filter(f => !f.endsWith(path.join("_shared", "email", "desenho.ts")) && /<!doctype html|<html[ >]/i.test(fs.readFileSync(f, "utf8")));
    expect(infratores).toEqual([]);
  });
  it("o rodapé institucional só existe em desenho.ts", () => {
    const copias = arquivos.filter(f => !f.endsWith(path.join("_shared", "email", "desenho.ts")) && fs.readFileSync(f, "utf8").includes("Sistema desenvolvido para apoiar a gestão administrativa"));
    expect(copias).toEqual([]);
  });
});
