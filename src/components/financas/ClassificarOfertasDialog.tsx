// ─── ClassificarOfertasDialog.tsx — classificar as ofertas missionárias em lote ───
//
// Pedido dela (06/10/2026): as ofertas sem campanha NÃO são classificadas automaticamente. Este
// diálogo só SUGERE: agrupa pelo ciclo (oferta → campanha da próxima remessa que fecha o ciclo, ≥ R$
// 20.000) e mostra o total de cada grupo. Nada vem marcado: ela confirma grupo a grupo, pode trocar a
// campanha de um grupo, e só então grava. Ver docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@/services/finService";
import {
  CAMPANHAS_EM_ORDEM, ROTULO_DA_CAMPANHA, VALOR_QUE_FECHA_CICLO,
  type CampanhaMissionaria, type GrupoDeCiclo,
} from "@/lib/missoesModelo";
import { classificarCampanhaEmLote, RECADO_MIGRATION_DE_MISSOES } from "@/services/missoesService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grupos: GrupoDeCiclo[];
  /** O campo campanha_missionaria existe (migration 20261006180000 aplicada). */
  disponivel: boolean;
  onAplicado: () => void;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function ClassificarOfertasDialog({ open, onOpenChange, grupos, disponivel, onAplicado }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [campanhas, setCampanhas] = useState<Record<string, CampanhaMissionaria>>({});
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMarcados(new Set());                                   // nada vem marcado
    setCampanhas(Object.fromEntries(grupos.map(g => [g.chave, g.campanha])));
  }, [open, grupos]);

  const selecionados = grupos.filter(g => marcados.has(g.chave));
  const totalOfertas = selecionados.reduce((s, g) => s + g.quantidade, 0);
  const totalValor = Math.round(selecionados.reduce((s, g) => s + g.total, 0) * 100) / 100;

  function alternar(chave: string) {
    setMarcados(m => { const n = new Set(m); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  }

  async function aplicar() {
    setGravando(true);
    try {
      let gravadas = 0;
      for (const g of selecionados) gravadas += await classificarCampanhaEmLote(g.ids, campanhas[g.chave] ?? g.campanha);
      toast.success(`${gravadas} oferta${gravadas === 1 ? "" : "s"} classificada${gravadas === 1 ? "" : "s"}`);
      onAplicado();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível classificar");
      onAplicado();                                           // alguns blocos podem ter gravado: recarrega
    } finally { setGravando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Classificar ofertas missionárias em lote</DialogTitle>
          <DialogDescription>
            Sugestão por ciclo: cada oferta vai para a campanha da próxima remessa de pelo menos {brl(VALOR_QUE_FECHA_CICLO)}
            {" "}(as menores são complementos e não fecham ciclo). <strong>Nada é gravado sem a sua confirmação</strong>:
            marque os grupos que confere e, se discordar, troque a campanha do grupo.
          </DialogDescription>
        </DialogHeader>

        {!disponivel ? (
          <p className="text-sm border border-dashed rounded-md p-3 text-muted-foreground">{RECADO_MIGRATION_DE_MISSOES}</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Não há o que sugerir: faltam remessas já classificadas com valor a partir de {brl(VALOR_QUE_FECHA_CICLO)}
            {" "}(elas definem os ciclos), ou todas as ofertas já têm campanha.
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {grupos.map(g => (
                <li key={g.chave} className="p-3 flex items-start gap-3">
                  <Checkbox checked={marcados.has(g.chave)} onCheckedChange={() => alternar(g.chave)} className="mt-1"
                    aria-label={`Selecionar o ciclo ${g.chave}`} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {g.fechaEm ? `Ciclo fechado em ${dataBr(g.fechaEm)}` : "Ciclo em andamento (ainda sem remessa)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {g.quantidade} oferta{g.quantidade === 1 ? "" : "s"} · {dataBr(g.de)} a {dataBr(g.ate)}
                    </p>
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                      Campanha:
                      <select value={campanhas[g.chave] ?? g.campanha}
                        onChange={e => setCampanhas(c => ({ ...c, [g.chave]: e.target.value as CampanhaMissionaria }))}
                        className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground">
                        {CAMPANHAS_EM_ORDEM.map(c => <option key={c} value={c}>{ROTULO_DA_CAMPANHA[c]}</option>)}
                      </select>
                    </label>
                  </div>
                  <span className="font-bold tabular-nums shrink-0 text-sm">{brl(g.total)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {selecionados.length === 0 ? "Nenhum grupo marcado." : `${totalOfertas} ofertas · ${brl(totalValor)} serão gravadas.`}
              </p>
              <Button type="button" onClick={aplicar} disabled={gravando || selecionados.length === 0}>
                {gravando ? "Gravando…" : "Classificar os marcados"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
