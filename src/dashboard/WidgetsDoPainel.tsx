// ─── WidgetsDoPainel — os blocos que a Home devolveu aos painéis ──────────
//
// A Home era o único lugar onde 13 dos 16 widgets do registry apareciam. Ao
// virar tela pessoal, ela precisava devolvê-los a alguém: este componente é o
// endereço. Cada painel o chama uma vez, com o próprio nome.
//
//   <WidgetsDoPainel painel="pastoral" />
//
// Ele lê a permissão de quem está olhando pelo `usePermissoes` — o painel não
// precisa saber disso, e não deve: quem sabe quem vê o quê é o registry.
//
// Ordena por prioridade, como a Home fazia, e não corta em "ver mais": o
// painel é o lugar de quem veio trabalhar, e esconder metade do trabalho atrás
// de um botão foi um defeito real desta base — os sinais de voluntariado
// nasceram invisíveis por causa disso.

import { Suspense } from "react";
import { usePermissoes } from "@/hooks/usePermissoes";
import { getWidgetsDoPainel, type PainelDoWidget } from "@/dashboard/widgetRegistry";
import { Secao } from "@/components/eu/Secao";
import { ListSkeleton } from "@/components/ListState";

export function WidgetsDoPainel({ painel }: { painel: PainelDoWidget }) {
  const { permissoes } = usePermissoes();
  const widgets = getWidgetsDoPainel({ permissoes }, painel);
  if (widgets.length === 0) return null;

  return (
    <div className="space-y-8">
      {widgets.map(w => {
        const Comp = w.component;
        return (
          // `Secao` traz o canal do vazio: o widget avisa que não tem o que
          // mostrar e o título dele some junto. Sem isso o painel gastaria uma
          // seção inteira para dizer "Tudo em ordem — nada fiscal pendente".
          <Secao key={w.id} titulo={w.label} subtitulo={w.subtitulo}>
            <Suspense fallback={<ListSkeleton count={2} className="grid gap-2" />}>
              <Comp />
            </Suspense>
          </Secao>
        );
      })}
    </div>
  );
}
