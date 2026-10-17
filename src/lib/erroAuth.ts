// ─── erroAuth — a causa REAL de uma falha de login, em português ────────────────────────────────────────────────────────────────────────────────────────────
//
// Antes (17/10/2026) a tela de entrada traduzia 4 mensagens do Auth e devolvia "Algo deu errado" para todo o resto — e as telas de convite (`Convite`, `ResetSenhaToken`) jogavam fora o erro
// do login automático. Foi assim que uma conta nascida quebrada (colunas de token NULL → o Auth responde 500 "Database error querying schema") passou despercebida: a pessoa via
// "sucesso", depois "Algo deu errado", e ninguém sabia o motivo. Aqui o que é conhecido ganha frase própria; o que não é conhecido mostra a causa técnica ao lado, para quem ajudar
// poder diagnosticar — nunca mais um "algo deu errado" mudo.

export interface ErroDoAuth { message?: string; status?: number; code?: string; name?: string }

const CONHECIDOS: [RegExp, string][] = [
  [/Invalid login credentials/i, "Telefone ou senha incorretos 😕 Verifique seus dados."],
  [/Email not confirmed/i, "Acesso não confirmado. Fale com a secretaria da Igreja."],
  [/Password should be at least/i, "A senha precisa ter no mínimo 6 caracteres."],
  [/you can only request this once every 60 seconds/i, "Aguarde 1 minuto antes de solicitar novamente."],
  [/User is banned|user_banned/i, "Este acesso está bloqueado. Fale com a secretaria da Igreja."],
  [/New password should be different|same_password/i, "A nova senha precisa ser diferente da senha atual."],
  [/rate limit|too many requests|over_request_rate_limit/i, "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."],
  [/Failed to fetch|NetworkError|Load failed|network request failed/i, "Sem conexão com o servidor. Verifique a internet e tente de novo."],
];

/** O texto técnico do erro, curto: "mensagem (código · status)". */
export function detalheTecnico(err: ErroDoAuth | string | null | undefined): string {
  if (!err) return "erro desconhecido";
  if (typeof err === "string") return err;
  const msg = err.message ?? err.name ?? "erro desconhecido";
  const extra = [err.code, err.status ? `HTTP ${err.status}` : null].filter(Boolean).join(" · ");
  return extra ? `${msg} (${extra})` : msg;
}

/**
 * A frase para a pessoa. Mensagem conhecida → frase própria. Erro do SERVIDOR (500 ou "Database error…") → diz que a conta foi recusada pelo servidor e mostra a causa. Qualquer outra →
 * mostra a causa técnica. Sempre registra o erro inteiro no console, onde o navegador da pessoa guarda a prova.
 */
export function mensagemDeErroAuth(err: ErroDoAuth | string | null | undefined): string {
  if (err) console.error("[auth]", err);
  const texto = typeof err === "string" ? err : `${err?.message ?? ""} ${err?.code ?? ""}`;
  for (const [padrao, frase] of CONHECIDOS) if (padrao.test(texto)) return frase;
  const servidor = (typeof err === "object" && err?.status !== undefined && err.status >= 500) || /Database error|unexpected_failure/i.test(texto);
  if (servidor) return `O servidor de login recusou esta conta — não é a senha. Avise a secretaria e informe: ${detalheTecnico(err)}`;
  return `Não foi possível entrar agora. Avise a secretaria e informe: ${detalheTecnico(err)}`;
}
