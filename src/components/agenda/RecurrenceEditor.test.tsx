// O dia da semana sugerido para um evento semanal é o do EVENTO (16/10/2026), e não o de hoje — e só acompanha a data enquanto a pessoa não escolheu os dias.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecurrenceEditor } from "./RecurrenceEditor";
import type { RecorrenciaRegra } from "@/lib/agenda/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const semanal = (dias: number[]): RecorrenciaRegra => ({ freq: "semanal", intervalo: 1, dias_semana: dias, fim: { tipo: "nunca" } });
const montar = () => { const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo); return (el: React.ReactElement) => act(async () => { raiz!.render(el); }); };

describe("RecurrenceEditor — o dia da semana sugerido", () => {
  it("nova série semanal com um dia diferente do da data: o dia sugerido passa a ser o da data (18/10/2026 é domingo)", async () => {
    const onChange = vi.fn();
    const render = montar();
    await render(<RecurrenceEditor freq="nao" regra={null} onChange={onChange} dataInicio="2026-10-18" />);
    await render(<RecurrenceEditor freq="semanal" regra={semanal([5])} onChange={onChange} dataInicio="2026-10-18" />);   // a sexta de hoje, sugerida antes
    expect(onChange).toHaveBeenCalledWith("semanal", expect.objectContaining({ dias_semana: [0] }));
  });

  it("se a data do evento muda, o dia sugerido acompanha (enquanto ninguém mexeu nos botões)", async () => {
    const onChange = vi.fn();
    const render = montar();
    await render(<RecurrenceEditor freq="nao" regra={null} onChange={onChange} dataInicio="2026-10-18" />);
    await render(<RecurrenceEditor freq="semanal" regra={semanal([0])} onChange={onChange} dataInicio="2026-10-18" />);
    expect(onChange).not.toHaveBeenCalled();     // já bate com o domingo
    await render(<RecurrenceEditor freq="semanal" regra={semanal([0])} onChange={onChange} dataInicio="2026-10-21" />);   // quarta
    expect(onChange).toHaveBeenCalledWith("semanal", expect.objectContaining({ dias_semana: [3] }));
  });

  it("quem escolheu os dias não é contrariado: série JÁ existente ao abrir o editor (edição) fica como está", async () => {
    const onChange = vi.fn();
    const render = montar();
    await render(<RecurrenceEditor freq="semanal" regra={semanal([4])} onChange={onChange} dataInicio="2026-10-18" />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("vários dias marcados nunca são trocados", async () => {
    const onChange = vi.fn();
    const render = montar();
    await render(<RecurrenceEditor freq="nao" regra={null} onChange={onChange} dataInicio="2026-10-18" />);
    await render(<RecurrenceEditor freq="semanal" regra={semanal([1, 3])} onChange={onChange} dataInicio="2026-10-18" />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
