// ─── resumoDiario — decide SE o resumo diário sai hoje e monta o e-mail (puro; as duas Edge Functions o dividem) ─────────────────────────────────────
//
// `resumo-diario` (o agendamento; envia de verdade) e `resumo-diario-previa` (visualizar/teste, com login) leem o MESMO pacote de `resumo_diario_dados()` e passam por aqui: o que a tela mostra na
// prévia é o que o e-mail das 7h leva.
import { montarEmailDiario, type EmailDoDiario } from "./emailDiario.ts";
import { montarItensDoDia, type CandidataDoDia, type ItemDoDia } from "./itensDoDia.ts";
import type { ExtratoDaConta } from "../saldos/extratoDasContas.ts";
import type { ReembolsoParaExibir } from "../reembolsos/apresentacao.ts";

export interface ConfigDoDiario { ativo: boolean; dias_semana: number[]; hora: number; minuto: number; janela_dias: number; enviar_sem_pagamentos: boolean; incluir_sigilosos?: boolean }
/** O que `resumo_diario_dados()` devolve. */
export interface DadosDoDiario {
  /** AAAA-MM-DD de Brasília */
  hoje: string;
  /** 0 = domingo … 6 = sábado */
  dow: number;
  gerado_em: string;
  config: ConfigDoDiario;
  destinatarios: { nome: string; email: string }[];
  itens: CandidataDoDia[];
  /** o último momento em que um resumo diário foi enviado (para não repetir o envio se o agendamento disparar duas vezes) */
  ultimo_envio_geral: string | null;
  /** saldo das contas com a data do último extrato do banco; a Edge Function o acrescenta (função `resumo_ultimo_extrato_das_contas`) — ausente/vazio = o e-mail sai sem o bloco de saldo */
  contas_extrato?: ExtratoDaConta[];
  /** reembolsos aprovados a pagar (quem recebe, o que quitou, valor, conta prevista); a Edge Function os acrescenta (`resumo_reembolsos_a_pagar`) — ausente/vazio = o e-mail sai sem a seção */
  reembolsos_a_pagar?: ReembolsoParaExibir[];
  /** o nome da igreja (Identidade) para o cabeçalho do e-mail; a Edge Function o acrescenta (`lerNomeDaIgreja`) */
  igreja_nome?: string | null;
}

/** Quanto tempo depois de um envio um novo disparo é tratado como repetição do mesmo (agendamento duplicado, chamada repetida na URL pública). */
export const INTERVALO_MINIMO_ENTRE_ENVIOS_MS = 20 * 60 * 1000;

export type MotivoDeNaoEnviar = "desligado" | "fora_dos_dias" | "sem_destinatarios" | "nada_a_pagar" | "enviado_ha_pouco";

export interface PreparoDoDiario { itens: ItemDoDia[]; email: EmailDoDiario }

/**
 * Monta os itens e o e-mail do dia. A `hora` do cumprimento é a do agendamento. Remuneração (prebenda, folha, Sustento, RPA) entra, marcada 🔒, a menos que a configuração diga o contrário
 * (decisão dela, 22/10/2026: também precisam ser pagos); `incluirSigilosos` sobrepõe a configuração — é o que a tela usa para pré-visualizar uma escolha ainda não salva.
 */
export function prepararDiario(d: DadosDoDiario, aviso?: string, incluirSigilosos?: boolean): PreparoDoDiario {
  const itens = montarItensDoDia(d.itens);
  return { itens, email: montarEmailDiario(itens, { igreja: d.igreja_nome, hojeYmd: d.hoje, hora: d.config.hora, aviso, contas: d.contas_extrato, reembolsos: d.reembolsos_a_pagar, incluirSigilosos: incluirSigilosos ?? d.config.incluir_sigilosos !== false }) };
}

/**
 * O envio agendado sai hoje? Na ordem: desligado · fora dos dias escolhidos · sem destinatário · já enviado há pouco · nada a pagar (a menos que a configuração mande assim mesmo).
 * Devolve o motivo de NÃO enviar, ou `null` para enviar.
 */
export function motivoDeNaoEnviar(d: DadosDoDiario, preparo: PreparoDoDiario, agora = Date.now()): MotivoDeNaoEnviar | null {
  if (!d.config.ativo) return "desligado";
  if (!d.config.dias_semana.includes(d.dow)) return "fora_dos_dias";
  if (d.destinatarios.length === 0) return "sem_destinatarios";
  if (d.ultimo_envio_geral && agora - new Date(d.ultimo_envio_geral).getTime() < INTERVALO_MINIMO_ENTRE_ENVIOS_MS) return "enviado_ha_pouco";
  // reembolso aprovado a pagar também é "algo a pagar": o e-mail sai mesmo sem nenhuma conta a pagar
  if (preparo.email.listados.length === 0 && preparo.email.reembolsosListados.length === 0 && !d.config.enviar_sem_pagamentos) return "nada_a_pagar";
  return null;
}
