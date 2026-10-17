// ─── atualizarSistema — o "F5" do celular ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//
// No celular instalado (PWA em tela cheia) não existe botão de recarregar. Esta função faz o que o F5 faria, mas antes pede ao service worker que procure uma versão nova do
// sistema: sem isso, o recarregamento servia a cópia guardada e quem acabara de ouvir "publiquei" continuava vendo a tela antiga. Com `skipWaiting` + `clientsClaim` (vite.config.ts)
// a versão nova assume sozinha assim que baixa; o limite de 2,5 s evita ficar preso numa rede ruim — nesse caso recarrega com o que tem.
//
// Recarrega a página INTEIRA (não só a tela): papéis, permissões e qualquer cache em memória também voltam do banco.
export async function atualizarSistema(): Promise<void> {
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) await Promise.race([registro.update(), new Promise((r) => setTimeout(r, 2500))]);
  } catch { /* sem service worker (desenvolvimento, navegador antigo): recarrega do mesmo jeito */ }
  window.location.reload();
}
