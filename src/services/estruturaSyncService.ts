// estruturaSyncService.ts — Sincroniza secoes_documento -> documento_estrutura
import { supabase } from "@/integrations/supabase/client";

export interface SecaoParaSync {
  id: string; documento_id: string; documento_titulo: string;
  documento_tipo: string; titulo: string; conteudo: string | null;
  tipo_secao: string | null; ministerio_ref: string | null;
  nivel_hierarquico: number | null; ordem: number;
}

export interface ItemEstruturaPreview {
  tipo: string; nivel: string; nome: string;
  descricao: string | null; responsabilidades: string | null;
  base_institucional: string; referencia_documento: string;
  ordem: number; secao_id: string; secao_titulo: string;
  documento_titulo: string; jaExiste: boolean; idExistente: string | null;
}

export interface ResultadoSync {
  novos: ItemEstruturaPreview[]; jaExistentes: ItemEstruturaPreview[];
  ignorados: SecaoParaSync[]; total: number;
}

export interface OpcaoSync { item: ItemEstruturaPreview; acao: "criar" | "atualizar" | "ignorar"; }

const MAPA_TIPO: Record<string, { tipo: string; nivel: string }> = {
  diretoria:  { tipo: "diretoria",  nivel: "institucional" },
  conselho:   { tipo: "conselho",   nivel: "institucional" },
  ministerio: { tipo: "ministerio", nivel: "ministerial"   },
  area:       { tipo: "area",       nivel: "area"          },
  assembleia: { tipo: "diretoria",  nivel: "institucional" },
};

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
}

export async function analisarSyncEstrutura(): Promise<ResultadoSync> {
  const { data: secoes, error: errSec } = await supabase
    .from("secoes_documento")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("id,titulo,conteudo,tipo_secao,ministerio_ref,nivel_hierarquico,ordem,documento_id,documentos!inner(id,titulo,tipo)")
    .in("tipo_secao",["diretoria","conselho","ministerio","area","assembleia"])
    .order("ordem");
  if (errSec) throw new Error("Erro ao buscar secoes: " + errSec.message);

  // Fase E: log diagnóstico para investigar "sync vazia"
  if (!secoes || secoes.length === 0) {
    console.warn(
      "[estruturaSync] Nenhuma seção encontrada com tipo_secao em " +
      "[diretoria, conselho, ministerio, area, assembleia]. " +
      "Verifique se algum documento foi ingerido E classificado em secoes_documento."
    );
  } else {
    console.info("[estruturaSync] " + secoes.length + " seção(ões) candidatas encontradas.");
  }

  const { data: existentes } = await supabase
    .from("documento_estrutura").select("id,nome,tipo").eq("ativo",true);

  const existentesMap = new Map<string,string>();
  for (const e of (existentes ?? [])) existentesMap.set(e.tipo+"|"+norm(e.nome), e.id);

  const novos: ItemEstruturaPreview[] = [];
  const jaExistentes: ItemEstruturaPreview[] = [];
  const ignorados: SecaoParaSync[] = [];

  for (const s of (secoes ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (s as any).documentos;
    const mapa = MAPA_TIPO[s.tipo_secao ?? ""];
    if (!mapa) {
      ignorados.push({ id:s.id, documento_id:s.documento_id, documento_titulo:doc?.titulo??"",
        documento_tipo:doc?.tipo??"", titulo:s.titulo, conteudo:s.conteudo,
        tipo_secao:s.tipo_secao, ministerio_ref:s.ministerio_ref,
        nivel_hierarquico:s.nivel_hierarquico, ordem:s.ordem });
      continue;
    }
    const nome = (s.ministerio_ref?.trim()) || s.titulo;
    const idExistente = existentesMap.get(mapa.tipo+"|"+norm(nome)) ?? null;
    const item: ItemEstruturaPreview = {
      tipo:mapa.tipo, nivel:mapa.nivel, nome,
      descricao:s.conteudo||null, responsabilidades:null,
      base_institucional:doc?.titulo??"",
      referencia_documento:(doc?.titulo??"")+" — "+s.titulo,
      ordem:s.nivel_hierarquico??s.ordem,
      secao_id:s.id, secao_titulo:s.titulo,
      documento_titulo:doc?.titulo??"",
      jaExiste:idExistente!==null, idExistente,
    };
    if (idExistente) jaExistentes.push(item); else novos.push(item);
  }
  return { novos, jaExistentes, ignorados, total:novos.length+jaExistentes.length };
}

export async function aplicarSync(
  opcoes: OpcaoSync[], emailUsuario: string | null
): Promise<{ criados:number; atualizados:number; erros:number }> {
  const { data: igr } = await supabase.from("identidade_igreja")
    .select("id").eq("ativa",true).maybeSingle();
  if (!igr?.id) throw new Error("Nenhuma identidade da igreja configurada.");
  let criados=0, atualizados=0, erros=0;
  for (const { item, acao } of opcoes) {
    if (acao==="ignorar") continue;
    const payload = {
      tipo:item.tipo, nivel:item.nivel, nome:item.nome,
      descricao:item.descricao, responsabilidades:item.responsabilidades,
      base_institucional:item.base_institucional,
      referencia_documento:item.referencia_documento,
      ordem:item.ordem, ativo:true, igreja_id:igr.id,
    };
    try {
      if (acao==="criar") {
        const { error } = await supabase.from("documento_estrutura").insert(payload);
        if (error) throw error; criados++;
      } else if (acao==="atualizar" && item.idExistente) {
        const { error } = await supabase.from("documento_estrutura")
          .update({ descricao:payload.descricao, base_institucional:payload.base_institucional,
            referencia_documento:payload.referencia_documento, ordem:payload.ordem })
          .eq("id",item.idExistente);
        if (error) throw error; atualizados++;
      }
    } catch (e) {
      console.warn("[estruturaSync] Erro ao processar item " + item.nome + ":", e);
      erros++;
    }
  }
  if (criados+atualizados>0) {
    await supabase.from("documentos_historico").insert({
      acao:"sincronizacao_estrutura", usuario_email:emailUsuario,
      observacao:"Sync: "+criados+" criado(s), "+atualizados+" atualizado(s)",
    }).then(()=>{}).catch((e)=>console.warn("[estruturaSync] Falha ao registrar histórico:", e));
  }
  return { criados, atualizados, erros };
}
