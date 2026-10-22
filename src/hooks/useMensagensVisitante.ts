import { useEffect, useState } from "react";
import { carregarMensagens } from "@/services/mensagensVisitanteService";
import type { PacoteDeMensagens } from "@/lib/mensagensVisitante";

/**
 * A configuração das mensagens ao visitante, para as telas que MANDAM a mensagem. `null` enquanto carrega e quando o banco ainda não tem a configuração (migration não aplicada) — nos dois casos a tela
 * usa o texto antigo, então nada some nem trava. O serviço guarda o resultado por 1 minuto: abrir várias linhas não repete a consulta.
 */
export function useMensagensVisitante(): PacoteDeMensagens | null {
  const [pacote, setPacote] = useState<PacoteDeMensagens | null>(null);
  useEffect(() => {
    let vivo = true;
    carregarMensagens().then(p => { if (vivo) setPacote(p); }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  return pacote;
}
