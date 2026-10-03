// ─── lib/documentos/relatorioLote.ts — o CSV do lote (rastreabilidade) ──────
//
// Pedido da Telma (03/10/2026): "manter o relatório de conferência arquivado para
// rastreabilidade". Cada lote da Central pode ser baixado como CSV com, por arquivo
// e por lançamento ligado: arquivo, grupo, lançamento, data, fornecedor, valor,
// confiança, motivo e o que de fato aconteceu (vinculado, ignorado, pendente, erro).
// Como a Central NÃO persiste nada (Fase 1), este arquivo é o único registro do lote
// — o botão fica à vista, não escondido.

import { csvPtBr, dataBr } from "@/lib/pacoteContabil";
import { FIN_ANEXO_TIPO_LABEL } from "@/services/finService";
import { destinosEfetivos, grupoDe, type GrupoUI, type ItemCentral } from "./fluxo";

const GRUPO_ROTULO: Record<GrupoUI, string> = {
  automatico: "Vinculação automática",
  revisao: "Revisão necessária",
  nao_identificado: "Não identificado",
  ja_anexado: "Já anexado",
};

const valorBr = (n: number) => n.toFixed(2).replace(".", ",");

function situacao(it: ItemCentral, erro?: string): string {
  if (erro) return `ERRO: ${erro}`;
  if (it.gravado) return "Vinculado";
  if (it.acao === "ignorado") return "Ignorado";
  if (it.acao === "confirmado") return "Confirmado (não gravado)";
  return "Pendente";
}

export function csvDoLote(itens: ItemCentral[], erros: Map<string, string> = new Map()): string {
  const cab = ["Arquivo", "Grupo", "Tipo do documento", "Lançamento", "Data", "Fornecedor", "Conta", "Valor (R$)", "Confiança", "Motivo da correspondência", "Situação"];
  const linhas: string[][] = [cab];
  for (const it of itens) {
    const grupo = grupoDe(it);
    const r = it.resultado;
    const sit = situacao(it, erros.get(it.id));
    const destinos = destinosEfetivos(it);
    // melhor candidato (ou o escolhido) — o motivo é o do candidato de topo
    const topo = r?.candidatos[0];
    const motivo = it.escolhido ? "lançamento escolhido pelo usuário"
      : r?.parcelamento ? r.resumo
      : topo?.motivos.join("; ") ?? r?.resumo ?? it.erro ?? "";
    const conf = r ? `${r.confianca}%` : "";
    const base = [it.caminho, grupo ? GRUPO_ROTULO[grupo] : "Não lido", FIN_ANEXO_TIPO_LABEL[it.tipo]];

    if (destinos.length === 0) {
      const l = topo?.lancamento;
      linhas.push([...base, l?.id.slice(0, 8) ?? "", l ? dataBr(l.dia) : "", l?.fornecedorNome ?? "", l?.contaNome ?? "", l ? valorBr(l.valor) : "", conf, motivo, sit]);
      continue;
    }
    for (const l of destinos) {
      linhas.push([...base, l.id.slice(0, 8), dataBr(l.dia), l.fornecedorNome, l.contaNome, valorBr(l.valor), conf, motivo, sit]);
    }
  }
  return csvPtBr(linhas);
}
