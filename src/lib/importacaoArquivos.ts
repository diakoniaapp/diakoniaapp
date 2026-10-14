// ─── importacaoArquivos.ts — impressão digital de arquivo importado ───────
//
// Morava em `omieImport.ts`. Quando o importador do Omie foi aposentado
// (14/10/2026), esta função ficou porque o importador de FATURA DE CARTÃO
// (`faturaImportService.ts`) depende dela, e a tabela `fin_import_arquivos`
// que ela alimenta continua sendo a trava de duplicidade dele.
//
// Gera a impressão digital do arquivo (SHA-256 dos bytes crus, Web Crypto —
// nenhuma lib nova) que a importação grava em `fin_import_arquivos` ANTES de
// inserir qualquer lançamento; a coluna `unique (conta_id, arquivo_hash)` faz
// o próprio banco recusar uma segunda tentativa do MESMO arquivo na MESMA
// conta, mesmo numa corrida de clique duplo que a tela não pegou a tempo.
export async function calcularHashArquivo(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
