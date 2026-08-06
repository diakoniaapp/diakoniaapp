// Abertura programática da busca global.
//
// Ctrl/Cmd+K não existe no celular, então qualquer botão (a lupa do header
// mobile, o campo na sidebar, o atalho no painel) precisa conseguir abrir a
// paleta. Um evento de janela evita prop drilling entre componentes que não
// compartilham ancestral próximo.
//
// Mora fora de CommandPalette.tsx de propósito: exportar função e componente
// no mesmo arquivo quebra o Fast Refresh do Vite.

export const EVENTO_ABRIR_BUSCA = "diakonia:abrir-busca";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_BUSCA));
}
