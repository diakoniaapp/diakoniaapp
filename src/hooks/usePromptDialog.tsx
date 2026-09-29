// ─── usePromptDialog.tsx ─────────────────────────────────────────────────
//
// Substituto de `window.prompt()` — igual o projeto já tem `AlertDialog`
// pro lugar de `confirm()` (Risco 3 do CLAUDE.md), faltava o equivalente
// pra pedir um TEXTO: 9 chamadas de `prompt()` sobreviviam em produção
// (achado na auditoria de 29/09/2026) porque não existia um componente
// pronto pra isso — só o de confirmação sim/não.
//
// Ergonomia pensada pra ficar parecida com `prompt()` no lugar de
// chamada — `const valor = await prompt({ titulo: "..." })` — mas
// assíncrona de verdade (`Promise`, resolvida quando a pessoa confirma ou
// cancela), porque `window.prompt()` bloqueia a thread e o navegador
// embarcado do celular (WebView) recusa abrir a caixa nativa nesse modo.
//
// `null` = cancelou (mesmo valor que `window.prompt()` devolve no
// Cancelar) — quem chama decide se isso aborta a ação ou segue em frente
// tratando como "sem valor", igual já fazia com `prompt(...) ?? undefined`.
import { useCallback, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PromptOpcoes {
  titulo: string;
  descricao?: string;
  placeholder?: string;
  valorInicial?: string;
  /** "texto" (padrão, uma linha) · "textarea" (várias linhas) ·
   *  "numero" (teclado numérico no celular; ainda devolve string — quem
   *  chama converte, mesmo comportamento de `prompt()` nativo). */
  tipo?: "texto" | "textarea" | "numero";
  /** Desabilita "Confirmar" enquanto o campo estiver vazio — pra prompts
   *  onde um valor em branco não faz sentido (ex.: "Motivo da rejeição"). */
  obrigatorio?: boolean;
  textoConfirmar?: string;
}

export function usePromptDialog() {
  const [opcoes, setOpcoes] = useState<PromptOpcoes | null>(null);
  const [valor, setValor] = useState("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const prompt = useCallback((o: PromptOpcoes): Promise<string | null> => {
    setOpcoes(o);
    setValor(o.valorInicial ?? "");
    return new Promise<string | null>((resolve) => { resolverRef.current = resolve; });
  }, []);

  function confirmar() {
    if (opcoes?.obrigatorio && !valor.trim()) return;
    resolverRef.current?.(valor.trim() || null);
    resolverRef.current = null;
    setOpcoes(null);
  }

  function cancelar() {
    resolverRef.current?.(null);
    resolverRef.current = null;
    setOpcoes(null);
  }

  const dialog = (
    <Dialog open={!!opcoes} onOpenChange={(v) => { if (!v) cancelar(); }}>
      {opcoes && (
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{opcoes.titulo}</DialogTitle>
            {opcoes.descricao && <DialogDescription>{opcoes.descricao}</DialogDescription>}
          </DialogHeader>
          {opcoes.tipo === "textarea" ? (
            <Textarea
              value={valor} onChange={(e) => setValor(e.target.value)}
              placeholder={opcoes.placeholder} autoFocus rows={3}
            />
          ) : (
            <Input
              value={valor} onChange={(e) => setValor(e.target.value)}
              placeholder={opcoes.placeholder} autoFocus
              inputMode={opcoes.tipo === "numero" ? "decimal" : undefined}
              onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
            <Button type="button" onClick={confirmar} disabled={!!opcoes.obrigatorio && !valor.trim()}>
              {opcoes.textoConfirmar ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return { prompt, dialog };
}
