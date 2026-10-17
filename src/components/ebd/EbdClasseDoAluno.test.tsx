// A página da classe, vista pelo aluno (16/10/2026): abre para quem está matriculado (ou ensina), é só de leitura e manda para a Home quem não é da classe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ehPaginaDeClasseEbd, papeisExigidosPara, ROLES_LIDERES } from "@/components/layout/navConfig";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLASSE = "11111111-2222-3333-4444-555555555555";
let matricula: { data_matricula: string } | null = null;
let professor: { tipo: string } | null = null;
const erros = vi.fn();
const irPara = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabela: string) => {
    const p: any = new Proxy({}, { get: (_t, nome: string) => {
      if (nome === "maybeSingle") return async () => ({ data: tabela === "ebd_matriculas" ? (globalThis as any).__mat : (globalThis as any).__prof, error: null });
      return () => p;
    } });
    return p;
  };
  return { supabase: { from: (t: string) => consulta(t) } };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ pessoaId: "p1", pessoaCarregada: true, hasRole: () => false }) }));
vi.mock("@/hooks/useNavegacao", () => ({ useRotuloDaTela: () => {} }));
vi.mock("@/services/ebdService", () => ({
  carregarClasse: async () => ({ id: CLASSE, nome: "Jovens", idade_min: 18, idade_max: 29, genero: "misto", descricao: "Estudo do livro de Romanos.", cor: null, ordem: 60, ativo: true }),
}));
vi.mock("@/services/meuEspacoService", () => ({
  minhaEbd: async () => ({ classeId: CLASSE, classe: "Jovens", cor: null, souProfessor: false, tipoProfessor: null, aulasComChamada: 4, aulasLancadas: 5, presencas: 3, ultimaChamada: null }),
}));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => erros(...a), success: vi.fn(), info: vi.fn() } }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<object>()), useNavigate: () => irPara }));

import { EbdClasseDoAluno } from "./EbdClasseDoAluno";

let raiz: Root | null = null;
beforeEach(() => { matricula = null; professor = null; erros.mockClear(); irPara.mockClear(); });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir() {
  (globalThis as any).__mat = matricula; (globalThis as any).__prof = professor;
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter><EbdClasseDoAluno classeId={CLASSE} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}

describe("a página da classe, para o aluno", () => {
  it("matriculado: vê a classe, o perfil, desde quando está nela e a própria frequência — e nada de gestão", async () => {
    matricula = { data_matricula: "2026-03-08" };
    const el = await abrir();
    const t = el.textContent!;
    expect(t).toContain("Jovens");
    expect(t).toContain("18–29 anos");
    expect(t).toContain("matriculado nesta classe desde 08/03/2026");
    expect(t).toContain("Estudo do livro de Romanos.");
    expect(t).toContain("3 de 4 chamadas");
    for (const gestao of ["Matriculados", "Esperados", "Fazer chamada", "Relatório mensal", "Campanhas", "Editar", "Excluir", "Desativar", "Buscar pessoa"]) expect(t, gestao).not.toContain(gestao);
    expect(irPara).not.toHaveBeenCalled();
  });

  it("professor da classe também entra, e a página diz que ele ensina (sem frequência de aluno)", async () => {
    professor = { tipo: "auxiliar" };
    const el = await abrir();
    expect(el.textContent).toContain("Você ensina nesta classe — professor auxiliar.");
  });

  it("quem não é da classe volta à Home com o aviso, e a classe alheia não aparece", async () => {
    const el = await abrir();
    expect(erros).toHaveBeenCalledWith("Você não está matriculado nesta classe.");
    expect(irPara).toHaveBeenCalledWith("/", { replace: true });
    expect(el.textContent).not.toContain("Jovens");
  });
});

describe("a guarda de rota da classe", () => {
  it("só a PÁGINA da classe sai da guarda de liderança — a página decide; chamada, relatórios e campanhas continuam da equipe", () => {
    expect(ehPaginaDeClasseEbd(`/ebd/${CLASSE}`)).toBe(true);
    expect(ehPaginaDeClasseEbd(`/ebd/${CLASSE}?aba=x`)).toBe(true);
    expect(papeisExigidosPara(`/ebd/${CLASSE}`)).toBeUndefined();
    for (const rota of ["/ebd", "/ebd/relatorio-mensal", "/ebd/acompanhamento", `/ebd/${CLASSE}/chamada`, `/ebd/${CLASSE}/relatorio-mensal`, `/ebd/${CLASSE}/campanhas`, `/ebd/${CLASSE}/chamada/relatorio`]) {
      expect(ehPaginaDeClasseEbd(rota), rota).toBe(false);
      expect(papeisExigidosPara(rota), rota).toEqual(ROLES_LIDERES);
    }
  });
});
