// ─── FamiliaBloco.tsx — Bloco de família no MembroForm ───────────────────────
//
// Mostra:
//  1. Família atual (se a pessoa já tem vínculo) com botão "Trocar"
//  2. Sugestões automáticas por sobrenome (se houver outras pessoas)
//  3. Opção "Criar nova família" com nome auto-sugerido
//  4. Opção "Ignorar por agora"
//
// Quando aceita vincular, abre sub-dialog perguntando:
//   - Tipo de parentesco
//   - Marcar como responsável?
//   - Copiar endereço da pessoa pra família?
//

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Home, UserPlus, Users, Sparkles, X, Crown } from "lucide-react";
import { toast } from "sonner";
import {
  sugerirVinculos, familiaDaPessoa, criarFamilia, vincularPessoa,
  desvincularPessoa, nomeFamiliaSugerido,
  PARENTESCO_LABEL, type ParentescoTipo, type SugestaoVinculo,
  type Familia,
} from "@/services/familiaService";

interface Props {
  pessoaId: string | null;
  nomeCompleto: string;
  // Endereço atual do form (pra copiar pra família se desejar)
  endereco: { endereco?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; cep?: string };
  // Hint para alterar após mudança
  onChange?: () => void;
}

interface FamiliaAtual {
  familia: Familia;
  parentesco: ParentescoTipo;
  responsavel: boolean;
  vinculoId: string;
}

export function FamiliaBloco({ pessoaId, nomeCompleto, endereco, onChange }: Props) {
  const [atual, setAtual]           = useState<FamiliaAtual | null>(null);
  const [sugestoes, setSugestoes]   = useState<SugestaoVinculo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ignorado, setIgnorado]     = useState(false);

  // Dialog de vinculação
  const [vincOpen, setVincOpen]     = useState(false);
  const [vincSugestao, setVincSugestao] = useState<SugestaoVinculo | null>(null);
  const [vincFamiliaId, setVincFamiliaId] = useState<string>("");
  const [vincFamiliaNovoNome, setVincFamiliaNovoNome] = useState("");
  const [vincParentesco, setVincParentesco] = useState<ParentescoTipo>("conjuge");
  const [vincResponsavel, setVincResponsavel] = useState(false);
  const [vincCopiarEnd, setVincCopiarEnd]   = useState(false);
  const [vincBusy, setVincBusy] = useState(false);
  const [vincModo, setVincModo] = useState<"existente" | "nova">("existente");

  // Vínculo em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteOpen, setLoteOpen] = useState(false);
  const [loteFamiliaNome, setLoteFamiliaNome] = useState("");
  const [loteFamiliaId, setLoteFamiliaId] = useState<string | null>(null);
  const [loteParentescoPessoa, setLoteParentescoPessoa] = useState<Record<string, string>>({});
  const [loteParentescoSelf, setLoteParentescoSelf] = useState<string>("conjuge");
  const [loteResponsavelId, setLoteResponsavelId] = useState<string>("__self__");
  const [loteCopiarEnd, setLoteCopiarEnd] = useState(false);
  const [loteBusy, setLoteBusy] = useState(false);

  // Carrega família atual + sugestões
  useEffect(() => {
    if (!nomeCompleto || nomeCompleto.trim().length < 3) {
      setAtual(null); setSugestoes([]); return;
    }
    let cancelled = false;
    (async () => {
      setCarregando(true);
      try {
        if (pessoaId) {
          const fa = await familiaDaPessoa(pessoaId);
          if (cancelled) return;
          if (fa) {
            setAtual({
              familia: fa.familia,
              parentesco: fa.vinculo.parentesco,
              responsavel: fa.vinculo.responsavel_familia,
              vinculoId: fa.vinculo.id,
            });
          } else {
            setAtual(null);
          }
        }
        // Carregar sugestões só se não está em família ou se está sem responsável definido
        const sugs = await sugerirVinculos(pessoaId ?? null, nomeCompleto);
        if (!cancelled) setSugestoes(sugs);
      } catch (e: any) {
        console.warn("FamiliaBloco erro:", e?.message);
      } finally {
        if (!cancelled) setCarregando(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pessoaId, nomeCompleto]);

  // ── Abrir dialog vinculação ─────────────────────────────────────────────
  function abrirVincSugestao(s: SugestaoVinculo) {
    setVincSugestao(s);
    setVincModo("existente");
    setVincFamiliaId(s.familia_id ?? "");
    setVincFamiliaNovoNome(s.familia_nome ?? nomeFamiliaSugerido(nomeCompleto));
    setVincParentesco("conjuge");
    setVincResponsavel(false);
    setVincCopiarEnd(false);
    setVincOpen(true);
  }

  function abrirVincLote() {
    if (!pessoaId) { toast.error("Salve a pessoa antes de vincular."); return; }
    const ids = Array.from(selecionados);
    if (ids.length === 0) { toast.error("Selecione ao menos uma pessoa."); return; }
    
    // Identifica família âncora: primeira sugestão selecionada que já está em alguma família
    const ancora = sugestoes.find(s => ids.includes(s.pessoa_id) && s.familia_id);
    setLoteFamiliaId(ancora?.familia_id ?? null);
    setLoteFamiliaNome(ancora?.familia_nome ?? nomeFamiliaSugerido(nomeCompleto));
    
    // Defaults de parentesco — heurística simples por idade não dá pra fazer sem mais dados
    const map: Record<string, string> = {};
    ids.forEach(id => { map[id] = "irmao"; });  // default "irmão" pra grupo familiar
    setLoteParentescoPessoa(map);
    setLoteParentescoSelf("conjuge");
    setLoteResponsavelId("__self__");
    setLoteCopiarEnd(!ancora);  // se cria nova, copia endereço
    setLoteOpen(true);
  }

  function abrirVincCriarNova() {
    setVincSugestao(null);
    setVincModo("nova");
    setVincFamiliaId("");
    setVincFamiliaNovoNome(nomeFamiliaSugerido(nomeCompleto));
    setVincParentesco("conjuge");
    setVincResponsavel(true);  // se cria nova, default é ser responsavel
    setVincCopiarEnd(true);    // e copiar o endereço
    setVincOpen(true);
  }

  async function confirmarVinculo() {
    if (!pessoaId) { toast.error("Salve a pessoa antes de vincular."); return; }
    setVincBusy(true);
    try {
      let familiaId = vincFamiliaId;
      if (vincModo === "nova" || !familiaId) {
        const nomeNovo = vincFamiliaNovoNome.trim() || nomeFamiliaSugerido(nomeCompleto);
        const enderecoSeed = vincCopiarEnd ? endereco : undefined;
        const nova = await criarFamilia(nomeNovo, enderecoSeed);
        familiaId = nova.id;
      }
      await vincularPessoa(familiaId, pessoaId, vincParentesco, vincResponsavel,
        vincModo === "existente" && vincCopiarEnd);
      toast.success("Vínculo familiar registrado!");
      setVincOpen(false);
      // Recarregar
      const fa = await familiaDaPessoa(pessoaId);
      if (fa) {
        setAtual({
          familia: fa.familia,
          parentesco: fa.vinculo.parentesco,
          responsavel: fa.vinculo.responsavel_familia,
          vinculoId: fa.vinculo.id,
        });
      }
      const sugs = await sugerirVinculos(pessoaId, nomeCompleto);
      setSugestoes(sugs);
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao vincular");
    } finally {
      setVincBusy(false);
    }
  }

  async function confirmarLote() {
    if (!pessoaId) { toast.error("Salve a pessoa antes."); return; }
    setLoteBusy(true);
    try {
      let familiaId = loteFamiliaId;
      if (!familiaId) {
        const nomeFam = loteFamiliaNome.trim() || nomeFamiliaSugerido(nomeCompleto);
        const enderecoSeed = loteCopiarEnd ? endereco : undefined;
        const nova = await criarFamilia(nomeFam, enderecoSeed);
        familiaId = nova.id;
      }

      // 1. Vincula a pessoa atual com parentesco escolhido + responsável se for ela
      const eu_responsavel = loteResponsavelId === "__self__";
      await vincularPessoa(familiaId, pessoaId, loteParentescoSelf as any, eu_responsavel, false);

      // 2. Vincula cada selecionado
      const ids = Array.from(selecionados);
      for (const id of ids) {
        const parent = (loteParentescoPessoa[id] ?? "irmao") as any;
        const ehResp = loteResponsavelId === id;
        await vincularPessoa(familiaId, id, parent, ehResp, false);
      }

      toast.success(`${ids.length + 1} pessoas vinculadas à família!`);
      setLoteOpen(false);
      setSelecionados(new Set());
      // Recarregar família atual + sugestões
      const fa = await familiaDaPessoa(pessoaId);
      if (fa) {
        setAtual({
          familia: fa.familia,
          parentesco: fa.vinculo.parentesco,
          responsavel: fa.vinculo.responsavel_familia,
          vinculoId: fa.vinculo.id,
        });
      }
      const sugs = await sugerirVinculos(pessoaId, nomeCompleto);
      setSugestoes(sugs);
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao vincular em lote");
    } finally {
      setLoteBusy(false);
    }
  }

  async function desvincular() {
    if (!atual) return;
    if (!confirm("Remover esta pessoa da família?")) return;
    try {
      await desvincularPessoa(atual.vinculoId);
      toast.success("Pessoa removida da família");
      setAtual(null);
      const sugs = await sugerirVinculos(pessoaId, nomeCompleto);
      setSugestoes(sugs);
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (!nomeCompleto || nomeCompleto.trim().length < 3) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-1.5">
        <Home className="w-3.5 h-3.5" /> Família
      </h3>

      {/* Família atual */}
      {atual && (
        <Card className="border-rose-200 bg-rose-50/40 dark:bg-rose-950/10">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate flex items-center gap-1.5">
                  {atual.responsavel && <Crown className="w-3.5 h-3.5 text-rose-500" />}
                  {atual.familia.nome_familia}
                </p>
                <p className="text-xs text-muted-foreground">
                  Esta pessoa é <strong>{PARENTESCO_LABEL[atual.parentesco] ?? atual.parentesco}</strong>
                  {atual.responsavel && " · Responsável"}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={desvincular} className="text-destructive">
                <X className="w-3.5 h-3.5 mr-1" /> Sair
              </Button>
            </div>
            {(atual.familia.endereco || atual.familia.bairro) && (
              <p className="text-[11px] text-muted-foreground">
                📍 {[atual.familia.endereco, atual.familia.numero, atual.familia.bairro, atual.familia.cidade].filter(Boolean).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sugestões automáticas (somente se ainda não tem família) */}
      {!atual && !ignorado && sugestoes.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="py-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
              <Sparkles className="w-3.5 h-3.5" />
              Possíveis familiares encontrados ({sugestoes.length}):
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {sugestoes.map(s => {
                const checked = selecionados.has(s.pessoa_id);
                return (
                  <label key={s.pessoa_id} className="flex items-center justify-between gap-2 text-sm border-b border-amber-200/40 pb-1.5 last:border-0 cursor-pointer hover:bg-amber-100/50 rounded px-1 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelecionados(prev => {
                            const next = new Set(prev);
                            if (v) next.add(s.pessoa_id); else next.delete(s.pessoa_id);
                            return next;
                          });
                        }}
                      />
                      <span className="font-medium truncate">{s.nome_completo}</span>
                      {s.familia_nome && (
                        <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700">
                          {s.familia_nome}
                        </Badge>
                      )}
                    </div>
                    {pessoaId && (
                      <Button
                        type="button"
                        size="sm" variant="ghost"
                        onClick={(e) => { e.preventDefault(); abrirVincSugestao(s); }}
                        className="gap-1 text-[10px] shrink-0 h-6 px-2"
                        title="Vincular só esta pessoa (modo individual)"
                      >
                        Só esta
                      </Button>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              {pessoaId && selecionados.size > 0 && (
                <Button type="button" size="sm" onClick={abrirVincLote} className="gap-1.5 text-xs">
                  <UserPlus className="w-3 h-3" /> Vincular {selecionados.size} de uma vez
                </Button>
              )}
              {pessoaId && selecionados.size === 0 && (
                <Button type="button" size="sm" variant="outline" onClick={abrirVincCriarNova} className="gap-1.5 text-xs">
                  <Users className="w-3 h-3" /> Criar nova família (só eu)
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setIgnorado(true)} className="text-xs">
                Ignorar por agora
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Marque os checkboxes pra vincular várias pessoas de uma vez à mesma família.
            </p>
            {!pessoaId && (
              <p className="text-[11px] text-muted-foreground">
                Salve a pessoa antes de vincular.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Caso: sem família, sem sugestão (oferecer criar) */}
      {!atual && sugestoes.length === 0 && pessoaId && !carregando && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={abrirVincCriarNova} className="gap-1.5 text-xs">
            <Users className="w-3 h-3" /> Criar família (sem familiares cadastrados)
          </Button>
        </div>
      )}

      {/* Dialog de vinculação */}
      <Dialog open={vincOpen} onOpenChange={setVincOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {vincModo === "nova" ? "Criar nova família" : "Vincular a família"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {vincModo === "existente" && vincSugestao && (
              <div className="rounded-md border p-2 bg-muted/30 text-sm">
                Vincular <strong>{nomeCompleto}</strong> à mesma família de <strong>{vincSugestao.nome_completo}</strong>
                {vincSugestao.familia_nome ? (
                  <> ({vincSugestao.familia_nome})</>
                ) : (
                  <> — uma nova família será criada para os dois</>
                )}
              </div>
            )}

            {/* Se a sugestão não tem família, mostra campo nome */}
            {(vincModo === "nova" || (vincModo === "existente" && !vincSugestao?.familia_id)) && (
              <div>
                <Label>Nome da família</Label>
                <Input value={vincFamiliaNovoNome} onChange={(e) => setVincFamiliaNovoNome(e.target.value)} />
              </div>
            )}

            <div>
              <Label>Esta pessoa é</Label>
              <Select value={vincParentesco} onValueChange={(v) => setVincParentesco(v as ParentescoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PARENTESCO_LABEL) as ParentescoTipo[]).map(k => (
                    <SelectItem key={k} value={k}>{PARENTESCO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={vincResponsavel} onCheckedChange={(v) => setVincResponsavel(!!v)} />
              <span>Marcar como <strong>responsável principal</strong> da família</span>
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={vincCopiarEnd} onCheckedChange={(v) => setVincCopiarEnd(!!v)} />
              <span>Copiar o endereço desta pessoa como endereço base da família</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVincOpen(false)} disabled={vincBusy}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarVinculo} disabled={vincBusy}>
              {vincBusy ? "Salvando..." : "Confirmar vínculo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: vínculo em LOTE */}
      <Dialog open={loteOpen} onOpenChange={setLoteOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Vincular {selecionados.size + 1} pessoas à família
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {!loteFamiliaId && (
              <div>
                <Label>Nome da família (nova)</Label>
                <Input value={loteFamiliaNome} onChange={(e) => setLoteFamiliaNome(e.target.value)} />
              </div>
            )}
            {loteFamiliaId && (
              <div className="rounded-md border p-2 bg-muted/30 text-sm">
                Todas serão vinculadas a <strong>{loteFamiliaNome}</strong>
              </div>
            )}

            {/* Linha da pessoa atual */}
            <div className="rounded-md border p-2 bg-rose-50/50 dark:bg-rose-950/10">
              <p className="text-xs font-semibold mb-1">{nomeCompleto} (esta pessoa)</p>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-xs">Parentesco</Label>
                  <Select value={loteParentescoSelf} onValueChange={(v) => setLoteParentescoSelf(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PARENTESCO_LABEL) as ParentescoTipo[]).map(k => (
                        <SelectItem key={k} value={k}>{PARENTESCO_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer pb-1.5">
                  <Checkbox
                    checked={loteResponsavelId === "__self__"}
                    onCheckedChange={(v) => v && setLoteResponsavelId("__self__")}
                  />
                  <Crown className="w-3 h-3 text-rose-500" />
                  <span>Responsável</span>
                </label>
              </div>
            </div>

            {/* Linha de cada selecionado */}
            {Array.from(selecionados).map(id => {
              const s = sugestoes.find(x => x.pessoa_id === id);
              if (!s) return null;
              return (
                <div key={id} className="rounded-md border p-2">
                  <p className="text-xs font-semibold mb-1">{s.nome_completo}</p>
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <Label className="text-xs">Parentesco</Label>
                      <Select
                        value={loteParentescoPessoa[id] ?? "irmao"}
                        onValueChange={(v) => setLoteParentescoPessoa(prev => ({ ...prev, [id]: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PARENTESCO_LABEL) as ParentescoTipo[]).map(k => (
                            <SelectItem key={k} value={k}>{PARENTESCO_LABEL[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer pb-1.5">
                      <Checkbox
                        checked={loteResponsavelId === id}
                        onCheckedChange={(v) => v && setLoteResponsavelId(id)}
                      />
                      <Crown className="w-3 h-3 text-rose-500" />
                      <span>Responsável</span>
                    </label>
                  </div>
                </div>
              );
            })}

            {!loteFamiliaId && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={loteCopiarEnd} onCheckedChange={(v) => setLoteCopiarEnd(!!v)} />
                <span>Copiar endereço desta pessoa para a família</span>
              </label>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLoteOpen(false)} disabled={loteBusy}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarLote} disabled={loteBusy}>
              {loteBusy ? "Vinculando..." : `Vincular ${selecionados.size + 1} pessoas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
