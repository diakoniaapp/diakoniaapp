// SyncEstruturaModal.tsx
// Modal de preview para sincronizar secoes_documento -> documento_estrutura
// O admin ve o que sera criado/atualizado e confirma item a item
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, CheckCircle2, SkipForward, PlusCircle, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  analisarSyncEstrutura, aplicarSync,
  ItemEstruturaPreview, OpcaoSync, ResultadoSync,
} from "@/services/estruturaSyncService";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; onConcluido: () => void; }

const TIPO_COR: Record<string, string> = {
  diretoria:  "bg-purple-100 text-purple-800 border-purple-200",
  conselho:   "bg-indigo-100 text-indigo-800 border-indigo-200",
  ministerio: "bg-blue-100 text-blue-800 border-blue-200",
  area:       "bg-green-100 text-green-800 border-green-200",
  cargo:      "bg-amber-100 text-amber-800 border-amber-200",
};
const TIPO_ICONE: Record<string, string> = {
  diretoria:"\uD83D\uDC54", conselho:"\uD83E\uDD1D", ministerio:"\u26EA",
  area:"\uD83D\uDCC2", cargo:"\uD83C\uDF96\uFE0F",
};
const NIVEL_LABEL: Record<string, string> = {
  institucional:"Institucional", ministerial:"Ministerial", area:"Area",
};

export default function SyncEstruturaModal({ open, onOpenChange, onConcluido }: Props) {
  const { user } = useAuth();
  const [fase, setFase] = useState<"idle"|"analisando"|"preview"|"aplicando"|"concluido">("idle");
  const [resultado, setResultado] = useState<ResultadoSync | null>(null);
  const [opcoes, setOpcoes] = useState<Map<string, "criar"|"atualizar"|"ignorar">>(new Map());
  const [resumo, setResumo] = useState<{criados:number;atualizados:number;erros:number}|null>(null);

  const analisar = async () => {
    setFase("analisando");
    try {
      const r = await analisarSyncEstrutura();
      setResultado(r);
      const m = new Map<string,"criar"|"atualizar"|"ignorar">();
      r.novos.forEach(i => m.set(i.secao_id, "criar"));
      r.jaExistentes.forEach(i => m.set(i.secao_id, "atualizar"));
      setOpcoes(m);
      if (r.total === 0) { toast.info("Nenhuma secao elegivel encontrada. Adicione secoes do tipo Diretoria, Ministerio ou Conselho nos documentos."); setFase("idle"); }
      else setFase("preview");
    } catch(e) { toast.error("Erro: "+(e as Error).message); setFase("idle"); }
  };

  const setAcao = (id: string, a: "criar"|"atualizar"|"ignorar") => {
    setOpcoes(prev => { const m = new Map(prev); m.set(id, a); return m; });
  };

  const aplicar = async () => {
    if (!resultado) return;
    setFase("aplicando");
    const todos: ItemEstruturaPreview[] = [...resultado.novos, ...resultado.jaExistentes];
    const ops: OpcaoSync[] = todos.map(i => ({ item:i, acao: opcoes.get(i.secao_id)??"ignorar" }));
    try {
      const r = await aplicarSync(ops, user?.email ?? null);
      setResumo(r);
      setFase("concluido");
      if (r.erros === 0) toast.success("Estrutura sincronizada: "+r.criados+" criado(s), "+r.atualizados+" atualizado(s)");
      else toast.warning("Concluido com "+r.erros+" erro(s)");
      onConcluido();
    } catch(e) { toast.error("Erro ao aplicar: "+(e as Error).message); setFase("preview"); }
  };

  const fechar = () => {
    setFase("idle"); setResultado(null); setOpcoes(new Map()); setResumo(null);
    onOpenChange(false);
  };

  const acaoAtiva = (id: string) => opcoes.get(id);
  const totalCriar = [...opcoes.values()].filter(v=>v==="criar").length;
  const totalAtualizar = [...opcoes.values()].filter(v=>v==="atualizar").length;
  const totalIgnorar = [...opcoes.values()].filter(v=>v==="ignorar").length;

  function ItemCard({ item, tipo }: { item: ItemEstruturaPreview; tipo: "novo"|"existente" }) {
    const acao = acaoAtiva(item.secao_id);
    const cor = TIPO_COR[item.tipo] ?? "bg-muted text-foreground";
    const ignorado = acao === "ignorar";
    return (
      <div className={"rounded-xl border px-4 py-3 transition-all "+(ignorado?"opacity-40 bg-muted/30":"bg-background")}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center text-lg shrink-0">{TIPO_ICONE[item.tipo]??"\uD83D\uDD16"}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <Badge variant="outline" className={"text-[10px] "+cor}>{item.tipo}</Badge>
              <span className="text-[10px] text-muted-foreground">{NIVEL_LABEL[item.nivel]??"–"}</span>
            </div>
            <p className="font-medium text-sm">{item.nome}</p>
            {item.descricao && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.descricao}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">\uD83D\uDCC4 {item.base_institucional} — {item.secao_titulo}</p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {tipo === "novo" ? (
              <>
                <button onClick={()=>setAcao(item.secao_id,"criar")} title="Criar" className={"p-1.5 rounded-md transition-colors "+(acao==="criar"?"bg-emerald-100 text-emerald-700":"hover:bg-muted text-muted-foreground")}>
                  <PlusCircle className="w-4 h-4" />
                </button>
                <button onClick={()=>setAcao(item.secao_id,"ignorar")} title="Ignorar" className={"p-1.5 rounded-md transition-colors "+(acao==="ignorar"?"bg-amber-100 text-amber-700":"hover:bg-muted text-muted-foreground")}>
                  <SkipForward className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button onClick={()=>setAcao(item.secao_id,"atualizar")} title="Atualizar" className={"p-1.5 rounded-md transition-colors "+(acao==="atualizar"?"bg-blue-100 text-blue-700":"hover:bg-muted text-muted-foreground")}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={()=>setAcao(item.secao_id,"ignorar")} title="Ignorar" className={"p-1.5 rounded-md transition-colors "+(acao==="ignorar"?"bg-amber-100 text-amber-700":"hover:bg-muted text-muted-foreground")}>
                  <SkipForward className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Sincronizar Estrutura
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Le as secoes dos documentos (tipo Diretoria, Ministerio, Conselho, Area)
            e cria ou atualiza os itens da Estrutura Derivada automaticamente.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 pb-2">

          {/* IDLE */}
          {fase === "idle" && (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <RefreshCw className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="font-medium">Pronto para analisar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique em Analisar para ver o que sera sincronizado.
                </p>
              </div>
              <Button onClick={analisar} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Analisar documentos
              </Button>
            </div>
          )}

          {/* ANALISANDO */}
          {fase === "analisando" && (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Analisando secoes dos documentos...</p>
            </div>
          )}

          {/* PREVIEW */}
          {fase === "preview" && resultado && (
            <div className="flex flex-col gap-3 h-full">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-2 shrink-0">
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">{totalCriar}</p>
                  <p className="text-[11px] text-emerald-600">para criar</p>
                </div>
                <div className="rounded-lg border bg-blue-50 border-blue-200 p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{totalAtualizar}</p>
                  <p className="text-[11px] text-blue-600">para atualizar</p>
                </div>
                <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-center">
                  <p className="text-xl font-bold text-amber-700">{totalIgnorar}</p>
                  <p className="text-[11px] text-amber-600">ignorados</p>
                </div>
              </div>

              <ScrollArea className="flex-1 -mx-1 px-1">
                <div className="space-y-4 pb-2">

                  {resultado.novos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                        <PlusCircle className="w-3.5 h-3.5" /> Novos ({resultado.novos.length})
                      </p>
                      {resultado.novos.map(i => <ItemCard key={i.secao_id} item={i} tipo="novo" />)}
                    </div>
                  )}

                  {resultado.jaExistentes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5" /> Ja existem — atualizar dados ({resultado.jaExistentes.length})
                      </p>
                      {resultado.jaExistentes.map(i => <ItemCard key={i.secao_id} item={i} tipo="existente" />)}
                    </div>
                  )}

                  {resultado.ignorados.length > 0 && (
                    <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {resultado.ignorados.length} secao(oes) sem tipo elegivel foram ignoradas (tipo Geral, Assembleia sem cargo, etc)
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* APLICANDO */}
          {fase === "aplicando" && (
            <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Aplicando sincronizacao...</p>
            </div>
          )}

          {/* CONCLUIDO */}
          {fase === "concluido" && resumo && (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-lg">Sincronizacao concluida!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {resumo.criados} criado(s) · {resumo.atualizados} atualizado(s)
                  {resumo.erros > 0 && " · "+resumo.erros+" erro(s)"}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={fechar}>
            {fase === "concluido" ? "Fechar" : "Cancelar"}
          </Button>
          {fase === "preview" && (
            <Button onClick={aplicar} disabled={totalCriar+totalAtualizar===0} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Aplicar ({totalCriar+totalAtualizar} acao(oes))
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
