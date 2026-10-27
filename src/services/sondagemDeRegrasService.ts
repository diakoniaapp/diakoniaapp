// ─── sondagemDeRegrasService — lê os anexos que JÁ EXISTEM e conta quantos trazem regra de atraso (só leitura; nada é gravado) ─────────────────────────────────────────────────
// Fase 0 da proposta de regras de atraso. Baixa cada PDF pela URL assinada, extrai o TEXTO EXATO (sem OCR: escaneado conta como "sem texto") e roda `lerRegrasDeAtraso`.
// O resultado guarda só o que a sondagem precisa (booleanos e os trechos das regras), nunca o texto do documento.
import { supabase } from "@/integrations/supabase/client";
import { anexoSignedUrl } from "@/services/finService";
import { textoDoPdf } from "@/services/ocrService";
import { lerRegrasDeAtraso } from "@/lib/atrasoRegras";
import { situacaoDe, type ResultadoDaSondagem } from "@/lib/sondagemDeRegras";

/** Os tipos que se pagam (os mesmos de `documentoPagamentoService`). */
const TIPOS = ["boleto", "guia", "fatura", "outro", "documento"];

export interface AnexoParaSondar { id: string; tipo: string; nome: string | null; url: string; favorecido: string | null }

const EM_LOTES = 150;
async function emLotes<T, R>(itens: T[], f: (parte: T[]) => Promise<R[]>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += EM_LOTES) saida.push(...await f(itens.slice(i, i + EM_LOTES)));
  return saida;
}

/** Os `limite` anexos de pagamento mais recentes que são PDF, com o nome do favorecido da despesa. */
export async function listarAnexosParaSondar(limite: number): Promise<AnexoParaSondar[]> {
  const { data, error } = await supabase.from("fin_lancamento_anexos").select("id, tipo, nome, url, lancamento_id")
    .in("tipo", TIPOS as never).order("enviado_em", { ascending: false }).limit(Math.max(1, Math.min(limite * 3, 3000)));
  if (error) throw new Error(error.message);
  const pdfs = ((data ?? []) as unknown as { id: string; tipo: string; nome: string | null; url: string; lancamento_id: string }[])
    .filter(a => /\.pdf$/i.test(a.nome ?? a.url)).slice(0, limite);
  if (pdfs.length === 0) return [];

  const lancs = await emLotes([...new Set(pdfs.map(a => a.lancamento_id))], async parte => {
    const { data: l, error: e } = await supabase.from("fin_lancamentos").select("id, fornecedor_id, descricao").in("id", parte);
    if (e) throw new Error(e.message);
    return (l ?? []) as { id: string; fornecedor_id: string | null; descricao: string | null }[];
  });
  const fornIds = [...new Set(lancs.map(l => l.fornecedor_id).filter((x): x is string => !!x))];
  const forns = await emLotes(fornIds, async parte => {
    const { data: f, error: e } = await supabase.from("fin_fornecedores").select("id, nome").in("id", parte);
    if (e) throw new Error(e.message);
    return (f ?? []) as { id: string; nome: string }[];
  });
  const nomeDoForn = new Map(forns.map(f => [f.id, f.nome]));
  const lancPorId = new Map(lancs.map(l => [l.id, l]));
  return pdfs.map(a => {
    const l = lancPorId.get(a.lancamento_id);
    return { id: a.id, tipo: a.tipo, nome: a.nome, url: a.url, favorecido: (l?.fornecedor_id ? nomeDoForn.get(l.fornecedor_id) : null) ?? l?.descricao ?? null };
  });
}

/** Lê UM anexo. Nunca lança: o erro vira `situacao: "erro"`, para uma falha não derrubar a sondagem inteira. */
export async function sondarAnexo(a: AnexoParaSondar): Promise<ResultadoDaSondagem> {
  const base = { anexoId: a.id, tipo: a.tipo, favorecido: a.favorecido, multa: false, juros: false, desconto: false, naoReceberApos: false, correcao: null, confianca: 0, trechos: [] as string[] };
  try {
    const url = await anexoSignedUrl(a.url);
    if (!url) return { ...base, situacao: "erro" };
    const blob = await (await fetch(url)).blob();
    const texto = await textoDoPdf(new File([blob], a.nome ?? "documento.pdf", { type: "application/pdf" }));
    if (!texto || texto.trim().length < 20) return { ...base, situacao: "sem_texto" };
    const r = lerRegrasDeAtraso(texto);
    const achou = { multa: !!r.multa, juros: !!r.juros };
    return { ...base, ...achou, desconto: !!r.desconto, naoReceberApos: !!r.naoReceberApos, correcao: r.correcao, confianca: r.confianca, trechos: r.trechos, situacao: situacaoDe(achou) };
  } catch {
    return { ...base, situacao: "erro" };
  }
}
