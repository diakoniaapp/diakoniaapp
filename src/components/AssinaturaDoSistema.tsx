// A assinatura discreta do DiakoniaApp no rodapé dos relatórios (tela e papel). Texto em src/lib/assinaturaDoSistema.ts.
import { SISTEMA } from "@/lib/assinaturaDoSistema";

export function AssinaturaDoSistema({ className = "" }: { className?: string }) {
  return (
    <div data-assinatura-do-sistema className={`avoid-break mt-3 text-center text-[10px] leading-snug text-muted-foreground ${className}`}>
      <p><b className="font-semibold">{SISTEMA.nome}</b> · {SISTEMA.slogan}</p>
      <p>Documento gerado automaticamente pelo sistema · Desenvolvimento e parametrização: {SISTEMA.autoria} · CNPJ {SISTEMA.cnpj}</p>
    </div>
  );
}
