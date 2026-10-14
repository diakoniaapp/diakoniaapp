import { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="border-b bg-card">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <h1 translate="no" className="text-2xl md:text-4xl font-serif text-foreground truncate">{title}</h1>
          {description && <p translate="no" className="text-sm md:text-base text-muted-foreground mt-0.5 md:mt-1">{description}</p>}
        </div>
        {/* As ações aparecem também no celular. Eram `hidden md:flex` desde a primeira
            versão, e 10 telas (Famílias, Ministérios, Locais, Campanhas…) ficavam sem
            "Novo" abaixo de 768px, sem outro caminho. No celular o cabeçalho já é
            coluna: as ações caem sob o título e quebram linha se não couberem. */}
        {actions && <div className="flex flex-wrap gap-2 md:shrink-0 md:flex-nowrap md:whitespace-nowrap" translate="no">{actions}</div>}
      </div>
    </div>
  );
}