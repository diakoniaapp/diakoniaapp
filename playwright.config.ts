import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright cobre o que o vitest nao alcanca: layout de verdade.
 * O vitest do projeto roda em jsdom, que nao calcula posicao nem tamanho —
 * getBoundingClientRect() devolve zero em tudo. Testes de transbordo,
 * alvo de toque ou sobreposicao so tem sentido num navegador real.
 *
 * Os dois convivem sem se atrapalhar: o vitest.config.ts inclui apenas
 * `src/**`, e estes ficam em `e2e/`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    // Rastro so do que falhou: um teste de layout que quebra e muito mais facil
    // de entender vendo a tela do que lendo a mensagem.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Faz login uma vez e guarda a sessao; sem isto cada rota repetiria o login.
    { name: "sessao", testMatch: /sessao\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.sessao.json" },
      dependencies: ["sessao"],
    },
  ],

  // Sobe o dev server sozinho, e reaproveita um que ja esteja de pe.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
