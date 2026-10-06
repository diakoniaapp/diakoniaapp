// ─── lib/favorecidoPorNome.ts — achar o fornecedor de um lançamento que NÃO está ligado a ninguém ───────────
//
// Medido em 06/10/2026: dos 280 pagamentos previstos, 76 não têm fornecedor nem pessoa — só a descrição
// ("Salario Caio", "RPA Ana Patricia", "DENISE TEIXEIRA DINIS"). São os 13 meses de cada folha/RPA gerados sem
// favorecido. A chave Pix de quase todos JÁ está cadastrada em `fin_fornecedores` (Caio Marcelo Mendes da Silva,
// Ana Patricia da Silva de Lima de Oliveira, Telma Rodrigues de Souza…), mas o "Pagar" só procura a chave por
// `fornecedor_id`/`pessoa_id` — então não trazia nada.
//
// Esta função só SUGERE: devolve o fornecedor quando o nome da descrição identifica UM ÚNICO cadastro (todas as
// palavras do nome estão no cadastro). Ambíguo ou sem acerto = nada. Nunca grava; quem liga é o botão "Vincular".

const sinAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras que descrevem O QUE é o pagamento, não QUEM recebe. */
const PALAVRAS_DE_DESCRICAO = new Set([
  "rpa", "salario", "salarios", "prebenda", "pagamento", "folha", "ferias", "decimo", "terceiro", "13o", "adiantamento",
  "recibo", "pix", "ted", "boleto", "mensal", "mes", "ref", "referente", "de", "da", "do", "das", "dos", "e",
]);

/** Palavras do NOME: sem acento, sem números (o cadastro vem como "59.407.727 Marco Antonio…"), sem palavra solta curta. */
export function palavrasDoNome(texto: string | null | undefined, tirarDescricao = false): string[] {
  return sinAcento(texto ?? "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(p => p.length >= 3 && !(tirarDescricao && PALAVRAS_DE_DESCRICAO.has(p)));
}

export interface FornecedorParaNome { id: string; nome: string; chave_pix: string | null; tipo_chave_pix: string | null }

/**
 * O único fornecedor cujo nome contém TODAS as palavras de `descricao`. Mínimo: uma palavra de 4+ letras
 * ("caio") ou duas palavras; o que sobrar ambíguo (2+ cadastros) devolve `null` — melhor não sugerir.
 */
export function fornecedorPeloNome<T extends FornecedorParaNome>(descricao: string | null | undefined, fornecedores: T[]): T | null {
  const quer = palavrasDoNome(descricao, true);
  if (quer.length === 0) return null;
  if (quer.length === 1 && quer[0].length < 4) return null;
  const acertos = fornecedores.filter(f => {
    const tem = palavrasDoNome(f.nome);
    return quer.every(q => tem.some(t => t === q));
  });
  return acertos.length === 1 ? acertos[0] : null;
}
