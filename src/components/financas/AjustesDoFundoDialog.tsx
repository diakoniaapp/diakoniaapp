// ─── AjustesDoFundoDialog.tsx — ajustes históricos do Fundo Missionário ───
//
// Pedido dela (06/10/2026): separar SALDO REGISTRADO (só o que está no banco) de SALDO AJUSTADO (com
// os acertos históricos conhecidos). O ajuste NÃO altera lançamentos, extratos, contabilidade nem
// prestação de contas — é só visão gerencial. Por isso aqui não há "apagar": desativa-se, e o
// ajuste desativado deixa de entrar no saldo ajustado mas continua no histórico, com o motivo.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoData } from "@/components/CampoData";
import { brl } from "@/services/finService";
import { hojeLocal } from "@/lib/data";
import type { AjusteDoFundo } from "@/lib/missoesModelo";
import { criarAjusteDoFundo, definirAjusteAtivo, RECADO_MIGRATION_DE_MISSOES } from "@/services/missoesService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ajustes: AjusteDoFundo[];
  /** A tabela de ajustes existe (migration 20261006180000 aplicada). */
  disponivel: boolean;
  onMudou: () => void;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AjustesDoFundoDialog({ open, onOpenChange, ajustes, disponivel, onMudou }: Props) {
  const [data, setData] = useState(hojeLocal());
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);

  const valorNumerico = Number(valor.replace(",", "."));

  async function adicionar() {
    if (!descricao.trim()) { toast.error("Descreva o ajuste."); return; }
    if (!Number.isFinite(valorNumerico) || valorNumerico === 0) { toast.error("Informe um valor diferente de zero."); return; }
    if (!justificativa.trim()) { toast.error("Escreva a justificativa: é ela que explica o ajuste no futuro."); return; }
    setSalvando(true);
    try {
      await criarAjusteDoFundo({ data_referencia: data, descricao, valor: valorNumerico, justificativa });
      toast.success("Ajuste registrado");
      setDescricao(""); setValor(""); setJustificativa("");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o ajuste");
    } finally { setSalvando(false); }
  }

  async function alternar(a: AjusteDoFundo) {
    try {
      await definirAjusteAtivo(a.id, !a.ativo);
      toast.success(a.ativo ? "Ajuste desativado" : "Ajuste reativado");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o ajuste");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes do Fundo Missionário</DialogTitle>
          <DialogDescription>
            Visão gerencial: o ajuste <strong>não altera lançamentos, extratos, contabilidade nem a prestação
            de contas</strong>. Ele só acerta o <em>saldo ajustado</em> por histórico conhecido (ex.: campanhas
            arrecadadas antes do Omie). Valor positivo aumenta o saldo ajustado.
          </DialogDescription>
        </DialogHeader>

        {!disponivel ? (
          <p className="text-sm border border-dashed rounded-md p-3 text-muted-foreground">{RECADO_MIGRATION_DE_MISSOES}</p>
        ) : (
          <>
            {ajustes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ajuste registrado.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {ajustes.map(a => (
                  <li key={a.id} className={`p-3 text-sm space-y-1 ${a.ativo ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{a.descricao}</p>
                        <p className="text-xs text-muted-foreground">{dataBr(a.data_referencia)}{a.ativo ? "" : " · desativado"}</p>
                      </div>
                      <span className="font-bold tabular-nums shrink-0">{brl(Number(a.valor))}</span>
                    </div>
                    {a.justificativa && <p className="text-xs text-muted-foreground">{a.justificativa}</p>}
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => alternar(a)}>
                      {a.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-semibold">Novo ajuste</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de referência</Label>
                  <CampoData value={data} onChange={setData} />
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="12032.69" />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Campanhas anteriores ao Omie" />
              </div>
              <div>
                <Label>Justificativa *</Label>
                <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3}
                  placeholder="O que aconteceu, que evidência sustenta e o que ainda falta confirmar." />
              </div>
              <Button type="button" onClick={adicionar} disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar ajuste"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
