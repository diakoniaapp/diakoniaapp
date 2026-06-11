// ─── CamposEndereco.tsx — Bloco de endereço com busca automática por CEP ──────
//
// Uso:
//   <CamposEndereco
//     cep={form.cep}
//     endereco={form.endereco}
//     numero={form.numero}
//     complemento={form.complemento}
//     bairro={form.bairro}
//     cidade={form.cidade}
//     uf={form.uf}
//     onChange={(campo, valor) => set(campo, valor)}
//   />
//
// Quando o CEP atinge 8 dígitos, consulta o ViaCEP e preenche
// logradouro, bairro e cidade automaticamente.

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, CheckCircle2, AlertCircle, Search } from "lucide-react";
import { buscarCep, buscarCepPorLogradouro, mascaraCep, limparCep, type EnderecoViaCep } from "@/services/enderecoService";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CamposEnderecoProps {
  // Valores controlados pelo pai
  cep:          string;
  endereco:     string;
  numero?:      string;
  complemento?: string;
  bairro:       string;
  cidade:       string;
  uf?:          string;

  // Callback único: onChange(campo, valor)
  onChange: (campo: string, valor: string) => void;

  disabled?: boolean;

  // Opções de exibição
  mostrarNumero?:      boolean;  // padrão: true
  mostrarComplemento?: boolean;  // padrão: true
  mostrarUf?:          boolean;  // padrão: false (preenchido internamente)
}

type StatusCep = "idle" | "buscando" | "ok" | "erro";

// ─── Componente ───────────────────────────────────────────────────────────────

export function CamposEndereco({
  cep, endereco, numero = "", complemento = "", bairro, cidade, uf = "",
  onChange, disabled = false,
  mostrarNumero = true, mostrarComplemento = true, mostrarUf = false,
}: CamposEnderecoProps) {

  const [status,    setStatus]    = useState<StatusCep>("idle");
  const [msgErro,   setMsgErro]   = useState<string>("");

  // ── Busca reversa por nome da rua ──────────────────────────────────────
  const [sugestoes, setSugestoes] = useState<EnderecoViaCep[]>([]);
  const [buscandoRua, setBuscandoRua] = useState(false);
  const [mostrandoSugestoes, setMostrandoSugestoes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dispararBuscaRua(valor: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (valor.trim().length < 3 || !uf || !cidade) {
      setSugestoes([]);
      setMostrandoSugestoes(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscandoRua(true);
      try {
        const r = await buscarCepPorLogradouro(uf, cidade, valor);
        if (r.ok && r.resultados) {
          setSugestoes(r.resultados.slice(0, 8));
          setMostrandoSugestoes(true);
        } else {
          setSugestoes([]);
          setMostrandoSugestoes(false);
        }
      } finally {
        setBuscandoRua(false);
      }
    }, 500);
  }

  function aplicarSugestao(e: EnderecoViaCep) {
    onChange("cep",       e.cep);
    onChange("endereco",  e.logradouro);
    onChange("bairro",    e.bairro);
    if (mostrarUf) onChange("uf", e.uf);
    onChange("cidade",    e.localidade);
    setSugestoes([]);
    setMostrandoSugestoes(false);
    setStatus("ok");
  }

  // ── Busca CEP quando atingir 8 dígitos ──────────────────────────────────────

  async function handleCepChange(valor: string) {
    const formatado = mascaraCep(valor);
    onChange("cep", formatado);

    const digits = limparCep(formatado);
    if (digits.length < 8) {
      setStatus("idle");
      return;
    }

    setStatus("buscando");
    setMsgErro("");

    const resultado = await buscarCep(digits);

    if (!resultado.ok || !resultado.endereco) {
      setStatus("erro");
      setMsgErro(resultado.erro ?? "CEP não encontrado.");
      return;
    }

    const e = resultado.endereco;
    // Preenche apenas campos que estiverem vazios — não sobrescreve edição manual
    if (!endereco || !endereco.trim()) onChange("endereco",    e.logradouro);
    if (!bairro   || !bairro.trim())   onChange("bairro",     e.bairro);
    if (!cidade   || !cidade.trim())   onChange("cidade",     e.localidade);
    if (mostrarUf)                     onChange("uf",         e.uf);
    // Complemento: preenche só se ViaCEP retornar e campo estiver vazio
    if ((!complemento || !complemento.trim()) && e.complemento) {
      onChange("complemento", e.complemento);
    }

    setStatus("ok");
  }

  // ── Ícone de status do CEP ─────────────────────────────────────────────────

  const iconeCep = {
    idle:     <MapPin      className="w-4 h-4 text-muted-foreground" />,
    buscando: <Loader2     className="w-4 h-4 text-muted-foreground animate-spin" />,
    ok:       <CheckCircle2 className="w-4 h-4 text-green-500" />,
    erro:     <AlertCircle  className="w-4 h-4 text-destructive" />,
  }[status];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* CEP — com busca automática */}
      <div className="space-y-1">
        <Label translate="no">CEP</Label>
        <div className="relative">
          <Input
            value={cep}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
            disabled={disabled}
            inputMode="numeric"
            className={`pr-9 ${status === "erro" ? "border-destructive" : status === "ok" ? "border-green-400" : ""}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {iconeCep}
          </span>
        </div>
        {status === "erro" && (
          <p className="text-xs text-destructive">{msgErro}</p>
        )}
        {status === "ok" && (
          <p className="text-xs text-green-600">Endereço preenchido automaticamente ✓</p>
        )}
      </div>

      {/* Logradouro com busca por nome */}
      <div className="relative">
        <Label translate="no" className="flex items-center gap-1.5">
          Logradouro
          {buscandoRua && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </Label>
        <div className="relative">
          <Input
            value={endereco}
            onChange={(e) => {
              onChange("endereco", e.target.value);
              dispararBuscaRua(e.target.value);
            }}
            onFocus={() => sugestoes.length > 0 && setMostrandoSugestoes(true)}
            onBlur={() => setTimeout(() => setMostrandoSugestoes(false), 200)}
            placeholder="Rua, Avenida, Travessa... (digite 3+ letras)"
            disabled={disabled}
            className="pr-8"
          />
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {mostrandoSugestoes && sugestoes.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b bg-muted/50">
              {sugestoes.length} resultado{sugestoes.length === 1 ? "" : "s"} em {cidade}/{uf}
            </div>
            {sugestoes.map((s, i) => (
              <button
                key={`${s.cep}-${i}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); aplicarSugestao(s); }}
                className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-0"
              >
                <p className="text-sm font-medium leading-tight">{s.logradouro}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.bairro} · CEP {s.cep}
                </p>
              </button>
            ))}
          </div>
        )}

        {!cidade && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            💡 Preencha primeiro a cidade pra habilitar a busca por nome da rua.
          </p>
        )}
      </div>

      {/* Número + Complemento (mesma linha) */}
      {(mostrarNumero || mostrarComplemento) && (
        <div className="grid grid-cols-2 gap-3">
          {mostrarNumero && (
            <div>
              <Label translate="no">Número</Label>
              <Input
                value={numero}
                onChange={(e) => onChange("numero", e.target.value)}
                placeholder="Ex: 123"
                disabled={disabled}
              />
            </div>
          )}
          {mostrarComplemento && (
            <div>
              <Label translate="no">Complemento</Label>
              <Input
                value={complemento}
                onChange={(e) => onChange("complemento", e.target.value)}
                placeholder="Apto, Bloco..."
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}

      {/* Bairro + Cidade (mesma linha) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label translate="no">Bairro</Label>
          <Input
            value={bairro}
            onChange={(e) => onChange("bairro", e.target.value)}
            placeholder="Bairro"
            disabled={disabled}
          />
        </div>
        <div>
          <Label translate="no">Cidade</Label>
          <Input
            value={cidade}
            onChange={(e) => onChange("cidade", e.target.value)}
            placeholder="Cidade"
            disabled={disabled}
          />
        </div>
      </div>

      {/* UF (opcional) */}
      {mostrarUf && (
        <div className="w-24">
          <Label translate="no">UF</Label>
          <Input
            value={uf}
            onChange={(e) => onChange("uf", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="RJ"
            maxLength={2}
            disabled={disabled}
          />
        </div>
      )}

    </div>
  );
}
