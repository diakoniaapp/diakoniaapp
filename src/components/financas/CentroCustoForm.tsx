import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { paraNumero } from "@/lib/dinheiro";
import {
  atualizarCentroCusto, criarCentroCusto, VINCULO_LABEL,
  type FinCentroCusto,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // `null` com `open=true` = criando um centro novo (vinculo_tipo
  // "geral" — os outros tipos nascem sozinhos, sincronizados de
  // ministério/área/EBD/PGM/campanha, e criar um manualmente com esses
  // tipos desalinharia do que ele diz representar).
  centro: FinCentroCusto | null;
  // Lista completa (todos os tipos, ativos e inativos) — só pra montar o
  // seletor de "centro pai" na criação. Vem de fora (`FinancasAdmin.tsx`
  // já carrega isso pra tela inteira) em vez de buscar de novo aqui.
  centrosDisponiveis: FinCentroCusto[];
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
];

// Editar muda nome/cor/orçamento sempre — e, desde 17/09/2026, também o
// centro pai, MAS só quando o tipo atual é "geral" ou "subgrupo_
// administracao" (`podeReparentar` abaixo). `vinculo_tipo` continua
// travado pros outros tipos (ministério/área/EBD/PGM/campanha/evento):
// esses nascem sincronizados com uma linha de outra tabela por
// `vinculo_id`, e "Sincronizar com ministérios" (`fin_seed_centros_
// custo()`) usa esse par (tipo, vinculo_id) pra saber que já existe —
// reparentar um desses pra "subgrupo" faria o próximo sync recriar um
// centro "ministério" novo, duplicado, porque o original já não bateria
// mais o par esperado.
//
// Criar (16/09/2026, pedido da Telma — "permita adição dos centros de
// custo"): `criarCentroCusto()` já existia no serviço desde 13/09/2026
// mas nenhuma tela chamava — a única forma de nascer um centro era o
// seed automático. Restrito a quem tem a permissão `estruturar_
// financeiro` (só a Telma, papel "proprietario") — ver o botão "Novo
// centro de custo" em FinancasAdmin.tsx, escondido pra quem não tem essa
// permissão.
export function CentroCustoForm({ open, onOpenChange, centro, centrosDisponiveis, onSaved }: Props) {
  const criando = open && !centro;
  // Editando um "geral" ou um subgrupo já existente — pedido da Telma
  // (17/09/2026): "inserir o subgrupo funciona apenas para novos
  // centros? eu gostaria de editar os que já temos, adicionando os
  // subgrupos". Antes o seletor de pai só aparecia na criação.
  const podeReparentar = criando || centro?.vinculo_tipo === "geral" || centro?.vinculo_tipo === "subgrupo_administracao";
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#888");
  const [orcamentoTexto, setOrcamentoTexto] = useState("");
  // "" = centro principal (sem pai), vira `vinculo_tipo: "geral"`. Qualquer
  // outro valor = id de um centro existente, vira `vinculo_tipo:
  // "subgrupo_administracao"` — pedido da Telma (17/09/2026): "qualquer
  // ministério pode ter subgrupo... clicando em min adm, abre os
  // subgrupos deste centro". Só oferece centros que NÃO são eles mesmos
  // subgrupo — um subgrupo dentro de subgrupo não tem uso pedido, e
  // complicaria a tela de detalhe (que só sabe mostrar 1 nível).
  const [centroPaiId, setCentroPaiId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const paisDisponiveis = useMemo(
    () => centrosDisponiveis.filter(c =>
      c.vinculo_tipo !== "subgrupo_administracao" && c.ativo
      // Editando: não pode ser pai de si mesmo, nem de um centro que já
      // é filho dele (evita o ciclo "A é pai de B, B passa a ser pai de
      // A" — improvável com só 1 nível de hierarquia hoje, mas de graça
      // pra evitar).
      && c.id !== centro?.id,
    ),
    [centrosDisponiveis, centro?.id],
  );
  const paiEscolhido = paisDisponiveis.find(c => c.id === centroPaiId);

  useEffect(() => {
    if (!open) return;
    setNome(centro?.nome ?? "");
    setCor(centro?.cor ?? "#888");
    setOrcamentoTexto(centro?.orcamento_anual != null ? String(centro.orcamento_anual) : "");
    setCentroPaiId(centro?.centro_pai_id ?? "");
  }, [open, centro]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const orcamento_anual = orcamentoTexto.trim() ? paraNumero(orcamentoTexto) : null;
      const vinculoPatch = centroPaiId
        ? { vinculo_tipo: "subgrupo_administracao" as const, vinculo_id: null, vinculo_nome: null, centro_pai_id: centroPaiId }
        : { vinculo_tipo: "geral" as const, vinculo_id: null, vinculo_nome: null, centro_pai_id: null };
      if (criando) {
        await criarCentroCusto({ nome: nome.trim(), cor, orcamento_anual, ...vinculoPatch });
        toast.success("Centro de custo criado");
      } else {
        if (!centro) return;
        await atualizarCentroCusto(centro.id, {
          nome: nome.trim(), cor, orcamento_anual,
          ...(podeReparentar ? vinculoPatch : {}),
        });
        toast.success("Centro de custo atualizado");
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
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            {criando ? "Novo centro de custo" : "Editar centro de custo"}
            {!criando && centro && <Badge variant="outline" className="text-xs">{VINCULO_LABEL[centro.vinculo_tipo]}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {criando
              ? "Uso livre, sem vínculo automático a ministério/área/EBD/PGM/campanha — mas pode entrar como subgrupo de qualquer centro já existente."
              : podeReparentar
              ? "Pode mudar o centro pai a qualquer momento — o resto do vínculo não muda por aqui."
              : "Sincronizado automaticamente — tipo de vínculo e centro pai não mudam por aqui."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>

          <div>
            <Label>Orçamento anual (R$)</Label>
            <Input type="text" inputMode="decimal" value={orcamentoTexto}
              onChange={(e) => setOrcamentoTexto(e.target.value)}
              placeholder="Opcional" />
          </div>

          {/* Na criação sempre; editando, só quando o tipo atual permite
              (`podeReparentar`, ver comentário no topo do arquivo) —
              ministério/área/EBD/PGM/campanha/evento continuam travados. */}
          {podeReparentar && (
            <div>
              <Label>Centro pai (opcional)</Label>
              <Select value={centroPaiId || "__nenhum__"} onValueChange={(v) => {
                const novoId = v === "__nenhum__" ? "" : v;
                setCentroPaiId(novoId);
                // Sugere o prefixo "{Pai} · " no nome — mesmo padrão que
                // já existe nos 5 subgrupos de Min. Administração
                // (Administração · Patrimônio, · Pessoal...). Só quando o
                // nome ainda está vazio, pra não sobrescrever o que a
                // pessoa já digitou.
                if (novoId && !nome.trim()) {
                  const pai = paisDisponiveis.find(c => c.id === novoId);
                  if (pai) setNome(`${pai.nome.replace(/^Min\.\s*/, "")} · `);
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Nenhum — centro principal</SelectItem>
                  {paisDisponiveis.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {centroPaiId
                  ? `Vira um subgrupo contábil dentro de "${paiEscolhido?.nome}" — aparece lá dentro, não na lista principal.`
                  : "Sem pai, este centro entra na lista principal, igual aos de ministério/área/EBD/PGM/campanha."}
              </p>
            </div>
          )}

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
