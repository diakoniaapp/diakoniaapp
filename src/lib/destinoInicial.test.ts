// ─── Teste do destino do login ────────────────────────────────────────────
//
// Esta regra decide onde CADA pessoa da igreja começa o dia. Errar aqui não
// quebra tela nenhuma: manda gente para o lugar errado em silêncio, e a pessoa
// conclui que o sistema não tem o que ela procura.
//
// O caso que originou tudo, dito pela igreja: "hoje o que temos é o meu
// painel, administrador do sistema que vê tudo". Quem lidera um ministério
// caía na Home genérica porque a decisão olhava só o papel.

import { describe, it, expect, vi, beforeEach } from "vitest";

// O serviço vai ao banco; aqui o que se testa é a REGRA de composição.
const meusMinisterios = vi.fn();
vi.mock("@/services/painelMinisterioService", () => ({
  meusMinisterios: (...a: unknown[]) => meusMinisterios(...a),
}));

import { destinoInicial } from "./destinoInicial";
import type { AppRole } from "@/hooks/useAuth";

const UM = [{ id: "min-1", nome: "Administração", sigla: null, cor: null, comoLidero: "Líder", areasQueLidero: [] }];
const DOIS = [
  ...UM,
  { id: "min-2", nome: "Pastoral", sigla: null, cor: null, comoLidero: "Líder de área", areasQueLidero: ["PGM"] },
];

beforeEach(() => { meusMinisterios.mockReset(); meusMinisterios.mockResolvedValue([]); });

describe("destinoInicial", () => {
  it("o papel manda: a secretária vai para a bancada dela", async () => {
    meusMinisterios.mockResolvedValue(UM);
    expect(await destinoInicial(["secretaria"] as AppRole[], "p1")).toBe("/painel-secretaria");
    // E nem chega a perguntar pela liderança: quem tem bancada por papel já
    // tem destino, e a consulta seria viagem perdida no caminho do login.
    expect(meusMinisterios).not.toHaveBeenCalled();
  });

  it("o pastor titular vai para o Painel Pastoral", async () => {
    meusMinisterios.mockResolvedValue(UM);
    expect(await destinoInicial(["diakonia"] as AppRole[], "p1")).toBe("/painel-pastoral");
    expect(await destinoInicial(["pastor"] as AppRole[], "p1")).toBe("/painel-pastoral");
  });

  it("quem lidera UM ministério cai na bancada dele", async () => {
    // É o caso do Caio Marcelo, líder do Ministério de Administração.
    meusMinisterios.mockResolvedValue(UM);
    expect(await destinoInicial(["lideranca"] as AppRole[], "p1")).toBe("/ministerios/min-1/painel");
  });

  it("quem lidera DOIS cai na Home — escolher por ela seria inventar", async () => {
    // Não é caso raro: a única conta que lidera algo hoje lidera três áreas em
    // dois ministérios. Na Home, "Seus painéis" mostra os dois lado a lado.
    meusMinisterios.mockResolvedValue(DOIS);
    expect(await destinoInicial(["lideranca"] as AppRole[], "p1")).toBe("/");
  });

  it("quem não lidera nada cai na Home", async () => {
    // O caso do Bruno: papel de liderança, nenhuma área sob ele.
    expect(await destinoInicial(["lideranca"] as AppRole[], "p1")).toBe("/");
    expect(await destinoInicial(["voluntario"] as AppRole[], "p1")).toBe("/");
    expect(await destinoInicial([] as AppRole[], "p1")).toBe("/");
  });

  it("administrar o sistema não é bancada — admin sozinho cai na Home", async () => {
    expect(await destinoInicial(["admin"] as AppRole[], "p1")).toBe("/");
  });

  it("admin que lidera um ministério vai para a bancada", async () => {
    // `admin` é o que a pessoa PODE; liderar é o que ela FAZ.
    meusMinisterios.mockResolvedValue(UM);
    expect(await destinoInicial(["admin"] as AppRole[], "p1")).toBe("/ministerios/min-1/painel");
  });

  it("sem ficha ligada, cai na Home sem consultar", async () => {
    expect(await destinoInicial(["lideranca"] as AppRole[], null)).toBe("/");
    expect(meusMinisterios).not.toHaveBeenCalled();
  });

  it("falha na consulta não prende ninguém no login", async () => {
    // Uma consulta acessória não pode ser mais importante que entrar. O
    // destino cai para o de antes, que é a Home.
    meusMinisterios.mockRejectedValue(new Error("rede caiu"));
    await expect(destinoInicial(["lideranca"] as AppRole[], "p1")).resolves.toBe("/");
  });
});
