// ─── mensagemDoVisitante — o texto que a equipe manda a UM visitante, saído da configuração (ou, sem ela, do texto antigo) ──────────────────────────────────────────────────────────────────────────────────
//
// As três telas que mandam WhatsApp a visitantes (Ações de hoje, Acolhimento da ficha, Fila pastoral do QR) pedem o texto aqui. Se a administração já tem a mensagem configurada e ligada para a situação do
// visitante, vale ela; se não (migration ainda não aplicada, modelo desligado), devolve `null` e a tela cai no texto antigo de `visitantesFluxo.getMensagem` — o envio nunca fica sem mensagem.
import { escolherModelo, montarMensagem, situacaoAutomatica, type CanalDaMensagem, type SituacaoDaMensagem } from "@/lib/mensagensVisitante";
import type { PacoteDeMensagens } from "@/lib/mensagensVisitante";
import type { EtapaFluxo } from "@/lib/visitantesFluxo";

/** A situação a partir da ETAPA do fluxo de acompanhamento que a tela já calcula (voltou / sumiu / ainda no prazo), mais a idade quando se sabe. */
export function situacaoPelaEtapa(etapa: EtapaFluxo, dataNascimento: string | null | undefined, hoje: string): SituacaoDaMensagem {
  if (etapa === "retornou") return "segunda_visita";
  if (etapa === "nao_voltou") return "nao_retornou";
  return situacaoAutomatica({ numeroDeVisitas: 1, diasDesdeAUltimaVisita: 0, dataNascimento, hoje });
}

/** A situação a partir dos fatos do check-in (fila do QR): número de visitas e dias desde a visita. */
export function situacaoPelosFatos(f: { numeroDeVisitas: number; diasDesdeAUltimaVisita: number; dataNascimento?: string | null; hoje: string }, diasSemRetorno: number): SituacaoDaMensagem {
  return situacaoAutomatica(f, diasSemRetorno);
}

/** O texto montado, ou `null` quando não há mensagem configurada e ligada para a situação (quem chama usa o texto antigo). */
export function textoDoVisitante(
  pacote: PacoteDeMensagens | null | undefined, situacao: SituacaoDaMensagem, visitante: { nome: string; culto?: string | null }, canal: CanalDaMensagem = "whatsapp",
): string | null {
  if (!pacote) return null;
  const modelo = escolherModelo(pacote.modelos, situacao, canal);
  if (!modelo) return null;
  const t = montarMensagem(modelo, { config: pacote.config, eventos: pacote.eventos, visitante }).texto.trim();
  return t || null;
}

/** Dias inteiros de `de` (AAAA-MM-DD) até `hoje` (AAAA-MM-DD). */
export const diasEntre = (de: string, hoje: string): number =>
  Math.max(0, Math.round((Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000));
