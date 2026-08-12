import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      // Area de toque de 32px sobre um desenho de 16px.
      //
      // O padrao do shadcn e h-4 w-4 — 16px, abaixo dos 24px minimos da WCAG
      // 2.2 (SC 2.5.8). Nao e detalhe teorico: as caixas de chamada da EBD sao
      // marcadas no celular, uma por aluno, durante a aula.
      //
      // O ::after e absoluto, entao NAO ocupa espaco: nenhum layout muda, e o
      // quadradinho continua com os mesmos 16px de sempre. So o alvo cresce,
      // 8px para cada lado. Corrige toda checkbox do sistema de uma vez, em vez
      // de caçar uma por tela.
      "relative after:absolute after:-inset-2 after:content-['']",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
