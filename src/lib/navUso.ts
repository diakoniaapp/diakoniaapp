// ─── navUso.ts ───────────────────────────────────────────────────────────────
// O menu aprende com quem o usa.
//
// ── O PROBLEMA MEDIDO ────────────────────────────────────────────────────────
//
// 21 itens em 5 grupos, para 76 rotas. A estrutura está certa — o problema é
// que ela mostra tudo para todos.
//
// Um professor de EBD vê Tesouraria, Módulo Fiscal, Visão Executiva e Reuniões
// financeiras: quatro itens que nunca vai abrir, todo dia, o dia inteiro. A
// sidebar ajuda na primeira semana e distrai a partir da segunda.
//
// ── O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO ──────────────────────────────────
//
// Não reordena os grupos. A razão de um menu ser rápido é memória muscular: a
// pessoa alcança "Famílias" sem ler, porque Famílias está sempre no mesmo
// lugar. Um menu que se reorganiza sozinho destrói exatamente isso e fica mais
// lento por parecer mais esperto.
//
// Então o aprendizado é ADITIVO e CONSERVADOR:
//
//   1. Um bloco de atalhos ACIMA dos grupos, que não mexe nos grupos.
//   2. Grupos nunca abertos começam fechados — e só depois de haver
//      histórico suficiente para essa conclusão significar algo.
//
// Em ambos os casos, a escolha explícita da pessoa vence sempre e para sempre.
//
// ── ONDE ISTO MORA ───────────────────────────────────────────────────────────
//
// localStorage. É por dispositivo e não sincroniza entre o celular e o
// computador — e está certo assim: o que a pessoa faz no celular no domingo
// não é o que ela faz na secretaria na terça. Guardar isto no banco custaria
// uma tabela, uma migration e uma política de RLS para resolver um problema
// que ninguém tem.

const CHAVE = "nav_uso_v1";

/** Quantos dias de histórico antes de o módulo se achar no direito de opinar. */
const DIAS_ATE_OPINAR = 14;

/** Um grupo é "esquecido" se nenhum item dele foi aberto neste prazo. */
const DIAS_DE_ESQUECIMENTO = 30;

/** Visitas mínimas para uma rota virar atalho. Abaixo disso é acaso. */
const VISITAS_PARA_ATALHO = 5;

/** Quantos atalhos, no máximo. Mais que isto vira um segundo menu. */
export const MAX_ATALHOS = 4;

const DIA = 86_400_000;

interface Registro {
  /** primeira vez que este dispositivo registrou qualquer coisa */
  inicio: number;
  /** rota -> [quantas vezes, quando foi a última] */
  rotas: Record<string, [number, number]>;
}

function ler(): Registro {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (cru) {
      const r = JSON.parse(cru) as Registro;
      if (r && typeof r.inicio === "number" && r.rotas) return r;
    }
  } catch {
    // aba privada, cota cheia, JSON corrompido — o menu só não aprende
  }
  return { inicio: Date.now(), rotas: {} };
}

function gravar(r: Registro) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    // idem
  }
}

/**
 * Registra uma visita.
 *
 * Guarda o PRIMEIRO segmento da rota, não a rota inteira: "/membros/abc-123"
 * e "/membros" são o mesmo destino do ponto de vista do menu, e guardar cada
 * id de pessoa encheria o localStorage de lixo que nunca mais se repete.
 */
export function registrarVisita(caminho: string) {
  const raiz = "/" + (caminho.split("/")[1] ?? "");
  const r = ler();
  const [n] = r.rotas[raiz] ?? [0, 0];
  r.rotas[raiz] = [n + 1, Date.now()];
  gravar(r);
}

/** Há histórico suficiente para o módulo tirar conclusões? */
export function temHistoricoBastante(): boolean {
  return Date.now() - ler().inicio >= DIAS_ATE_OPINAR * DIA;
}

/**
 * As rotas mais usadas, para o bloco de atalhos.
 *
 * Devolve lista vazia enquanto não houver sinal de verdade — é melhor não
 * mostrar bloco nenhum do que mostrar um bloco de "atalhos" com o que a
 * pessoa clicou duas vezes por engano.
 *
 * A ordem é recalculada uma vez por carga de página, nunca a cada navegação:
 * um bloco que se reordena enquanto se olha para ele é pior que inútil.
 */
export function atalhos(rotasValidas: Set<string>): string[] {
  if (!temHistoricoBastante()) return [];
  const { rotas } = ler();
  const candidatas = Object.entries(rotas)
    .filter(([rota, [n]]) => n >= VISITAS_PARA_ATALHO && rotasValidas.has(rota))
    // desempate pelo nome da rota para a ordem não dançar entre cargas
    .sort((a, b) => b[1][0] - a[1][0] || a[0].localeCompare(b[0]))
    .slice(0, MAX_ATALHOS)
    .map(([rota]) => rota);
  // Um atalho só não é um bloco de atalhos: é uma linha solta pedindo
  // explicação. Dois já formam uma lista.
  return candidatas.length >= 2 ? candidatas : [];
}

/**
 * Este grupo merece começar aberto?
 *
 * Só responde "não" quando há histórico bastante E nenhum item do grupo foi
 * aberto no prazo de esquecimento. Um usuário novo vê tudo aberto, como hoje
 * — a alternativa seria receber um menu quase todo fechado no primeiro dia,
 * que é a pior primeira impressão possível de um sistema que ele ainda não
 * conhece.
 */
export function grupoMereceAbrir(rotasDoGrupo: string[]): boolean {
  if (!temHistoricoBastante()) return true;
  const { rotas } = ler();
  const limite = Date.now() - DIAS_DE_ESQUECIMENTO * DIA;
  return rotasDoGrupo.some(r => {
    const reg = rotas[r];
    return reg && reg[1] >= limite;
  });
}
