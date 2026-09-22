import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  criarCategoria, atualizarCategoria, listarCentrosCusto,
  type FinCategoria, type FinMovimentoTipo, type FinClassificacaoDRE, type FinCentroCusto,
} from "@/services/finService";

// Pedido da Telma (16/09/2026), depois de criar "Devoluções e Estornos"
// por aqui e a categoria nascer sem `classificacao_dre`: o campo nunca
// esteve neste formulário — só migration/SQL direto preenchia. Sem ele,
// TODA categoria nova criada pela tela fica de fora da Prestação de
// Contas/DRE em silêncio (a mesma lacuna já achada com "Assistência
// Social / Ação Social" da Diaconia). Opções filtradas por `tipo`
// porque uma categoria de entrada não pode ser "despesas", e vice-versa.
const CLASSIFICACAO_POR_TIPO: Record<FinMovimentoTipo, { valor: FinClassificacaoDRE; rotulo: string }[]> = {
  entrada: [
    { valor: "receitas_regulares", rotulo: "Receitas Regulares (dízimos, ofertas)" },
    { valor: "outras_receitas", rotulo: "Outras Receitas" },
  ],
  saida: [
    { valor: "despesas", rotulo: "Despesas" },
    { valor: "despesas_financeiras", rotulo: "Despesas Financeiras" },
    { valor: "outras_despesas", rotulo: "Outras Despesas" },
  ],
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoria?: FinCategoria | null;
  tipoPadrao?: FinMovimentoTipo;
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
  "#7c3aed","#16a34a","#eab308","#d97706","#be185d","#3f3f46",
];

export function CategoriaForm({ open, onOpenChange, categoria, tipoPadrao = "saida", onSaved }: Props) {
  const isEdit = !!categoria;
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<FinMovimentoTipo>(tipoPadrao);
  const [cor, setCor] = useState("#888");
  const [ordem, setOrdem] = useState<number>(50);
  const [contaContabil, setContaContabil] = useState("");
  const [classificacaoDre, setClassificacaoDre] = useState<FinClassificacaoDRE | "">("");
  // Sugestão automática de centro de custo (22/09/2026) — "Centro de
  // Custo Padrão" e "Subcentro de Custo Padrão" como dois campos NA TELA
  // (pedido explícito da Telma, com mockup mostrando os dois separados),
  // mas no banco é uma coluna só (`centro_custo_padrao_id`): um centro
  // raiz (`centro_pai_id` nulo) OU um subcentro (`centro_pai_id`
  // preenchido) — mesmo desenho de `fin_fornecedores.centro_custo_
  // padrao_id`. `centroPrincipalId` guarda a escolha do 1º seletor;
  // `subcentroId` a do 2º, sempre filtrado pelos filhos do 1º.
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [centroPrincipalId, setCentroPrincipalId] = useState("");
  const [subcentroId, setSubcentroId] = useState("");
  const [busy, setBusy] = useState(false);

  const centrosPrincipais = centros.filter(c => !c.centro_pai_id);
  const subcentrosDoPrincipal = centros.filter(c => c.centro_pai_id === centroPrincipalId);

  useEffect(() => {
    if (!open) return;
    listarCentrosCusto().then(setCentros);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (categoria) {
      setNome(categoria.nome);
      setTipo(categoria.tipo);
      setCor(categoria.cor ?? "#888");
      setOrdem(categoria.ordem ?? 50);
      setContaContabil(categoria.conta_contabil ?? "");
      setClassificacaoDre(categoria.classificacao_dre ?? "");
    } else {
      setNome(""); setTipo(tipoPadrao);
      setCor("#888"); setOrdem(50); setContaContabil(""); setClassificacaoDre("");
    }
  }, [open, categoria, tipoPadrao]);

  // Separado do efeito acima: precisa de `centros` carregado pra saber se
  // o `centro_custo_padrao_id` salvo é raiz ou subcentro (e então achar o
  // pai). Roda de novo quando `centros` chega, não só na abertura.
  useEffect(() => {
    if (!open || centros.length === 0) return;
    const padraoId = categoria?.centro_custo_padrao_id ?? "";
    if (!padraoId) { setCentroPrincipalId(""); setSubcentroId(""); return; }
    const centro = centros.find(c => c.id === padraoId);
    if (!centro) { setCentroPrincipalId(""); setSubcentroId(""); return; }
    if (centro.centro_pai_id) { setCentroPrincipalId(centro.centro_pai_id); setSubcentroId(centro.id); }
    else { setCentroPrincipalId(centro.id); setSubcentroId(""); }
  }, [open, categoria, centros]);

  // Trocar o Centro invalida o Subcentro escolhido antes (era filho de
  // outro pai) — mesma ideia de `mudarTipo` abaixo, pra classificação.
  function mudarCentroPrincipal(v: string) {
    setCentroPrincipalId(v);
    setSubcentroId("");
  }

  // Trocar entrada↔saída invalida a classificação escolhida (uma
  // categoria de entrada não pode ser "despesas") — mesma guarda que já
  // existia pra `tipo` em si (desabilitado pra categoria do sistema).
  function mudarTipo(novoTipo: FinMovimentoTipo) {
    setTipo(novoTipo);
    if (!CLASSIFICACAO_POR_TIPO[novoTipo].some(o => o.valor === classificacaoDre)) {
      setClassificacaoDre("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    // Governança pedida pela Telma (16/09/2026): "todas as depesas
    // precisam ser apresentadas em conselho, então todas precisam estar
    // no relatorio" — nenhuma categoria de SAÍDA pode nascer ou ficar
    // "Fora do Plano Oficial". O seletor abaixo já esconde essa opção
    // pra saída; esta é a segunda trava, pro caso de uma categoria
    // existente chegar aqui já com `classificacao_dre` nulo (dado
    // antigo, ou uma categoria que estava "entrada" e virou "saida").
    if (tipo === "saida" && !classificacaoDre) {
      toast.error("Toda categoria de saída precisa de uma classificação — não pode ficar fora da Prestação de Contas.");
      return;
    }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        tipo, cor, ordem,
        conta_contabil: contaContabil.trim() || null,
        classificacao_dre: classificacaoDre || null,
        centro_custo_padrao_id: subcentroId || centroPrincipalId || null,
      };
      if (isEdit && categoria) {
        await atualizarCategoria(categoria.id, payload);
        toast.success("Categoria atualizada");
      } else {
        await criarCategoria(payload);
        toast.success("Categoria criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {isEdit ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={tipo === "entrada" ? "default" : "outline"}
              onClick={() => mudarTipo("entrada")}
              className={tipo === "entrada" ? "bg-success text-white hover:bg-success gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingUp className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => mudarTipo("saida")}
              className={tipo === "saida" ? "bg-destructive text-white hover:bg-destructive gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingDown className="w-3.5 h-3.5" /> Saída
            </Button>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus
              placeholder="Ex: Material de som" />
          </div>

          <div>
            <Label>Classificação no Plano de Contas</Label>
            {/* BUG CRÍTICO corrigido (18/09/2026, achado ao vivo — "Dízimos"
                salvava "Receitas Regulares" no banco, mas reabrir sempre
                mostrava "Fora do Plano Oficial"). Causa: o Radix Select
                chama `onValueChange("")` sozinho quando o `value` atual
                não bate com nenhum `SelectItem` MONTADO ainda — aqui isso
                acontece no primeiro render depois de abrir o diálogo,
                quando `tipo` ainda carrega o valor antigo (de uma edição
                anterior) por uma fração de segundo antes do `useEffect`
                corrigir, e a lista de opções momentaneamente não inclui
                o item certo. Sem guarda, esse `onValueChange("")` batia
                no mesmo `if` que trata o clique real em "Fora do Plano
                Oficial" (`v === "__fora__"`) e limpava o campo — a escrita
                no banco nunca foi afetada, só a LEITURA na tela seguinte.
                Mesmo padrão já corrigido em `LancamentoForm.tsx`
                (categoria/centro de custo, 17/09/2026): ignorar `v` vazio
                é seguro porque um clique de verdade em "Fora do Plano
                Oficial" sempre manda `"__fora__"`, nunca `""`. */}
            <Select value={classificacaoDre || "__fora__"} onValueChange={(v) => { if (v) setClassificacaoDre(v === "__fora__" ? "" : v as FinClassificacaoDRE); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* "Fora do Plano Oficial" só existe pra ENTRADA — pedido
                    da Telma (16/09/2026): toda despesa tem que ir a
                    conselho, então nenhuma categoria de saída pode ficar
                    de fora do relatório oficial. */}
                {tipo === "entrada" && <SelectItem value="__fora__">Fora do Plano Oficial</SelectItem>}
                {CLASSIFICACAO_POR_TIPO[tipo].map(o => (
                  <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tipo === "saida"
                ? "Toda categoria de saída entra na Prestação de Contas — não tem opção de ficar de fora."
                : "\"Fora do Plano Oficial\" não entra na Prestação de Contas nem na DRE — só no extrato."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordem</Label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 50)} />
              <p className="text-xs text-muted-foreground mt-0.5">Menor aparece primeiro</p>
            </div>
            <div>
              <Label>Conta contábil</Label>
              <Input value={contaContabil} onChange={(e) => setContaContabil(e.target.value)}
                placeholder="Ex: 3.1.01" />
            </div>
          </div>

          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CORES.map(c => (
                <button key={c} type="button"
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Centro de custo padrão</Label>
              <Select value={centroPrincipalId} onValueChange={(v) => { if (v) mudarCentroPrincipal(v); }}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {centrosPrincipais.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subcentro de custo padrão</Label>
              <Select value={subcentroId} onValueChange={(v) => { if (v) setSubcentroId(v); }}
                disabled={!centroPrincipalId || subcentrosDoPrincipal.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={centroPrincipalId ? "(nenhum)" : "Escolha o centro primeiro"}>
                    {subcentrosDoPrincipal.find(c => c.id === subcentroId)?.nome.split(" · ")[1]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {subcentrosDoPrincipal.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome.split(" · ")[1] ?? c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1.5">
            Sugerido sozinho ao escolher esta categoria num lançamento (dá pra trocar na hora).
            Sem padrão cadastrado, o sistema sugere pelo centro mais usado nesta categoria até aqui.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
