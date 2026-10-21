// Os modais recentes do Financeiro respondem ao X, ao ESC, ao clique fora e ao Cancelar (relato de 20/10/2026: "o modal não fecha"; pedido: consistência entre todos).
// Cada um é montado de verdade (só o banco é de mentira) e fechado pelos quatro caminhos; `onFechar` tem que ser chamado.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// banco de mentira: qualquer consulta devolve vazio, sem erro
vi.mock("@/integrations/supabase/client", () => {
  const cadeia: any = new Proxy(function () {}, {
    get: (_, prop: string) => {
      if (prop === "then") return (res: (v: unknown) => unknown) => res({ data: [], error: null, count: 0 });
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
      return () => cadeia;
    },
    apply: () => cadeia,
  });
  return { supabase: { from: () => cadeia, rpc: () => cadeia, auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, storage: { from: () => cadeia } }, supabaseRel: { from: () => cadeia } };
});
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AAAA" } }));
vi.mock("@/services/envioDePagamentosService", () => ({
  carregarItensDeEnvio: async () => [], buscarPessoasComEmail: async () => [], baixarPacote: async () => ({ arquivos: 0, semDocumento: [], falhas: [] }), baixarResumo: async () => {},
  lerPreferencias: () => ({ destinatarios: [], saudacao: null, introducao: null, incluirResumo: true, citarSemLinha: true, baixarZipJunto: true }), guardarPreferencias: () => {},
}));

import { NotaQuitadaDialog } from "./NotaQuitadaDialog";
import { PagarReembolsoDialog } from "./PagarReembolsoDialog";
import { QuitacaoDialog } from "./QuitacaoDialog";
import { DocumentacaoDaObrigacao } from "./DocumentacaoDaObrigacao";
import { PrepararEnvioDialog } from "./envio/PrepararEnvioDialog";
import { ImprimirExtratoDialog } from "./extrato/ImprimirExtratoDialog";
import { PERFIL_PADRAO } from "@/lib/perfilDeImpressaoDoExtrato";

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const lancamento = { id: "l1", data: "2026-10-05", valor: 278.22, tipo: "saida", status: "conciliado", conta_id: "c1", descricao: "Verisure", fornecedor_nome: "Verisure", forma_pagamento: null } as never;
const alvoReembolso = { quitacaoId: "q1", obrigacaoId: "o1", responsavel: "terceiro", pessoaId: null, fornecedorId: null, responsavelNome: "Fulano", valorDaObrigacao: 100, reembolsado: 0, saldoAReembolsar: 100 } as never;

interface Caso { nome: string; temCancelar: boolean; montar: (onFechar: () => void) => JSX.Element }
const CASOS: Caso[] = [
  { nome: "Imprimir extrato", temCancelar: true, montar: f => <ImprimirExtratoDialog aberto onFechar={f} perfil={PERFIL_PADRAO} onMudar={() => {}} onImprimir={() => {}} /> },
  { nome: "NF quitada por terceiro", temCancelar: true, montar: f => <NotaQuitadaDialog aberto onFechar={f} onFeito={() => {}} /> },
  { nome: "Pagar reembolso", temCancelar: true, montar: f => <PagarReembolsoDialog alvo={alvoReembolso} onFechar={f} onFeito={() => {}} /> },
  { nome: "Corrigir quitação", temCancelar: true, montar: f => <QuitacaoDialog alvo={{ id: "o1", descricao: "Verisure", valor: 278.22 }} onFechar={f} onFeito={() => {}} /> },
  { nome: "Documentação", temCancelar: false, montar: f => <DocumentacaoDaObrigacao lancamento={lancamento} onFechar={f} /> },
  { nome: "Preparar envio", temCancelar: false, montar: f => <PrepararEnvioDialog aberto onFechar={f} candidatas={[]} hojeYmd="2026-10-20" onAbrirObrigacao={() => {}} /> },
];

async function abrir(c: Caso) {
  const onFechar = vi.fn();
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(c.montar(onFechar)); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  expect(document.querySelector('[role="dialog"]'), `${c.nome} abriu`).toBeTruthy();
  return onFechar;
}
const botoes = () => [...document.querySelectorAll('[role="dialog"] button')] as HTMLButtonElement[];

for (const c of CASOS) {
  describe(`${c.nome} — fecha`, () => {
    it("pelo X do canto", async () => {
      const onFechar = await abrir(c);
      const x = botoes().find(b => /^(Close|Fechar)$/.test((b.textContent ?? "").trim()))!;
      expect(x, "o X existe").toBeTruthy();
      await act(async () => { x.click(); });
      expect(onFechar).toHaveBeenCalledTimes(1);
    });
    it("pelo ESC", async () => {
      const onFechar = await abrir(c);
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(onFechar).toHaveBeenCalled();
    });
    it("pelo clique fora (no fundo escuro)", async () => {
      const onFechar = await abrir(c);
      const fundo = document.querySelector("[data-state=open].fixed.inset-0") as HTMLElement;
      expect(fundo, "o fundo escuro existe").toBeTruthy();
      await act(async () => {
        fundo.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        fundo.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
        fundo.click();
      });
      expect(onFechar).toHaveBeenCalled();
    });
    if (c.temCancelar) {
      it("pelo botão Cancelar", async () => {
        const onFechar = await abrir(c);
        const cancelar = botoes().find(b => (b.textContent ?? "").trim() === "Cancelar")!;
        expect(cancelar, "o Cancelar existe e está habilitado").toBeTruthy();
        expect(cancelar.disabled).toBe(false);
        await act(async () => { cancelar.click(); });
        expect(onFechar).toHaveBeenCalledTimes(1);
      });
    }
  });
}
