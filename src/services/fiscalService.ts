import { supabase } from "@/integrations/supabase/client";

export type FiscalEsfera = "federal" | "municipal" | "estadual";
export type FiscalPeriodicidade = "mensal" | "anual" | "trimestral";
export type FiscalStatus = "pendente" | "pago" | "atrasado" | "dispensado" | "enviado";

export interface FiscalTipoObrigacao {
  codigo: string;
  nome: string;
  descricao: string | null;
  esfera: FiscalEsfera;
  periodicidade: FiscalPeriodicidade;
  dia_vencimento: number | null;
  mes_anual: number | null;
  requer_funcionarios: boolean;
  icone: string;
  cor: string;
}

export interface FiscalConfig {
  id: number;
  tipo_entidade: string;
  municipio: string | null;
  uf: string | null;
  inscricao_municipal: string | null;
  cnae_principal: string | null;
  possui_funcionarios: boolean;
  dia_iss_municipal: number;
  alerta_dias_antes: number;
  whatsapp_tesouraria: string | null;
  atualizado_em: string;
}

export interface FiscalObrigacaoAtiva {
  codigo_obrigacao: string;
  ativa: boolean;
  dia_vencimento_custom: number | null;
  categoria_financeira_id: string | null;
  centro_custo_id: string | null;
  conta_pagadora_id: string | null;
  observacao: string | null;
}

export interface FiscalAgendaItem {
  id: string;
  codigo_obrigacao: string;
  competencia: string;
  vencimento: string;
  valor_esperado: number | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  lancamento_id: string | null;
  status: FiscalStatus;
  observacao: string | null;
  // Joined
  tipo?: FiscalTipoObrigacao;
}

// ─── Configuração ─────────────────────────────────────────────────────
export async function carregarConfig(): Promise<FiscalConfig | null> {
  const { data, error } = await supabase
    .from("fiscal_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as FiscalConfig | null;
}

export async function atualizarConfig(patch: Partial<FiscalConfig>): Promise<void> {
  const { error } = await supabase
    .from("fiscal_config")
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ─── Tipos & Obrigações ativas ────────────────────────────────────────
export async function listarTiposObrigacao(): Promise<FiscalTipoObrigacao[]> {
  const { data, error } = await supabase
    .from("fiscal_tipos_obrigacao")
    .select("*")
    .order("esfera")
    .order("codigo");
  if (error) throw error;
  return (data ?? []) as FiscalTipoObrigacao[];
}

export async function listarObrigacoesAtivas(): Promise<FiscalObrigacaoAtiva[]> {
  const { data, error } = await supabase
    .from("fiscal_obrigacoes_ativas")
    .select("*");
  if (error) throw error;
  return (data ?? []) as FiscalObrigacaoAtiva[];
}

export async function definirObrigacaoAtiva(
  codigo: string,
  ativa: boolean,
  extras: Partial<FiscalObrigacaoAtiva> = {},
): Promise<void> {
  const { error } = await supabase
    .from("fiscal_obrigacoes_ativas")
    .upsert({
      codigo_obrigacao: codigo,
      ativa,
      ...extras,
      atualizado_em: new Date().toISOString(),
    });
  if (error) throw error;
}

// ─── Agenda fiscal ────────────────────────────────────────────────────
/** Gera agenda no intervalo dado (idempotente). */
export async function gerarAgenda(inicio: string, fim: string) {
  const { data, error } = await supabase.rpc("fiscal_gerar_agenda", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw error;
  return data ?? [];
}

export interface FiltroAgenda {
  inicio?: string;
  fim?: string;
  status?: FiscalStatus;
  codigo_obrigacao?: string;
}

export async function listarAgenda(f: FiltroAgenda = {}): Promise<FiscalAgendaItem[]> {
  let q = supabase
    .from("fiscal_agenda")
    .select("*, tipo:fiscal_tipos_obrigacao!codigo_obrigacao(codigo,nome,icone,cor,esfera)")
    .order("vencimento");
  if (f.inicio) q = q.gte("vencimento", f.inicio);
  if (f.fim) q = q.lte("vencimento", f.fim);
  if (f.status) q = q.eq("status", f.status);
  if (f.codigo_obrigacao) q = q.eq("codigo_obrigacao", f.codigo_obrigacao);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FiscalAgendaItem[];
}

export async function darBaixaObrigacao(
  agendaId: string,
  dados: { valor_pago: number; data_pagamento: string; observacao?: string },
): Promise<void> {
  const { error } = await supabase
    .from("fiscal_agenda")
    .update({
      ...dados,
      status: "pago",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", agendaId);
  if (error) throw error;
}

export async function dispensarObrigacao(agendaId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from("fiscal_agenda")
    .update({
      status: "dispensado",
      observacao: motivo,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", agendaId);
  if (error) throw error;
}

// ═══════════════════════════════════════════════════════════════════════
// FB-2: Alertas + Integração financeira + WhatsApp
// ═══════════════════════════════════════════════════════════════════════

export type Severidade = "atrasado" | "urgente" | "proximo" | "futuro" | "pago";

export interface AlertaFiscalDashboard {
  id: string;
  codigo: string;
  nome: string;
  icone: string;
  vencimento: string;
  dias_para_vencer: number;
  severidade: Severidade;
  valor_esperado: number | null;
}

export interface ResumoFiscalDashboard {
  total_atrasados: number;
  total_urgentes: number;
  total_proximos: number;
  total_pagos_mes: number;
  proximos: AlertaFiscalDashboard[];
}

export async function carregarResumoFiscal(): Promise<ResumoFiscalDashboard> {
  const { data, error } = await supabase.rpc("fiscal_resumo_dashboard");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { total_atrasados: 0, total_urgentes: 0, total_proximos: 0, total_pagos_mes: 0, proximos: [] };
  }
  return {
    total_atrasados: row.total_atrasados ?? 0,
    total_urgentes: row.total_urgentes ?? 0,
    total_proximos: row.total_proximos ?? 0,
    total_pagos_mes: row.total_pagos_mes ?? 0,
    proximos: row.proximos ?? [],
  };
}

export async function marcarAtrasados(): Promise<number> {
  const { data, error } = await supabase.rpc("fiscal_marcar_atrasados");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function criarLancamentoFiscal(
  agendaId: string,
  valor: number,
  descricao?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("fiscal_criar_lancamento", {
    p_agenda_id: agendaId,
    p_valor: valor,
    p_descricao: descricao ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** WhatsApp da tesouraria — alerta de obrigações urgentes/atrasadas. */
export function montarAlertaFiscalWhatsApp(
  resumo: ResumoFiscalDashboard,
  telefoneTesouraria: string | null,
): { mensagem: string; url: string } {
  const linhas: string[] = [
    "🚨 *Alerta Fiscal — QIBRJ*",
    "",
  ];

  if (resumo.total_atrasados > 0) {
    linhas.push(`🔴 *${resumo.total_atrasados} obrigação(ões) ATRASADA(S)*`);
  }
  if (resumo.total_urgentes > 0) {
    linhas.push(`🟡 *${resumo.total_urgentes} vencem nos próximos dias*`);
  }

  linhas.push("", "_Próximas:_", "");

  for (const a of resumo.proximos) {
    const dia = new Date(a.vencimento + "T00:00").toLocaleDateString("pt-BR");
    const tag =
      a.severidade === "atrasado"
        ? `vencida há ${Math.abs(a.dias_para_vencer)}d`
        : a.dias_para_vencer === 0
        ? "vence HOJE"
        : `vence em ${a.dias_para_vencer}d`;
    linhas.push(`${a.icone} *${a.nome}* — ${dia} (${tag})`);
  }

  linhas.push(
    "",
    "_Por favor, dá uma olhada quando puder?_",
    "_Pra evitar multa e juros._",
    "",
    "_Secretaria · QIBRJ_",
    "_Diakonia APP — Módulo Fiscal_",
  );

  const mensagem = linhas.join("\n");
  const tel = (telefoneTesouraria ?? "").replace(/\D/g, "");
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return { mensagem, url };
}

// ═══════════════════════════════════════════════════════════════════════
// FB-3: Documentos + Malote ZIP
// ═══════════════════════════════════════════════════════════════════════

import JSZip from "jszip";
import { saveAs } from "file-saver";

export type FiscalDocTipo = "guia" | "comprovante" | "recibo" | "outro";

export interface FiscalDocumento {
  id: string;
  agenda_id: string;
  tipo: FiscalDocTipo;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  observacao: string | null;
  enviado_em: string;
}

/** Upload de um documento fiscal vinculado a um item da agenda. */
export async function uploadDocumentoFiscal(
  agendaId: string,
  arquivo: File,
  tipo: FiscalDocTipo,
  observacao?: string,
): Promise<FiscalDocumento> {
  // path: {agendaId}/{tipo}-{timestamp}-{nome}
  const safeName = arquivo.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${agendaId}/${tipo}-${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("fiscal-docs")
    .upload(storagePath, arquivo, {
      cacheControl: "3600",
      upsert: false,
      contentType: arquivo.type || undefined,
    });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("fiscal_documentos")
    .insert({
      agenda_id: agendaId,
      tipo,
      nome_arquivo: arquivo.name,
      storage_path: storagePath,
      mime_type: arquivo.type,
      tamanho_bytes: arquivo.size,
      observacao: observacao ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FiscalDocumento;
}

export async function listarDocumentosObrigacao(agendaId: string): Promise<FiscalDocumento[]> {
  const { data, error } = await supabase
    .from("fiscal_documentos")
    .select("*")
    .eq("agenda_id", agendaId)
    .order("enviado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FiscalDocumento[];
}

export async function excluirDocumentoFiscal(doc: FiscalDocumento): Promise<void> {
  // Remove do storage
  await supabase.storage.from("fiscal-docs").remove([doc.storage_path]);
  const { error } = await supabase
    .from("fiscal_documentos")
    .delete()
    .eq("id", doc.id);
  if (error) throw error;
}

/** URL assinada (válida por 1h) para visualizar/baixar. */
export async function urlDocumentoFiscal(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("fiscal-docs")
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ─── Malote ZIP ───────────────────────────────────────────────────────
export interface MaloteDocItem {
  documento_id: string;
  codigo_obrigacao: string;
  nome_obrigacao: string;
  competencia: string;
  vencimento: string;
  status_obrigacao: string;
  valor_pago: number | null;
  data_pagamento: string | null;
  tipo_doc: string;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string | null;
  observacao: string | null;
}

export async function listarDocumentosDoMes(ano: number, mes: number): Promise<MaloteDocItem[]> {
  const { data, error } = await supabase.rpc("fiscal_documentos_mes", {
    p_ano: ano, p_mes: mes,
  });
  if (error) throw error;
  return (data ?? []) as MaloteDocItem[];
}

export interface ResumoMaloteFiscal {
  ano: number;
  mes: number;
  total_obrigacoes: number;
  total_pagas: number;
  total_pendentes: number;
  valor_total_pago: number;
  por_obrigacao: Array<{
    codigo: string;
    nome: string;
    icone: string;
    status: string;
    vencimento: string;
    valor_pago: number | null;
    data_pagamento: string | null;
    qtd_documentos: number;
  }>;
}

export async function resumoMaloteFiscal(ano: number, mes: number): Promise<ResumoMaloteFiscal> {
  const { data, error } = await supabase.rpc("fiscal_resumo_malote", {
    p_ano: ano, p_mes: mes,
  });
  if (error) throw error;
  return data as ResumoMaloteFiscal;
}

/**
 * Exporta o malote fiscal do mês como ZIP estruturado:
 *   /MaloteFiscal_2026-06/
 *     ├── INDICE.txt
 *     ├── FGTS/comprovante-...pdf
 *     ├── DCTFWeb/guia-...pdf
 *     ├── ISS/...
 *     └── ...
 */
export async function exportarMaloteFiscalZip(ano: number, mes: number): Promise<void> {
  const [docs, resumo] = await Promise.all([
    listarDocumentosDoMes(ano, mes),
    resumoMaloteFiscal(ano, mes),
  ]);

  if (docs.length === 0 && resumo.total_obrigacoes === 0) {
    throw new Error(`Nenhuma obrigação ou documento encontrado para ${mes}/${ano}`);
  }

  const zip = new JSZip();
  const pastaNome = `MaloteFiscal_${ano}-${String(mes).padStart(2, "0")}`;
  const root = zip.folder(pastaNome)!;

  // ─── Capa / índice ────────────────────────────────────────────────
  const fmtBR = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (s: string | null) =>
    s ? new Date(s + "T00:00").toLocaleDateString("pt-BR") : "—";

  const linhas: string[] = [
    `MALOTE FISCAL — QIBRJ`,
    `Período: ${String(mes).padStart(2, "0")}/${ano}`,
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    "",
    "=".repeat(60),
    "RESUMO",
    "=".repeat(60),
    `Total de obrigações no período: ${resumo.total_obrigacoes}`,
    `  • Pagas:     ${resumo.total_pagas}`,
    `  • Pendentes: ${resumo.total_pendentes}`,
    `Valor total pago: ${fmtBR(resumo.valor_total_pago)}`,
    "",
    "=".repeat(60),
    "POR OBRIGAÇÃO",
    "=".repeat(60),
    "",
  ];

  for (const o of resumo.por_obrigacao) {
    linhas.push(
      `${o.icone} ${o.nome} (${o.codigo})`,
      `   Vencimento:       ${fmtData(o.vencimento)}`,
      `   Status:           ${o.status.toUpperCase()}`,
      `   Valor pago:       ${o.valor_pago != null ? fmtBR(o.valor_pago) : "—"}`,
      `   Data pagamento:   ${fmtData(o.data_pagamento)}`,
      `   Documentos:       ${o.qtd_documentos}`,
      "",
    );
  }

  linhas.push(
    "=".repeat(60),
    "ESTRUTURA DESTE MALOTE",
    "=".repeat(60),
    "Os documentos estão organizados em pastas por código de obrigação.",
    "Exemplo: /FGTS/comprovante-*.pdf",
    "",
    "_Gerado pelo Diakonia APP — Módulo Fiscal_",
  );

  root.file("INDICE.txt", linhas.join("\n"));

  // ─── Documentos por obrigação ─────────────────────────────────────
  // Agrupa por código
  const porCodigo = new Map<string, MaloteDocItem[]>();
  docs.forEach(d => {
    if (!porCodigo.has(d.codigo_obrigacao)) porCodigo.set(d.codigo_obrigacao, []);
    porCodigo.get(d.codigo_obrigacao)!.push(d);
  });

  // Baixa cada arquivo do storage e adiciona ao ZIP
  for (const [codigo, lista] of porCodigo) {
    const pasta = root.folder(codigo)!;
    for (const doc of lista) {
      try {
        const { data: blob, error } = await supabase.storage
          .from("fiscal-docs")
          .download(doc.storage_path);
        if (error || !blob) continue;
        const nomeFinal = `${doc.tipo_doc}-${doc.nome_arquivo}`;
        pasta.file(nomeFinal, blob);
      } catch {
        // Falha silenciosa — registra no índice
        pasta.file(`ERRO-${doc.nome_arquivo}.txt`,
          `Não foi possível baixar este documento.\nStorage path: ${doc.storage_path}`);
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${pastaNome}.zip`);
}

// ═══════════════════════════════════════════════════════════════════════
// FB-4: OCR + IA + Inteligência
// ═══════════════════════════════════════════════════════════════════════

import { extrairDadosDoComprovante, pdfParaImagem, type OcrResultado } from "@/services/ocrService";

export interface AnaliseGuiaFiscal {
  ocr: OcrResultado;
  codigo_obrigacao_sugerido: string | null;
  nome_obrigacao_sugerida: string | null;
  competencia_sugerida: string | null;
  vencimento_sugerido: string | null;
  valor_sugerido: number | null;
}

function inferirCodigoObrigacao(texto: string): string | null {
  const t = texto.toUpperCase();
  if (/\bFGTS\b/.test(t) || /FUNDO.*GARANTIA/.test(t) || /\bGRF\b/.test(t)) return "FGTS";
  if (/\bDCTFWEB\b/.test(t) || /DECLARA[ÇC][ÃA]O.*D[ÉE]BITOS.*CR[ÉE]DITOS/.test(t)) return "DCTFWeb";
  if (/\bESOCIAL\b/.test(t)) return "eSocial";
  if (/\bISS\b/.test(t) || /SERVI[ÇC]O.*MUNICIPAL/.test(t) || /\bNFS-?E\b/.test(t)) return "ISS";
  if (/\bDARF\b/.test(t)) {
    if (/IRRF|IMPOSTO.*RENDA.*FONTE/.test(t)) return "DARF_IRRF";
    if (/INSS|PREVID[ÊE]NCIA/.test(t)) return "DARF_INSS";
    return "DARF_INSS";
  }
  if (/\bDIRF\b/.test(t)) return "DIRF";
  return null;
}

function extrairCompetenciaOCR(texto: string): string | null {
  const m1 = texto.match(/(?:compet[êe]ncia|per[íi]odo|m[êe]s)[:\s]*(\d{2})[\/.](\d{4})/i);
  if (m1) return `${m1[2]}-${m1[1]}-01`;
  const m2 = texto.match(/\b(0[1-9]|1[0-2])[\/.](\d{4})\b/);
  if (m2) return `${m2[2]}-${m2[1]}-01`;
  return null;
}

export async function analisarGuiaFiscal(arquivo: File): Promise<AnaliseGuiaFiscal> {
  let arquivoOCR = arquivo;
  if (arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf")) {
    arquivoOCR = await pdfParaImagem(arquivo, 2);
  }
  const ocr = await extrairDadosDoComprovante(arquivoOCR);
  const codigo = inferirCodigoObrigacao(ocr.textoBruto);

  let nomeSugerido: string | null = null;
  if (codigo) {
    const { data } = await supabase
      .from("fiscal_tipos_obrigacao")
      .select("nome")
      .eq("codigo", codigo)
      .maybeSingle();
    nomeSugerido = data?.nome ?? null;
  }
  return {
    ocr,
    codigo_obrigacao_sugerido: codigo,
    nome_obrigacao_sugerida: nomeSugerido,
    competencia_sugerida: extrairCompetenciaOCR(ocr.textoBruto),
    vencimento_sugerido: ocr.data,
    valor_sugerido: ocr.valor,
  };
}

export type SeveridadeInc = "alta" | "media" | "baixa";
export type TipoInconsistencia = "valor_anomalo" | "sem_documento" | "sem_movimento";

export interface InconsistenciaFiscal {
  tipo: TipoInconsistencia;
  severidade: SeveridadeInc;
  agenda_id: string;
  codigo_obrigacao: string;
  nome_obrigacao: string;
  competencia: string;
  mensagem: string;
  detalhes: Record<string, any>;
}

export async function listarInconsistencias(): Promise<InconsistenciaFiscal[]> {
  const { data, error } = await supabase.rpc("fiscal_inconsistencias");
  if (error) throw error;
  return (data ?? []) as InconsistenciaFiscal[];
}

export interface InsightsFiscais {
  ano: number;
  total_pago_ytd: number;
  total_pago_mes_atual: number;
  total_pago_mes_anterior: number;
  variacao_mes_pct: number | null;
  obrigacao_mais_cara: string | null;
  obrigacao_mais_cara_total: number | null;
  count_inconsistencias: number;
}

export async function carregarInsightsFiscais(): Promise<InsightsFiscais> {
  const { data, error } = await supabase.rpc("fiscal_insights");
  if (error) throw error;
  return data as InsightsFiscais;
}
