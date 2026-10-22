// Gera docs/EXEMPLO_RESUMO_DIARIO_TESOURARIA_2026-10-22.html: o e-mail diário de 22/10/2026 montado com o MESMO código da Edge Function e os dados reais lidos do banco naquele dia (somente leitura).
// Uso: node docs/EXEMPLO_RESUMO_DIARIO_GERADOR.mjs (na raiz do projeto; precisa do esbuild, que já vem com o Vite).
import fs from "node:fs";
import { transformSync } from "esbuild";
const cache = new Map();
const carregar = (f) => { if (cache.has(f)) return cache.get(f); const m = { exports: {} }; cache.set(f, m.exports);
  const dir = f.replace(/[^/]+$/, "");
  const js = transformSync(fs.readFileSync(f, "utf8"), { loader: "ts", format: "cjs" }).code.replace(/require\("\.\/([^"]+)\.ts"\)/g, (_, n) => `__req("${dir}${n}.ts")`);
  new Function("module", "exports", "__req", js)(m, m.exports, carregar); cache.set(f, m.exports); return m.exports; };
const D = "supabase/functions/_shared/pagamentos/";
const itens = carregar(D + "itensDoDia.ts"), email = carregar(D + "emailDiario.ts");
const g = (o) => ({ versao: 1, ...o });
const C = (id, data, valor, dias, fornecedor_nome, descricao, categoria, centro, anexos) => ({ id, data, valor, dias_para_vencer: dias, fornecedor_id: "x" + id, fornecedor_nome, pessoa_nome: null, descricao, categoria, centro, chave_pix: null, tipo_chave_pix: null, ultimo_envio: null, anexos });
const cands = [
  C("a", "2026-10-15", 176, -7, "Freecolor Comercio de Tintas, Pinturas e Revestimentos LTDA", "Tinta Algoodão egípcio", "Manutenção de Imobilizado", "Administração · Patrimônio", [{ tipo: "nota_fiscal", nome: "NF.pdf", dados: g({ valor: null, vencimento: "2026-10-15" }) }, { tipo: "boleto", nome: "b.pdf", dados: g({ linhaDigitavel: "34191090080150334811020558120000116000000017600", valor: 176, vencimento: "2026-10-15", codigoValido: true }) }]),
  C("b", "2026-10-13", 485.66, -9, "Flora Energia Renovavel S.A.", "Flora Energia Renovavel S.A.", "Energia Elétrica", "Administração · Infraestrutura", [{ tipo: "fatura", nome: "f.pdf", dados: g({ linhaDigitavel: "40192026238000000000200001910975115970000048566", valor: 485.66, vencimento: "2026-10-12", codigoValido: true, pix: { payload: "00020101021226890014br.gov.bcb.pix2567qr.iugu.com/public/payload/v2/cobv/CB6D98FAF82A40888500C18B18B31DDB5204000053039865406485.665802BR5925FLORA ENERGIA RENOVAVEL S6009SAO PAULO62070503***6304FE42" } }) }]),
  C("c", "2026-10-20", 360, -2, "Ecoprint Impressoras Ltda-Me", "Ecoprint Impressoras Ltda-Me", "Locação de Equipamentos", "Administração · Tecnologia", [{ tipo: "boleto", nome: "b.pdf", dados: g({ linhaDigitavel: "34191570070619922292571890560007216050000036000", valor: 360, vencimento: "2026-10-20", codigoValido: true }) }, { tipo: "contrato", nome: "c.pdf", dados: null }]),
  C("d", "2026-10-20", 8376.43, -2, "Receita Federal do Brasil (RFB)", null, "Encargos Trabalhistas", "Administração · Pessoal", [{ tipo: "guia", nome: "darf.pdf", dados: g({ linhaDigitavel: "858900000832764303852624930716262877465305600028", valor: 8376.43, vencimento: "2026-10-20", codigoValido: true }) }]),
  C("e", "2026-10-20", 833.09, -2, "Receita Federal do Brasil (RFB)", "FGTS Digital", "Encargos Trabalhistas", "Administração · Pessoal", [{ tipo: "guia", nome: "fgts.pdf", dados: g({ valor: 833.09, vencimento: "2026-10-20", pix: { payload: "00020101021226900014br.gov.bcb.pix2568pix-qrcode.caixa.gov.br/api/v2/cobv/a4a158036e2240378302bdee6d4422be5204000053039865802BR5923CAIXA ECONOMICA FEDERAL6008Brasilia62070503***6304F00C" } }) }]),
  C("f", "2026-10-21", 3086.32, -1, "Amil Assistencia Medica Internacional S.A.", "Amil Assistencia Medica Internacional S.A.", "Benefícios", "Pastoral · Plano de Saúde", []),
  C("g", "2026-10-20", 99, -2, "Prov Telecom LTDA", "Prov Telecom LTDA", "Internet e Telefonia", "Administração · Tecnologia", [{ tipo: "fatura", nome: "f.pdf", dados: g({ valor: 99, vencimento: "2026-10-20", pix: { payload: "00020126970014br.gov.bcb.pix2575qrcodes.sulcredi.coop.br/v2/v3/at/cobv/2ef553e6-5793-45f8-8f0d-79aa92bef7b45204000053039865802BR5917PROV_TELECOM_LTDA6014SAO_MIGUEL_DO_62070503***63049836" } }) }]),
  C("h", "2026-10-20", 121.51, -2, "Tim S.A", "Tim S.A", "Internet e Telefonia", "Administração · Tecnologia", [{ tipo: "fatura", nome: "f.pdf", dados: g({ linhaDigitavel: "846700000017215101090110005886213460401326228566", valor: 121.51, vencimento: "2026-10-07", codigoValido: true }) }]),
];
const e = email.montarEmailDiario(itens.montarItensDoDia(cands), { hojeYmd: "2026-10-22", hora: 7, aviso: "EXEMPLO — o e-mail de hoje (22/10/2026) montado com os dados reais; nada foi enviado" });
fs.writeFileSync("docs/EXEMPLO_RESUMO_DIARIO_TESOURARIA_2026-10-22.html", e.html);
console.log(e.assunto, JSON.stringify(e.contagem), JSON.stringify(e.total));
