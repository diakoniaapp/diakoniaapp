// ─────────────────────────────────────────────────────────────────────────────
// TelefoneInput.tsx — Input com prefixo +55 visualmente separado.
//
// Por que: o `+55` é DDI fixo do Brasil. Mostrá-lo dentro do mesmo input
// confunde o usuário (ele tenta digitar "55" como DDD e o algoritmo
// trata como DDI). Aqui o +55 é só rótulo; o input formata apenas
// "(DDD) NNNNN-NNNN".
//
// Uso:
//   <TelefoneInput
//     value={form.telefone_celular}            // limpo, ex: "21999998399" ou ""
//     onChange={(v) => set("telefone_celular", v)}  // recebe só dígitos
//   />
//
// O componente repassa `id`, `disabled`, `required`, `className`, `aria-*`.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarTelefoneSemDDI, limparTelefone } from "@/lib/telefone";

export interface TelefoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Telefone armazenado SEM prefixo +55. Aceita string limpa ou já formatada. */
  value: string | null | undefined;
  /** Recebe a string SEM máscara (só dígitos), incluindo ou não o 55. */
  onChange: (digitos: string) => void;
}

export const TelefoneInput = React.forwardRef<HTMLInputElement, TelefoneInputProps>(
  function TelefoneInput({ value, onChange, className, placeholder, ...rest }, ref) {
    return (
      <div className="relative flex items-center w-full">
        <span
          className="pointer-events-none absolute left-3 text-sm text-muted-foreground select-none"
          aria-hidden="true"
        >
          +55
        </span>
        <Input
          ref={ref}
          {...rest}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          value={formatarTelefoneSemDDI(value)}
          onChange={(e) => onChange(limparTelefone(e.target.value))}
          placeholder={placeholder ?? "(00) 00000-0000"}
          className={cn("pl-12", className)}
        />
      </div>
    );
  }
);
