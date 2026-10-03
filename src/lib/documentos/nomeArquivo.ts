// ─── lib/documentos/nomeArquivo.ts — a convenção de nomes da tesouraria ──────
//
// O arquivo real de agosto/2026 (103 PDFs montados à mão pela tesouraria) segue
// um padrão forte: 95 de 99 nomes têm o cabeçalho exato
//
//     dd.mm.aaaa - R$ 1.234,56 _ NF123 _ FORNECEDOR _ BOLETO _ PG BANKLINE.pdf
//
// Aqui só se LÊ esse padrão (pra servir de reserva quando o conteúdo do PDF não
// dá nada — digitalização ruim — e pra mostrar o nº da NF). Nada é inventado: se
// um campo não está no nome, vem `null`.
//
// Variações reais já vistas e aceitas: separador " _ " ou espaços duplos;
// `.pdf.pdf`; valor sem centavos (`R$2.420`); sem data (a data estava só na pasta);
// parcela `04_10`; formas `BANKLINE`, `ESPECIE`, `VISA`, `CARTAO CREDITO`.

export interface NomeLido {
  /** `AAAA-MM-DD` */
  data: string | null;
  valor: number | null;
  /** Número da NF, só dígitos (`NF000.051.078` → `000051078`). */
  nf: string | null;
  fornecedor: string | null;
  /** `PG BANKLINE` → `BANKLINE` */
  forma: string | null;
  /** `04_10` → `{ numero: 4, total: 10 }` */
  parcela: { numero: number; total: number } | null;
  /** BOLETO / FATURA / GUIA, quando o nome diz. */
  tipoDocumento: "BOLETO" | "FATURA" | "GUIA" | null;
  /** RPA, RPS (também escrito RSP) ou DPS no nome: o "fornecedor" é a FUNÇÃO, não a pessoa. */
  recibo: string | null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function lerNomeDeArquivo(nomeArquivo: string): NomeLido {
  // tira o caminho da pasta e as extensões (inclusive `.pdf.pdf`)
  let nome = nomeArquivo.split(/[\\/]/).pop()!.replace(/(\.(pdf|png|jpe?g|xml))+$/i, "");
  const r: NomeLido = { data: null, valor: null, nf: null, fornecedor: null, forma: null, parcela: null, tipoDocumento: null, recibo: null };

  const md = nome.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (md) { r.data = `${md[3]}-${md[2]}-${md[1]}`; nome = nome.slice(md[0].length); }

  const mv = nome.match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/);
  if (mv) {
    r.valor = Number(mv[1].replace(/\./g, "").replace(",", "."));
    nome = nome.replace(mv[0], " | ");
  }

  const resto: string[] = [];
  for (const bruto of nome.split(/\s+_\s+|\s{2,}|\s+-\s+|\s*\|\s*/)) {
    const s = bruto.replace(/^[\s_-]+|[\s_-]+$/g, "");
    if (!s) continue;
    if (/^NF[\s]?[\d.]+$/i.test(s)) r.nf = s.replace(/^NF\s?/i, "").replace(/\./g, "");
    else if (/^PG\s+/i.test(s)) r.forma = semAcento(s.replace(/^PG\s+/i, "")).trim();
    else if (/^\d{1,2}_\d{1,2}$/.test(s)) { const [n, t] = s.split("_").map(Number); r.parcela = { numero: n, total: t }; }
    else if (/^(RPS|RPA|RSP|DPS)$/i.test(s)) r.recibo = s.toUpperCase();
    else if (/^(BOLETO|FATURA|GUIA)$/i.test(s)) r.tipoDocumento = s.toUpperCase() as NomeLido["tipoDocumento"];
    else if (/^\d{5,}$/.test(s) || /^\d+\.\d$/.test(s)) continue; // código solto / retenção "3.3"
    else {
      // "NF215273 SUPERMERCADOS MUNDIAL": o número da nota colado na frase, sem " _ " —
      // é como os anexos reais da tesouraria aparecem (01.09.2026 R$61,92 NF215273 …).
      const m = !r.nf ? s.match(/\bNF\s?(\d[\d.]*\d|\d)\b\s*/i) : null;
      if (m) {
        r.nf = m[1].replace(/\./g, "");
        const sem = s.replace(m[0], " ").replace(/\s+/g, " ").trim();
        if (sem) resto.push(sem);
      } else resto.push(s);
    }
  }
  // "TIM SA PG BANKLINE" — forma colada no fim, sem separador
  if (!r.forma && resto.length) {
    const m = resto[resto.length - 1].match(/^(.*)\s+PG\s+(\w+)$/i);
    if (m) { resto[resto.length - 1] = m[1]; r.forma = semAcento(m[2]); }
  }
  r.fornecedor = resto.join(" / ") || null;
  return r;
}
