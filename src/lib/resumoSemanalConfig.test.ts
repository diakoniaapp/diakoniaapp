import { describe, expect, it } from "vitest";
import {
  BLOCOS, PERFIS, blocosDaPessoa, blocosDoPerfil, mesclarConfig, paraSalvar, type ConfigSalva,
} from "../../supabase/functions/_shared/resumoSemanal/catalogo";
import { montarBloco, montarBlocos, montarHtml, type Digest } from "../../supabase/functions/_shared/resumoSemanal/blocos";
import { readFileSync } from "node:fs";

const digest = (o: Partial<Digest["tesouraria"]> = {}): Digest => ({
  pastoral: { aniversarios_semana: 7, bodas_semana: 1, visitantes_sem_contato: 13, candidatos_batismo: 2 },
  secretaria: { sem_telefone: 26, membresia_em_andamento: 2, atas_pendentes: 1, pautas_rascunho: 3 },
  tesouraria: {
    fiscal_atrasados: 0, fiscal_urgentes: 0, caixas_abertos: 0, aprovacoes_pendentes: 0, centros_criticos: 0,
    contas_atrasadas: { n: 7, total: 15038.01, itens: [{ quem: "Light", vencimento: "2026-10-15", valor: 2110.12 }, { quem: "Cedae", vencimento: "2026-10-20", valor: 40 }] },
    vencimentos_semana: { ate: "2026-10-31", n: 3, total: 4815, itens: [{ quem: "Aluguel", vencimento: "2026-10-28", valor: 4000 }] },
    debitos_automaticos: { ate: "2026-10-31", previstos_n: 2, previstos_total: 520.5, aguardando_n: 1, possivel_falha_n: 1, possivel_falha_total: 300, itens: [{ quem: "Net", vencimento: "2026-10-17", valor: 300 }] },
    reembolsos: { n: 1, total: 1500 },
    saldo_contas: { total: -8403.19, contas: [{ nome: "Bradesco", saldo: -8000 }, { nome: "Caixinha", saldo: -403.19 }] },
    ...o,
  },
  gerado_em: "2026-10-25T12:00:00Z",
});

describe("catálogo", () => {
  it("todo id é único e cada bloco tem título e descrição", () => {
    const ids = BLOCOS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BLOCOS) { expect(b.titulo.length).toBeGreaterThan(2); expect(b.descricao.length).toBeGreaterThan(5); }
  });
  it("os blocos que ela pediu existem: Tesouraria, Secretaria e Pastoral", () => {
    const de = (g: string) => BLOCOS.filter(b => b.grupo === g).map(b => b.id);
    expect(de("tesouraria")).toEqual(expect.arrayContaining(["contas_atrasadas", "vencimentos_semana", "debitos_automaticos", "prontidao_malote", "reembolsos", "saldo_contas", "recursos_reservados", "documentos_pendentes"]));
    expect(de("secretaria")).toEqual(["membresias", "governanca", "pessoas_sem_telefone"]);
    expect(de("pastoral")).toEqual(["aniversariantes", "visitantes", "batismo"]);
  });
  it("Prontidão, Documentos e Recursos reservados ainda não estão disponíveis (dependem do cálculo da tela)", () => {
    for (const id of ["prontidao_malote", "documentos_pendentes", "recursos_reservados"]) expect(BLOCOS.find(b => b.id === id)?.disponivel).toBe(false);
  });
  it("cada perfil escolhe do próprio grupo; a Administração escolhe de todos", () => {
    expect(blocosDoPerfil("secretaria").every(b => b.grupo === "secretaria")).toBe(true);
    expect(blocosDoPerfil("administracao")).toHaveLength(BLOCOS.length);
  });
  it("todo bloco disponível o e-mail sabe montar; os 'em preparação', não", () => {
    const d = digest();
    for (const b of BLOCOS) {
      const r = montarBloco(b.id, d);
      if (b.disponivel) { expect(r, b.id).not.toBeNull(); expect(r!.titulo.length).toBeGreaterThan(2); expect(r!.frase.length).toBeGreaterThan(5); } else expect(r, b.id).toBeNull();
    }
  });
});

describe("mesclarConfig — o salvo sobre o padrão", () => {
  it("sem nada salvo: todos os perfis recebem e valem os padrões do catálogo, na ordem dele", () => {
    const c = mesclarConfig(null);
    expect(c.map(p => p.perfil)).toEqual([...PERFIS]);
    expect(c.every(p => p.ativo)).toBe(true);
    const tes = c.find(p => p.perfil === "tesouraria")!;
    expect(tes.blocos.filter(b => b.ativo).map(b => b.bloco)).toEqual(["contas_atrasadas", "vencimentos_semana", "debitos_automaticos", "reembolsos", "saldo_contas", "centros_orcamento"]);
    expect(tes.blocos.map(b => b.ordem)).toEqual(tes.blocos.map((_, i) => i + 1));
  });
  it("os blocos em preparação nunca ficam ativos, nem se o banco disser que sim", () => {
    const salva: ConfigSalva = { perfis: [], blocos: [{ perfil: "tesouraria", bloco: "prontidao_malote", ativo: true, ordem: 1 }] };
    const tes = mesclarConfig(salva).find(p => p.perfil === "tesouraria")!;
    expect(tes.blocos.find(b => b.bloco === "prontidao_malote")).toMatchObject({ ativo: false });
  });
  it("o salvo manda: ordem e liga/desliga; o bloco novo do código entra depois, com o padrão dele", () => {
    const salva: ConfigSalva = {
      perfis: [{ perfil: "secretaria", ativo: true }],
      blocos: [{ perfil: "secretaria", bloco: "pessoas_sem_telefone", ativo: true, ordem: 1 }, { perfil: "secretaria", bloco: "membresias", ativo: false, ordem: 2 }],
    };
    const sec = mesclarConfig(salva).find(p => p.perfil === "secretaria")!;
    expect(sec.blocos.map(b => b.bloco)).toEqual(["pessoas_sem_telefone", "membresias", "governanca"]);
    expect(sec.blocos.map(b => b.ativo)).toEqual([true, false, true]);
  });
  it("perfil desligado fica desligado; linha de bloco desconhecido é ignorada", () => {
    const c = mesclarConfig({ perfis: [{ perfil: "pastoral", ativo: false }], blocos: [{ perfil: "pastoral", bloco: "inventado", ativo: true, ordem: 1 }] });
    const pas = c.find(p => p.perfil === "pastoral")!;
    expect(pas.ativo).toBe(false);
    expect(pas.blocos.some(b => b.bloco === "inventado")).toBe(false);
  });
});

describe("blocosDaPessoa — o que UMA pessoa recebe", () => {
  const config = mesclarConfig(null);
  it("Tesouraria recebe só os blocos da Tesouraria, na ordem escolhida", () => {
    expect(blocosDaPessoa(["tesouraria"], config)).toEqual(["contas_atrasadas", "vencimentos_semana", "debitos_automaticos", "reembolsos", "saldo_contas", "centros_orcamento"]);
  });
  it("a Administração recebe de todos os grupos (o resumo completo de antes, agora com os blocos novos)", () => {
    const ids = blocosDaPessoa(["administracao"], config);
    expect(ids).toEqual(expect.arrayContaining(["aniversariantes", "membresias", "contas_atrasadas"]));
    expect(ids).not.toContain("prontidao_malote");
  });
  it("quem tem dois perfis recebe a soma, sem repetir", () => {
    const ids = blocosDaPessoa(["tesouraria", "secretaria"], config);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["saldo_contas", "membresias"]));
  });
  it("perfil desligado não entra; sem nada ativo, lista vazia (não se manda e-mail vazio)", () => {
    const sem = mesclarConfig({ perfis: [{ perfil: "tesouraria", ativo: false }], blocos: [] });
    expect(blocosDaPessoa(["tesouraria"], sem)).toEqual([]);
    expect(blocosDaPessoa([], config)).toEqual([]);
  });
  it("a ordem escolhida vale: reordenar muda o e-mail", () => {
    const salva: ConfigSalva = { perfis: [], blocos: [{ perfil: "tesouraria", bloco: "saldo_contas", ativo: true, ordem: 1 }, { perfil: "tesouraria", bloco: "contas_atrasadas", ativo: true, ordem: 2 }] };
    const ids = blocosDaPessoa(["tesouraria"], mesclarConfig(salva));
    expect(ids.slice(0, 2)).toEqual(["saldo_contas", "contas_atrasadas"]);
  });
});

describe("paraSalvar", () => {
  it("renumera a ordem 1..n e derruba o que o código não conhece", () => {
    const r = paraSalvar([{ perfil: "tesouraria", ativo: true, blocos: [{ bloco: "x", ativo: true, ordem: 9 }, { bloco: "saldo_contas", ativo: true, ordem: 7 }, { bloco: "prontidao_malote", ativo: true, ordem: 8 }] }]);
    expect(r[0].blocos).toEqual([{ bloco: "saldo_contas", ativo: true, ordem: 1 }, { bloco: "prontidao_malote", ativo: false, ordem: 2 }]);
  });
});

describe("os blocos como texto", () => {
  it("Contas atrasadas traz a contagem, a soma e a lista; passando de 5 diz 'outras'", () => {
    const b = montarBloco("contas_atrasadas", digest())!;
    expect(b.frase).toBe("7 contas atrasadas, somando R$ 15.038,01.");
    expect(b.tom).toBe("atencao");
    expect(b.itens[0]).toBe("15/10 · Light · R$ 2.110,12");
    expect(b.itens[b.itens.length - 1]).toBe("+ 5 outras");
  });
  it("zero também diz algo ('Nenhuma conta atrasada.')", () => {
    const b = montarBloco("contas_atrasadas", digest({ contas_atrasadas: { n: 0, total: 0, itens: [] } }))!;
    expect(b).toMatchObject({ frase: "Nenhuma conta atrasada.", tom: "ok", itens: [] });
  });
  it("Débitos automáticos separa previstos, aguardando e possível falha, e destaca a falha", () => {
    const b = montarBloco("debitos_automaticos", digest())!;
    expect(b.frase).toBe("2 débitos previstos até sábado (R$ 520,50); 1 aguardando o banco; 1 possível falha (R$ 300,00) — conferir o extrato.");
    expect(b.tom).toBe("atencao");
    expect(b.itens).toEqual(["17/10 · Net · R$ 300,00"]);
  });
  it("Saldo das contas mostra o total, o aviso de negativo e cada conta", () => {
    const b = montarBloco("saldo_contas", digest())!;
    expect(b.frase).toBe("Saldo nas contas: -R$ 8.403,19 — negativo.");
    expect(b.tom).toBe("atencao");
    // sem a data do extrato (não veio no digest), só as contas e a nota geral de que o saldo pode não refletir o banco
    expect(b.itens).toEqual(["Bradesco: -R$ 8.000,00", "Caixinha: -R$ 403,19", "Saldo do DiakoniaApp: acompanha o banco só até a data do último extrato importado e conciliado — pode não ser o saldo real da conta."]);
  });
  it("Reembolsos e Vencimentos usam singular e plural", () => {
    expect(montarBloco("reembolsos", digest())!.frase).toBe("1 reembolso a pagar, somando R$ 1.500,00.");
    expect(montarBloco("vencimentos_semana", digest())!.frase).toBe("3 vencimentos até sábado (31/10), somando R$ 4.815,00.");
  });
  it("Pastoral e Secretaria", () => {
    expect(montarBloco("aniversariantes", digest())!.frase).toBe("Esta semana: 7 aniversariantes e 1 casal em bodas.");
    expect(montarBloco("visitantes", digest())!.frase).toBe("13 visitantes sem contato há mais de 7 dias.");
    expect(montarBloco("governanca", digest())!.frase).toBe("1 ata pendente e 3 pautas em rascunho.");
    expect(montarBloco("pessoas_sem_telefone", digest())!.frase).toBe("26 pessoas sem telefone cadastrado.");
  });
  it("se o banco ainda não trouxe o número do bloco novo, o bloco diz isso em vez de sumir ou quebrar", () => {
    const antigo = digest(); delete antigo.tesouraria.contas_atrasadas;
    expect(montarBloco("contas_atrasadas", antigo)!.frase).toMatch(/banco precisa ser atualizado/);
  });
  it("o HTML tem os títulos, os itens, o aviso e o link; texto do usuário é escapado", () => {
    const blocos = montarBlocos(["contas_atrasadas", "saldo_contas"], digest());
    blocos[0].itens.push("<script>x</script>");
    const html = montarHtml("2026-10-25T12:00:00Z", blocos, "PRÉVIA — nada foi enviado");
    expect(html).toContain("Contas atrasadas");
    expect(html).toContain("Saldo das contas");
    expect(html).toContain("PRÉVIA — nada foi enviado");
    expect(html).toContain("Abrir o DiakoniaApp");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("a Edge Function e a migration falam a mesma língua", () => {
  const index = readFileSync("supabase/functions/resumo-semanal/index.ts", "utf8");
  const previa = readFileSync("supabase/functions/resumo-semanal-previa/index.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20261022200000_resumo_semanal_configuravel.sql", "utf8");
  it("a função chama as RPCs que a migration cria", () => {
    for (const rpc of ["resumo_semanal_digest", "resumo_semanal_destinatarios_v2"]) { expect(index).toContain(rpc); expect(migration).toContain(`FUNCTION public.${rpc}`); }
    for (const tabela of ["resumo_semanal_perfis", "resumo_semanal_blocos"]) { expect(index).toContain(tabela); expect(migration).toContain(`TABLE IF NOT EXISTS public.${tabela}`); }
  });
  it("os perfis do banco são os do catálogo", () => {
    for (const p of PERFIS) expect(migration).toContain(`'${p}'`);
  });
  it("todo bloco que o digest SQL precisa fornecer está na migration", () => {
    for (const chave of ["contas_atrasadas", "vencimentos_semana", "debitos_automaticos", "reembolsos", "saldo_contas"]) expect(migration).toContain(`'${chave}'`);
  });
  it("prévia e teste conferem a sessão e o papel antes de qualquer coisa", () => {
    expect(previa).toContain("auth.getUser(token)");
    expect(previa).toContain('.in("role", ["admin", "diakonia"])');
    expect(previa.indexOf("auth.getUser(token)")).toBeLessThan(previa.indexOf('rpc("resumo_semanal_digest")'));
  });
  it("o teste só vai para o e-mail cadastrado de quem pediu (nunca um endereço do corpo da chamada)", () => {
    expect(previa).toContain('.from("membros").select("email")');
    expect(previa).not.toMatch(/corpo\.(para|email|destino)/);
  });
  it("a prévia mora FORA da função que dispara o envio geral (chamá-la por engano nunca manda e-mail a todos)", () => {
    expect(index).not.toContain('"previa"');
    expect(index).not.toContain("corpo.acao");
    expect(index).not.toContain("req.json");   // o envio geral não lê nada do corpo da chamada
    expect(previa).not.toContain("resumo_semanal_destinatarios_v2");   // a prévia nunca lê a lista de destinatários
  });
});
