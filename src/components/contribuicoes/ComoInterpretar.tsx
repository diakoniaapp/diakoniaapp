// ─── ComoInterpretar — "Como interpretar este relatório", na tela do sistema (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: o e-mail para o pastor e a liderança não leva mais as definições dos perfis (ocupavam espaço demais); elas continuam à mão aqui, recolhidas, para a tesouraria e a administração.
// O texto é GERADO conforme o período e a base escolhidos (a mesma função que o e-mail usava).
interface Props { itens: { titulo: string; texto: string }[] }

export function ComoInterpretar({ itens }: Props) {
  if (itens.length === 0) return null;
  return (
    <details className="rounded-md border bg-muted/20 px-3 py-2" data-como-interpretar>
      <summary className="cursor-pointer text-xs font-medium select-none">Como interpretar este relatório</summary>
      <dl className="mt-2 space-y-2 text-xs leading-relaxed">
        {itens.map(i => (
          <div key={i.titulo}><dt className="font-semibold text-foreground">{i.titulo}</dt><dd className="text-muted-foreground">{i.texto}</dd></div>
        ))}
      </dl>
    </details>
  );
}
