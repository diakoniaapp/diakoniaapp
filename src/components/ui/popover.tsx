import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, collisionPadding = 8, onWheel, onTouchMove, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      // Rolagem dentro de um popover que abre POR CIMA de um Dialog/Sheet (ex.: os filtros da Agenda): o Dialog trava a rolagem de tudo que está fora dele e o popover é
      // renderizado fora (portal) — a roda do mouse e o arrasto do dedo eram engolidos e a lista longa ficava inalcançável (medido em 6 tamanhos de tela, scrollTop = 0).
      // Parar o evento aqui impede o travamento de vê-lo; `overscroll-contain` impede que o fim da lista role a página por trás.
      // O teto é a altura que SOBRA na tela (sem isso, no celular deitado o popover passava do topo e os primeiros itens ficavam cortados).
      onWheel={(e) => { e.stopPropagation(); onWheel?.(e); }}
      onTouchMove={(e) => { e.stopPropagation(); onTouchMove?.(e); }}
      className={cn(
        "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
