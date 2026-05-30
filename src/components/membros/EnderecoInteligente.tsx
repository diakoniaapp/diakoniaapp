import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, MapPin, Navigation, Loader2, CheckCircle, AlertCircle, X, Map } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
export interface EnderecoData {
  endereco:          string;   // logradouro
  numero:            string;
  complemento:       string;
  bairro:            string;
  cidade:            string;
  estado:            string;   // UF ex: "SP"
  cep:               string;
  endereco_completo: string;   // formatado
  latitude:          number | null;
  longitude:         number | null;
  geo_fonte:         "manual" | "viacep" | "nominatim" | "gps";
  geo_place_id:      string;
}

export const emptyEndereco = (): EnderecoData => ({
  endereco: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", cep: "",
  endereco_completo: "", latitude: null, longitude: null,
  geo_fonte: "manual", geo_place_id: "",
});

interface Props {
  value:    EnderecoData;
  onChange: (v: EnderecoData) => void;
  /** Para visitantes: mostra só cidade/bairro */
  compact?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOMINATIM — autocomplete OSM (gratuito, sem chave)
// ─────────────────────────────────────────────────────────────────────────────
interface NominatimResult {
  place_id:     number;
  display_name: string;
  lat:          string;
  lon:          string;
  address: {
    road?:           string;
    house_number?:   string;
    suburb?:         string;
    neighbourhood?:  string;
    city?:           string;
    town?:           string;
    village?:        string;
    state?:          string;
    state_code?:     string;
    postcode?:       string;
  };
}

async function searchNominatim(q: string): Promise<NominatimResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(q)}` +
    `&format=json&addressdetails=1&limit=6&countrycodes=br` +
    `&accept-language=pt-BR`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": "DiakoniaApp/1.0" },
  });
  if (!res.ok) throw new Error("Erro ao buscar endereço");
  return res.json();
}

function nominatimToEndereco(r: NominatimResult): EnderecoData {
  const a = r.address;
  const logradouro = a.road ?? "";
  const bairro     = a.suburb ?? a.neighbourhood ?? "";
  const cidade     = a.city   ?? a.town ?? a.village ?? "";
  const uf         = (a.state_code ?? a.state ?? "").replace("BR-", "").slice(0, 2).toUpperCase();
  const cep        = (a.postcode ?? "").replace(/\D/g, "").slice(0, 8);
  const numero     = a.house_number ?? "";

  const partes = [logradouro, numero, bairro, cidade, uf].filter(Boolean);
  const completo = partes.join(", ");

  return {
    endereco:          logradouro,
    numero,
    complemento:       "",
    bairro,
    cidade,
    estado:            uf,
    cep:               cep ? cep.replace(/(\d{5})(\d{3})/, "$1-$2") : "",
    endereco_completo: completo,
    latitude:          parseFloat(r.lat),
    longitude:         parseFloat(r.lon),
    geo_fonte:         "nominatim",
    geo_place_id:      String(r.place_id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIACEP — lookup por CEP (gratuito, sem chave)
// ─────────────────────────────────────────────────────────────────────────────
interface ViaCepResult {
  logradouro: string; bairro: string; localidade: string;
  uf: string; erro?: boolean;
}

async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;
  const data: ViaCepResult = await res.json();
  return data.erro ? null : data;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOCODIFICAR endereço textual via Nominatim (para lat/lng após ViaCEP)
// ─────────────────────────────────────────────────────────────────────────────
async function geocodeText(q: string): Promise<{ lat: number; lon: number; place_id: string } | null> {
  try {
    const results = await searchNominatim(q);
    if (results.length === 0) return null;
    const r = results[0];
    return { lat: parseFloat(r.lat), lon: parseFloat(r.lon), place_id: String(r.place_id) };
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export function EnderecoInteligente({ value, onChange, compact = false }: Props) {
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [geoLoading,  setGeoLoading]  = useState(false);
  const [cepLoading,  setCepLoading]  = useState(false);
  const [showMap,     setShowMap]     = useState(false);
  const [showManual,  setShowManual]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef  = useRef<HTMLDivElement>(null);

  const hasCoords = value.latitude !== null && value.longitude !== null;
  const hasAddr   = !!(value.cidade || value.bairro || value.endereco);

  // ── Fechar dropdown ao clicar fora ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Autocomplete com debounce 400ms ────────────────────────────────────
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 4) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchNominatim(q + ", Brasil");
        setSuggestions(results);
      } catch { toast.error("Falha na busca de endereço"); }
      finally  { setSearching(false); }
    }, 400);
  }, []);

  // ── Selecionar sugestão ─────────────────────────────────────────────────
  const handleSelect = (r: NominatimResult) => {
    const end = nominatimToEndereco(r);
    onChange(end);
    setQuery(end.endereco_completo);
    setSuggestions([]);
    setShowMap(true);
    toast.success("Endereço encontrado! Verifique e ajuste se necessário.");
  };

  // ── Buscar por CEP ──────────────────────────────────────────────────────
  const handleCepBlur = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    if (value.endereco && value.cidade) return; // já preenchido
    setCepLoading(true);
    try {
      const data = await fetchViaCep(digits);
      if (!data) { toast.error("CEP não encontrado"); return; }
      const updated: EnderecoData = {
        ...value,
        endereco: data.logradouro || value.endereco,
        bairro:   data.bairro     || value.bairro,
        cidade:   data.localidade || value.cidade,
        estado:   data.uf         || value.estado,
        cep:      digits.replace(/(\d{5})(\d{3})/, "$1-$2"),
        geo_fonte: "viacep",
      };
      // Tentar geocodificar para obter lat/lng
      const q = [data.logradouro, data.localidade, data.uf, "Brasil"].filter(Boolean).join(", ");
      const geo = await geocodeText(q);
      if (geo) {
        updated.latitude     = geo.lat;
        updated.longitude    = geo.lon;
        updated.geo_place_id = geo.place_id;
      }
      const partes = [updated.endereco, updated.numero, updated.bairro, updated.cidade, updated.estado].filter(Boolean);
      updated.endereco_completo = partes.join(", ");
      onChange(updated);
      if (geo) setShowMap(true);
      toast.success("CEP encontrado!" + (geo ? " Coordenadas salvas." : ""));
    } catch { toast.error("Erro ao buscar CEP"); }
    finally  { setCepLoading(false); }
  };

  // ── Geolocalização GPS ──────────────────────────────────────────────────
  const handleGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada neste dispositivo");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Reverse geocode via Nominatim
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pt-BR`;
          const res = await fetch(url, { headers: { "User-Agent": "DiakoniaApp/1.0" } });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          const r: NominatimResult = { ...data, lat: String(latitude), lon: String(longitude) };
          const end = nominatimToEndereco(r);
          end.latitude    = latitude;
          end.longitude   = longitude;
          end.geo_fonte   = "gps";
          onChange(end);
          setQuery(end.endereco_completo);
          setShowMap(true);
          toast.success("Localização obtida com sucesso!");
        } catch {
          // Fallback: salva só as coordenadas
          onChange({ ...value, latitude, longitude, geo_fonte: "gps" });
          setShowMap(true);
          toast.success("Coordenadas salvas. Preencha o endereço manualmente se necessário.");
        }
        setGeoLoading(false);
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === 1) toast.error("Permissão de localização negada");
        else toast.error("Não foi possível obter a localização");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── Limpar endereço ─────────────────────────────────────────────────────
  const handleClear = () => {
    onChange(emptyEndereco());
    setQuery("");
    setSuggestions([]);
    setShowMap(false);
  };

  // ── Recalcular endereco_completo ao editar manual ───────────────────────
  const updateField = (field: keyof EnderecoData, val: string) => {
    const updated = { ...value, [field]: val, geo_fonte: "manual" as const };
    const partes = [
      updated.endereco, updated.numero, updated.complemento,
      updated.bairro, updated.cidade, updated.estado,
    ].filter(Boolean);
    updated.endereco_completo = partes.join(", ");
    onChange(updated);
  };

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── BUSCA PRINCIPAL ── */}
      <div className="space-y-2" ref={suggestRef}>
        <Label className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          Buscar endereço
        </Label>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Digite rua, bairro, cidade... (mínimo 4 letras)"
              className="h-11 pr-8"
            />
            {searching && (
              <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {query && !searching && (
              <button type="button" onClick={handleClear}
                className="absolute right-2 top-3 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Botão GPS */}
          <Button
            type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0"
            onClick={handleGps} disabled={geoLoading}
            title="Usar minha localização atual"
          >
            {geoLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Navigation className="h-4 w-4" />}
          </Button>
        </div>

        {/* Dropdown de sugestões */}
        {suggestions.length > 0 && (
          <div className="border rounded-xl shadow-lg bg-background max-h-56 overflow-y-auto z-50 relative">
            {suggestions.map((s) => (
              <button
                key={s.place_id} type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent border-b last:border-0 flex items-start gap-2 transition-colors"
                onClick={() => handleSelect(s)}
              >
                <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <span className="line-clamp-2">{s.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Texto ajuda */}
        <p className="text-xs text-muted-foreground">
          Digite o endereço para busca automática •{" "}
          <button type="button" className="underline text-primary"
            onClick={() => setShowManual(v => !v)}>
            {showManual ? "Ocultar campos" : "Preencher manualmente"}
          </button>
          {" "}•{" "}
          <button type="button" className="underline text-primary" onClick={handleGps}>
            Usar minha localização
          </button>
        </p>
      </div>

      {/* ── STATUS DO ENDEREÇO ── */}
      {hasAddr && (
        <div className={cn(
          "rounded-lg px-3 py-2.5 flex items-center gap-2 text-sm",
          hasCoords
            ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800"
            : "bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
        )}>
          {hasCoords
            ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            : <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={cn("font-medium text-xs", hasCoords ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
              {hasCoords ? "Endereço com coordenadas GPS" : "Endereço sem coordenadas"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{value.endereco_completo || [value.bairro, value.cidade, value.estado].filter(Boolean).join(", ")}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasCoords && (
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                {value.geo_fonte === "gps" ? "GPS" : value.geo_fonte === "viacep" ? "CEP" : value.geo_fonte === "nominatim" ? "Mapa" : "Manual"}
              </Badge>
            )}
            <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => setShowMap(v => !v)} title="Ver mapa">
              <Map className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW DO MAPA ── */}
      {showMap && hasCoords && (
        <div className="rounded-xl overflow-hidden border border-border relative">
          <iframe
            title="Mapa do endereço"
            width="100%" height="220"
            loading="lazy"
            style={{ border: 0 }}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${value.longitude! - 0.005},${value.latitude! - 0.005},${value.longitude! + 0.005},${value.latitude! + 0.005}&layer=mapnik&marker=${value.latitude},${value.longitude}`}
          />
          <a
            href={`https://www.openstreetmap.org/?mlat=${value.latitude}&mlon=${value.longitude}#map=17/${value.latitude}/${value.longitude}`}
            target="_blank" rel="noopener noreferrer"
            className="absolute bottom-2 right-2 bg-white/90 dark:bg-black/70 text-xs px-2 py-1 rounded shadow hover:underline"
          >
            Abrir no mapa ↗
          </a>
        </div>
      )}

      {/* ── BUSCA POR CEP (sempre visível) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1">
            CEP
            {cepLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </Label>
          <Input
            value={value.cep} inputMode="numeric"
            className="h-11" placeholder="00000-000"
            onChange={(e) => {
              let v = e.target.value.replace(/\D/g, "").slice(0, 8);
              if (v.length > 5) v = v.replace(/(\d{5})(\d{0,3})/, "$1-$2");
              updateField("cep", v);
            }}
            onBlur={(e) => handleCepBlur(e.target.value)}
          />
        </div>
      </div>

      {/* ── CAMPOS MANUAIS (expansível) ── */}
      {(showManual || hasAddr) && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Logradouro</Label>
            <Input value={value.endereco} className="h-11"
              placeholder="Rua, Av., Praça..."
              onChange={(e) => updateField("endereco", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Número</Label>
            <Input value={value.numero} className="h-11"
              onChange={(e) => updateField("numero", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Complemento</Label>
            <Input value={value.complemento} className="h-11"
              placeholder="Apto, Bloco, Casa..."
              onChange={(e) => updateField("complemento", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Bairro</Label>
            <Input value={value.bairro} className="h-11"
              onChange={(e) => updateField("bairro", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input value={value.cidade} className="h-11"
              onChange={(e) => updateField("cidade", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Estado (UF)</Label>
            <Input value={value.estado} className="h-11"
              maxLength={2} placeholder="SP"
              onChange={(e) => updateField("estado", e.target.value.toUpperCase())} />
          </div>
        </div>
      )}

      {/* ── CAMPOS COMPACT (só visitante) ── */}
      {compact && !showManual && !hasAddr && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Bairro</Label>
            <Input value={value.bairro} className="h-11"
              onChange={(e) => updateField("bairro", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input value={value.cidade} className="h-11"
              onChange={(e) => updateField("cidade", e.target.value)} />
          </div>
        </div>
      )}

    </div>
  );
}
