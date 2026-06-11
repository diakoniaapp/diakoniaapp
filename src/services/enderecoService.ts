// ─── enderecoService.ts — Busca de endereço por CEP (ViaCEP) ─────────────────
// API gratuita, sem chave, cobre todos os CEPs brasileiros.

export interface EnderecoViaCep {
  logradouro:  string;
  complemento: string;
  bairro:      string;
  localidade:  string;   // cidade
  uf:          string;
  cep:         string;
  erro?:       boolean;
}

export interface ResultadoCep {
  ok:       boolean;
  endereco?: EnderecoViaCep;
  erro?:    string;
}

/** Remove máscara e retorna apenas dígitos. */
export function limparCep(cep: string): string {
  return cep.replace(/\D/g, "");
}

/** Aplica máscara 00000-000. */
export function mascaraCep(valor: string): string {
  const d = limparCep(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Consulta o ViaCEP e retorna o endereço preenchível.
 * Só consulta se CEP tiver 8 dígitos.
 */
export async function buscarCep(cep: string): Promise<ResultadoCep> {
  const digits = limparCep(cep);

  if (digits.length !== 8) {
    return { ok: false, erro: "CEP deve ter 8 dígitos." };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { ok: false, erro: "Erro ao consultar o CEP. Tente novamente." };
    }

    const data: EnderecoViaCep = await res.json();

    if (data.erro) {
      return { ok: false, erro: "CEP não encontrado. Verifique e tente novamente." };
    }

    return { ok: true, endereco: data };
  } catch {
    return { ok: false, erro: "Sem conexão para consultar o CEP." };
  }
}

// ─── Busca reversa: por nome da rua ──────────────────────────────────────
// API: https://viacep.com.br/ws/{UF}/{CIDADE}/{LOGRADOURO}/json/
// Mínimo: UF (2 letras), cidade (3+ letras), logradouro (3+ letras)
// Retorna até 50 resultados.

export interface ResultadoBuscaLogradouro {
  ok: boolean;
  resultados?: EnderecoViaCep[];
  erro?: string;
}

export async function buscarCepPorLogradouro(
  uf: string, cidade: string, logradouro: string,
): Promise<ResultadoBuscaLogradouro> {
  const ufClean = (uf ?? "").trim().toUpperCase();
  const cidClean = (cidade ?? "").trim();
  const logClean = (logradouro ?? "").trim();

  if (ufClean.length !== 2) return { ok: false, erro: "UF inválida" };
  if (cidClean.length < 3)  return { ok: false, erro: "Cidade muito curta" };
  if (logClean.length < 3)  return { ok: false, erro: "Rua muito curta" };

  try {
    const url = `https://viacep.com.br/ws/${ufClean}/${encodeURIComponent(cidClean)}/${encodeURIComponent(logClean)}/json/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { ok: false, erro: "Erro na consulta" };
    const data = await res.json();
    if (!Array.isArray(data)) return { ok: false, erro: "Resposta inesperada" };
    return { ok: true, resultados: data as EnderecoViaCep[] };
  } catch {
    return { ok: false, erro: "Sem conexão" };
  }
}
