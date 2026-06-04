// RefatoracaoComparacao.tsx
// Tela de Comparacao Inteligente de Ministerios - DiakoniaApp

import { useState } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    CheckCircle2, Plus, Minus, RefreshCw, AlertCircle,
    ChevronDown, ChevronUp, Sparkles, Shield, Loader2,
  } from "lucide-react";
import {
    ItemComparacao, ResultadoRefatoracao, MinisterioExistente, AcaoRefatoracao,
  } from "@/services/ministerioRefatoracaoService";

// --- Tipos internos ---

type DecisaoItem = {
    decisao: "atualizar" | "manter" | "criar" | "ignorar" | "pendente";
  };

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    resultado: ResultadoRefatoracao;
    fonte: "ia" | "parser" | "combinado";
    carregando: boolean;
    onAplicar: (
          decisoes: Map<ItemComparacao, DecisaoItem["decisao"]>,
          orfaos: MinisterioExistente[]
        ) => Promise<void>;
  }

// --- Badge de fonte ---

function FonteBadge({ fonte }: { fonte: "ia" | "parser" | "combinado" }) {
    const map = {
          ia: { label: "IA + Documento", color: "bg-purple-100 text-purple-700 border-purple-300" },
          parser: { label: "Parser Manual", color: "bg-blue-100 text-blue-700 border-blue-300" },
          combinado: { label: "IA + Parser", color: "bg-amber-100 text-amber-700 border-amber-300" },
        };
    const m = map[fonte];
    return (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${m.color}`}>
            <Sparkles className="w-2.5 h-2.5 inline mr-1" />{m.label}
          </span>
        );
  }

// --- Badge de similaridade ---

function SimilaridadeBadge({ pct }: { pct: number }) {
    const color =
      pct >= 90 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
      pct >= 70 ? "text-amber-700 bg-amber-50 border-amber-200" :
      "text-rose-700 bg-rose-50 border-rose-200";
    return (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${color}`}>
            {pct}% similar
          </span>
        );
  }

// --- Card de item ---

function ItemCard({
    item,
    decisao,
    onDecidir,
    tipo,
  }: {
    item: ItemComparacao;
    decisao: DecisaoItem["decisao"];
    onDecidir: (d: DecisaoItem["decisao"]) => void;
    tipo: "atualizar" | "criar" | "manter";
  }) {
    const [expandido, setExpandido] = useState(false);
    const temDif = item.diferencas.some(d => d.tipo !== "sem_mudanca");

    const borderColor =
      decisao === "atualizar" ? "border-amber-300 bg-amber-50/30" :
      decisao === "criar" ? "border-emerald-300 bg-emerald-50/30" :
      decisao === "manter" ? "border-muted bg-muted/20" :
      decisao === "ignorar" ? "border-muted bg-muted/20 opacity-60" :
      "border-border bg-background";

    return (
          <div className={`rounded-lg border p-3 transition-all ${borderColor}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {tipo === "atualizar" && (
                                  <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 gap-1">
                                    <RefreshCw className="w-2.5 h-2.5" /> Atualizar
                                  </Badge>
                                )}
                  {tipo === "criar" && (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
                                    <Plus className="w-2.5 h-2.5" /> Novo
                                  </Badge>
                                )}
                  {tipo === "manter" && (
                                  <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Sincronizado
                                  </Badge>
                                )}
                  {item.similaridade > 0 && <SimilaridadeBadge pct={item.similaridade} />}
                </div>

                <div className="flex items-baseline gap-2">
                  <p className="font-medium text-sm">{item.extraido.nome}</p>
                  {item.existente && item.existente.nome !== item.extraido.nome && (
                                  <span className="text-[10px] text-muted-foreground">
                                    (existente: {item.existente.nome})
                                  </span>
                                )}
                </div>

                {item.extraido.descricao && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {item.extraido.descricao}
                              </p>
                            )}

                {temDif && (
                              <button
                                className="flex items-center gap-1 text-[10px] text-primary mt-1.5 hover:underline"
                                onClick={() => setExpandido(!expandido)}
                              >
                                {expandido ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {expandido ? "Ocultar" : "Ver"} {item.diferencas.filter(d => d.tipo !== "sem_mudanca").length} diferenca(s)
                              </button>
                            )}

                {expandido && (
                              <div className="mt-2 space-y-1.5">
                                {item.diferencas.filter(d => d.tipo !== "sem_mudanca").map((dif, i) => (
                                                  <div key={i} className="rounded-md bg-background border p-2 text-xs">
                                                    <p className="font-medium text-[10px] uppercase text-muted-foreground mb-1">
                                                      {dif.label}
                                                      {dif.tipo === "novo" && (
                                                                              <Badge variant="outline" className="ml-2 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">Novo campo</Badge>
                                                                            )}
                                                      {dif.tipo === "modificado" && (
                                                                              <Badge variant="outline" className="ml-2 text-[9px] bg-amber-50 text-amber-700 border-amber-200">Mais completo</Badge>
                                                                            )}
                                                    </p>
                                                    {dif.valorAtual && (
                                                                          <div className="flex items-start gap-1 mb-1">
                                                                            <Minus className="w-3 h-3 text-rose-400 mt-0.5 shrink-0" />
                                                                            <p className="text-muted-foreground line-clamp-2">{dif.valorAtual}</p>
                                                                          </div>
                                                                        )}
                                                    {dif.valorNovo && dif.tipo !== "sem_mudanca" && (
                                                                          <div className="flex items-start gap-1">
                                                                            <Plus className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                                                            <p className="text-foreground line-clamp-3">{dif.valorNovo}</p>
                                                                          </div>
                                                                        )}
                                                  </div>
                                                ))}
                              </div>
                            )}
              </div>

              {/* Acoes */}
              <div className="shrink-0 flex flex-col gap-1">
                {tipo === "atualizar" && (
                              <>
                                <button
                                  onClick={() => onDecidir("atualizar")}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                                                      decisao === "atualizar"
                                                        ? "bg-amber-500 text-white border-amber-500"
                                                        : "bg-background border-border text-muted-foreground hover:border-amber-300"
                                                    }`}
                                >
                                  Atualizar
                                </button>
                                <button
                                  onClick={() => onDecidir("manter")}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                                                      decisao === "manter"
                                                        ? "bg-muted text-foreground border-muted-foreground"
                                                        : "bg-background border-border text-muted-foreground hover:border-muted-foreground"
                                                    }`}
                                >
                                  Manter
                                </button>
                              </>
                            )}
                {tipo === "criar" && (
                              <>
                                <button
                                  onClick={() => onDecidir("criar")}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                                                      decisao === "criar"
                                                        ? "bg-emerald-500 text-white border-emerald-500"
                                                        : "bg-background border-border text-muted-foreground hover:border-emerald-300"
                                                    }`}
                                >
                                  Criar
                                </button>
                                <button
                                  onClick={() => onDecidir("ignorar")}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all border ${
                                                      decisao === "ignorar"
                                                        ? "bg-muted text-foreground border-muted-foreground"
                                                        : "bg-background border-border text-muted-foreground hover:border-muted-foreground"
                                                    }`}
                                >
                                  Ignorar
                                </button>
                              </>
                            )}
              </div>
            </div>
          </div>
        );
  }

// --- Componente principal ---

export default function RefatoracaoComparacao({
    open,
    onOpenChange,
    resultado,
    fonte,
    carregando,
    onAplicar,
  }: Props) {
    const { paraCriar, paraAtualizar, paraManter, orfaos } = resultado;

    // Estado das decisoes por item
    const [decisoes, setDecisoes] = useState<Map<ItemComparacao, DecisaoItem["decisao"]>>(() => {
          const m = new Map<ItemComparacao, DecisaoItem["decisao"]>();
          paraAtualizar.forEach(i => m.set(i, "atualizar"));
          paraCriar.forEach(i => m.set(i, "criar"));
          paraManter.forEach(i => m.set(i, "manter"));
          return m;
        });

    const [aplicando, setAplicando] = useState(false);

    const decidir = (item: ItemComparacao, d: DecisaoItem["decisao"]) => {
          setDecisoes(prev => {
                  const next = new Map(prev);
                  next.set(item, d);
                  return next;
                });
        };

    const totalAcoes = () => {
          let atualizar = 0, criar = 0;
          decisoes.forEach(d => {
                  if (d === "atualizar") atualizar++;
                  if (d === "criar") criar++;
                });
          return { atualizar, criar };
        };

    const handleAplicar = async () => {
          setAplicando(true);
          try {
                  await onAplicar(decisoes, orfaos);
                  onOpenChange(false);
                } finally {
                  setAplicando(false);
                }
        };

    const { atualizar, criar } = totalAcoes();
    const semAcoes = atualizar === 0 && criar === 0;

    const totalItens =
      paraCriar.length + paraAtualizar.length + paraManter.length;

    return (
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-5 pb-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="font-serif text-xl">
                      Comparacao de Estrutura
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <FonteBadge fonte={fonte} />
                      <span className="text-[10px] text-muted-foreground">
                        {totalItens} ministerio(s) analisado(s)
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {carregando ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground animate-pulse">Analisando documento...</p>
                            <p className="text-[11px] text-muted-foreground">Comparando com ministerios existentes</p>
                          </div>
                        ) : (
                          <ScrollArea className="flex-1 px-6 py-4">
                            <div className="space-y-5">

                              {/* Resumo */}
                              <div className="grid grid-cols-4 gap-2">
                                {[
                                                    { label: "Para atualizar", count: paraAtualizar.length, color: "text-amber-600 bg-amber-50 border-amber-200" },
                                                    { label: "Para criar", count: paraCriar.length, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                                                    { label: "Sincronizados", count: paraManter.length, color: "text-muted-foreground bg-muted/30 border-border" },
                                                    { label: "Nao encontrados", count: orfaos.length, color: "text-blue-600 bg-blue-50 border-blue-200" },
                                                  ].map(({ label, count, color }) => (
                                                    <div key={label} className={`rounded-lg border px-3 py-2 text-center ${color}`}>
                                                      <p className="text-xl font-bold">{count}</p>
                                                      <p className="text-[10px] leading-tight">{label}</p>
                                                    </div>
                                                  ))}
                              </div>

                              {/* Para atualizar */}
                              {paraAtualizar.length > 0 && (
                                                <section>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                                                    <h3 className="text-sm font-semibold">Para enriquecer ({paraAtualizar.length})</h3>
                                                    <span className="text-[10px] text-muted-foreground">dados podem ser melhorados</span>
                                                  </div>
                                                  <div className="space-y-2">
                                                    {paraAtualizar.map((item, i) => (
                                                                            <ItemCard
                                                                              key={i}
                                                                              item={item}
                                                                              decisao={decisoes.get(item) ?? "pendente"}
                                                                              onDecidir={(d) => decidir(item, d)}
                                                                              tipo="atualizar"
                                                                            />
                                                                          ))}
                                                  </div>
                                                </section>
                                              )}

                              {/* Para criar */}
                              {paraCriar.length > 0 && (
                                                <section>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <Plus className="w-3.5 h-3.5 text-emerald-500" />
                                                    <h3 className="text-sm font-semibold">Novos no documento ({paraCriar.length})</h3>
                                                    <span className="text-[10px] text-muted-foreground">nao encontrados no sistema</span>
                                                  </div>
                                                  <div className="space-y-2">
                                                    {paraCriar.map((item, i) => (
                                                                            <ItemCard
                                                                              key={i}
                                                                              item={item}
                                                                              decisao={decisoes.get(item) ?? "pendente"}
                                                                              onDecidir={(d) => decidir(item, d)}
                                                                              tipo="criar"
                                                                            />
                                                                          ))}
                                                  </div>
                                                </section>
                                              )}

                              {/* Sincronizados */}
                              {paraManter.length > 0 && (
                                                <section>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <h3 className="text-sm font-semibold text-muted-foreground">
                                                      Ja sincronizados ({paraManter.length})
                                                    </h3>
                                                  </div>
                                                  <div className="space-y-2">
                                                    {paraManter.map((item, i) => (
                                                                            <ItemCard
                                                                              key={i}
                                                                              item={item}
                                                                              decisao="manter"
                                                                              onDecidir={() => {}}
                                                                              tipo="manter"
                                                                            />
                                                                          ))}
                                                  </div>
                                                </section>
                                              )}

                              {/* Orfaos */}
                              {orfaos.length > 0 && (
                                                <section>
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
                                                    <h3 className="text-sm font-semibold">Nao encontrados no documento ({orfaos.length})</h3>
                                                  </div>
                                                  <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
                                                    <p className="text-[11px] text-blue-700 mb-2">
                                                      Estes ministerios existem no sistema mas nao foram identificados no documento.
                                                      Eles serao preservados automaticamente.
                                                    </p>
                                                    <div className="space-y-1">
                                                      {orfaos.map((orfao, i) => (
                                                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                                                  <Shield className="w-3 h-3 text-blue-400 shrink-0" />
                                                                                  <span className="font-medium">{orfao.nome}</span>
                                                                                  {orfao.sigla && (
                                                                                                                <span className="text-[10px] text-muted-foreground">({orfao.sigla})</span>
                                                                                                              )}
                                                                                  <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-600 border-blue-200 ml-auto">
                                                                                    Preservado
                                                                                  </Badge>
                                                                                </div>
                                                                              ))}
                                                    </div>
                                                  </div>
                                                </section>
                                              )}

                              {totalItens === 0 && (
                                                <div className="text-center py-8 text-muted-foreground">
                                                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                                  <p className="text-sm">Nenhum ministerio encontrado no documento.</p>
                                                  <p className="text-xs mt-1">
                                                    Adicione secoes do tipo "ministerio" nos documentos institucionais primeiro.
                                                  </p>
                                                </div>
                                              )}
                            </div>
                          </ScrollArea>
                        )}

              {!carregando && (
                          <DialogFooter className="px-6 py-3 border-t bg-muted/20">
                            <div className="flex items-center gap-2 flex-1 text-[11px] text-muted-foreground">
                              {atualizar > 0 && <span className="text-amber-600 font-medium">{atualizar} para atualizar</span>}
                              {atualizar > 0 && criar > 0 && <span>•</span>}
                              {criar > 0 && <span className="text-emerald-600 font-medium">{criar} para criar</span>}
                              {semAcoes && <span>Nenhuma alteracao selecionada</span>}
                            </div>
                            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={aplicando}>
                              Cancelar
                            </Button>
                            <Button
                              onClick={handleAplicar}
                              disabled={semAcoes || aplicando}
                              className={semAcoes ? "" : "bg-primary"}
                            >
                              {aplicando ? (
                                                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Aplicando...</>
                                              ) : (
                                                <>
                                                  <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                                                  Confirmar e Aplicar
                                                </>
                                              )}
                            </Button>
                          </DialogFooter>
                        )}
            </DialogContent>
          </Dialog>
        );
  }
