// ─── mensagensVisitanteService — a configuração das mensagens ao visitante (leitura para quem envia; edição para a administração) ─────────────────────────────────────────────────────────────
//
// Leitura: a função `visitante_mensagens()` (qualquer usuário logado) devolve config + modelos + Identidade da Igreja (nome, redes, endereço, contatos: fonte única, editada em /admin/identidade) + próximos eventos. Escrita: as tabelas `visitante_mensagem_config` (uma linha) e `visitante_mensagem_modelos`
// (uma por situação e canal), só admin/diakonia/secretaria (RLS). Se a migration ainda não foi aplicada, `carregarMensagens()` devolve null e quem chama cai no texto antigo.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { fecharUrl, lerPacote, type PacoteDeMensagens } from "@/lib/mensagensVisitante";
import type { CanalDaMensagem, ConfigDaMensagem, ModeloDaMensagem } from "@/lib/mensagensVisitante";

let guardado: { em: number; pacote: PacoteDeMensagens | null } | null = null;
const VALE_POR_MS = 60_000;

/** `null` = a função ainda não existe no banco (migration não aplicada). Guardado por 1 min: a Mesa abre várias linhas e não precisa buscar a cada uma. */
export async function carregarMensagens(forcar = false): Promise<PacoteDeMensagens | null> {
  if (!forcar && guardado && Date.now() - guardado.em < VALE_POR_MS) return guardado.pacote;
  const { data, error } = await supabase.rpc("visitante_mensagens" as never);
  const pacote = error || !data ? null : lerPacote(data);
  guardado = { em: Date.now(), pacote };
  return pacote;
}
export const esquecerMensagens = () => { guardado = null; };

export async function salvarConfig(c: ConfigDaMensagem): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const linha = {
    id: true, assinatura: c.assinatura.trim(), link_pedido_oracao: fecharUrl(c.link_pedido_oracao), link_plano_leitura: fecharUrl(c.link_plano_leitura),
    titulo_eventos: c.titulo_eventos.trim() || "Próximos eventos", dias_sem_retorno: c.dias_sem_retorno, eventos_max: c.eventos_max, redes_ocultas: c.redes_ocultas,
    atualizado_em: new Date().toISOString(), atualizado_por: uid,
  };
  const r = conferir(await supabase.from("visitante_mensagem_config" as never).upsert(linha as never, { onConflict: "id" } as never).select("id"), "A configuração das mensagens");
  if (!r.ok) throw new Error(r.erro);
  esquecerMensagens();
}

export async function salvarModelo(m: ModeloDaMensagem): Promise<void> {
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const linha = {
    situacao: m.situacao, canal: m.canal, ativo: m.ativo, assunto: m.assunto.trim(), abertura: m.abertura.trim(), texto_pastoral: m.texto_pastoral.trim(), convite_retorno: m.convite_retorno.trim(),
    fechamento: m.fechamento.trim(), incluir_eventos: m.incluir_eventos, incluir_redes: m.incluir_redes, incluir_endereco: m.incluir_endereco, incluir_contato: m.incluir_contato,
    incluir_whatsapp: m.incluir_whatsapp, incluir_oracao: m.incluir_oracao, incluir_leitura: m.incluir_leitura, atualizado_em: new Date().toISOString(), atualizado_por: uid,
  };
  const r = conferir(await supabase.from("visitante_mensagem_modelos" as never).upsert(linha as never, { onConflict: "situacao,canal" } as never).select("situacao"), "O modelo da mensagem");
  if (!r.ok) throw new Error(r.erro);
  esquecerMensagens();
}

/** O e-mail e o telefone de quem está logado — o destino do teste (nunca um endereço digitado ou vindo da chamada). */
export async function meuContato(): Promise<{ email: string | null; telefone: string | null }> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return { email: null, telefone: null };
  const { data: perfil } = await supabase.from("profiles").select("pessoa_id").eq("id", uid).maybeSingle();
  const pessoaId = (perfil as { pessoa_id?: string | null } | null)?.pessoa_id;
  if (!pessoaId) return { email: null, telefone: null };
  const { data } = await supabase.from("membros").select("email, telefone_celular, whatsapp_celular").eq("id", pessoaId).maybeSingle();
  const m = data as { email?: string | null; telefone_celular?: string | null; whatsapp_celular?: string | null } | null;
  return { email: m?.email?.trim() || null, telefone: m?.whatsapp_celular || m?.telefone_celular || null };
}

export interface RascunhoParaTeste { modelo: ModeloDaMensagem; config: ConfigDaMensagem; canal: CanalDaMensagem }
/**
 * E-mail de TESTE: a Edge Function monta com o RASCUNHO que a tela está editando (não precisa salvar antes) e manda só para o e-mail cadastrado de quem pediu.
 * Falha com a mensagem do servidor (sem e-mail na ficha, sem permissão, função ainda não implantada…).
 */
export async function enviarTesteDeEmail(r: RascunhoParaTeste): Promise<{ enviadoPara: string }> {
  const { data, error } = await supabase.functions.invoke("visitante-mensagem-teste", { body: { modelo: r.modelo, config: r.config } });
  if (error) {
    // a resposta de erro da função traz { erro } no corpo
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corpo?.erro ?? error.message ?? "Não foi possível enviar o teste.");
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Não foi possível enviar o teste.");
  return { enviadoPara: String(data.enviadoPara) };
}
