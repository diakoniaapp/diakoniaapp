// ─── omieImport.ts — leitura do Excel de "Movimentação da Conta Corrente" do Omie ──
//
// Pedido da Telma (13/09/2026): trazer o histórico anterior ao Diakonia,
// que hoje só existe no Omie. Função pura (sem Supabase) — só sabe ler o
// arquivo e devolver linhas estruturadas; quem resolve categoria/
// fornecedor/pessoa é `omieImportService.ts`.
//
// Formato confirmado com um arquivo real (Omie: Finanças → Passo 5 -
// Conciliar Contas Correntes → botão direito → Exportar → Excel), com a
// coluna Categoria VISÍVEL na grade antes de exportar (por padrão ela
// pode estar oculta, e a exportação só traz colunas visíveis — achado ao
// vivo, o primeiro arquivo que a Telma mandou não tinha Categoria nem
// Documento). Cabeçalho fica na 3ª linha da planilha; as duas primeiras
// são título e "Emitido por/em".
//
// Duas armadilhas reais do arquivo real:
//   1. Linhas "SALDO"/"SALDO ANTERIOR" sem Situação — são só marcador de
//      dia sem movimento, não são lançamento. Descartadas pelo filtro
//      `situacao !== ""`.
//   2. Uma categoria pode vir como "Dizimos (70,000000%); Ofertas
//      (30,000000%)" — o Omie deixa ratear UM pagamento entre duas
//      categorias. `separarCategoriaEPercentuais` quebra isso em N
//      entradas, cada uma com seu valor proporcional — importar como uma
//      coisa só perderia a informação real do rateio.
import * as XLSX from "xlsx";

export interface OmieLinhaBruta {
  situacao: string;
  data: string;              // YYYY-MM-DD
  clienteFornecedor: string;
  contaCorrente: string;
  categoriaBruta: string;    // pode ter várias, com percentual embutido
  valor: number;              // sinal já indica entrada(+)/saída(-)
  documento: string | null;
  cpfCnpj: string | null;     // só dígitos
  observacoes: string | null;
}

export interface OmieCategoriaEValor {
  categoria: string;
  valor: number;
}

const CABECALHOS_ESPERADOS = ["Situação", "Data", "Cliente ou Fornecedor"];

/** Excel guarda data como número de dias desde 30/12/1899. Convertido em
 *  UTC (não local) de propósito — é só aritmética de dias, não há hora
 *  envolvida, e fazer em UTC evita qualquer risco do fuso empurrar pro
 *  dia errado (mesma cautela do bug de fuso já corrigido em `lib/data.ts`). */
function serialExcelParaYmd(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function soDigitos(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length >= 11 ? d : null;
}

export interface OmieExtratoLido {
  linhas: OmieLinhaBruta[];
  /** Valor da linha "SALDO ANTERIOR" (o saldo da conta um dia antes do
   *  início do período exportado) — útil como `saldo_inicial` quando
   *  este for o primeiro período a ser importado para a conta. `null`
   *  se a planilha não tiver essa linha (ex.: um recorte no meio do mês). */
  saldoAnterior: number | null;
}

/** Lê o .xlsx exportado do Omie e devolve só as linhas de lançamento de
 *  verdade (descarta cabeçalho, título e as linhas "SALDO"). */
export function parseOmieXlsx(buffer: ArrayBuffer): OmieExtratoLido {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const idxCabecalho = linhas.findIndex(l =>
    CABECALHOS_ESPERADOS.every(esperado => l.includes(esperado)));
  if (idxCabecalho === -1) {
    throw new Error("Não reconheci o formato — esperava um cabeçalho com \"Situação, Data, Cliente ou Fornecedor\". Confira se exportou a tela certa do Omie.");
  }
  const cabecalho = linhas[idxCabecalho] as string[];
  const col = (nome: string) => cabecalho.indexOf(nome);

  const cSituacao = col("Situação");
  const cData = col("Data");
  const cCliente = col("Cliente ou Fornecedor");
  const cConta = col("Conta Corrente");
  const cCategoria = col("Categoria");
  const cValor = col("Valor (R$)");
  const cSaldo = col("Saldo (R$)");
  const cDocumento = col("Documento");
  const cCpfCnpj = col("Cliente ou Fornecedor (CNPJ/CPF)");
  const cObs = col("Observações");

  if (cCategoria === -1) {
    throw new Error("Essa planilha não tem a coluna Categoria — sem ela não dá pra classificar os lançamentos. No Omie, deixe a coluna \"Categoria\" visível na grade antes de exportar.");
  }

  const resultado: OmieLinhaBruta[] = [];
  let saldoAnterior: number | null = null;

  for (let i = idxCabecalho + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l || l.length === 0) continue;
    const cliente = (l[cCliente] ?? "").toString().trim();
    const situacao = (l[cSituacao] ?? "").toString().trim();

    if (!situacao) {
      // Linha "SALDO"/"SALDO ANTERIOR" — não é lançamento, mas a de
      // SALDO ANTERIOR carrega um número que vale a pena guardar.
      if (cliente === "SALDO ANTERIOR" && cSaldo >= 0) {
        saldoAnterior = Number(l[cSaldo]) || 0;
      }
      continue;
    }

    const dataSerial = l[cData];
    if (typeof dataSerial !== "number") continue;

    resultado.push({
      situacao,
      data: serialExcelParaYmd(dataSerial),
      clienteFornecedor: cliente,
      contaCorrente: cConta >= 0 ? (l[cConta] ?? "").toString().trim() : "",
      categoriaBruta: (l[cCategoria] ?? "").toString().trim(),
      valor: Number(l[cValor]) || 0,
      documento: cDocumento >= 0 && l[cDocumento] != null ? l[cDocumento].toString().trim() : null,
      cpfCnpj: cCpfCnpj >= 0 ? soDigitos(l[cCpfCnpj]?.toString()) : null,
      observacoes: cObs >= 0 && l[cObs] != null ? l[cObs].toString().trim() : null,
    });
  }
  return { linhas: resultado, saldoAnterior };
}

const RE_PERCENTUAL = /^(.+?)\s*\((\d+(?:,\d+)?)%\)$/;

/** "Dizimos (70,000000%); Ofertas (30,000000%)" + valor total → duas
 *  entradas com valor proporcional. Categoria sem "%" devolve ela mesma,
 *  inteira, como única entrada. */
export function separarCategoriaEPercentuais(categoriaBruta: string, valorTotal: number): OmieCategoriaEValor[] {
  const partes = categoriaBruta.split(";").map(p => p.trim()).filter(Boolean);
  const comPercentual = partes.map(p => {
    const m = p.match(RE_PERCENTUAL);
    if (!m) return null;
    return { categoria: m[1].trim(), percentual: Number(m[2].replace(",", ".")) };
  });

  if (comPercentual.some(p => p === null) || comPercentual.length === 0) {
    // Não é rateio — devolve a categoria bruta inteira
    return [{ categoria: categoriaBruta, valor: valorTotal }];
  }

  return (comPercentual as { categoria: string; percentual: number }[]).map(p => ({
    categoria: p.categoria,
    valor: Math.round(valorTotal * (p.percentual / 100) * 100) / 100,
  }));
}

export function ehTransferencia(categoria: string): boolean {
  return categoria === "Saída de Transferência" || categoria === "Entrada de Transferência";
}
