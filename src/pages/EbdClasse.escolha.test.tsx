// Qual cara da classe cada pessoa recebe (16/10/2026): a equipe da EBD abre a gestão de sempre; voluntário e membro, a visão do aluno; e quem LIDERA o ministério de EBD sem papel
// de liderança não é tratado como aluno nem por um instante (enquanto a pergunta ao banco não responde, a página espera).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let papeis: string[] = [];
let operador = { pode: false, pronto: true };

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (r: string | string[]) => (Array.isArray(r) ? r : [r]).some(x => papeis.includes(x)), pessoaId: "p1", pessoaCarregada: true }) }));
vi.mock("@/hooks/usePodeOperarModulo", () => ({ useOperadorDoModulo: () => operador, usePodeOperarModulo: () => operador.pode }));
vi.mock("@/components/ebd/EbdClasseDoAluno", () => ({ EbdClasseDoAluno: ({ classeId }: { classeId: string }) => <div data-testid="aluno">visão do aluno {classeId}</div> }));
vi.mock("@/hooks/useNavegacao", () => ({ useRotuloDaTela: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null }) } }));
// a tela da equipe fica carregando para sempre: o que interessa aqui é só QUAL das duas foi escolhida
const { espera } = vi.hoisted(() => ({ espera: () => new Promise(() => {}) }));
vi.mock("@/services/ebdService", () => ({
  carregarClasse: espera, esperadosDaClasse: espera, matriculadosDaClasse: espera, moverParaClasse: espera, alertasIdadeDaClasse: espera, manterNaClasse: espera, listarClasses: espera,
  matricular: espera, desmatricular: espera, excluirClasse: espera, desativarClasse: espera, reativarClasse: espera, temProgressaoPorIdade: () => false,
}));
vi.mock("@/components/ebd/ClasseForm", () => ({ ClasseForm: () => null }));
vi.mock("@/components/ebd/ProfessoresBloco", () => ({ ProfessoresBloco: () => null }));
vi.mock("@/components/membros/ficha", () => ({ NomePessoa: () => null }));

import EbdClasse from "./EbdClasse";

let raiz: Root | null = null;
beforeEach(() => { papeis = []; operador = { pode: false, pronto: true }; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={["/ebd/abc"]}><Routes><Route path="/ebd/:classeId" element={<EbdClasse />} /></Routes></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return alvo;
}
const aluno = (el: HTMLElement) => el.querySelector("[data-testid=aluno]");

describe("a página da classe escolhe a cara certa", () => {
  it("voluntário e membro recebem a visão do aluno, com o id da classe da URL", async () => {
    for (const p of ["voluntario", "membro"]) {
      papeis = [p];
      const el = await abrir();
      expect(aluno(el), p).toBeTruthy();
      expect(el.textContent).toContain("abc");
      act(() => raiz?.unmount()); document.body.innerHTML = "";
    }
  });

  it("a equipe (administração, secretaria, pastor, liderança) abre a gestão, não a visão do aluno", async () => {
    for (const p of ["admin", "secretaria", "pastor", "lideranca", "diakonia"]) {
      papeis = [p];
      const el = await abrir();
      expect(aluno(el), p).toBeNull();
      act(() => raiz?.unmount()); document.body.innerHTML = "";
    }
  });

  it("quem lidera o ministério de EBD (sem papel de liderança) abre a gestão; e, enquanto o banco não responde, a página espera em vez de tratá-lo como aluno", async () => {
    papeis = ["voluntario"];
    operador = { pode: true, pronto: true };
    expect(aluno(await abrir())).toBeNull();
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    operador = { pode: false, pronto: false };
    expect(aluno(await abrir())).toBeNull();     // ainda perguntando: nem aluno, nem gestão
  });
});
