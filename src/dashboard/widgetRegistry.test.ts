// ─── Teste do registry: nenhum widget sem casa ────────────────────────────
//
// Existe por causa de um defeito real, e não por zelo.
//
// Em 01/09/2026 a Home deixou de ser painel de trabalho e virou tela pessoal.
// Medido naquele dia, por importação: 13 dos 16 widgets do registry apareciam
// SOMENTE no `Dashboard.tsx`. Se a troca tivesse sido feita sem olhar, o
// Acolhimento, os Alertas inteligentes, os Cadastros a corrigir e a Agenda
// fiscal teriam saído do sistema inteiro — sem erro de compilação, sem tela
// quebrada, sem nada. Só sumiriam.
//
// O campo `paineis` deu endereço a cada um. Este teste garante que o próximo
// widget nasça com endereço também: um bloco sem painel não aparece em lugar
// nenhum, e essa é a falha que não avisa.

import { describe, it, expect } from "vitest";
import { widgetRegistry, getWidgetsDoPainel, type PainelDoWidget } from "./widgetRegistry";

const PAINEIS: PainelDoWidget[] = ["pastoral", "secretaria", "estrategico", "financas"];

describe("widgetRegistry", () => {
  it("todo widget ativo tem painel — ou diz quem o mostra no lugar", () => {
    // A exceção é declarada, não presumida. O `AgendaDoDia` sai dos painéis
    // porque o Painel Pastoral já o monta ligado à tira de sete dias, e
    // pendurá-lo também aqui produzia a agenda DUAS vezes na mesma tela —
    // conferido: dois títulos "Acontecendo hoje" e o mesmo Projeto Social das
    // 10:30 listado nos dois.
    //
    // Sem `renderizadoPor`, "vazio de propósito" e "esqueceram de preencher"
    // seriam indistinguíveis, e este teste teria virado um teste que passa.
    const orfaos = widgetRegistry
      .filter(w => w.ativo !== false)
      .filter(w => !w.paineis || w.paineis.length === 0)
      .filter(w => !w.renderizadoPor)
      .map(w => w.id);
    expect(orfaos).toEqual([]);
  });

  it("os painéis declarados existem", () => {
    const invalidos = widgetRegistry
      .flatMap(w => (w.paineis ?? []).map(p => ({ id: w.id, p })))
      .filter(({ p }) => !PAINEIS.includes(p));
    expect(invalidos).toEqual([]);
  });

  it("todo widget ativo declara alguma permissão", () => {
    // Widget sem permissão nenhuma nunca passa pelo filtro de
    // `getWidgetsParaUsuario` — é outro jeito de nascer invisível.
    const semPermissao = widgetRegistry
      .filter(w => w.ativo !== false)
      .filter(w => w.permissoes.length === 0)
      .map(w => w.id);
    expect(semPermissao).toEqual([]);
  });

  it("ids não se repetem — a chave do React e o desempate dependem disso", () => {
    const ids = widgetRegistry.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("quem tem toda permissão vê, somando os painéis, todos os widgets ativos", () => {
    // A garantia que importa: nenhum bloco fica inalcançável por não ter sido
    // pendurado em painel nenhum.
    const todas = new Set(widgetRegistry.flatMap(w => w.permissoes));
    const vistos = new Set(
      PAINEIS.flatMap(p => getWidgetsDoPainel({ permissoes: todas }, p)).map(w => w.id),
    );
    const ativos = widgetRegistry
      .filter(w => w.ativo !== false)
      // Quem declara `renderizadoPor` aparece por fora do registry, e por
      // isso não deve aparecer por dentro dele. Ver o teste acima.
      .filter(w => !w.renderizadoPor)
      .map(w => w.id);
    expect([...ativos].filter(id => !vistos.has(id))).toEqual([]);
  });

  it("quem é renderizado por fora não aparece em painel nenhum", () => {
    // O outro lado da moeda: declarar `renderizadoPor` E deixar um painel
    // preenchido traria de volta exatamente a duplicação que o campo existe
    // para encerrar.
    const emDobro = widgetRegistry
      .filter(w => w.renderizadoPor && (w.paineis ?? []).length > 0)
      .map(w => w.id);
    expect(emDobro).toEqual([]);
  });
});
