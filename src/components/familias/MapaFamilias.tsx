// ─── MapaFamilias.tsx ──────────────────────────────────────────────────────
//
// Onde as famílias moram.
//
// Um pino por FAMÍLIA, não por pessoa: uma casa com cinco moradores é um
// endereço, e cinco alfinetes empilhados no mesmo telhado não informam mais
// que um.
//
// ── SOBRE A PRECISÃO, QUE É O QUE MAIS IMPORTA AQUI ───────────────────────
//
// A coordenada vem do OpenStreetMap, e no Brasil o OSM raramente tem número
// de casa. Na prática o ponto é o da RUA: famílias do mesmo logradouro caem
// no mesmo lugar — e três delas de fato dividem o mesmo endereço.
//
// Quatro famílias têm precisão só de BAIRRO, porque a rua não foi encontrada.
// Elas aparecem com o pino vazado e dizem isso no cartão. A distinção não é
// decorativa: um mapa que trate centro de bairro como se fosse a casa faz
// duas famílias a 2 km parecerem vizinhas, e é exatamente sobre isso que a
// próxima etapa — proximidade — vai decidir pequenos grupos.
//
// OpenStreetMap e não Google: sem chave, sem cartão de crédito, sem cobrança
// por visualização. Para 29 pontos, pagar por mapa seria custo recorrente por
// nada.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle, Users, TriangleAlert, ChevronRight, Sprout, Compass } from "lucide-react";

interface FamiliaMapa {
  id: string;
  nome_familia: string;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  latitude: number;
  longitude: number;
  geo_precisao: "rua" | "bairro" | null;
  pessoas: { id: string; nome: string; telefone: string | null }[];
}

// Centro aproximado da área onde a igreja tem famílias. Só é usado se, por
// algum motivo, nenhuma família tiver coordenada.
const CENTRO_PADRAO: [number, number] = [-22.9126, -43.2118];

// ── Proximidade ────────────────────────────────────────────────────────────
//
// 300 metros, e não 1 km.
//
// Eu havia projetado 1 km — "o que uma pessoa caminha à noite para ir a um
// grupo". Medido nestes dados, 1 km NÃO SEPARA NADA: quase toda família tem
// 16 a 18 vizinhas nesse raio, porque a igreja está concentrada em bairros
// contíguos (Praça da Bandeira, Rio Comprido e Maracanã se tocam).
//
// Um raio em que todo mundo é vizinho de todo mundo não responde "quem mora
// perto de quem" — responde "a igreja é do centro do Rio", que já se sabia.
//
// A 300 m os números passam a discriminar: de 9 vizinhas a nenhuma. É a
// distância de dois ou três quarteirões, que é onde alguém de fato aceita ir
// a pé numa terça à noite.
const RAIO_METROS = 300;

/** Distância em metros entre dois pontos (haversine). */
function distancia(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const s =
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLon) - rad(aLon)) +
    Math.sin(rad(aLat)) * Math.sin(rad(bLat));
  return R * Math.acos(Math.min(1, s));
}

interface Agrupamento {
  centro: FamiliaMapa;
  familias: FamiliaMapa[];
  pessoas: number;
  emPgm: number;
}

/**
 * Agrupamentos possíveis: para cada família, quem está dentro do raio.
 *
 * Só entram famílias com precisão de RUA. Ponto de bairro é o centroide do
 * bairro inteiro — usá-lo aqui faria duas famílias a 2 km parecerem vizinhas,
 * e é justamente esta conta que vai sugerir pequeno grupo.
 *
 * Devolve ordenado por quantidade de PESSOAS, não de famílias: um grupo se
 * forma com gente, e duas famílias de cinco valem mais que quatro de um.
 */
function agrupar(familias: FamiliaMapa[], idsEmPgm: Set<string>): Agrupamento[] {
  const exatas = familias.filter(f => f.geo_precisao === "rua");

  const grupos = exatas.map(centro => {
    const perto = exatas.filter(
      o => o.id === centro.id ||
           distancia(centro.latitude, centro.longitude, o.latitude, o.longitude) <= RAIO_METROS,
    );
    const pessoas = perto.reduce((s, f) => s + f.pessoas.length, 0);
    const emPgm = perto.reduce(
      (s, f) => s + f.pessoas.filter(p => idsEmPgm.has(p.id)).length, 0,
    );
    return { centro, familias: perto, pessoas, emPgm };
  });

  // Um "agrupamento" de uma família só é uma família, não um grupo.
  return grupos
    .filter(g => g.familias.length >= 3)
    .sort((a, b) => b.pessoas - a.pessoas);
}

// ── O outro lado da mesma conta ────────────────────────────────────────────
//
// Agrupar responde "quem pode formar um grupo". Sobra a pergunta oposta, que é
// pastoral e não organizacional: quem está longe de todo mundo?
//
// Uma família a 2,6 km da família da igreja mais próxima não vai ser atendida
// por nenhuma estratégia de grupo de bairro — não porque foi esquecida, mas
// porque não há vizinhança de igreja ao redor dela. É um tipo de solidão que
// só a geografia mostra: na lista alfabética ela parece igual às outras.
//
// 1 km porque abaixo disso ainda se caminha. Acima, a pessoa depende de
// conducao para encontrar qualquer irmão — e isso muda o que a igreja precisa
// oferecer a ela.
const LONGE_METROS = 1000;

interface Distante {
  familia: FamiliaMapa;
  metros: number;
  emPgm: number;
}

function maisDistantes(familias: FamiliaMapa[], idsEmPgm: Set<string>): Distante[] {
  const exatas = familias.filter(f => f.geo_precisao === "rua");
  if (exatas.length < 2) return [];

  return exatas
    .map(f => {
      const metros = Math.min(
        ...exatas
          .filter(o => o.id !== f.id)
          .map(o => distancia(f.latitude, f.longitude, o.latitude, o.longitude)),
      );
      return {
        familia: f,
        metros,
        emPgm: f.pessoas.filter(p => idsEmPgm.has(p.id)).length,
      };
    })
    .filter(d => d.metros > LONGE_METROS)
    .sort((a, b) => b.metros - a.metros);
}

/** "2,6 km" / "820 m" */
function distanciaLegivel(m: number): string {
  return m >= 1000
    ? `${(m / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(m)} m`;
}

/**
 * Tira os grupos que se sobrepõem: se duas famílias vizinhas produzem
 * praticamente a mesma lista, mostrar as duas seria repetir o mesmo grupo com
 * outro nome no topo.
 */
function semRepetir(grupos: Agrupamento[], limite = 3): Agrupamento[] {
  const escolhidos: Agrupamento[] = [];
  const usadas = new Set<string>();

  for (const g of grupos) {
    const novas = g.familias.filter(f => !usadas.has(f.id)).length;
    if (novas < g.familias.length / 2) continue;   // mais da metade já contada
    escolhidos.push(g);
    g.familias.forEach(f => usadas.add(f.id));
    if (escolhidos.length >= limite) break;
  }
  return escolhidos;
}

function linkWhats(tel: string | null): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`;
}

export function MapaFamilias() {
  const [familias, setFamilias] = useState<FamiliaMapa[] | null>(null);
  const [semCoordenada, setSemCoordenada] = useState(0);
  const [idsEmPgm, setIdsEmPgm] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const [fam, vinc, pgm] = await Promise.all([
        supabase.from("familias")
          .select("id, nome_familia, endereco, numero, bairro, latitude, longitude, geo_precisao"),
        supabase.from("vinculos_familiares")
          .select("familia_id, membros(id, nome_completo, telefone_celular)"),
        supabase.from("pgm_membros").select("pessoa_id"),
      ]);
      if (cancelado) return;

      setIdsEmPgm(new Set((pgm.data ?? []).map(p => p.pessoa_id)));

      const porFamilia = new Map<string, FamiliaMapa["pessoas"]>();
      for (const v of (vinc.data ?? []) as any[]) {
        if (!v.membros || !v.familia_id) continue;
        const lista = porFamilia.get(v.familia_id) ?? [];
        lista.push({
          id: v.membros.id,
          nome: v.membros.nome_completo,
          telefone: v.membros.telefone_celular,
        });
        porFamilia.set(v.familia_id, lista);
      }

      const todas = (fam.data ?? []) as any[];
      setSemCoordenada(todas.filter(f => f.latitude == null || f.longitude == null).length);
      setFamilias(
        todas
          .filter(f => f.latitude != null && f.longitude != null)
          .map(f => ({ ...f, pessoas: porFamilia.get(f.id) ?? [] })),
      );
    })();

    return () => { cancelado = true; };
  }, []);

  if (familias === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Carregando o mapa...
        </CardContent>
      </Card>
    );
  }

  if (familias.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma família tem coordenada ainda.
        </CardContent>
      </Card>
    );
  }

  // Enquadra em todas as famílias em vez de fixar um zoom: a igreja pode se
  // espalhar, e um zoom fixo deixaria gente fora da tela sem avisar.
  const lats = familias.map(f => f.latitude);
  const lons = familias.map(f => f.longitude);
  const limites: [[number, number], [number, number]] = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

  const agrupamentos = semRepetir(agrupar(familias, idsEmPgm));
  const distantes    = maisDistantes(familias, idsEmPgm);

  return (
    <div className="space-y-3">

      {/* Agrupamentos possíveis: a pergunta que o mapa responde e a lista não.
          Vem antes do mapa porque é a única parte desta tela que sugere uma
          ação — o mapa em si informa. */}
      {agrupamentos.length > 0 && (
        <Card className="border-l-4 border-l-success">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sprout className="w-4 h-4 text-success shrink-0" />
              Quem mora perto de quem
            </p>
            <ul className="space-y-1.5">
              {agrupamentos.map(g => (
                // O bairro sozinho não serve de nome: dois agrupamentos
                // distintos podem cair na Praça da Bandeira, e a lista ficaria
                // com duas linhas de rótulo idêntico. A família do centro
                // desempata e ainda diz por onde procurar no mapa.
                <li key={g.centro.id} className="text-sm text-muted-foreground">
                  <b className="text-foreground">
                    {g.centro.bairro ? `${g.centro.bairro}, ` : ""}
                    em torno da família {g.centro.nome_familia}
                  </b>
                  {" — "}
                  <b className="text-foreground">{g.familias.length} famílias</b> e{" "}
                  <b className="text-foreground">{g.pessoas} pessoas</b> a menos de{" "}
                  {RAIO_METROS} m umas das outras
                  {g.emPgm === 0
                    ? ", e nenhuma em pequeno grupo."
                    : `, ${g.emPgm} em pequeno grupo.`}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Distância em linha reta entre os pontos de rua. Famílias com ponto
              só de bairro ficam de fora desta conta.
            </p>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs -ml-2">
              <Link to="/pgm">Abrir Pequenos Grupos <ChevronRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Longe de todo mundo. Fica depois dos agrupamentos porque é a
          pergunta menor em quantidade — e antes do mapa porque também pede
          uma ação, e de um tipo que o mapa sozinho não sugere. */}
      {distantes.length > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Compass className="w-4 h-4 text-warning shrink-0" />
              Longe de todo mundo
            </p>
            <ul className="space-y-1.5">
              {distantes.map(d => (
                <li key={d.familia.id} className="text-sm text-muted-foreground">
                  <b className="text-foreground">Família {d.familia.nome_familia}</b>
                  {d.familia.bairro ? `, ${d.familia.bairro}` : ""} — a{" "}
                  <b className="text-foreground">{distanciaLegivel(d.metros)}</b> da
                  família da igreja mais próxima
                  {d.familia.pessoas.length > 0 && `, ${d.familia.pessoas.length} ${d.familia.pessoas.length === 1 ? "pessoa" : "pessoas"}`}
                  {d.emPgm === 0 ? ", nenhuma em pequeno grupo." : `, ${d.emPgm} em pequeno grupo.`}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Nenhum grupo de bairro vai alcançar estas famílias — não há
              vizinhança de igreja em volta delas.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg overflow-hidden border" style={{ height: "60vh", minHeight: 320 }}>
        <MapContainer
          bounds={limites}
          boundsOptions={{ padding: [40, 40] }}
          center={CENTRO_PADRAO}
          zoom={13}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {familias.map(f => {
            const aproximado = f.geo_precisao === "bairro";
            return (
              // CircleMarker e nao Marker: o icone padrao do Leaflet depende de
              // imagens que o empacotador nao resolve sozinho, e o circulo ainda
              // deixa a precisao visivel — vazado quando e so o bairro.
              <CircleMarker
                key={f.id}
                center={[f.latitude, f.longitude]}
                radius={9}
                pathOptions={{
                  color: aproximado ? "#A8761B" : "#4F6B3E",
                  fillColor: aproximado ? "transparent" : "#4F6B3E",
                  fillOpacity: aproximado ? 0 : 0.75,
                  weight: 2,
                  dashArray: aproximado ? "3 3" : undefined,
                }}
              >
                <Popup>
                  <div className="min-w-[13rem]">
                    <p className="font-semibold text-sm">Família {f.nome_familia}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[f.endereco, f.numero].filter(Boolean).join(", ")}
                      {f.bairro ? ` — ${f.bairro}` : ""}
                    </p>
                    <p className="text-xs mt-1">
                      <Users className="w-3 h-3 inline mr-1" />
                      {f.pessoas.length} {f.pessoas.length === 1 ? "pessoa" : "pessoas"}
                    </p>

                    {aproximado && (
                      <p className="text-xs mt-1.5 text-amber-700">
                        Ponto aproximado — o número da rua não foi localizado.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                        <Link to={`/familias?familia=${f.id}`}>Abrir</Link>
                      </Button>
                      {(() => {
                        const comTel = f.pessoas.find(p => linkWhats(p.telefone));
                        if (!comTel) return null;
                        return (
                          <Button asChild size="sm"
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                            <a href={linkWhats(comTel.telefone)!} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="w-3 h-3 mr-1" /> WhatsApp
                            </a>
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#4F6B3E" }} />
          endereço localizado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: "#A8761B" }} />
          só o bairro
        </span>
        <span className="tabular-nums">{familias.length} famílias no mapa</span>
      </div>

      {semCoordenada > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardContent className="py-4">
            <p className="text-sm flex items-start gap-2">
              <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span>
                <b>{semCoordenada} famílias estão fora do mapa</b> por não terem
                endereço cadastrado. O mapa mostra onde a igreja registrou
                endereço — ainda não onde ela inteira mora.
              </span>
            </p>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs -ml-2 mt-1">
              <Link to="/familias">Completar endereços <ChevronRight className="w-3.5 h-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default MapaFamilias;
