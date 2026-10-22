import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  CONFIG_PADRAO, SITUACOES, TEXTOS_PADRAO, completarRedes, escolherModelo, fecharUrl, idadeEmAnos, lerPacote, linkDoWhatsApp, modeloOuPadrao, modeloPadrao, montarMensagem,
  primeiroNome, problemasDaConfig, problemasDoModelo, situacaoAutomatica, substituir, urlSegura, type ConfigDaMensagem, type EventoDaMensagem, type ModeloDaMensagem,
} from "@/lib/mensagensVisitante";

const config = (o: Partial<ConfigDaMensagem> = {}): ConfigDaMensagem => ({
  ...CONFIG_PADRAO, igreja_nome: "Quarta Igreja Batista", assinatura: "Com carinho,\nEquipe de Acolhimento", endereco: "Rua das Flores, 100 — Centro", telefone: "(21) 3333-4444",
  whatsapp: "21983991229", email_contato: "acolhimento@qibrj.org.br", link_pedido_oracao: "https://qibrj.org.br/oracao", link_plano_leitura: "https://qibrj.org.br/leitura",
  redes: [
    { tipo: "instagram", url: "https://instagram.com/qibrj", ativo: true }, { tipo: "facebook", url: "", ativo: false }, { tipo: "youtube", url: "https://youtube.com/@qibrj", ativo: true },
    { tipo: "spotify", url: "https://open.spotify.com/user/qibrj", ativo: false }, { tipo: "site", url: "https://qibrj.org.br", ativo: true },
  ], ...o,
});
const eventos: EventoDaMensagem[] = [
  { titulo: "Culto de Oração", quando: "quarta-feira" }, { titulo: "Pequenos Grupos", quando: "semana" }, { titulo: "Congresso de Casais", quando: "15/11", link: "https://qibrj.org.br/casais" },
  { titulo: "Cantata de Natal", quando: "12/12" }, { titulo: "Quinto evento", quando: "20/12" },
];
const visitante = { nome: "Maria da Silva", culto: "Culto da Manhã" };
const zap = (o: Partial<ModeloDaMensagem> = {}): ModeloDaMensagem => ({ ...modeloPadrao("primeira_visita", "whatsapp"), ...o });
const monta = (m: ModeloDaMensagem, c = config(), ev = eventos) => montarMensagem(m, { config: c, eventos: ev, visitante });

describe("marcas {{…}}", () => {
  it("troca nome, nome completo, igreja e culto; marca desconhecida some", () => {
    expect(substituir("Olá, {{nome}} ({{nome_completo}}) — {{igreja}} / {{culto}} {{xyz}}!", { nome: "Maria da Silva", igreja: "QIBRJ", culto: "Culto da Manhã" })).toBe("Olá, Maria (Maria da Silva) — QIBRJ / Culto da Manhã !");
    expect(substituir("Oi {{ NOME }}", { nome: "joão pedro", igreja: "x" })).toBe("Oi joão");
  });
  it("culto ausente não deixa buraco nem a marca", () => {
    expect(substituir("Visita no {{culto}}.", { nome: "A", igreja: "x" })).toBe("Visita no .");
  });
  it("primeiroNome e links seguros", () => {
    expect(primeiroNome("  Ana  Paula Souza ")).toBe("Ana");
    expect(urlSegura("https://a.com/x")).toBe("https://a.com/x");
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("ftp://a.com")).toBeNull();
    expect(urlSegura("https://a.com/<script>")).toBeNull();
    expect(linkDoWhatsApp("(21) 98399-1229")).toBe("https://wa.me/5521983991229");
    expect(linkDoWhatsApp("5521983991229")).toBe("https://wa.me/5521983991229");
    expect(linkDoWhatsApp("123")).toBeNull();
    expect(linkDoWhatsApp("")).toBeNull();
  });
});

describe("WhatsApp — a mensagem montada por blocos", () => {
  it("todos os blocos, na ordem: abertura, texto pastoral, convite, eventos, endereço, contato, WhatsApp, redes, oração, fechamento, assinatura", () => {
    const r = monta(zap({ incluir_leitura: true }));
    expect(r.blocos).toEqual(["abertura", "texto_pastoral", "convite_retorno", "eventos", "endereco", "contato", "whatsapp", "redes", "oracao", "leitura", "fechamento", "assinatura"]);
    expect(r.html).toBeNull();
  });
  it("personaliza: nome do visitante e da igreja", () => {
    const r = monta(zap());
    expect(r.texto).toContain("Olá, Maria! 😊 Que alegria receber você na Quarta Igreja Batista!");
  });
  it("os próximos eventos saem como lista (• título – quando), só os 4 primeiros, com o link quando houver", () => {
    const r = monta(zap());
    expect(r.texto).toContain("*Próximos eventos*:\n• Culto de Oração – quarta-feira\n• Pequenos Grupos – semana\n• Congresso de Casais – 15/11 (https://qibrj.org.br/casais)\n• Cantata de Natal – 12/12");
    expect(r.texto).not.toContain("Quinto evento");
  });
  it("o convite vem antes da lista de eventos", () => {
    const t = monta(zap()).texto;
    expect(t.indexOf("Esperamos ver você de novo")).toBeLessThan(t.indexOf("Próximos eventos"));
  });
  it("redes: só as ligadas e com endereço; o WhatsApp tem bloco próprio com o link wa.me", () => {
    const t = monta(zap()).texto;
    expect(t).toContain("*Siga a gente*\n• Instagram: https://instagram.com/qibrj\n• YouTube: https://youtube.com/@qibrj\n• Site: https://qibrj.org.br");
    expect(t).not.toContain("Facebook");
    expect(t).not.toContain("Spotify");   // desligada, mesmo com endereço
    expect(t).toContain("https://wa.me/5521983991229");
  });
  it("endereço, contato, oração e leitura", () => {
    const t = monta(zap({ incluir_leitura: true })).texto;
    expect(t).toContain("*Onde estamos*\nRua das Flores, 100 — Centro");
    expect(t).toContain("*Fale com a gente*\nTelefone: (21) 3333-4444\nE-mail: acolhimento@qibrj.org.br");
    expect(t).toContain("*Pedido de oração*\nQuer que oremos por você? Envie seu pedido: https://qibrj.org.br/oracao");
    expect(t).toContain("*Plano de leitura bíblica*\nLeia a Bíblia com a gente: https://qibrj.org.br/leitura");
  });
  it("cada opção desligada tira o seu bloco", () => {
    const r = monta(zap({ incluir_eventos: false, incluir_redes: false, incluir_endereco: false, incluir_contato: false, incluir_whatsapp: false, incluir_oracao: false, incluir_leitura: false }));
    expect(r.blocos).toEqual(["abertura", "texto_pastoral", "convite_retorno", "fechamento", "assinatura"]);
  });
  it("bloco ligado mas sem o dado (link vazio, WhatsApp vazio, sem eventos) simplesmente não aparece", () => {
    const vazio = config({ link_pedido_oracao: "", link_plano_leitura: "", whatsapp: "", endereco: "", telefone: "", email_contato: "", redes: completarRedes([]) });
    const r = monta(zap({ incluir_leitura: true }), vazio, []);
    expect(r.blocos).toEqual(["abertura", "texto_pastoral", "convite_retorno", "fechamento", "assinatura"]);
  });
  it("endereço de link inseguro vindo da configuração nunca entra na mensagem", () => {
    const r = monta(zap(), config({ link_pedido_oracao: "javascript:alert(1)", redes: [{ tipo: "site", url: "javascript:x", ativo: true }, ...completarRedes([]).slice(0, 0)] }));
    expect(r.texto).not.toContain("javascript");
    expect(r.blocos).not.toContain("oracao");
    expect(r.blocos).not.toContain("redes");
  });
  it("texto pastoral e assinatura vão como escritos; a assinatura fecha a mensagem", () => {
    const t = monta(zap()).texto;
    expect(t).toContain("Deus conhece cada um de nós pelo nome");
    expect(t.endsWith("Com carinho,\nEquipe de Acolhimento")).toBe(true);
  });
  it("blocos separados por linha em branco, sem espaço sobrando", () => {
    const t = monta(zap()).texto;
    expect(t).not.toMatch(/\n{3,}/);
    expect(t).not.toMatch(/ \n/);
  });
});

describe("e-mail — o mesmo conteúdo, com assunto e HTML", () => {
  const email = (o: Partial<ModeloDaMensagem> = {}) => monta({ ...modeloPadrao("primeira_visita", "email"), ...o });
  it("assunto personalizado; versão HTML e versão de texto", () => {
    const r = email();
    expect(r.assunto).toBe("Foi uma alegria receber você, Maria!");
    expect(r.html).toContain("Quarta Igreja Batista");
    expect(r.html).toContain("Olá, Maria!");
    expect(r.texto).toContain("PRÓXIMOS EVENTOS:");   // no e-mail, título em caixa alta (sem asterisco do WhatsApp)
    expect(r.texto).not.toContain("*");
  });
  it("tudo é escapado: nada de HTML vindo da configuração", () => {
    const r = email({ abertura: "<script>alert(1)</script> Olá {{nome}} & cia", assunto: "x" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Olá Maria &amp; cia");
  });
  it("só http(s) vira link, e o link do evento vira 'saiba mais'", () => {
    const r = email();
    expect(r.html).toContain('href="https://instagram.com/qibrj"');
    expect(r.html).toContain('href="https://qibrj.org.br/casais"');
    expect(r.html).toContain("saiba mais");
    expect(r.html).not.toMatch(/href="javascript/i);
  });
  it("parágrafos do texto pastoral viram <p> separados", () => {
    const r = email({ texto_pastoral: "Primeiro parágrafo.\n\nSegundo parágrafo." });
    expect(r.html).toContain("Primeiro parágrafo.</p><p style=\"margin:0 0 14px\">Segundo parágrafo.");
  });
  it("sem assunto o e-mail cai no nome da igreja (nunca sai sem assunto)", () => {
    expect(email({ assunto: "" }).assunto).toBe("Quarta Igreja Batista");
  });
});

describe("SMS (futuro) — curto", () => {
  it("abertura + convite + um caminho de volta, no máximo 320 caracteres", () => {
    const r = monta({ ...modeloPadrao("primeira_visita", "sms") });
    expect(r.html).toBeNull();
    expect(r.texto.length).toBeLessThanOrEqual(320);
    expect(r.texto).toContain("Olá, Maria!");
    expect(r.texto).toContain("https://wa.me/5521983991229");
    expect(r.texto).not.toContain("Instagram");
  });
});

describe("qual situação vale para o visitante", () => {
  const f = (o: Record<string, unknown> = {}) => ({ numeroDeVisitas: 1, diasDesdeAUltimaVisita: 0, dataNascimento: null, hoje: "2026-10-22", ...o }) as Parameters<typeof situacaoAutomatica>[0];
  it("primeira visita; volta = segunda visita; sumiu depois do prazo = não retornou", () => {
    expect(situacaoAutomatica(f())).toBe("primeira_visita");
    expect(situacaoAutomatica(f({ diasDesdeAUltimaVisita: 15 }))).toBe("primeira_visita");
    expect(situacaoAutomatica(f({ diasDesdeAUltimaVisita: 16 }))).toBe("nao_retornou");
    expect(situacaoAutomatica(f({ numeroDeVisitas: 2, diasDesdeAUltimaVisita: 40 }))).toBe("segunda_visita");
    expect(situacaoAutomatica(f({ numeroDeVisitas: 5 }))).toBe("segunda_visita");
  });
  it("o prazo vem da configuração", () => {
    expect(situacaoAutomatica(f({ diasDesdeAUltimaVisita: 8 }), 7)).toBe("nao_retornou");
    expect(situacaoAutomatica(f({ diasDesdeAUltimaVisita: 8 }), 30)).toBe("primeira_visita");
  });
  it("criança (menos de 12) e jovem (12 a 29) na primeira visita, pela data de nascimento", () => {
    expect(situacaoAutomatica(f({ dataNascimento: "2017-03-01" }))).toBe("infantil");
    expect(situacaoAutomatica(f({ dataNascimento: "2014-10-23" }))).toBe("infantil");   // 11 anos e 364 dias
    expect(situacaoAutomatica(f({ dataNascimento: "2014-10-22" }))).toBe("jovem");      // faz 12 hoje
    expect(situacaoAutomatica(f({ dataNascimento: "1997-10-23" }))).toBe("jovem");      // 28
    expect(situacaoAutomatica(f({ dataNascimento: "1997-10-22" }))).toBe("jovem");      // 29 hoje: ainda jovem
    expect(situacaoAutomatica(f({ dataNascimento: "1996-10-22" }))).toBe("primeira_visita");   // 30 hoje: fora da faixa
  });
  it("adulto sem faixa = primeira visita; sem data de nascimento = primeira visita", () => {
    expect(situacaoAutomatica(f({ dataNascimento: "1980-01-01" }))).toBe("primeira_visita");
    expect(situacaoAutomatica(f())).toBe("primeira_visita");
  });
  it("a idade só decide na primeira visita: quem voltou ou sumiu recebe a mensagem do momento", () => {
    expect(situacaoAutomatica(f({ dataNascimento: "2017-03-01", numeroDeVisitas: 2 }))).toBe("segunda_visita");
    expect(situacaoAutomatica(f({ dataNascimento: "2017-03-01", diasDesdeAUltimaVisita: 30 }))).toBe("nao_retornou");
  });
  it("idadeEmAnos: aniversário ainda não chegou; data inválida ou futura = desconhecida", () => {
    expect(idadeEmAnos("2000-12-31", "2026-10-22")).toBe(25);
    expect(idadeEmAnos("2000-10-22", "2026-10-22")).toBe(26);
    expect(idadeEmAnos("lixo", "2026-10-22")).toBeNull();
    expect(idadeEmAnos("2030-01-01", "2026-10-22")).toBeNull();
    expect(idadeEmAnos(null, "2026-10-22")).toBeNull();
  });
});

describe("modelos", () => {
  it("escolherModelo só devolve o ativo; modeloOuPadrao nunca fica sem nada", () => {
    const modelos = [zap({ ativo: false }), { ...modeloPadrao("jovem", "whatsapp"), abertura: "Fala, {{nome}}!" }];
    expect(escolherModelo(modelos, "primeira_visita", "whatsapp")).toBeNull();
    expect(escolherModelo(modelos, "jovem", "whatsapp")?.abertura).toBe("Fala, {{nome}}!");
    expect(escolherModelo(modelos, "jovem", "email")).toBeNull();
    expect(modeloOuPadrao([], "nao_retornou", "email").abertura).toBe(TEXTOS_PADRAO.nao_retornou.abertura);
  });
});

describe("leitura do que o banco devolve", () => {
  it("completa as cinco redes na ordem, ignora modelo de situação/canal desconhecidos e campos ausentes viram padrão", () => {
    const p = lerPacote({
      config: { igreja_nome: "QIBRJ", redes: [{ tipo: "youtube", url: "https://y.com", ativo: true }], dias_sem_retorno: 20 },
      modelos: [{ situacao: "jovem", canal: "email", abertura: "Oi", ativo: true }, { situacao: "inventada", canal: "email" }, { situacao: "jovem", canal: "fax" }],
      eventos: [{ titulo: "Culto", quando: "dom" }, { titulo: "  " }, null],
    });
    expect(p.config.redes.map(r => r.tipo)).toEqual(["instagram", "facebook", "youtube", "spotify", "site"]);
    expect(p.config.redes.find(r => r.tipo === "youtube")).toMatchObject({ ativo: true, url: "https://y.com" });
    expect(p.config.redes.find(r => r.tipo === "instagram")).toMatchObject({ ativo: false, url: "" });
    expect(p.config.dias_sem_retorno).toBe(20);
    expect(p.config.eventos_max).toBe(4);
    expect(p.modelos).toHaveLength(1);
    expect(p.modelos[0]).toMatchObject({ situacao: "jovem", canal: "email", abertura: "Oi", incluir_eventos: true, incluir_leitura: false });
    expect(p.eventos).toEqual([{ titulo: "Culto", quando: "dom", local: null, link: null }]);
  });
  it("resposta vazia ou estranha não quebra", () => {
    expect(lerPacote(null).modelos).toEqual([]);
    expect(lerPacote({}).config.igreja_nome).toBe(CONFIG_PADRAO.igreja_nome);
  });
});

describe("validação do que a administração digita", () => {
  it("modelo: limite de tamanho, ativo precisa de texto, e-mail precisa de assunto", () => {
    expect(problemasDoModelo(zap())).toEqual([]);
    expect(problemasDoModelo(zap({ abertura: "x".repeat(601) }))[0]).toMatch(/abertura passa de 600/);
    expect(problemasDoModelo(zap({ abertura: "", texto_pastoral: "" }))[0]).toMatch(/precisa de ao menos/);
    expect(problemasDoModelo(zap({ abertura: "", texto_pastoral: "", ativo: false }))).toEqual([]);
    expect(problemasDoModelo({ ...modeloPadrao("jovem", "email"), assunto: "" })[0]).toMatch(/assunto/);
  });
  it("config: nome, e-mail, WhatsApp, links, redes ligadas sem endereço, prazo", () => {
    expect(problemasDaConfig(config())).toEqual([]);
    expect(problemasDaConfig(config({ igreja_nome: " " }))[0]).toMatch(/nome da igreja/);
    expect(problemasDaConfig(config({ email_contato: "x@y" }))[0]).toMatch(/e-mail/);
    expect(problemasDaConfig(config({ whatsapp: "9839" }))[0]).toMatch(/WhatsApp/);
    expect(problemasDaConfig(config({ link_pedido_oracao: "javascript:alert(1)" }))[0]).toMatch(/pedido de oração/);
    expect(problemasDaConfig(config({ redes: [{ tipo: "instagram", url: "", ativo: true }] }))[0]).toMatch(/Instagram/);
    expect(problemasDaConfig(config({ dias_sem_retorno: 1 }))[0]).toMatch(/3 a 90/);
    expect(problemasDaConfig(config({ eventos_max: 11 }))[0]).toMatch(/1 a 10/);
  });
  it("fecharUrl acrescenta https:// só quando falta", () => {
    expect(fecharUrl("instagram.com/qibrj")).toBe("https://instagram.com/qibrj");
    expect(fecharUrl("http://a.com")).toBe("http://a.com");
    expect(fecharUrl("  ")).toBe("");
    expect(fecharUrl("javascript:alert(1)")).toBe("javascript:alert(1)");   // não vira "https://javascript:…"
    expect(fecharUrl("localhost:8080/x")).toBe("https://localhost:8080/x");
  });
});

describe("a migration traz exatamente os textos de padroes.ts", () => {
  const sql = fs.readFileSync("supabase/migrations/20261023100000_visitante_mensagens.sql", "utf8");
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  it("os 14 modelos de partida (7 situações × WhatsApp e e-mail) estão no SQL com os mesmos textos", () => {
    for (const s of SITUACOES) {
      const t = TEXTOS_PADRAO[s];
      for (const campo of ["assunto", "abertura", "texto_pastoral", "convite_retorno", "fechamento"] as const) expect(sql, `${s}.${campo}`).toContain(q(t[campo]));
    }
    expect((sql.match(/^ {2}\('(primeira_visita|segunda_visita|nao_retornou|interesse_membresia|infantil|jovem|indicado_ministerio)', '(whatsapp|email)'/gm) ?? []).length).toBe(14);
  });
  it("a assinatura e o nome da igreja de partida também", () => {
    expect(sql).toContain(q(CONFIG_PADRAO.assinatura));
    expect(sql).toContain(q(CONFIG_PADRAO.igreja_nome));
  });
});
