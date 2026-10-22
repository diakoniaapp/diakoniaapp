// ─── QrCompacto — o QR Code do cadastro, recolhido por padrão ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O QR ocupava o primeiro terço da tela (um quadrado de 192 px + culto + funil do formulário + visitantes de hoje) para uma tarefa que a recepção faz uma vez por culto. Agora é uma linha de 56 px; abrir mostra
// o painel de sempre (QR, copiar/imprimir/pausar, culto de agora, formulário e "Visitantes de hoje"). Fechado, o painel nem é montado — e para de consultar o banco a cada 15 s. A escolha fica neste aparelho.
import { useState } from "react";
import { ChevronDown, QrCode } from "lucide-react";
import { AutoCadastroQrPainel } from "@/components/membros/AutoCadastroQrPainel";

const CHAVE = "diakonia-central-qr-aberto";
const ler = (): boolean => { try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; } };

export function QrCompacto({ chegaramHoje }: { chegaramHoje: number }) {
  const [aberto, setAberto] = useState(ler);
  const alternar = () => setAberto(a => { const n = !a; try { localStorage.setItem(CHAVE, n ? "1" : "0"); } catch { /* só não lembra */ } return n; });
  return (
    <section aria-label="QR Code do cadastro" data-qr-compacto>
      <button type="button" onClick={alternar} aria-expanded={aberto}
        className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">QR Code do cadastro</span>
          <span className="block truncate text-xs text-muted-foreground">{chegaramHoje > 0 ? `${chegaramHoje} ${chegaramHoje === 1 ? "chegou" : "chegaram"} hoje · ` : ""}{aberto ? "toque para recolher" : "toque para abrir o QR, o culto de hoje e quem chegou"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {aberto && <div className="mt-2"><AutoCadastroQrPainel /></div>}
    </section>
  );
}
