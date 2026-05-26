import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
