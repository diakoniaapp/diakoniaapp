import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";

// Deploy novo enquanto a aba já estava aberta: os módulos com lazy load
// (`import("tesseract.js")`, `import("pdfjs-dist")`, telas por rota) ficam
// referenciados pelo hash do build ANTERIOR, que some do servidor assim que
// o deploy novo termina — daí "Failed to fetch dynamically imported module"
// num OCR ou numa navegação. Achado ao vivo pela Telma (16/09/2026),
// duas vezes no mesmo dia, cada vez com um hash de arquivo diferente —
// bate exatamente com os pushes feitos nesta sessão. O Vite dispara este
// evento nesse cenário; a correção oficial é recarregar a página, mas
// force um reload sem aviso perderia o que ela estivesse digitando (ex.:
// um lançamento pela metade) — por isso é um toast persistente com botão,
// não um `location.reload()` direto.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    toast.error("Uma versão nova do sistema foi publicada.", {
      description: "Atualize a página para continuar — sem isso, telas e recursos carregados aos poucos (como leitura de nota) vão continuar falhando.",
      duration: Infinity,
      action: { label: "Atualizar agora", onClick: () => window.location.reload() },
    });
  });
}

// Defensive shim: browser translation extensions (Google Translate, etc.) can
// mutate Radix portal subtrees and cause React's reconciler to throw
// "Failed to execute 'removeChild'/'insertBefore' on 'Node'". We guard both
// methods so the app keeps working instead of crashing to a black screen.
if (typeof window !== "undefined") {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        try { child.parentNode.removeChild(child); } catch { /* noop */ }
      }
      return child;
    }
    // eslint-disable-next-line prefer-rest-params
    return origRemoveChild.apply(this, arguments as any) as T;
  } as typeof Node.prototype.removeChild;

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // eslint-disable-next-line prefer-rest-params
      return origInsertBefore.call(this, newNode, null) as T;
    }
    // eslint-disable-next-line prefer-rest-params
    return origInsertBefore.apply(this, arguments as any) as T;
  } as typeof Node.prototype.insertBefore;
}

createRoot(document.getElementById("root")!).render(<App />);
