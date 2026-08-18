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
import { Loader2, MessageCircle, Users, TriangleAlert, ChevronRight } from "lucide-react";

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

function linkWhats(tel: string | null): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`;
}

export function MapaFamilias() {
  const [familias, setFamilias] = useState<FamiliaMapa[] | null>(null);
  const [semCoordenada, setSemCoordenada] = useState(0);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const [fam, vinc] = await Promise.all([
        supabase.from("familias")
          .select("id, nome_familia, endereco, numero, bairro, latitude, longitude, geo_precisao"),
        supabase.from("vinculos_familiares")
          .select("familia_id, membros(id, nome_completo, telefone_celular)"),
      ]);
      if (cancelado) return;

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

  return (
    <div className="space-y-3">
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
