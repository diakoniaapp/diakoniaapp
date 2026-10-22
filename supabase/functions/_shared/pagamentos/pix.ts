// ─── pix.ts — payload do PIX "copia e cola" (BR Code) ───────────────────
//
// Fase 7 do roadmap Financeiro (docs/ROADMAP_FINANCEIRO_ERP.md), pedido
// dela (22/09/2026, "Central Financeira Diakonia"): "Pagar Agora" — copiar
// PIX, gerar QR Code. Não guarda nada novo no banco (é matemática pura
// sobre `chave_pix` + valor + nome, calculada na hora, igual ao espírito
// de `boleto.ts` decodificando linha digitável sem tocar banco nenhum).
//
// ── POR QUE NÃO TENTA "ABRIR O BANCO SOZINHO" ────────────────────────────
//
// Investigado antes de construir (ver Central Financeira Diakonia, seção
// 4): existe um link oficial do Banco Central (pix.bcb.gov.br) registrado
// como App Link/Universal Link em cada banco — funciona bem no Android,
// mas no iPhone a Apple não deixa escolher QUAL app abre (abre o primeiro
// banco instalado que casar, não necessariamente o da pessoa pagando).
// Prometer isso falharia silenciosamente pra quem tem mais de um banco no
// celular — a maioria. Por isso esta função só gera o PAYLOAD (a string
// "copia e cola"/QR); quem usa decide como levar até o banco — copiar,
// mostrar QR, ou compartilhar pelo menu nativo do aparelho, que já resolve
// a escolha certa por si.
//
// ── O FORMATO ─────────────────────────────────────────────────────────
//
// Padrão BR Code do Banco Central, que é o mesmo EMV QR Code usado em
// qualquer PIX estático — série de campos TLV (id de 2 dígitos + tamanho
// de 2 dígitos + valor), terminando num checksum CRC16 sobre a string
// inteira. Referência pública: manual "Padrão para Iniciação do Pix" do
// Bacen — Tag 26 (conta do recebedor), 54 (valor, opcional — sem ela o
// PIX pede o valor no próprio app do banco), 62 (dado adicional).

export type TipoChavePix = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

export interface PixPayloadInput {
  chave: string;
  /** Quando o tipo é "telefone", normaliza pra `+55DDDNUMERO` antes de
   *  montar o payload — ver `normalizarChaveTelefone` abaixo pro porquê. */
  tipoChave?: TipoChavePix | null;
  nomeRecebedor: string;
  /** Cidade do recebedor — obrigatória no padrão, mas nada no cadastro de
   *  fornecedor/contratado hoje guarda isso. "SAO PAULO" como fallback
   *  neutro seria mentir; usar o nome da igreja é o que faz sentido aqui
   *  (é sempre a mesma cidade de quem PAGA, a QIBRJ). */
  cidade?: string;
  /** Sem valor: o PIX nasce "em aberto", quem paga digita o valor no
   *  próprio banco — válido pro padrão, só menos automático. */
  valor?: number;
  /** Aparece no app de quem paga como identificação da cobrança. */
  identificador?: string;
}

/** Remove acento e reduz a um alfabeto seguro pro payload (letras/números/espaço). */
function normalizar(texto: string, maxLen: number): string {
  const semAcento = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "");
  return semAcento.slice(0, maxLen).trim() || "NA";
}

function tlv(id: string, valor: string): string {
  return id + valor.length.toString().padStart(2, "0") + valor;
}

// ── Bug real, achado por ela em produção (22/09/2026, print do banco):
// "Chave Pix vinculado ao QRCode não existe". A chave telefone estava
// cadastrada como só os 11 dígitos locais ("21983991229"), e o payload
// levava exatamente isso — mas o DICT do Bacen registra chave de telefone
// no formato internacional `+5521983991229`, com o código do país. Sem o
// "+55", a consulta do banco dela não achava a chave em lugar nenhum, e o
// Pix falhava ANTES mesmo de chegar em quem recebe.
//
// A correção é só na hora de montar o payload — não no cadastro. Assim
// funciona tanto pra quem já digitou com "+55"/"55" quanto pra quem
// digitou só o DDD+número (o caso mais comum, e o que já estava quebrado).
// Por comprimento de dígitos, não por prefixo: um DDD "55" (Santa Maria,
// RS) é um número de 11 dígitos válido que POR ACASO começa com "55" —
// cortar esse prefixo às cegas destruiria o DDD real. 12/13 dígitos só
// acontece se o código do país já estiver ali.
function normalizarChaveTelefone(chave: string): string {
  const digitos = chave.replace(/\D/g, "");
  if (digitos.length === 12 || digitos.length === 13) return "+" + digitos;
  if (digitos.length === 10 || digitos.length === 11) return "+55" + digitos;
  return chave.trim(); // formato inesperado — não inventa, manda como veio
}

/**
 * CRC16-CCITT (poly 0x1021, init 0xFFFF) — o checksum que o padrão BR
 * Code exige no campo 63, calculado sobre a string inteira até ali
 * (incluindo o próprio "6304").
 */
export function crc16ccitt(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Monta o payload "copia e cola" — a mesma string que vira QR Code (o
 * QR é só essa string codificada visualmente, não um formato à parte).
 */
export function montarPayloadPix(input: PixPayloadInput): string {
  const chaveBruta = input.chave.trim();
  if (!chaveBruta) throw new Error("Chave PIX vazia");
  const chave = input.tipoChave === "telefone" ? normalizarChaveTelefone(chaveBruta) : chaveBruta;

  const gui = tlv("00", "br.gov.bcb.pix");
  const chaveTlv = tlv("01", chave);
  const contaInfo = tlv("26", gui + chaveTlv);

  const categoria = tlv("52", "0000");
  const moeda = tlv("53", "986"); // ISO 4217 — Real
  const valorTlv = input.valor && input.valor > 0 ? tlv("54", input.valor.toFixed(2)) : "";
  const pais = tlv("58", "BR");
  const nome = tlv("59", normalizar(input.nomeRecebedor, 25));
  const cidade = tlv("60", normalizar(input.cidade || "RIO DE JANEIRO", 15));

  // "***" é o placeholder padrão do PIX pra "sem identificador de
  // transação" — passar por `normalizar()` destruiria os asteriscos (não
  // são letra/número/espaço) e sobraria "NA", que não é o padrão. Só
  // sanitiza quando um identificador de verdade é passado.
  const idBruto = input.identificador?.trim();
  const txid = idBruto ? normalizar(idBruto, 25).replace(/ /g, "") || "***" : "***";
  const dadoAdicional = tlv("62", tlv("05", txid));

  const semCrc =
    tlv("00", "01") + contaInfo + categoria + moeda + valorTlv + pais + nome + cidade + dadoAdicional + "6304";

  return semCrc + crc16ccitt(semCrc);
}

/** Formata a chave só para EXIBIÇÃO — o payload usa o valor cru. */
export function formatarChavePix(chave: string, tipo: TipoChavePix | null): string {
  const limpa = chave.trim();
  if (tipo === "cpf" && /^\d{11}$/.test(limpa)) {
    return limpa.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (tipo === "cnpj" && /^\d{14}$/.test(limpa)) {
    return limpa.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (tipo === "telefone" && /^\+?\d{10,13}$/.test(limpa)) {
    const digitos = limpa.replace(/^\+?55/, "");
    return digitos.length === 11
      ? digitos.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
      : limpa;
  }
  return limpa;
}

export const TIPOS_CHAVE_PIX: { valor: TipoChavePix; rotulo: string }[] = [
  { valor: "cpf", rotulo: "CPF" },
  { valor: "cnpj", rotulo: "CNPJ" },
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "aleatoria", rotulo: "Chave aleatória" },
];
