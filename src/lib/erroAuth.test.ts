// A causa real de uma falha de login: o que é conhecido tem frase própria; o resto mostra o erro técnico (17/10/2026).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detalheTecnico, mensagemDeErroAuth } from "./erroAuth";

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("mensagemDeErroAuth", () => {
  it("as quatro mensagens que a tela sempre traduziu continuam iguais", () => {
    expect(mensagemDeErroAuth({ message: "Invalid login credentials" })).toBe("Telefone ou senha incorretos 😕 Verifique seus dados.");
    expect(mensagemDeErroAuth({ message: "Email not confirmed" })).toContain("Acesso não confirmado");
    expect(mensagemDeErroAuth({ message: "Password should be at least 6 characters" })).toContain("mínimo 6 caracteres");
    expect(mensagemDeErroAuth({ message: "For security purposes, you can only request this once every 60 seconds" })).toContain("1 minuto");
  });

  it("o erro que escondeu a conta quebrada: 500 do servidor NÃO vira 'algo deu errado' — diz que não é a senha e mostra a causa", () => {
    const m = mensagemDeErroAuth({ message: "Database error querying schema", status: 500, code: "unexpected_failure" });
    expect(m).toContain("não é a senha");
    expect(m).toContain("Database error querying schema");
    expect(m).toContain("HTTP 500");
    expect(m).not.toMatch(/algo deu errado/i);
  });

  it("conta bloqueada, senha repetida, excesso de tentativas e falta de internet têm frase própria", () => {
    expect(mensagemDeErroAuth({ message: "User is banned" })).toContain("bloqueado");
    expect(mensagemDeErroAuth({ message: "New password should be different from the old password.", code: "same_password" })).toContain("diferente");
    expect(mensagemDeErroAuth({ message: "Request rate limit reached", code: "over_request_rate_limit" })).toContain("Muitas tentativas");
    expect(mensagemDeErroAuth({ message: "Failed to fetch" })).toContain("Sem conexão");
  });

  it("erro desconhecido mostra a causa técnica e o registro vai ao console", () => {
    const m = mensagemDeErroAuth({ message: "algo novo e estranho", status: 418 });
    expect(m).toContain("algo novo e estranho");
    expect(m).toContain("HTTP 418");
    expect(console.error).toHaveBeenCalled();
  });

  it("sem erro nenhum, ainda diz que é desconhecido (nunca string vazia)", () => {
    expect(mensagemDeErroAuth(null)).toContain("erro desconhecido");
    expect(detalheTecnico(undefined)).toBe("erro desconhecido");
  });
});
