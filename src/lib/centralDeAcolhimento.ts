// ─── centralDeAcolhimento — a regra da Central de Acolhimento (pura: sem rede, sem tela) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): a tela de Visitantes vira uma CENTRAL DE ACOLHIMENTO que responde, ao abrir: quem precisa de cuidado? quem não voltou? quem contatar hoje? qual a próxima ação? como está o funil?
//
// Esta regra substitui duas coisas que andavam separadas e erravam por omissão:
//   · a prioridade de `visitantesFluxo.calcularPrioridade` olhava SÓ o tempo (mais de 15 dias = alta, para sempre — mesmo quem já foi procurado ontem) e ignorava quem pediu oração ou contato;
//   · a "próxima ação" não existia: o cartão mostrava cinco botões iguais (Retorno, Contato, WhatsApp…) e a pessoa tinha de decidir sozinha.
// Aqui a prioridade junta TRÊS fatos — pediu cuidado? foi procurado? quanto tempo passou? — e cada visitante sai com UMA ação recomendada, o motivo dela e uma linha do tempo curta.
//
// "Contatar hoje" = quem tem uma AÇÃO a fazer agora: a regra é a da própria próxima ação (a que não manda "aguardar" nem diz "em dia"). Assim o cartão e o indicador nunca se contradizem: ninguém aparece em
// "Contatar hoje" com a recomendação "aguardar a resposta". Diferença para o widget "Acolhimento" do painel (que segue a régua antiga de "mais de 2 dias sem contato"): quem não voltou e foi procurado esta semana
// fica de fora daqui até a semana passar. "Não voltou" continua sendo uma visita só e mais de 15 dias desde o cadastro; "retornou", duas visitas ou mais.

export type Prioridade = "alta" | "media" | "baixa";
export type SituacaoDoVisitante = "chegou_agora" | "em_prazo" | "nao_voltou" | "retornou";

/** Pedido ainda sem retorno (vem de `vw_visitantes_aguardando_contato`): oração e/ou contato pastoral pedidos no cadastro pelo QR. */
export interface PedidoDeCuidado {
  checkinId: string;
  /** "Família", "Saúde", "Trabalho"… */
  oracao: string[];
  oracaoTexto?: string | null;
  quer_contato: boolean;
  /** "WhatsApp, à tarde" */
  preferencia?: string | null;
  /** AAAA-MM-DD da visita que gerou o pedido */
  dataVisita: string;
}

export interface VisitanteBase {
  id: string;
  nome: string;
  telefone: string | null;
  bairro?: string | null;
  numeroVisitas: number;
  /** instante do cadastro (ISO) */
  criadoEm: string;
  ultimoContatoEm: string | null;
  ultimoContatoTipo?: string | null;
  /** o chamador calcula com `avaliarEvolucao` (que olha o relógio): fica fora desta regra pura */
  sugestaoDePromocao?: "congregado" | "membro" | null;
  pedido?: PedidoDeCuidado | null;
}

export type AcaoDoBotao = "whatsapp" | "retorno_feito" | "promover" | "abrir_ficha" | "nenhuma";
export type TipoDeAcao = "orar" | "contato_pastoral" | "boas_vindas" | "primeiro_contato" | "reengajar" | "acompanhar" | "convidar" | "promover" | "em_dia";
export interface ProximaAcao {
  tipo: TipoDeAcao;
  titulo: string;
  detalhe: string;
  /** o que o botão principal faz; `nenhuma` = não há o que fazer agora */
  botao: AcaoDoBotao;
  rotuloDoBotao: string;
}
export interface Marco {
  chave: "chegada" | "contato" | "retorno" | "proximo_passo";
  rotulo: string;
  detalhe: string;
  /** feito = já aconteceu · atencao = devia ter acontecido · pendente = ainda não · proximo = o passo recomendado agora */
  estado: "feito" | "atencao" | "pendente" | "proximo";
}

export interface VisitanteDaCentral extends VisitanteBase {
  diasDesdeCadastro: number;
  /** null = nunca foi procurado */
  diasSemContato: number | null;
  situacao: SituacaoDoVisitante;
  prioridade: Prioridade;
  /** por que está nessa prioridade, em frases curtas (a primeira é a principal) */
  motivos: string[];
  contatarHoje: boolean;
  proximaAcao: ProximaAcao;
  linhaDoTempo: Marco[];
}

export const DIAS_PARA_RETORNAR = 15;
/** Sem contato há mais que isto = a pessoa precisa ser procurada hoje (a mesma régua do widget "Acolhimento"). */
export const DIAS_ENTRE_CONTATOS = 2;
/** Quem foi procurado há mais que isto, e ainda não voltou, volta a ser prioridade. */
export const DIAS_DO_CONTATO_SEMANAL = 7;

// ── datas ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** O dia (AAAA-MM-DD) de um instante, em Brasília: 22h do dia 20 é dia 20, não 21. */
export const diaDeBrasilia = (iso: string): string => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const diasEntre = (de: string, ate: string): number =>
  Math.max(0, Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000));
const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;
const haDias = (n: number) => (n === 0 ? "hoje" : n === 1 ? "ontem" : `há ${n} dias`);

// ── a classificação ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function situacaoDe(numeroVisitas: number, diasDesdeCadastro: number): SituacaoDoVisitante {
  if (numeroVisitas >= 2) return "retornou";
  if (diasDesdeCadastro > DIAS_PARA_RETORNAR) return "nao_voltou";
  if (diasDesdeCadastro <= 1) return "chegou_agora";
  return "em_prazo";
}

const temPedido = (p: PedidoDeCuidado | null | undefined): p is PedidoDeCuidado => !!p && (p.oracao.length > 0 || p.quer_contato || !!(p.oracaoTexto ?? "").trim());

/** ALTA: pediu cuidado, primeiro contato atrasado, ou está se perdendo (não voltou e ninguém procurou na última semana). MÉDIA: precisa de atenção hoje, mas há tempo. BAIXA: em dia. */
export function prioridadeDe(v: { situacao: SituacaoDoVisitante; diasDesdeCadastro: number; diasSemContato: number | null; numeroVisitas: number; pedido?: PedidoDeCuidado | null; sugestaoDePromocao?: unknown }): Prioridade {
  if (temPedido(v.pedido)) return "alta";
  if (v.diasSemContato === null && v.diasDesdeCadastro >= 2) return "alta";
  if (v.situacao === "nao_voltou" && (v.diasSemContato === null || v.diasSemContato > DIAS_DO_CONTATO_SEMANAL)) return "alta";
  if (v.diasSemContato === null) return "media";                                                       // chegou agora: a boas-vindas é para hoje
  if (v.situacao === "nao_voltou") return "media";                                                     // não voltou, mas já foi procurado esta semana
  if (v.numeroVisitas === 1 && v.diasSemContato > DIAS_DO_CONTATO_SEMANAL) return "media";            // dentro do prazo, mas sem contato semanal
  if (v.sugestaoDePromocao) return "media";                                                            // pronto para crescer: não deixar esfriar
  return "baixa";
}

function motivosDe(v: VisitanteBase, c: { situacao: SituacaoDoVisitante; diasDesdeCadastro: number; diasSemContato: number | null }): string[] {
  const m: string[] = [];
  const p = v.pedido;
  if (temPedido(p)) {
    if (p.oracao.length > 0) m.push(`Pediu oração (${p.oracao.join(", ")})`);
    else if ((p.oracaoTexto ?? "").trim()) m.push("Pediu oração");
    if (p.quer_contato) m.push(`Quer contato pastoral${p.preferencia ? ` (${p.preferencia})` : ""}`);
  }
  if (c.diasSemContato === null) m.push(c.diasDesdeCadastro >= 2 ? `Nunca foi procurado — chegou ${haDias(c.diasDesdeCadastro)}` : "Chegou agora: enviar as boas-vindas");
  else if (c.diasSemContato > DIAS_ENTRE_CONTATOS) m.push(`Sem contato ${haDias(c.diasSemContato)}`);
  if (c.situacao === "nao_voltou") m.push(`Não voltou: ${dias(c.diasDesdeCadastro)} desde a visita`);
  if (c.situacao === "retornou") m.push(`Voltou (${v.numeroVisitas} visitas)`);
  if (v.sugestaoDePromocao) m.push("Pronto para o próximo passo");
  return m;
}

/** UMA ação recomendada, a primeira regra que valer: pedido de oração › contato pastoral › próximo passo › boas-vindas/primeiro contato › reengajar › acompanhar › convidar › em dia. */
export function proximaAcaoDe(v: VisitanteBase, c: { situacao: SituacaoDoVisitante; diasDesdeCadastro: number; diasSemContato: number | null }): ProximaAcao {
  const tel = !!v.telefone;
  const zap = (rotulo: string) => (tel ? { botao: "whatsapp" as const, rotuloDoBotao: rotulo } : { botao: "abrir_ficha" as const, rotuloDoBotao: "Abrir a ficha (sem telefone)" });
  const p = v.pedido;
  if (temPedido(p) && (p.oracao.length > 0 || (p.oracaoTexto ?? "").trim())) {
    return { tipo: "orar", titulo: "Responder ao pedido de oração", detalhe: `Pediu oração${p.oracao.length > 0 ? ` por ${p.oracao.join(", ").toLowerCase()}` : ""} na visita de ${dm(p.dataVisita)}. Ore e escreva uma palavra de cuidado.`, ...zap("Responder pelo WhatsApp") };
  }
  if (temPedido(p) && p.quer_contato) {
    return { tipo: "contato_pastoral", titulo: "Fazer o contato pastoral pedido", detalhe: `Pediu contato na visita de ${dm(p.dataVisita)}${p.preferencia ? ` — prefere ${p.preferencia}` : ""}.`, ...zap("Chamar pelo WhatsApp") };
  }
  if (v.sugestaoDePromocao) {
    const para = v.sugestaoDePromocao === "membro" ? "membro" : "congregado";
    return { tipo: "promover", titulo: `Convidar para dar o próximo passo`, detalhe: `Já está pronto para virar ${para}. Converse com a pessoa antes de promover.`, botao: "promover", rotuloDoBotao: `Promover a ${para}` };
  }
  if (c.diasSemContato === null) {
    return c.diasDesdeCadastro <= 1
      ? { tipo: "boas_vindas", titulo: "Enviar as boas-vindas", detalhe: `Chegou ${haDias(c.diasDesdeCadastro)}. A primeira mensagem é a que mais pesa para a pessoa voltar.`, ...zap("Enviar boas-vindas") }
      : { tipo: "primeiro_contato", titulo: "Fazer o primeiro contato", detalhe: `Ninguém procurou esta pessoa ainda: chegou ${haDias(c.diasDesdeCadastro)}.`, ...zap("Enviar mensagem") };
  }
  if (c.situacao === "nao_voltou") {
    return c.diasSemContato > DIAS_DO_CONTATO_SEMANAL
      ? { tipo: "reengajar", titulo: "Reencontrar quem não voltou", detalhe: `Não voltou em ${dias(c.diasDesdeCadastro)} e o último contato foi ${haDias(c.diasSemContato)}. Mostre que sentimos sua falta.`, ...zap("Enviar mensagem de retorno") }
      : { tipo: "em_dia", titulo: "Aguardar a resposta", detalhe: `Foi procurado ${haDias(c.diasSemContato)}. Se não responder, volte a chamar depois de ${dias(DIAS_DO_CONTATO_SEMANAL)} do último contato.`, botao: "nenhuma", rotuloDoBotao: "" };
  }
  if (c.diasSemContato > DIAS_ENTRE_CONTATOS) {
    return c.situacao === "retornou"
      ? { tipo: "convidar", titulo: "Aproximar quem voltou", detalhe: `Voltou (${v.numeroVisitas} visitas) e está sem contato ${haDias(c.diasSemContato)}. Convide para uma célula, a EBD ou uma conversa.`, ...zap("Convidar pelo WhatsApp") }
      : { tipo: "acompanhar", titulo: "Acompanhar de perto", detalhe: `Sem contato ${haDias(c.diasSemContato)}. Uma mensagem curta mantém a pessoa próxima até o retorno.`, ...zap("Enviar mensagem") };
  }
  return { tipo: "em_dia", titulo: "Em dia", detalhe: `Foi procurado ${haDias(c.diasSemContato)}. Nada a fazer agora.`, botao: "nenhuma", rotuloDoBotao: "" };
}

/** Quatro marcos: chegou · contato · voltou · próximo passo. Mostra onde a pessoa está e onde parou. */
export function linhaDoTempoDe(v: VisitanteBase, c: { situacao: SituacaoDoVisitante; diasDesdeCadastro: number; diasSemContato: number | null }): Marco[] {
  const chegada = diaDeBrasilia(v.criadoEm);
  const contato: Marco = v.ultimoContatoEm
    ? { chave: "contato", rotulo: "Contato", detalhe: `${dm(diaDeBrasilia(v.ultimoContatoEm))}${v.ultimoContatoTipo ? ` · ${v.ultimoContatoTipo}` : ""}`, estado: (c.diasSemContato ?? 0) > DIAS_DO_CONTATO_SEMANAL && v.numeroVisitas < 2 ? "atencao" : "feito" }
    : { chave: "contato", rotulo: "Contato", detalhe: c.diasDesdeCadastro >= 2 ? `nenhum em ${dias(c.diasDesdeCadastro)}` : "ainda não", estado: c.diasDesdeCadastro >= 2 ? "atencao" : "proximo" };
  const retorno: Marco = v.numeroVisitas >= 2
    ? { chave: "retorno", rotulo: "Voltou", detalhe: `${v.numeroVisitas} visitas`, estado: "feito" }
    : { chave: "retorno", rotulo: "Retorno", detalhe: c.situacao === "nao_voltou" ? `não voltou (${dias(c.diasDesdeCadastro)})` : "aguardando", estado: c.situacao === "nao_voltou" ? "atencao" : "pendente" };
  const passo: Marco = v.sugestaoDePromocao
    ? { chave: "proximo_passo", rotulo: "Próximo passo", detalhe: `pronto para ${v.sugestaoDePromocao}`, estado: "proximo" }
    : { chave: "proximo_passo", rotulo: "Próximo passo", detalhe: "ainda não", estado: "pendente" };
  return [{ chave: "chegada", rotulo: "Chegou", detalhe: `${dm(chegada)}${c.diasDesdeCadastro > 0 ? ` · ${haDias(c.diasDesdeCadastro)}` : " · hoje"}`, estado: "feito" }, contato, retorno, passo];
}

/** O visitante da Central: tudo o que a tela precisa para desenhar o cartão, calculado num lugar só. `hoje` = AAAA-MM-DD de Brasília. */
export function classificar(v: VisitanteBase, hoje: string): VisitanteDaCentral {
  const diasDesdeCadastro = diasEntre(diaDeBrasilia(v.criadoEm), hoje);
  const diasSemContato = v.ultimoContatoEm ? diasEntre(diaDeBrasilia(v.ultimoContatoEm), hoje) : null;
  const situacao = situacaoDe(v.numeroVisitas, diasDesdeCadastro);
  const base = { situacao, diasDesdeCadastro, diasSemContato };
  const proximaAcao = proximaAcaoDe(v, base);
  return {
    ...v, ...base, prioridade: prioridadeDe({ ...base, numeroVisitas: v.numeroVisitas, pedido: v.pedido, sugestaoDePromocao: v.sugestaoDePromocao }),
    motivos: motivosDe(v, base), contatarHoje: proximaAcao.botao !== "nenhuma", proximaAcao, linhaDoTempo: linhaDoTempoDe(v, base),
  };
}

// ── ordem e filtros ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

const PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
/** Alta antes de média antes de baixa; dentro de cada uma, quem pediu cuidado, depois quem está há mais tempo sem contato (nunca procurado = o mais antigo de todos), depois o cadastro mais antigo. */
export function ordenar<T extends VisitanteDaCentral>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) =>
    PESO[a.prioridade] - PESO[b.prioridade]
    || Number(temPedido(b.pedido)) - Number(temPedido(a.pedido))
    || (b.diasSemContato ?? Infinity) - (a.diasSemContato ?? Infinity)
    || a.criadoEm.localeCompare(b.criadoEm));
}

export type FiltroDaCentral = "hoje" | "cuidado" | "nao_voltou" | "retornaram" | "todos";
export const FILTROS: FiltroDaCentral[] = ["hoje", "cuidado", "nao_voltou", "retornaram", "todos"];
export const ROTULO_DO_FILTRO: Record<FiltroDaCentral, string> = { hoje: "Contatar hoje", cuidado: "Precisam de cuidado", nao_voltou: "Não voltaram", retornaram: "Retornaram", todos: "Todos" };
const PASSA: Record<FiltroDaCentral, (v: VisitanteDaCentral) => boolean> = {
  hoje: v => v.contatarHoje, cuidado: v => v.prioridade === "alta", nao_voltou: v => v.situacao === "nao_voltou", retornaram: v => v.situacao === "retornou", todos: () => true,
};
export const filtrar = <T extends VisitanteDaCentral>(lista: readonly T[], f: FiltroDaCentral): T[] => ordenar(lista.filter(PASSA[f]));
/** Aceita os valores antigos de `?aba=` (acao, nao_voltou, todos) que outros painéis ainda usam. */
export function filtroDaUrl(aba: string | null | undefined): FiltroDaCentral {
  if (aba === "acao") return "hoje";
  return (FILTROS as string[]).includes(aba ?? "") ? (aba as FiltroDaCentral) : "hoje";
}

// ── indicadores e funil ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Indicadores {
  total: number;
  contatarHoje: number;
  /** prioridade alta: pediu cuidado, primeiro contato atrasado ou se perdendo */
  cuidado: number;
  /** dos quais, os que PEDIRAM oração ou contato pastoral */
  pedidos: number;
  naoVoltaram: number;
  retornaram: number;
  novosNaSemana: number;
  prontos: number;
  /** quantos dias o visitante mais esquecido está sem contato (null = ninguém sem contato) */
  maisEsquecidoHaDias: number | null;
}
export function indicadores(lista: readonly VisitanteDaCentral[]): Indicadores {
  const semContato = lista.filter(v => v.contatarHoje && !temPedido(v.pedido)).map(v => v.diasSemContato ?? v.diasDesdeCadastro);
  return {
    total: lista.length, contatarHoje: lista.filter(v => v.contatarHoje).length, cuidado: lista.filter(v => v.prioridade === "alta").length, pedidos: lista.filter(v => temPedido(v.pedido)).length,
    naoVoltaram: lista.filter(v => v.situacao === "nao_voltou").length, retornaram: lista.filter(v => v.situacao === "retornou").length,
    novosNaSemana: lista.filter(v => v.diasDesdeCadastro <= 7).length, prontos: lista.filter(v => !!v.sugestaoDePromocao).length,
    maisEsquecidoHaDias: semContato.length > 0 ? Math.max(...semContato) : null,
  };
}

export interface EtapaDoFunil { chave: "chegaram" | "procurados" | "voltaram" | "prontos" | "congregados"; rotulo: string; n: number; /** 0–100, em relação a quem chegou */ pct: number; dica: string }
/** O funil de acolhimento: chegou → foi procurado → voltou → está pronto para o próximo passo → já virou congregado/membro. `conversoes` = quem virou congregado/membro nos últimos dias (já não é mais visitante). */
export function funil(lista: readonly VisitanteDaCentral[], conversoes = 0): EtapaDoFunil[] {
  const total = lista.length;
  const topo = Math.max(total, 1);
  const pct = (n: number) => Math.min(100, Math.round((n / topo) * 100));
  const procurados = lista.filter(v => v.ultimoContatoEm).length;
  const voltaram = lista.filter(v => v.numeroVisitas >= 2).length;
  const prontos = lista.filter(v => !!v.sugestaoDePromocao).length;
  return [
    { chave: "chegaram", rotulo: "Chegaram", n: total, pct: total > 0 ? 100 : 0, dica: "visitantes que ainda estão no acolhimento" },
    { chave: "procurados", rotulo: "Foram procurados", n: procurados, pct: pct(procurados), dica: "tiveram ao menos um contato registrado" },
    { chave: "voltaram", rotulo: "Voltaram", n: voltaram, pct: pct(voltaram), dica: "duas visitas ou mais" },
    { chave: "prontos", rotulo: "Prontos para o próximo passo", n: prontos, pct: pct(prontos), dica: "a regra de evolução indica congregado ou membro" },
    { chave: "congregados", rotulo: "Já viraram congregados", n: conversoes, pct: pct(conversoes), dica: "saíram do acolhimento para o vínculo (nos últimos 90 dias)" },
  ];
}
