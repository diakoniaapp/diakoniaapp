// ─── geocodificacaoService.ts ──────────────────────────────────────────────
//
// Transforma endereço de família em coordenada, pelo Nominatim/OpenStreetMap.
//
// ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────
//
// As 29 coordenadas que o mapa usa hoje foram gravadas de uma vez, por fora do
// sistema. Sem isto aqui, o mapa começaria a apodrecer no dia seguinte: família
// nova entra sem pino, endereço corrigido continua apontando para o lugar
// antigo, e ninguém percebe — porque um mapa com pinos errados parece um mapa
// certo.
//
// ── AS DUAS DEFESAS, E POR QUE ELAS NÃO SÃO OPCIONAIS ─────────────────────
//
// Na primeira geocodificação em massa, DEZ das 29 famílias foram parar no lugar
// errado: uma em Inhoaíba (Zona Oeste), duas em Duque de Caxias, uma em
// Niterói. Nome de rua se repete na região metropolitana — "Rua Paraíba" existe
// na Praça da Bandeira e em Caxias —, e o serviço escolhe o primeiro que achar.
//
//   1. O BAIRRO entra na consulta. É o que desempata ruas homônimas.
//   2. A BUSCA É LIMITADA a uma caixa em volta de onde a igreja já tem
//      famílias. O serviço passa a recusar o que está fora, em vez de a gente
//      conferir depois.
//
// E ainda assim o resultado é conferido: se o bairro que o mapa devolve não
// bate com o bairro do cadastro, a coordenada é RECUSADA. É melhor uma família
// sem pino que uma família no bairro errado.
//
// ── GEOCODIFICAR NÃO É DETERMINÍSTICO ─────────────────────────────────────
//
// Testado: apagar a coordenada de uma família e refazer devolveu um ponto
// ~100 m distante do anterior — mesma rua, nó diferente da geometria do
// OpenStreetMap. Não é erro; é como o serviço funciona quando não há número de
// casa mapeado, e varia com o texto exato da consulta.
//
// Cem metros não mudam o mapa, mas PODEM mudar a conta de proximidade, que usa
// raio de 300 m: uma família na borda entra ou sai de um agrupamento. Por isso
// só se regeocodifica quem precisa — família nova, ou endereço alterado —, e
// nunca a base inteira "para atualizar". Refazer tudo sem motivo mexeria nos
// agrupamentos sem que nenhum endereço tivesse mudado.

import { supabase } from "@/integrations/supabase/client";

/** Precisão do ponto obtido. Ver comentário da coluna `geo_precisao`. */
export type GeoPrecisao = "rua" | "bairro";

export interface FamiliaParaGeocodificar {
  id: string;
  nome_familia: string;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
}

export interface ResultadoGeo {
  nome: string;
  ok: boolean;
  motivo?: string;
  precisao?: GeoPrecisao;
}

/**
 * Nominatim pede no máximo uma consulta por segundo. 1.100 ms dá folga para
 * variação de relógio — estourar o limite faz o serviço bloquear o endereço de
 * origem, e aí ninguém geocodifica mais nada.
 */
const INTERVALO_MS = 1_100;

/**
 * Teto por execução. Sem ele, uma igreja com 300 famílias novas dispararia 300
 * consultas seguidas do navegador de uma pessoa — que é exatamente o padrão de
 * uso que o Nominatim bloqueia. Quem tiver mais que isso clica de novo.
 */
export const MAX_POR_VEZ = 25;

const dorme = (ms: number) => new Promise(r => setTimeout(r, ms));

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Caixa de busca derivada das famílias que JÁ têm coordenada, com uma folga de
 * ~11 km em volta.
 *
 * Derivada e não fixa no código de propósito: uma caixa do Rio escrita à mão
 * seria uma suposição sobre onde a igreja fica, e quebraria em silêncio para
 * qualquer outra. Sem nenhuma coordenada ainda, devolve nulo e a busca corre
 * sem limite — é a primeira vez, e aí só o cruzamento de bairro protege.
 */
async function caixaDeBusca(): Promise<string | null> {
  const { data } = await supabase
    .from("familias")
    .select("latitude, longitude")
    .not("latitude", "is", null);

  const pontos = (data ?? []).filter(p => p.latitude != null && p.longitude != null);
  if (pontos.length === 0) return null;

  const lats = pontos.map(p => p.latitude as number);
  const lons = pontos.map(p => p.longitude as number);
  const folga = 0.1;   // ~11 km

  return [
    Math.min(...lons) - folga,
    Math.min(...lats) - folga,
    Math.max(...lons) + folga,
    Math.max(...lats) + folga,
  ].join(",");
}

interface Achado {
  lat: number;
  lon: number;
  bairroOsm: string | null;
}

async function consultar(q: string, caixa: string | null): Promise<Achado | null> {
  const p = new URLSearchParams({
    q, format: "jsonv2", limit: "1", addressdetails: "1", countrycodes: "br",
  });
  if (caixa) { p.set("viewbox", caixa); p.set("bounded", "1"); }

  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "Accept-Language": "pt-BR" },
  });
  if (!r.ok) return null;

  const [hit] = await r.json();
  if (!hit) return null;

  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    bairroOsm: hit.address?.suburb ?? hit.address?.neighbourhood ?? hit.address?.city_district ?? null,
  };
}

/** Famílias com endereço que ainda não têm coordenada, ou cujo endereço mudou. */
export async function familiasPendentes(): Promise<FamiliaParaGeocodificar[]> {
  const { data } = await supabase
    .from("familias")
    .select("id, nome_familia, endereco, numero, bairro, cidade, latitude, geocodificado_em, updated_at")
    .not("endereco", "is", null);

  return (data ?? [])
    .filter(f => {
      if (!f.endereco?.trim()) return false;
      if (f.latitude == null) return true;                       // nunca teve
      if (!f.geocodificado_em) return true;                      // veio de fora
      return new Date(f.updated_at) > new Date(f.geocodificado_em); // endereço mudou
    })
    .map(f => ({
      id: f.id,
      nome_familia: f.nome_familia,
      endereco: f.endereco,
      numero: f.numero,
      bairro: f.bairro,
      cidade: f.cidade,
    }));
}

/**
 * Geocodifica as pendentes e grava. Chama `aoAndar` a cada família, para a tela
 * poder mostrar progresso — são mais de um segundo por endereço, e uma barra
 * parada por meio minuto parece travamento.
 */
export async function geocodificarPendentes(
  aoAndar?: (feitas: number, total: number, nome: string) => void,
): Promise<ResultadoGeo[]> {
  const pendentes = (await familiasPendentes()).slice(0, MAX_POR_VEZ);
  if (pendentes.length === 0) return [];

  const caixa = await caixaDeBusca();
  const saida: ResultadoGeo[] = [];

  for (const [i, f] of pendentes.entries()) {
    aoAndar?.(i, pendentes.length, f.nome_familia);

    const cidade = f.cidade || "Rio de Janeiro";
    const rua = [f.endereco, f.numero].filter(Boolean).join(", ");

    // 1ª tentativa: endereço com número. 2ª: só a rua — cai no meio dela, que
    // ainda é o quarteirão certo. 3ª: o bairro, marcado como aproximado.
    let achado = await consultar([rua, f.bairro, cidade, "Brasil"].filter(Boolean).join(", "), caixa);
    let precisao: GeoPrecisao = "rua";

    if (!achado) {
      await dorme(INTERVALO_MS);
      achado = await consultar([f.endereco, f.bairro, cidade, "Brasil"].filter(Boolean).join(", "), caixa);
    }
    if (!achado && f.bairro) {
      await dorme(INTERVALO_MS);
      achado = await consultar([f.bairro, cidade, "Brasil"].join(", "), caixa);
      precisao = "bairro";
    }

    if (!achado) {
      saida.push({ nome: f.nome_familia, ok: false, motivo: "endereço não encontrado" });
      await dorme(INTERVALO_MS);
      continue;
    }

    // A conferência que salvou dez famílias na primeira rodada.
    if (f.bairro && achado.bairroOsm && semAcento(f.bairro) !== semAcento(achado.bairroOsm)) {
      saida.push({
        nome: f.nome_familia,
        ok: false,
        motivo: `caiu em ${achado.bairroOsm}, e o cadastro diz ${f.bairro}`,
      });
      await dorme(INTERVALO_MS);
      continue;
    }

    const { error } = await supabase
      .from("familias")
      .update({
        latitude: achado.lat,
        longitude: achado.lon,
        geo_precisao: precisao,
        geocodificado_em: new Date().toISOString(),
      })
      .eq("id", f.id)
      .select("id");

    saida.push(
      error
        ? { nome: f.nome_familia, ok: false, motivo: error.message }
        : { nome: f.nome_familia, ok: true, precisao },
    );

    await dorme(INTERVALO_MS);
  }

  aoAndar?.(pendentes.length, pendentes.length, "");
  return saida;
}
