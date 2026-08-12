import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Faz login uma vez e guarda a sessao em e2e/.sessao.json, para os testes de
 * layout nao repetirem o login em cada rota.
 *
 * As credenciais vem do ambiente e nunca do repositorio:
 *
 *   E2E_TELEFONE   telefone com DDD, so digitos  (o login do app e por telefone)
 *   E2E_SENHA      senha da mesma conta
 *
 * Use uma conta de teste, nao a sua. O arquivo de sessao contem um token de
 * acesso valido — esta no .gitignore e nao deve sair da maquina.
 */

export const ARQUIVO_SESSAO = path.join(process.cwd(), "e2e", ".sessao.json");

setup("entrar no sistema", async ({ page }) => {
  const telefone = process.env.E2E_TELEFONE;
  const senha    = process.env.E2E_SENHA;

  if (!telefone || !senha) {
    // Sem credenciais o preparo nao falha: grava uma sessao vazia e deixa cada
    // teste se pular sozinho com a mensagem explicando o que falta. Falhar aqui
    // pintaria a suite inteira de vermelho por configuracao ausente, que e
    // diferente de defeito no produto.
    fs.mkdirSync(path.dirname(ARQUIVO_SESSAO), { recursive: true });
    fs.writeFileSync(ARQUIVO_SESSAO, JSON.stringify({ cookies: [], origins: [] }), "utf8");
    setup.skip(true, "E2E_TELEFONE e E2E_SENHA nao definidos — veja e2e/README.md");
    return;
  }

  await page.goto("/auth");
  await page.getByLabel(/telefone/i).fill(telefone);
  await page.getByLabel(/^senha$/i).fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();

  // O app so esta pronto quando saiu de /auth por conta propria.
  await page.waitForURL(url => !new URL(url).pathname.startsWith("/auth"), { timeout: 20_000 });

  const destino = new URL(page.url()).pathname;
  expect(
    destino,
    `Login levou a ${destino}. Se for /aceite-lgpd, entre uma vez a mao com essa ` +
      `conta e aceite a politica de privacidade — o teste nao aceita termos por voce.`,
  ).not.toBe("/aceite-lgpd");

  await page.context().storageState({ path: ARQUIVO_SESSAO });
});
