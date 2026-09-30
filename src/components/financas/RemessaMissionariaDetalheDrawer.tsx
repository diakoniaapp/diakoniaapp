// ─── RemessaMissionariaDetalheDrawer.tsx ────────────────────────────────
//
// Pedido dela (30/09/2026): tela de detalhe de uma remessa missionária,
// "seguindo exatamente o padrão visual... já existente em 'Ofertas para
// Missões — detalhe'" (MissoesDrawer.tsx, mesmo Sheet lateral).
//
// ── ESCOPO DA v1 (confirmado com ela) ───────────────────────────────────
//
// A especificação original pedia tabela própria de remessa, workflow de
// status (Planejada/Em Processo/Enviada/Recebida/Cancelada), anexos
// múltiplos, timeline de auditoria completa, motor de alertas configurável
// e geração de PDF dedicada. Medido antes de montar: "remessa" HOJE não é
// uma entidade — é um `fin_lancamentos` comum (saída, categoria "Repasses
// Missionários"), sem tabela própria, sem status, sem anexo múltiplo, sem
// timeline. Mesmo princípio que o cabeçalho de `MissoesDrawer.tsx` já
// registrou construindo a tela irmã desta: "não existe fin_projetos
// vinculado a campanha missionária — a seção fica marcada honestamente
// como 'ainda não existe', não inventada."
//
// Esta v1 mostra os 7 itens da "visão de produto" do pedido — de onde veio
// o dinheiro, quanto foi enviado, para quem, como, com qual comprovante,
// quem registrou, saldo antes/depois — usando só o que já existe:
// `fin_lancamentos` (valor, data, forma_pagamento, comprovante_url,
// audit_user_id) + `fin_fornecedores` (destinatário, se vinculado — já
// tem endereço, telefone, e-mail e PIX, não precisa de tabela nova) + o
// agregado `missoesSaldo` que `PainelTesouraria.tsx` já busca.
//
// `audit_user_id` nunca tinha sido LIDO por tela nenhuma até aqui (só
// gravado) — resolvido pro nome com o mesmo padrão já usado em toda
// tela de relatório do Financeiro (`profiles.select("nome").eq("id",...)`).

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Send, Paperclip, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  brl, buscarFornecedor, comprovanteSignedUrl, FORMA_LABEL,
  type FinLancamentoExtenso, type FinFornecedor,
} from "@/services/finService";
import { formatarTelefoneSemDDI } from "@/lib/telefone";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lancamento: FinLancamentoExtenso | null;
  /** Mesmo agregado que o card "Saldo Missionário" da tela já busca —
   *  reaproveitado, não recalculado aqui. */
  saldoMissionario: { arrecadadoTotal: number; enviadoTotal: number } | null;
  onEditar: () => void;
}

function dataBr(iso: string): string {
  return new Date(iso + "T00:00").toLocaleDateString("pt-BR");
}

export function RemessaMissionariaDetalheDrawer({
  open, onOpenChange, lancamento, saldoMissionario, onEditar,
}: Props) {
  const [fornecedor, setFornecedor] = useState<FinFornecedor | null>(null);
  const [nomeAutor, setNomeAutor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open || !lancamento) { setFornecedor(null); setNomeAutor(null); return; }
    setCarregando(true);
    Promise.all([
      lancamento.fornecedor_id ? buscarFornecedor(lancamento.fornecedor_id) : Promise.resolve(null),
      lancamento.audit_user_id
        ? supabase.from("profiles").select("nome").eq("id", lancamento.audit_user_id).maybeSingle()
            .then(r => r.data?.nome ?? null)
        : Promise.resolve(null),
    ])
      .then(([f, nome]) => { setFornecedor(f); setNomeAutor(nome); })
      .finally(() => setCarregando(false));
  }, [open, lancamento]);

  if (!lancamento) return null;

  const abrirComprovante = async () => {
    if (!lancamento.comprovante_url) return;
    const url = await comprovanteSignedUrl(lancamento.comprovante_url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  // `enviadoTotal` já inclui esta remessa (é o histórico completo até
  // agora) — "saldo após" é literalmente o saldo disponível de hoje.
  const saldoApos = saldoMissionario ? saldoMissionario.arrecadadoTotal - saldoMissionario.enviadoTotal : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-violeta" /> Remessa Missionária — Detalhe
          </SheetTitle>
          <SheetDescription>Resumo completo da remessa enviada.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-2">
            <Cartao rotulo="Valor enviado" valor={brl(Number(lancamento.valor))} cor="text-destructive-text" />
            <Cartao rotulo="Data do envio" valor={dataBr(lancamento.data)} />
            <Cartao rotulo="Forma de envio" valor={lancamento.forma_pagamento ? FORMA_LABEL[lancamento.forma_pagamento] : "—"} />
            <Cartao rotulo="Saldo missionário após" valor={saldoApos != null ? brl(saldoApos) : "—"} cor="text-violeta-text" />
          </div>

          <Secao titulo="Dados da remessa">
            <Linha rotulo="Conta de origem" valor={lancamento.conta_nome ?? "—"} />
            <Linha rotulo="Documento" valor={lancamento.documento_numero || "—"} />
            <Linha rotulo="Observações" valor={lancamento.observacoes || "—"} />
            <Linha rotulo="Registrado por" valor={carregando ? "…" : (nomeAutor ?? "—")} />
            {lancamento.comprovante_url && (
              <Button type="button" variant="outline" size="sm" className="gap-1.5 mt-1.5" onClick={abrirComprovante}>
                <Paperclip className="w-3.5 h-3.5" /> Ver comprovante
              </Button>
            )}
          </Secao>

          {/* Sem fornecedor vinculado não vira tela vazia — diz o que TEM
              (a descrição livre do lançamento), sem inventar destinatário
              nenhum. */}
          <Secao titulo="Destinatário">
            {fornecedor ? (
              <>
                <Linha rotulo="Nome" valor={fornecedor.nome} />
                {(fornecedor.cidade || fornecedor.uf) && (
                  <Linha rotulo="Local" valor={[fornecedor.cidade, fornecedor.uf].filter(Boolean).join(" / ")} />
                )}
                {fornecedor.telefone && <Linha rotulo="Telefone" valor={formatarTelefoneSemDDI(fornecedor.telefone)} />}
                {fornecedor.email && <Linha rotulo="E-mail" valor={fornecedor.email} />}
                {fornecedor.chave_pix && <Linha rotulo="Chave PIX" valor={fornecedor.chave_pix} />}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sem fornecedor cadastrado neste lançamento
                {lancamento.descricao ? ` — descrição: "${lancamento.descricao}"` : ""}.
              </p>
            )}
          </Secao>

          {saldoMissionario && (
            <Secao titulo="Fundo missionário">
              <Linha rotulo="Arrecadado (histórico)" valor={brl(saldoMissionario.arrecadadoTotal)} />
              <Linha rotulo="Enviado (histórico)" valor={brl(saldoMissionario.enviadoTotal)} />
              <Linha rotulo="Saldo disponível" valor={brl(saldoApos ?? 0)} />
            </Secao>
          )}

          <Button type="button" variant="outline" className="w-full gap-1.5" onClick={onEditar}>
            <Pencil className="w-3.5 h-3.5" /> Editar remessa
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">{rotulo}</p>
      <p className={`text-sm font-bold tabular-nums ${cor ?? ""}`}>{valor}</p>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between text-xs gap-2">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right">{valor}</span>
    </div>
  );
}
