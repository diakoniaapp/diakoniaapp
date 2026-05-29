import { ReactNode } from "react";

/**
 * PageHeader — header de seção.
 * Desktop: título grande + descrição + ações à direita.
 * Mobile: título compacto + ações em linha abaixo do título (sem esconder).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="border-b bg-card">
      <div className="px-4 md:px-8 py-3 md:py-6">
        {/* Desktop: título + ações lado a lado */}
        <div className="hidden md:flex md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <h1 translate="no" className="text-4xl font-serif text-foreground truncate">{title}</h1>
            {description && (
              <p translate="no" className="text-base text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex gap-2 shrink-0 whitespace-nowrap" translate="no">
              {actions}
            </div>
          )}
        </div>

        {/* Mobile: compacto */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h1 translate="no" className="text-xl font-serif text-foreground truncate leading-tight">
                {title}
              </h1>
              {description && (
                <p translate="no" className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
              )}
            </div>
            {actions && (
              <div className="flex gap-1.5 shrink-0 items-center" translate="no">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
