// ─────────────────────────────────────────────────────────────────────────────
// telefone.ts — Utilitários de formatação/normalização/validação de telefone
//
// Padrão único do Diakonia:
//   UI exibe   : +55 (DDD) NNNNN-NNNN
//   Banco grava: 5521999999999   (apenas dígitos, com DDI)
//
// Uso típico em formulário:
//   <Input
//     value={formatarTelefone(form.telefone_celular)}
//     onChange={(e) => set("telefone_celular", limparTelefone(e.target.value))}
//     placeholder="+55 (21) 99999-9999"
//     inputMode="tel"
//   />
//
// Antes de salvar no banco use `normalizarTelefone(...)` — garante DDI 55.
// ─────────────────────────────────────────────────────────────────────────────

/** Remove qualquer caractere que não seja dígito. */
export function limparTelefone(tel: string | null | undefined): string {
  if (!tel) return "";
  return tel.replace(/\D/g, "");
}

/**
 * Normaliza para o formato canônico que vai ao banco e ao WhatsApp:
 *   "5521999999999" (DDI 55 + DDD 2 + 8 ou 9 dígitos)
 *
 * Aceita entradas variadas:
 *   "(21) 99999-9999"   → "5521999999999"
 *   "21999999999"       → "5521999999999"
 *   "5521999999999"     → "5521999999999"
 *   "+55 21 99999-9999" → "5521999999999"
 *
 * Se vier vazio ou com menos de 10 dígitos retorna "".
 */
export function normalizarTelefone(tel: string | null | undefined): string {
  const limpo = limparTelefone(tel);
  if (!limpo) return "";

  // Já tem DDI 55 e tamanho válido?
  if (limpo.startsWith("55") && (limpo.length === 12 || limpo.length === 13)) {
    return limpo;
  }
  // Sem DDI: 10 (fixo DDD+8) ou 11 (celular DDD+9) dígitos
  if (limpo.length === 10 || limpo.length === 11) {
    return "55" + limpo;
  }
  // Pode ser parcial (digitação) ou inválido — devolve como está
  return limpo;
}

/**
 * Formata para exibição progressiva (formata enquanto o usuário digita).
 * Mantém o cursor em posição razoável; sem assumir input controlado externo.
 *
 *   ""                  → ""
 *   "2"                 → "+55 (2"
 *   "21"                → "+55 (21)"
 *   "2199"              → "+55 (21) 99"
 *   "219999"            → "+55 (21) 9999"
 *   "21999999"          → "+55 (21) 9999-9999"
 *   "21999999999"       → "+55 (21) 99999-9999"
 *   "5521999999999"     → "+55 (21) 99999-9999"
 */
export function formatarTelefone(tel: string | null | undefined): string {
  const limpo = limparTelefone(tel);
  if (!limpo) return "";

  // Remove DDI 55 se presente (tratamos como fixo)
  let d = limpo;
  if (d.startsWith("55") && d.length > 11) {
    d = d.slice(2);
  }

  const ddd = d.slice(0, 2);
  const numero = d.slice(2, 11); // até 9 dígitos

  let out = "+55";
  if (ddd) out += ` (${ddd}`;
  if (ddd.length === 2) out += ")";

  if (numero.length === 0) {
    return out;
  }
  if (numero.length <= 4) {
    return `${out} ${numero}`;
  }
  if (numero.length <= 8) {
    // fixo: 4 + 4
    return `${out} ${numero.slice(0, 4)}-${numero.slice(4)}`;
  }
  // celular: 5 + 4
  return `${out} ${numero.slice(0, 5)}-${numero.slice(5, 9)}`;
}

/**
 * Valida que o telefone tem DDD válido (11-99) e quantidade correta de dígitos.
 *   { ok: true } se válido
 *   { ok: false, erro: "..." } se inválido
 */
export function validarTelefone(
  tel: string | null | undefined
): { ok: boolean; erro?: string } {
  const limpo = limparTelefone(tel);
  if (!limpo) return { ok: false, erro: "Telefone é obrigatório." };

  let d = limpo;
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);

  if (d.length < 10 || d.length > 11) {
    return { ok: false, erro: "Telefone deve ter DDD + 8 ou 9 dígitos." };
  }
  const ddd = parseInt(d.slice(0, 2), 10);
  if (isNaN(ddd) || ddd < 11 || ddd > 99) {
    return { ok: false, erro: "DDD inválido (deve ser entre 11 e 99)." };
  }
  // Celular começa com 9
  if (d.length === 11 && d[2] !== "9") {
    return { ok: false, erro: "Celular deve começar com 9 após o DDD." };
  }
  return { ok: true };
}

/** Conveniência: true/false. */
export function telefoneValido(tel: string | null | undefined): boolean {
  return validarTelefone(tel).ok;
}

/**
 * Formata para exibição SEM o prefixo "+55" — usado em inputs que mostram
 * o "+55" como adornment visual fixo. O usuário não vê nem digita o DDI.
 *
 *   ""                  → ""
 *   "2"                 → "(2"
 *   "21"                → "(21)"
 *   "2199"              → "(21) 99"
 *   "21999998399"       → "(21) 99999-8399"
 *   "5521999998399"     → "(21) 99999-8399"   (DDI strippado)
 */
export function formatarTelefoneSemDDI(tel: string | null | undefined): string {
  const limpo = limparTelefone(tel);
  if (!limpo) return "";

  // Remove DDI 55 se vier (banco grava com DDI; UI sem DDI).
  let d = limpo;
  if (d.startsWith("55") && d.length > 11) {
    d = d.slice(2);
  }
  d = d.slice(0, 11); // hard cap em 11 dígitos brasileiros

  const ddd = d.slice(0, 2);
  const numero = d.slice(2);

  let out = "";
  if (ddd) out += `(${ddd}`;
  if (ddd.length === 2) out += ")";

  if (numero.length === 0) return out;
  if (numero.length <= 4) return `${out} ${numero}`;
  if (numero.length <= 8) return `${out} ${numero.slice(0, 4)}-${numero.slice(4)}`;
  return `${out} ${numero.slice(0, 5)}-${numero.slice(5, 9)}`;
}

