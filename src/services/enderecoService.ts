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
