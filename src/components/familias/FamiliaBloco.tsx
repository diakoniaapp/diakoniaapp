// ─── FamiliaBloco.tsx — Bloco de família no MembroForm ───────────────────────
//
// Mostra:
//  1. Família atual (se a pessoa já tem vínculo) com botão "Trocar"
//  2. Um campo que procura PESSOAS já cadastradas, pelo nome
//  3. A lista de pessoas — sugestões por sobrenome, ou o que a busca achou
//  4. Opção "Criar nova família" com nome auto-sugerido
//  5. Opção "Ignorar por agora"
//
// Quando aceita vincular, abre sub-dialog perguntando:
//   - Tipo de parentesco
//   - Marcar como responsável?
//   - Copiar endereço da pessoa pra família?
//

import { useEffect, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
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
import { Home, UserPlus, Users, Sparkles, X, Crown, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  sugerirVinculos, familiaDaPessoa, criarFamilia, vincularPessoa,
  desvincularPessoa, nomeFamiliaSugerido,
  PARENTESCO_LABEL, type ParentescoTipo, type SugestaoVinculo,
  type Familia, buscarPessoasParaVinculo,
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

  // Busca por PESSOA para vincular.
  //
  // Devolve `SugestaoVinculo`, o mesmo tipo das sugestões automáticas por
  // sobrenome, para os dois resultados caírem na MESMA lista, com a mesma
  // caixa de seleção e o mesmo diálogo de parentesco.
  const [buscaTermo, setBuscaTermo] = useState("");
  const [buscaAchados, setBuscaAchados] = useState<SugestaoVinculo[]>([]);
  const [buscando, setBuscando]     = useState(false);

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
    const ancora = pessoasListadas.find(s => ids.includes(s.pessoa_id) && s.familia_id);
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

  /**
   * A busca roda enquanto se digita, com 300ms de espera.
   *
   * Sem a espera, "Rodrigues" dispararia nove consultas e as respostas
   * poderiam chegar fora de ordem — a de "Rod" depois da de "Rodrigues",
   * sobrescrevendo o resultado certo pelo errado. O `cancelado` cobre o
   * mesmo risco pelo outro lado: a resposta de um termo já abandonado não
   * escreve no estado.
   *
   * Não há botão "Buscar". Ele existia porque o campo morava num diálogo que
   * já custava um clique para abrir; num campo sempre visível, exigir um
   * segundo clique para ver resultado é exigir sem motivo.
   */
  useEffect(() => {
    const t = buscaTermo.trim();
    if (t.length < 2) { setBuscaAchados([]); setBuscando(false); return; }
    let cancelado = false;
    setBuscando(true);
    const id = setTimeout(async () => {
      try {
        const achados = await buscarPessoasParaVinculo(t, pessoaId);
        if (!cancelado) setBuscaAchados(achados);
      } catch (e: any) {
        if (!cancelado) { toast.error(e?.message ?? "Erro ao buscar pessoas"); setBuscaAchados([]); }
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(id); };
  }, [buscaTermo, pessoaId]);

  /**
   * A lista de pessoas que a tela mostra: os achados da busca quando há
   * termo, as sugestões automáticas quando não há.
   *
   * Uma só, e não duas empilhadas. O lote (`abrirVincLote`) escolhe a família
   * âncora daqui: se a lista renderizada e a lista consultada fossem
   * diferentes, marcar alguém achado na busca e clicar em "Vincular" pegaria
   * âncora nula e criaria família nova em vez de entrar na existente.
   */
  const pessoasListadas = buscaTermo.trim().length >= 2 ? buscaAchados : sugestoes;

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
        <Card className="border-destructive-line bg-destructive-soft/40">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate flex items-center gap-1.5">
                  {atual.responsavel && <Crown className="w-3.5 h-3.5 text-destructive-text" />}
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
              <p className="text-xs text-muted-foreground">
                📍 {[atual.familia.endereco, atual.familia.numero, atual.familia.bairro, atual.familia.cidade].filter(Boolean).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Buscar família existente ──────────────────────────────────────

          FORA do cartão de sugestões, e não dentro: as sugestões só
          aparecem quando alguém tem sobrenome parecido, e era justamente
          quando NÃO aparecem que faltava saída. Um genro, uma nora, alguém
          que adotou o nome do cônjuge — nesses casos o bloco inteiro sumia
          e o formulário não oferecia família nenhuma.

          Aqui em cima do cartão porque entrar numa família que já existe é
          o desfecho mais comum e o mais barato de desfazer; criar família
          nova por engano espalha duplicata pelo cadastro. */}
      {!atual && !ignorado && (
        <div className="space-y-2">
          {/* ── O campo de procura, aberto ──────────────────────────────
              Antes isto era um botão que abria um diálogo com o campo
              dentro. Dois cliques e uma tela inteira para o que é a saída
              mais comum do passo — e, pior, um campo que ninguém via: quem
              não reconhecia nenhum dos "possíveis familiares" não tinha por
              onde procurar sem antes descobrir o botão.

              E o que ele procurava eram FAMÍLIAS. Quem cadastra procura o
              parente — "é a mulher do Roger" —, digitava "Roger" e recebia
              "Família Paixão · por causa de Roger Ferreira Cury Paixao":
              duas traduções para chegar à mesma pessoa. Pior, quem ainda não
              tem família nenhuma não aparecia, por não haver família que o
              representasse — e são 294 pessoas para 75 famílias.

              O campo nasce vazio de propósito. O sobrenome já é o que as
              sugestões automáticas abaixo usam; repetir a mesma consulta aqui
              encheria o campo com um termo que a lista de baixo já respondeu. */}
          <div>
            <p className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
              <Search className="w-3.5 h-3.5 text-gold-text" />
              Buscar familiares existentes
            </p>
            <Input
              value={buscaTermo}
              onChange={(e) => setBuscaTermo(e.target.value)}
              // Enter aqui submeteria o formulário de 6 passos inteiro.
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Nome de quem já está cadastrado"
              className="h-9 text-sm"
            />
            {/* O resultado NÃO sai aqui: ele cai no cartão logo abaixo, o
                mesmo das sugestões automáticas. Uma lista de pessoas só, com
                uma aparência só. */}
            {buscando && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Procurando...
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
          {/* Estes dois moram dentro do cartão de sugestões quando ele
              existe. Sem sugestões o cartão não é renderizado, e sem esta
              linha a pessoa ficava sem nenhuma das três saídas. */}
            {pessoasListadas.length === 0 && pessoaId && (
              <Button
                type="button" size="sm" variant="outline"
                onClick={(e) => { e.preventDefault(); abrirVincCriarNova(); }}
                className="gap-1.5 text-xs"
              >
                <Users className="w-3 h-3" /> Criar nova família (só eu)
              </Button>
            )}
            {pessoasListadas.length === 0 && (
              <Button
                type="button" size="sm" variant="ghost"
                onClick={(e) => { e.preventDefault(); setIgnorado(true); }}
                className="text-xs text-muted-foreground"
              >
                Ignorar por agora
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── A lista de pessoas ────────────────────────────────────────────
          Um cartão só para as duas origens: as sugestões automáticas por
          sobrenome, e o que a busca acima devolve. São a mesma coisa — uma
          pessoa que talvez seja parente — e o que se faz com elas é
          idêntico, então empilhar duas listas com aparências diferentes
          seria pedir para quem cadastra descobrir que a de baixo funciona
          igual à de cima.

          Some quando não há nem sugestão nem achado; o campo de busca fica,
          porque é justamente aí que ele serve. */}
      {!atual && !ignorado && pessoasListadas.length > 0 && (
        <Card className="border-warning-line bg-warning-soft/40">
          <CardContent className="py-3 space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5 text-warning-text">
              <Sparkles className="w-3.5 h-3.5" />
              {buscando
                ? "Procurando..."
                : buscaTermo.trim().length >= 2
                  ? `Pessoas encontradas (${pessoasListadas.length}):`
                  : `Possíveis familiares encontrados (${pessoasListadas.length}):`}
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {pessoasListadas.map(s => {
                const checked = selecionados.has(s.pessoa_id);
                return (
                  <label key={s.pessoa_id} className="flex items-center justify-between gap-2 text-sm border-b border-warning-line/40 pb-1.5 last:border-0 cursor-pointer hover:bg-warning-soft/50 rounded px-1 py-1">
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
                      <NomePessoa id={s.pessoa_id} nome={s.nome_completo} className="font-medium truncate" />
                      {s.familia_nome ? (
                        <Badge variant="outline" className="text-xs border-destructive-line text-destructive-text">
                          {s.familia_nome}
                        </Badge>
                      ) : (
                        // Sem esta etiqueta, escolher alguém sem família e cair
                        // num diálogo pedindo NOME DE FAMÍLIA NOVA parece erro.
                        // A busca por pessoa traz muita gente assim: 294
                        // cadastradas para 75 famílias.
                        <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
                          sem família
                        </Badge>
                      )}
                    </div>
                    {pessoaId && (
                      <Button
                        type="button"
                        size="sm" variant="ghost"
                        onClick={(e) => { e.preventDefault(); abrirVincSugestao(s); }}
                        className="gap-1 text-xs shrink-0 h-6 px-2"
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
            <p className="text-xs text-muted-foreground">
              Marque os checkboxes pra vincular várias pessoas de uma vez à mesma família.
            </p>
            {!pessoaId && (
              <p className="text-xs text-muted-foreground">
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
            <div className="rounded-md border p-2 bg-destructive-soft/50">
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
                  <Crown className="w-3 h-3 text-destructive-text" />
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
                      <Crown className="w-3 h-3 text-destructive-text" />
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
