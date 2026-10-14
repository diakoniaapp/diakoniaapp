// ─── comprovanteService.ts — o arquivo do comprovante → a data sugerida para o pagamento; e o registro da decisão ───
//
// Pedido dela (14/10/2026). Lê o comprovante (PDF com texto: exato; imagem/screenshot/PDF escaneado: OCR — o mesmo caminho do
// `ocrService`) e entrega a leitura de `lib/documentos/comprovante.ts`. Quem decide a data é a pessoa, na tela; a decisão vai para
// `fin_data_pagamento_decisoes` (migration 20261016130000) — sem a migration, a sugestão funciona igual e só a auditoria fica de fora.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { hojeLocal } from "@/lib/data";
import { lerComprovante, type LeituraDoComprovante } from "@/lib/documentos/comprovante";
import { anexoSignedUrl } from "@/services/finService";
import { extrairDadosDoComprovante } from "@/services/ocrService";

/** O texto do arquivo — a leitura em si é refeita na tela quando o valor pago muda (a confiança depende dele), sem ler o arquivo de novo. */
export interface TextoDoComprovante {
  texto: string;
  fonte: "pdf_texto" | "ocr";
  confiancaOcr: number | null;
  arquivoNome: string;
  /** "agora" (escolhido no diálogo) ou "anexado" à despesa antes de pagar */
  origem: "agora" | "anexado";
}
export interface ComprovanteLido { leitura: LeituraDoComprovante; fonte: "pdf_texto" | "ocr"; arquivoNome: string }

const ACEITOS = /\.(pdf|png|jpe?g|webp)$/i;

/** Extrai o texto de um comprovante (PDF com texto: exato; imagem ou PDF escaneado: OCR). */
export async function textoDoComprovante(file: File, origem: TextoDoComprovante["origem"] = "agora"): Promise<TextoDoComprovante> {
  const r = await extrairDadosDoComprovante(file);
  return { texto: r.textoBruto, fonte: r.fonte, confiancaOcr: r.fonte === "ocr" ? r.confianca : null, arquivoNome: file.name, origem };
}

/** A leitura do texto, com o valor que saiu do banco segundo a tela. */
export function lerTextoDoComprovante(t: TextoDoComprovante, valorEsperado: number | null): ComprovanteLido {
  return {
    leitura: lerComprovante(t.texto, { hoje: hojeLocal(), valorEsperado, fonte: t.fonte, confiancaOcr: t.confiancaOcr }),
    fonte: t.fonte, arquivoNome: t.arquivoNome,
  };
}

/** O comprovante mais recente já anexado à despesa (tipo "comprovante"), como arquivo — ou null. */
export async function comprovanteJaAnexado(lancamentoId: string): Promise<File | null> {
  const { data, error } = await supabase.from("fin_lancamento_anexos")
    .select("id, nome, url").eq("lancamento_id", lancamentoId).eq("tipo", "comprovante")
    .order("enviado_em", { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  const a = data[0] as { id: string; nome: string | null; url: string };
  const nome = a.nome ?? a.url.split("/").pop() ?? "comprovante";
  if (!ACEITOS.test(nome)) return null;
  const assinada = await anexoSignedUrl(a.url);
  if (!assinada) return null;
  const blob = await (await fetch(assinada)).blob();
  const tipo = /\.pdf$/i.test(nome) ? "application/pdf" : blob.type || "image/jpeg";
  return new File([blob], nome, { type: tipo });
}

let sondagem: { em: number; ok: boolean } | null = null;
/** `true` quando a tabela da auditoria existe (migration 20261016130000). Guardado por 30 s. */
export async function auditoriaDaDataDisponivel(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.from("fin_data_pagamento_decisoes" as never).select("id").limit(1);
  sondagem = { em: Date.now(), ok: !error };
  return !error;
}

export type DecisaoDaData = "usou_sugerida" | "alterou" | "sem_sugestao";

export interface RegistroDaDecisao {
  lancamentoId: string;
  liquidacaoId: string | null;
  comprovante: ComprovanteLido;
  dataEscolhida: string;
  motivo: string | null;
}

/** A decisão que a tela registra, derivada (e não informada): se havia sugestão e a pessoa ficou com ela, "usou"; senão "alterou". */
export function decisaoDe(sugerida: string | null, escolhida: string): DecisaoDaData {
  if (!sugerida) return "sem_sugestao";
  return sugerida === escolhida ? "usou_sugerida" : "alterou";
}

/** Grava a decisão. Quem e quando são carimbados pelo banco. Lança com mensagem em português se o banco recusar. */
export async function registrarDecisaoDaData(p: RegistroDaDecisao): Promise<void> {
  const l = p.comprovante.leitura;
  const decisao = decisaoDe(l.data, p.dataEscolhida);
  const r = conferir(await supabase.from("fin_data_pagamento_decisoes" as never).insert({
    lancamento_id: p.lancamentoId, liquidacao_id: p.liquidacaoId, arquivo_nome: p.comprovante.arquivoNome, fonte: p.comprovante.fonte,
    tipo_operacao: l.tipo, banco: l.banco, e2e: l.e2e, data_sugerida: l.data, hora_sugerida: l.data ? l.hora : null,
    valor_encontrado: l.valor, confianca: l.data ? l.confianca : null, avisos: l.avisos,
    data_escolhida: p.dataEscolhida, decisao, motivo: decisao === "alterou" ? (p.motivo ?? "").trim() : (p.motivo?.trim() || null),
  } as never).select("id"), "O registro da data do pagamento");
  if (!r.ok) throw new Error(r.erro);
}
