// ─── lib/hipoteseOfx.ts — "o que EU acredito que esta linha representa" (puro, testado) ───────────────────────
//
// Pedido dela (08/10/2026): "o tesoureiro não deve interpretar dados bancários; o sistema deve interpretar e apresentar hipóteses
// claras para validação". Para cada linha do extrato, esta função responde: o que entrou, quem o sistema acredita que é, por que
// acredita, o que sugere fazer e com que confiança. A tela só desenha o que sai daqui.

import type { Banda, Sugestao } from "./classificacaoOfx";
import { ehDepositoEmDinheiro, type OutraPonta, type ProvavelTransferencia } from "./transferenciaOfx";

/** "Ofertas para Missões" → "Missões"; "Dizimos" → "Dízimo": o nome curto cabe num botão e numa lista. */
export function nomeCurtoDaCategoria(nome: string): string {
  if (/miss/i.test(nome)) return "Missões";
  if (/^diz/i.test(nome)) return "Dízimo";
  if (/^ofert/i.test(nome)) return "Oferta";
  return nome;
}

export type TomDaHipotese = "pessoa" | "fornecedor" | "transferencia" | "missionaria" | "deposito" | "documento" | "desconhecida";

export interface HipoteseDaLinha {
  tom: TomDaHipotese;
  /** "Pessoa identificada", "Possível transferência interna", "Documento não identificado"… */
  titulo: string;
  /** ✅ certeza alta · ⚠ pede conferência · ❌ não sei */
  nivel: Banda;
  /** quem o sistema acredita que é */
  quem?: { nome: string; papel: "Pessoa" | "Fornecedor" };
  /** as últimas classificações desse favorecido, da mais recente para a mais antiga */
  anteriores: string[];
  valor: number;
  tipo: "entrada" | "saida";
  /** o que sugere fazer: o nome da categoria, ou "Transferência entre contas" */
  sugestao?: string;
  confianca: number;
  /** por que acredita nisso */
  porques: string[];
  /** a ressalva que a tesouraria precisa ler (ex.: "apenas sugestão") */
  aviso?: string;
  transferencia?: { origem: string; destino: string; data?: string; ligada: boolean; outras: string[] };
}

export interface EntradaDaHipotese {
  tx: { tipo: "entrada" | "saida"; valor: number; data: string; memo: string };
  sugestao: Sugestao;
  contaNome: string;
  provavel?: ProvavelTransferencia;
  alvo: OutraPonta | null;
  /** a linha está sendo tratada como transferência (sugerida pelo motor ou escolhida pela tesouraria) */
  modoTransferencia: boolean;
  sugeridaComoTransferencia: boolean;
  /** o favorecido que vale agora (o sugerido ou o que a tesouraria trocou) */
  favorecido?: { nome: string; papel: "pessoa" | "fornecedor" } | null;
  /** a categoria que vale agora (sugerida ou escolhida) */
  categoriaId?: string;
  nomeDaCategoria: (id?: string | null) => string;
}

const diasEntre = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000));

export function montarHipotese(e: EntradaDaHipotese): HipoteseDaLinha {
  const { tx, sugestao: s } = e;
  const anteriores = (s.historico ?? []).map(h => (h.categoriaId ? nomeCurtoDaCategoria(e.nomeDaCategoria(h.categoriaId)) : "sem categoria"));
  const categoria = e.categoriaId ? nomeCurtoDaCategoria(e.nomeDaCategoria(e.categoriaId)) : undefined;
  const base = { valor: tx.valor, tipo: tx.tipo, anteriores, confianca: s.confianca, nivel: s.banda };
  const quem = e.favorecido ? { nome: e.favorecido.nome, papel: e.favorecido.papel === "pessoa" ? "Pessoa" as const : "Fornecedor" as const } : undefined;

  // 1. transferência interna (a primeira hipótese)
  if (e.modoTransferencia) {
    const entrada = tx.tipo === "entrada";
    const outra = e.alvo?.contaNome;
    const origem = entrada ? (outra ?? "escolha a origem") : e.contaNome;
    const destino = entrada ? e.contaNome : (outra ?? "escolha o destino");
    const casa = !!e.provavel && !!e.alvo && e.provavel.contaId === e.alvo.contaId;
    const porques: string[] = [];
    if (casa && e.provavel) {
      const dias = diasEntre(e.provavel.data, tx.data);
      porques.push(`Existe ${entrada ? "saída" : "entrada"} correspondente em ${e.provavel.contaNome}: o mesmo valor, ${dias === 0 ? "no mesmo dia" : `com ${dias} dia${dias > 1 ? "s" : ""} de diferença`}.`);
      porques.push(e.alvo!.lancamentoId ? `Esse lançamento já existe e será ligado ao extrato, sem duplicar.` : "As duas pernas serão criadas.");
      if (e.provavel.outras.length > 0) porques.push(`Também compatível: ${e.provavel.outras.map(o => o.contaNome).join(", ")} — confira a conta.`);
    } else if (e.sugeridaComoTransferencia) {
      porques.push("Só o texto do banco sugere movimento entre contas da igreja; não há lançamento correspondente em outra conta. Confira antes de registrar.");
    } else {
      porques.push("Você escolheu tratar esta linha como transferência entre contas.");
    }
    return {
      ...base, tom: "transferencia", nivel: casa || !e.sugeridaComoTransferencia ? (casa && (e.provavel?.confianca ?? 0) >= 85 ? "identificada" : "revisar") : s.banda,
      titulo: e.sugeridaComoTransferencia ? "Possível transferência interna" : "Transferência entre contas",
      confianca: casa && e.provavel ? e.provavel.confianca : s.confianca, sugestao: "Transferência entre contas", porques,
      transferencia: { origem, destino, data: casa ? e.provavel?.data : undefined, ligada: !!e.alvo?.lancamentoId, outras: e.provavel?.outras.map(o => o.contaNome) ?? [] },
    };
  }

  // 2. texto genérico do banco (boleto/cobrança de vários favorecidos): não se sugere categoria
  if (s.generico && !e.favorecido) {
    return {
      ...base, tom: "documento", titulo: "Documento não identificado", nivel: "nao_identificada",
      porques: ["O texto do banco (cobrança/boleto) serve a vários favorecidos e não diz quem foi pago."],
      aviso: "Aguardando associação com um fornecedor ou com o documento a pagar. Nenhuma categoria é sugerida automaticamente.",
    };
  }

  // 3. PIX terminado em ,10 — a convenção da tesouraria
  if (s.possivelMissoes) {
    return {
      ...base, tom: "missionaria", titulo: "Possível oferta missionária", quem, sugestao: categoria,
      porques: ["Convenção operacional da tesouraria: PIX terminado em ,10.", ...s.motivos.filter(m => !/^PIX terminado em ,10/.test(m)).slice(0, 2)],
      aviso: "Apenas sugestão — nada é reclassificado automaticamente. Confirme Missões ou troque.",
    };
  }

  // 4. alguém conhecido
  if (quem) {
    const certeza = s.banda === "identificada";
    const pessoa = quem.papel === "Pessoa";
    return {
      ...base, tom: pessoa ? "pessoa" : "fornecedor",
      titulo: certeza ? `${pessoa ? "Pessoa" : "Fornecedor"} identificad${pessoa ? "a" : "o"}` : `Possível ${pessoa ? "pessoa" : "fornecedor"}`,
      quem, sugestao: categoria, porques: s.motivos,
    };
  }

  // 5. dinheiro vivo depositado: pode ser o caixa indo para o banco
  if (ehDepositoEmDinheiro(tx.memo)) {
    return {
      ...base, tom: "deposito", titulo: "Depósito em dinheiro", sugestao: categoria,
      porques: ["O banco descreve um depósito em dinheiro/caixa eletrônico."],
      aviso: "Pode ser o Caixa de Envelopes, a Caixinha ou o Caixa sendo depositado no banco — confira se é transferência entre contas antes de lançar como receita.",
    };
  }

  // 6. não sei
  // nome que casa com pessoa E fornecedor: o "não está no cadastro" seria contraditório com o "ambíguo"
  const motivos = s.motivos.some(m => /ambíguo/.test(m)) ? s.motivos.filter(m => !/não está no cadastro/.test(m)) : s.motivos;
  return { ...base, tom: "desconhecida", titulo: "Não identificado", nivel: s.banda, sugestao: categoria, porques: motivos.length ? motivos : ["Sem nome nem padrão conhecido."] };
}
