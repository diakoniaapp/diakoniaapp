import { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="border-b bg-card">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <h1 translate="no" className="text-2xl md:text-4xl font-serif text-foreground truncate">{title}</h1>
          {description && <p translate="no" className="text-sm md:text-base text-muted-foreground mt-0.5 md:mt-1">{description}</p>}
        </div>
        {actions && <div className="hidden md:flex gap-2 shrink-0 whitespace-nowrap" translate="no">{actions}</div>}
      </div>
    </div>
  );
}