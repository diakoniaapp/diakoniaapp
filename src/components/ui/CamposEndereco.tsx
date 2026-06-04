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

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { buscarCep, mascaraCep, limparCep } from "@/services/enderecoService";

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

      {/* Logradouro */}
      <div>
        <Label translate="no">Logradouro</Label>
        <Input
          value={endereco}
          onChange={(e) => onChange("endereco", e.target.value)}
          placeholder="Rua, Avenida, Travessa..."
          disabled={disabled}
        />
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
