// Campos de arquivo da Tesouraria que NÃO limpavam (auditoria, 27/10/2026, F-09). Trava, no código, que cada campo continua tratado:
//   · visível e que continua na tela depois de salvar → `key` que muda a cada envio (o <input type="file"> não é controlado: zerar o estado não apaga o nome do arquivo que a tela mostra);
//   · escondido (clica-se num rótulo) → `e.target.value = ""` ao escolher, para o MESMO arquivo poder ser escolhido de novo e disparar a leitura outra vez.
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const ler = (f: string) => fs.readFileSync(`src/components/financas/${f}`, "utf8");

describe("campos de arquivo que ficam na tela depois de salvar", () => {
  it.each(["AnexosLancamentoDialog.tsx", "DeclaracaoDoTerceiroCard.tsx", "CancelarNotaDialog.tsx"])("%s remonta o campo (key) a cada envio ou abertura", (f) => {
    const c = ler(f);
    expect(c).toContain("chaveDoArquivo");
    expect(c).toMatch(/key=\{chaveDoArquivo\}/);
    expect(c).toMatch(/setChaveDoArquivo\(k => k \+ 1\)/);
  });
});

describe("campos de arquivo escondidos", () => {
  it.each(["LancamentoForm.tsx", "TransferenciaForm.tsx", "ConciliacaoOFXDialog.tsx"])("%s zera o campo depois de escolher", (f) => {
    expect(ler(f)).toContain('e.target.value = ""');
  });
});

describe("os que já estavam certos continuam", () => {
  it("Quitação, Documentos do fechamento e Importar fatura zeram o campo", () => {
    expect(ler("QuitacaoCard.tsx")).toContain('e.target.value = ""');
    expect(ler("DocumentosDoFechamento.tsx")).toContain('entrada.current.value = ""');
    expect(ler("ImportacaoFaturaDialog.tsx")).toContain('e.target.value = ""');
  });
});
