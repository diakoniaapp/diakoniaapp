// ─── emailDiario — o e-mail do Resumo Diário da Tesouraria (puro: recebe os itens já prontos e devolve assunto, HTML e texto) ───────────────────────────
//
// Pedido dela (22/10/2026): o tesoureiro recebe, todo dia, tudo o que precisa para pagar sem abrir o sistema. Fase 1: SEM anexos (PDF resumo e ZIP vêm na Fase 2).
// O formato é o do "Arquivos de pagamento" que ela já manda (➡️ "Boleto bancário · Banco · R$ · vence dd/mm", beneficiário em maiúsculas, linha em fonte monoespaçada), mais:
//   · DE ONDE veio cada código — 🧾 Linha digitável do documento · 💳 PIX do documento · 👤 PIX do cadastro do favorecido;
//   · quanto está ATRASADO e o que vence hoje;
//   · "já enviado em dd/mm — confira se já foi pago": o e-mail se repete enquanto a obrigação estiver em aberto, e quem pagou ontem pode ainda não ter dado baixa no sistema;
//   · quatro seções (ver `secaoDoItem`): Para pagar · Conferir antes de pagar (sem o código) · Sem linha nem Pix · e a nota dos sigilosos, que não aparecem.
import { AVISO_DE_CONFERENCIA, bancoDaLinha, formatarLinha, ICONE_SEM_MEIO, rotuloDoCodigo, tipoDaLinha } from "./envioDePagamentos.ts";
import { assinaturaEmTexto } from "./assinaturaDoSistema.ts";
import * as D from "../email/desenho.ts";
import { ABERTURA_DO_DIARIO, INTRODUCAO_DO_DIARIO, SEM_PAGAMENTOS_NO_DIA } from "../email/textos.ts";
import type { LinhaDeFato, Tom } from "../email/desenho.ts";
import { secaoDoItem, type ItemDoDia } from "./itensDoDia.ts";
import { avisoDeExtratoDefasado, ehContaDeBanco, NOTA_DO_SALDO, situacaoDoExtrato, type ExtratoDaConta } from "../saldos/extratoDasContas.ts";
import { linhasDoReembolso, quemRecebe, type ReembolsoParaExibir } from "../reembolsos/apresentacao.ts";
import { AVISO_SEM_PIX, pagamentoEmEspecie, pixDoReembolso, textoEmEspecie } from "../reembolsos/pixDoReembolso.ts";

export const LIMITE_POR_SECAO = 40;
const LINK_DO_SISTEMA = "https://portal.diakoniaapp.com.br";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const dataBr = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
const dataComPontos = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join(".");
const dataCurta = (iso: string) => dataBr(iso.slice(0, 10)).slice(0, 5);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface OpcoesDoDiario {
  /** AAAA-MM-DD, a data de Brasília */
  hojeYmd: string;
  /** a hora do envio (escolhe "bom dia"/"boa tarde") */
  hora: number;
  /** remuneração (prebenda, folha, Sustento, RPA) entra no e-mail, marcada 🔒; padrão do código: fora (a configuração do resumo diário nasce com "incluir") */
  incluirSigilosos?: boolean;
  /** nome da igreja (Identidade) para o cabeçalho; sem ele o cabeçalho traz só a marca */
  igreja?: string | null;
  /** linhas no topo do e-mail (prévia e teste) */
  aviso?: string;
  /** saldo das contas com a data do último extrato do banco (resumo_ultimo_extrato_das_contas); sem isso o e-mail não traz o bloco de saldo */
  contas?: readonly ExtratoDaConta[];
  /** reembolsos aprovados a pagar (resumo_reembolsos_a_pagar): QUEM recebe, o que quitou, o valor e a conta prevista; sem isso o e-mail não traz a seção */
  reembolsos?: readonly ReembolsoParaExibir[];
}

export interface EmailDoDiario {
  assunto: string; html: string; texto: string;
  /** quantos itens foram para cada seção */
  contagem: { pagar: number; conferir: number; semMeio: number; sigilosos: number; sigilososIncluidos: number; reembolsos: number };
  /** os reembolsos que entraram no e-mail (entram no registro de "já enviado", como os pagamentos) */
  reembolsosListados: ReembolsoParaExibir[];
  /** o que entrou no total em dinheiro: só a seção "pagar" */
  total: { quantidade: number; valor: number; atrasados: { quantidade: number; valor: number }; hoje: { quantidade: number; valor: number } };
  /** os itens LISTADOS (entram no registro de "já enviado") — sem os sigilosos */
  listados: ItemDoDia[];
}

/** O texto do "já enviado": só quando o último envio foi antes de hoje. */
const jaEnviado = (i: ItemDoDia, hojeYmd: string): string | null =>
  i.ultimoEnvio && i.ultimoEnvio.slice(0, 10) < hojeYmd ? `já enviado em ${dataCurta(i.ultimoEnvio)} — confira se já foi pago` : null;

/** O atraso vem da OBRIGAÇÃO (a data que a Tesouraria cadastrou), não da data lida no documento: a leitura do PDF às vezes pega a emissão no lugar do vencimento. A data do documento aparece no cabeçalho e, se diferir, numa nota. */
const situacaoPorDias = (d: number): string => (d < 0 ? `ATRASADO há ${Math.abs(d)}d` : d === 0 ? "vence hoje" : `vence em ${d}d`);

const cabecalho = (i: ItemDoDia): string => {
  const partes = i.linha
    ? [tipoDaLinha(i.linha), bancoDaLinha(i.linha), brl(i.valor), `vence ${dataBr(i.vencimento)}`]
    : ["Pix", brl(i.valor), `vence ${dataBr(i.vencimento)}`];
  return partes.filter(Boolean).join(" · ") + (i.sigiloso ? " · 🔒 sigiloso" : "");
};
const codigoDo = (i: ItemDoDia) => (i.linha ? formatarLinha(i.linha) : i.pix ?? "");
const beneficiario = (i: ItemDoDia) => i.fornecedor.toLocaleUpperCase("pt-BR");

export function montarEmailDiario(itens: readonly ItemDoDia[], o: OpcoesDoDiario): EmailDoDiario {
  const porSecao = { pagar: [] as ItemDoDia[], conferir: [] as ItemDoDia[], sem_meio: [] as ItemDoDia[], sigiloso: [] as ItemDoDia[] };
  for (const i of itens) porSecao[secaoDoItem(i, o.incluirSigilosos)].push(i);
  const incluidosSigilosos = itens.filter(i => i.sigiloso && secaoDoItem(i, o.incluirSigilosos) !== "sigiloso");
  const soma = (xs: ItemDoDia[]) => xs.reduce((t, i) => t + i.valor, 0);
  const dias = (i: ItemDoDia) => i.diasParaVencer;
  const situacao = (i: ItemDoDia) => situacaoPorDias(dias(i));
  const atrasados = porSecao.pagar.filter(i => dias(i) < 0);
  const hoje = porSecao.pagar.filter(i => dias(i) === 0);
  const total = { quantidade: porSecao.pagar.length, valor: soma(porSecao.pagar), atrasados: { quantidade: atrasados.length, valor: soma(atrasados) }, hoje: { quantidade: hoje.length, valor: soma(hoje) } };
  const listados = [...porSecao.pagar, ...porSecao.conferir, ...porSecao.sem_meio];

  const assunto = `Resumo diário da Tesouraria | ${dataComPontos(o.hojeYmd)}${total.quantidade > 0 ? ` · ${plural(total.quantidade, "pagamento", "pagamentos")}` : ""}`;
  // reembolsos aprovados: a dívida da igreja é com QUEM PAGOU, então o nome dele vem em destaque (pedido dela, 22/10/2026)
  const reembolsos = [...(o.reembolsos ?? [])];
  const totalReembolsos = reembolsos.reduce((t, r) => t + r.valor, 0);
  // a ordem que a Tesouraria lê: Quitou · Valor · COMO PAGAR (o Pix de quem recebe) · DE QUAL CONTA sai
  const linhasDoReembolsoNoDiario = (r: ReembolsoParaExibir) => {
    const [quitou, valor, conta] = linhasDoReembolso(r, brl);
    // conta que não é o Bradesco = sempre em espécie: o Pix não entra (regra dela, 23/10/2026)
    const especie = pagamentoEmEspecie(r) ? textoEmEspecie(r) : null;
    const pix = especie ? null : pixDoReembolso(r);
    return {
      antes: [quitou, valor],
      especie,
      pix,
      semPix: `${quemRecebe(r)}: ${AVISO_SEM_PIX}`,
      conta: { rotulo: "Pagar pela conta", texto: conta.texto },
    };
  };
  const jaEnviadoReembolso = (r: ReembolsoParaExibir): string | null =>
    r.ultimo_envio && r.ultimo_envio.slice(0, 10) < o.hojeYmd ? `já enviado em ${dataCurta(r.ultimo_envio)} — confira se já foi pago` : null;
  // a abertura é a institucional (a MESMA na visualização, no teste e no envio); só o dia sem nenhum pagamento nem reembolso ganha uma frase a mais
  const semNada = listados.length === 0 && reembolsos.length === 0;
  const avisoSigiloso = incluidosSigilosos.length > 0
    ? `🔒 ${plural(incluidosSigilosos.length, "item marcado é pagamento", "itens marcados são pagamentos")} de remuneração (sigilosos): não encaminhe este e-mail.` : "";
  const resumo = total.quantidade > 0
    ? `${plural(total.quantidade, "pagamento", "pagamentos")} · ${brl(total.valor)}` + (total.atrasados.quantidade > 0 ? ` — ${total.atrasados.quantidade} em atraso (${brl(total.atrasados.valor)})` : "") + (total.hoje.quantidade > 0 ? ` — ${total.hoje.quantidade} vencem hoje (${brl(total.hoje.valor)})` : "")
    : "";

  // saldo das contas de banco com até quando o extrato foi atualizado: o saldo do app só acompanha o banco até a última importação conciliada (pedido dela, 22/10/2026)
  const contasDeBanco = (o.contas ?? []).filter(c => ehContaDeBanco(c));
  const saldos = contasDeBanco.map(c => ({ nome: c.nome, saldo: c.saldo, ...situacaoDoExtrato(c, o.hojeYmd) }));
  const avisoDeExtrato = avisoDeExtratoDefasado(contasDeBanco, o.hojeYmd);

  // ── HTML: Design System de E-mails (_shared/email/desenho.ts) — o mesmo cabeçalho, cartões e rodapé do e-mail de boas-vindas ──
  const limitar = (xs: ItemDoDia[]) => ({ vistos: xs.slice(0, LIMITE_POR_SECAO), resto: Math.max(0, xs.length - LIMITE_POR_SECAO) });
  const statusDe = (i: ItemDoDia): { texto: string; tom: Tom } => ({ texto: situacao(i), tom: dias(i) < 0 ? "atencao" : dias(i) === 0 ? "aviso" : "info" });
  const etiquetaDe = (i: ItemDoDia) => (i.linha ? [tipoDaLinha(i.linha), bancoDaLinha(i.linha)].filter(Boolean).join(" · ") : "Pix") + (i.sigiloso ? " · 🔒 sigiloso" : "");
  const fatosDe = (i: ItemDoDia): LinhaDeFato[] => [
    { icone: "📅", rotulo: "Vencimento", valor: dataBr(i.vencimento) },
    ...(i.centro ? [{ icone: "🏢", rotulo: "Centro de custo", valor: i.centro }] : []),
    ...(i.categoria ? [{ icone: "🏷️", rotulo: "Categoria", valor: i.categoria }] : []),
  ];
  const quando = (i: ItemDoDia) => (i.descricao && i.descricao.trim().toLocaleUpperCase("pt-BR") !== beneficiario(i) ? i.descricao : undefined);
  const repetidoDe = (i: ItemDoDia): { texto: string; tom: Tom } | undefined => { const r = jaEnviado(i, o.hojeYmd); return r ? { texto: `↻ ${r}`, tom: "atencao" } : undefined; };
  const maisOutros = (n: number, um: string, varios: string) => (n > 0 ? D.blocoDeObservacao(`+ ${plural(n, um, varios)} — abra o DiakoniaApp.`) : "");

  // o mesmo título e a mesma linha de data do resumo semanal ("Resumo da semana" / "Sexta-feira, 23 de outubro"), antes da saudação
  const dataPorExtenso = new Date(`${o.hojeYmd}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  let corpo = D.saudacao("Resumo diário da Tesouraria") + D.paragrafo(`${dataPorExtenso.charAt(0).toLocaleUpperCase("pt-BR")}${dataPorExtenso.slice(1)}.`)
    + ABERTURA_DO_DIARIO.map(D.paragrafo).join("") + (semNada ? D.paragrafo(SEM_PAGAMENTOS_NO_DIA) : "");
  const inds: { icone: string; rotulo: string; valor: string; tom?: Tom }[] = [];
  if (total.quantidade > 0) {
    inds.push({ icone: "🧾", rotulo: "Pagamentos", valor: brl(total.valor) });
    inds.push({ icone: "🔴", rotulo: `Em atraso · ${total.atrasados.quantidade}`, valor: brl(total.atrasados.valor), tom: total.atrasados.quantidade > 0 ? "atencao" : "ok" });
    inds.push({ icone: "📅", rotulo: `Vencem hoje · ${total.hoje.quantidade}`, valor: brl(total.hoje.valor), tom: total.hoje.quantidade > 0 ? "aviso" : undefined });
  }
  if (reembolsos.length > 0) inds.push({ icone: "↺", rotulo: `Reembolsos · ${reembolsos.length}`, valor: brl(totalReembolsos), tom: "info" });
  if (inds.length > 0) corpo += D.indicadores(inds);
  if (avisoSigiloso) corpo += D.cartaoDeAlerta({ titulo: "Pagamentos sigilosos", linhas: [avisoSigiloso.replace(/^🔒\s*/, "")], tom: "aviso" });
  if (avisoDeExtrato) corpo += D.cartaoDeAlerta({ titulo: "Atenção", linhas: [avisoDeExtrato.replace(/^⚠\s*/, "")], tom: "atencao" });

  if (porSecao.pagar.length > 0) {
    const { vistos, resto } = limitar(porSecao.pagar);
    corpo += D.secao("Para pagar", "Atrasadas primeiro. A origem de cada código está indicada no cartão.")
      + vistos.map(i => D.cartaoDePagamento({
        etiqueta: etiquetaDe(i), titulo: beneficiario(i), subtitulo: quando(i), valor: brl(i.valor), status: statusDe(i), fatos: fatosDe(i),
        codigo: { rotulo: rotuloDoCodigo(i), texto: codigoDo(i) }, notas: i.avisos, alerta: repetidoDe(i),
      })).join("") + maisOutros(resto, "outro pagamento", "outros pagamentos");
  }
  if (reembolsos.length > 0) {
    corpo += D.secao("Reembolsos a pagar", `${brl(totalReembolsos)} — a igreja deve este dinheiro a quem pagou a despesa, não ao fornecedor. O Pix, quando há, é o de quem recebe.`);
    for (const r of reembolsos.slice(0, LIMITE_POR_SECAO)) {
      const L = linhasDoReembolsoNoDiario(r);
      const repetido = jaEnviadoReembolso(r);
      corpo += D.cartaoDePagamento({
        etiqueta: "Reembolso · quem recebe", titulo: quemRecebe(r), valor: brl(r.valor),
        fatos: [{ icone: "🧾", rotulo: "Quitou", valor: L.antes[0].texto }, ...(L.pix ? [{ icone: "💳", rotulo: L.pix.rotulo, valor: L.pix.chave }] : []), { icone: "🏦", rotulo: L.conta.rotulo, valor: L.conta.texto }],
        codigo: L.pix?.copiaECola ? { rotulo: "Pix copia e cola (já com o valor do reembolso):", texto: L.pix.copiaECola } : undefined,
        alerta: repetido ? { texto: `↻ ${repetido}`, tom: "atencao" } : L.especie ? { texto: `💵 ${L.especie}`, tom: "info" } : !L.pix ? { texto: `⚠ ${L.semPix}`, tom: "aviso" } : undefined,
      });
    }
    corpo += maisOutros(reembolsos.length - LIMITE_POR_SECAO, "outro reembolso", "outros reembolsos");
  }
  if (porSecao.conferir.length > 0) {
    const { vistos } = limitar(porSecao.conferir);
    corpo += D.secao("Conferir antes de pagar", "O documento não bate com a obrigação: o código não vem neste e-mail. Não pague antes de conferir no DiakoniaApp.", "atencao")
      + vistos.map(i => D.cartaoDePagamento({ etiqueta: etiquetaDe(i), titulo: beneficiario(i), valor: brl(i.valor), status: statusDe(i), fatos: fatosDe(i), alerta: i.avisos.length > 0 ? { texto: `⚠ ${i.avisos.join(" · ")}`, tom: "atencao" } : undefined })).join("");
  }
  if (porSecao.sem_meio.length > 0) {
    const { vistos } = limitar(porSecao.sem_meio);
    corpo += D.secao(`${ICONE_SEM_MEIO} Sem linha digitável nem Pix`, "Pague pelo documento (no DiakoniaApp).")
      + vistos.map(i => D.cartaoDePagamento({
        etiqueta: i.sigiloso ? "🔒 sigiloso" : undefined, titulo: beneficiario(i), valor: brl(i.valor), status: statusDe(i), fatos: fatosDe(i),
        notas: i.documentos > 0 ? [`${plural(i.documentos, "documento", "documentos")} no sistema`] : undefined, alerta: repetidoDe(i),
      })).join("");
  }
  if (porSecao.sigiloso.length > 0) corpo += D.blocoDeObservacao(`🔒 ${plural(porSecao.sigiloso.length, "pagamento sigiloso (remuneração) não aparece", "pagamentos sigilosos (remuneração) não aparecem")} neste e-mail.`);
  if (saldos.length > 0) {
    corpo += D.secao("Saldo das contas") + saldos.map(s => D.cartaoDeSaldo({ nome: s.nome, saldo: brl(s.saldo), situacao: s.texto, defasado: s.defasado })).join("") + D.blocoDeObservacao(NOTA_DO_SALDO);
  }
  corpo += D.blocoDeObservacao(AVISO_DE_CONFERENCIA) + D.botao(LINK_DO_SISTEMA, "Abrir o DiakoniaApp");
  const html = D.moldura({ assunto, igreja: o.igreja, aviso: o.aviso, preheader: resumo || INTRODUCAO_DO_DIARIO, corpo, versiculo: D.VERSICULO_DOS_RELATORIOS });

  // ── texto simples ──
  const t: string[] = [];
  if (o.aviso) t.push(o.aviso, "");
  t.push(...ABERTURA_DO_DIARIO.flatMap((p, k) => (k === 0 ? [p] : ["", p])));
  if (semNada) t.push("", SEM_PAGAMENTOS_NO_DIA);
  if (resumo) t.push("", resumo);
  if (avisoSigiloso) t.push(avisoSigiloso);
  if (avisoDeExtrato) t.push(avisoDeExtrato);
  if (porSecao.pagar.length > 0) {
    t.push("", "PARA PAGAR");
    for (const i of limitar(porSecao.pagar).vistos) {
      t.push("", `➡️ ${cabecalho(i)} · ${situacao(i)}`, beneficiario(i), ...(rotuloDoCodigo(i) ? [rotuloDoCodigo(i)] : []), codigoDo(i), ...i.avisos.map(a => `ℹ ${a}`), ...(jaEnviado(i, o.hojeYmd) ? [`↻ ${jaEnviado(i, o.hojeYmd)}`] : []));
    }
  }
  if (reembolsos.length > 0) {
    t.push("", `↺ REEMBOLSOS A PAGAR · ${brl(totalReembolsos)} (a igreja deve este dinheiro a quem pagou a despesa, não ao fornecedor)`);
    for (const r of reembolsos.slice(0, LIMITE_POR_SECAO)) {
      const L = linhasDoReembolsoNoDiario(r);
      t.push("", `➡️ ${quemRecebe(r).toLocaleUpperCase("pt-BR")}`, ...L.antes.map(l => `${l.rotulo}: ${l.texto}`),
        ...(L.especie ? [`💵 ${L.especie}`] : L.pix ? [`💳 ${L.pix.rotulo}: ${L.pix.chave}`, ...(L.pix.copiaECola ? [L.pix.copiaECola] : [])] : [`⚠ ${L.semPix}`]), `${L.conta.rotulo}: ${L.conta.texto}`, ...(jaEnviadoReembolso(r) ? [`↻ ${jaEnviadoReembolso(r)}`] : []));
    }
    if (reembolsos.length > LIMITE_POR_SECAO) t.push("", `+ ${plural(reembolsos.length - LIMITE_POR_SECAO, "outro reembolso", "outros reembolsos")} — abra o DiakoniaApp.`);
  }
  if (porSecao.conferir.length > 0) {
    t.push("", "⚠ CONFERIR ANTES DE PAGAR (o código não vem neste e-mail)");
    for (const i of limitar(porSecao.conferir).vistos) t.push("", `⚠ ${beneficiario(i)} · ${brl(i.valor)} · vence ${dataBr(i.vencimento)} · ${situacao(i)}`, ...i.avisos.map(a => `  • ${a}`));
  }
  if (porSecao.sem_meio.length > 0) {
    t.push("", `${ICONE_SEM_MEIO} SEM LINHA DIGITÁVEL NEM PIX (pague pelo documento, no DiakoniaApp)`);
    for (const i of limitar(porSecao.sem_meio).vistos) t.push(`${beneficiario(i)} · ${brl(i.valor)} · vence ${dataBr(i.vencimento)} · ${situacao(i)}`);
  }
  if (porSecao.sigiloso.length > 0) t.push("", `🔒 ${plural(porSecao.sigiloso.length, "pagamento sigiloso não aparece", "pagamentos sigilosos não aparecem")} neste e-mail.`);
  if (saldos.length > 0) t.push("", "SALDO DAS CONTAS", ...saldos.map(s => `${s.nome}: ${brl(s.saldo)} — ${s.defasado ? "⚠ " : ""}${s.texto}`), NOTA_DO_SALDO);
  t.push("", AVISO_DE_CONFERENCIA, "", `Abrir o DiakoniaApp: ${LINK_DO_SISTEMA}`, "", `“${D.VERSICULO_DOS_RELATORIOS.texto}” — ${D.VERSICULO_DOS_RELATORIOS.ref}`, "", assinaturaEmTexto("mensagem"));

  return { assunto, html, texto: t.join("\n"), contagem: { pagar: porSecao.pagar.length, conferir: porSecao.conferir.length, semMeio: porSecao.sem_meio.length, sigilosos: porSecao.sigiloso.length, sigilososIncluidos: incluidosSigilosos.length, reembolsos: reembolsos.length }, reembolsosListados: reembolsos, total, listados };
}
