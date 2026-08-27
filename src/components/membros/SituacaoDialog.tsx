// ─── SituacaoDialog.tsx — trocar a situação sem abrir o assistente ─────────
//
// ── O DEFEITO QUE ELE RESOLVE ──────────────────────────────────────────────
//
// A situação da pessoa só podia ser trocada dentro do `MembroForm`, que é um
// assistente de SEIS passos com guarda de submissão no último (`if (step !==
// 6)`). Marcar alguém como transferido custava: abrir a ficha, escolher o
// status, preencher a data e então clicar "Próximo" cinco vezes por telas que
// não têm nada a ver com o assunto — contato, vínculos, quando serve, acesso,
// revisão.
//
// Telma está começando a organizar a membresia, ou seja, vai repetir isso
// dezenas de vezes seguidas. Cinco cliques inúteis por pessoa deixam de ser
// incômodo e viram motivo para não fazer.
//
// ── POR QUE UM DIÁLOGO PRÓPRIO, E NÃO "SALVAR EM QUALQUER PASSO" ───────────
//
// A alternativa era soltar a guarda do assistente e pôr um "Salvar" em todos
// os passos. Foi descartada por dois motivos:
//
//   · O assistente monta um payload com o formulário INTEIRO (`{...form}`), e
//     grava lateralmente áreas, matrícula de EBD e perfil de serviço. Salvar
//     no meio do caminho grava tudo isso pela metade, em telas que a pessoa
//     nem viu. O CLAUDE.md já registra que mexer na numeração desses passos é
//     a armadilha mais cara deste arquivo.
//
//   · Trocar a situação é uma decisão de assembleia, não uma edição de
//     cadastro. Merece uma pergunta focada, com a data ao lado e a
//     consequência escrita — não um campo perdido entre CPF e estado civil.
//
// Este diálogo grava **duas colunas e nada mais**: `status` e `data_saida`.
//
// ── A ASSINATURA NÃO PASSA POR AQUI ────────────────────────────────────────
//
// Quem registrou fica gravado pelo gatilho `a_assina_saida_do_rol`, no banco
// (migration 20260828180000). Este componente não manda nome nem carimbo de
// hora de propósito: aqui o navegador fala direto com o Postgres, e assinatura
// que o cliente escreve é assinatura que o cliente pode omitir.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_INFO, type MembroStatus } from "@/components/membros/StatusMembroBadge";
import { Loader2, Check } from "lucide-react";

/** Os três que tiram do rol. `inativo` é ausência: a pessoa continua membro. */
const STATUS_DE_SAIDA: MembroStatus[] = ["transferido", "desligado", "falecido"];

/**
 * As opções oferecidas, por tipo de pessoa.
 *
 * Congregado e visitante não têm transferência nem desligamento — eles nunca
 * entraram no rol, e oferecer os três seria oferecer uma saída de onde não se
 * está. Só membro vê a lista inteira, que é a mesma do `MembroForm`.
 */
function opcoesPara(tipo: string): MembroStatus[] {
  return tipo === "membro"
    ? ["ativo", "inativo", "transferido", "desligado", "falecido"]
    : ["ativo", "inativo"];
}

/** O rótulo do seletor da ficha, repetido aqui para as duas telas casarem. */
function rotulo(s: MembroStatus): string {
  return s === "inativo" ? "Inativo (Ausente)" : STATUS_INFO[s].label;
}

interface Pessoa {
  id: string;
  nome_completo: string;
  tipo_pessoa: string;
  status: string;
  data_saida?: string | null;
}

export default function SituacaoDialog({
  open, onOpenChange, pessoa, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoa: Pessoa | null;
  /** Chamado depois de gravar, para a lista atrás refletir a mudança. */
  onSaved?: () => void;
}) {
  const [status, setStatus] = useState<MembroStatus>("ativo");
  const [dataSaida, setDataSaida] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Cada abertura começa do estado REAL da pessoa, e não do que ficou da
  // última vez. Sem isto, abrir o diálogo de alguém depois de ter marcado
  // outro como falecido traria "falecido" pré-selecionado — e um Enter
  // distraído mataria a pessoa errada no cadastro.
  useEffect(() => {
    if (!open || !pessoa) return;
    setStatus((pessoa.status as MembroStatus) ?? "ativo");
    setDataSaida(pessoa.data_saida ?? "");
  }, [open, pessoa?.id]);

  if (!pessoa) return null;

  const saindo = STATUS_DE_SAIDA.includes(status);
  const mudou = status !== pessoa.status || (saindo && dataSaida !== (pessoa.data_saida ?? ""));
  const faltaData = saindo && !dataSaida;

  async function salvar() {
    if (faltaData) {
      toast.error("A data de saída é obrigatória — sem ela a saída não entra no Movimento de Membros.");
      return;
    }
    setSalvando(true);
    try {
      // `.select()` no fim não é enfeite: a política de UPDATE de `membros` é
      // de admin e secretaria, e no Postgres um UPDATE barrado pela RLS afeta
      // zero linhas e devolve SUCESSO. Sem conferir, a tela diria "situação
      // atualizada" sobre uma gravação que não aconteceu.
      const r = conferir(
        await supabase
          .from("membros")
          .update({
            status,
            // Volta a nulo quando a pessoa retorna ao rol. O gatilho do banco
            // também limpa, mas mandar o valor certo daqui evita depender
            // disso para a tela ficar coerente.
            data_saida: saindo ? dataSaida : null,
          })
          .eq("id", pessoa.id)
          .select("id"),
        "A situação",
      );
      if (!r.ok) { toast.error(r.erro); return; }

      toast.success(`${pessoa.nome_completo.split(" ")[0]} agora está como ${rotulo(status)}.`);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar a situação");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Situação de {pessoa.nome_completo}</DialogTitle>
          <DialogDescription className="text-xs">
            Grava só a situação. Para o resto do cadastro, use a edição completa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* ── As opções, em lista e não em seletor ──────────────────────
              Um `Select` esconde as alternativas atrás de um clique, e a
              diferença entre "Inativo" e "Desligado" é justamente o que
              precisa estar à vista na hora de escolher. Aqui as cinco ficam
              abertas, cada uma com a frase que a define — o mesmo texto do
              tooltip da etiqueta, que ninguém abria. */}
          <div className="space-y-1">
            {opcoesPara(pessoa.tipo_pessoa).map(s => {
              const escolhido = s === status;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${escolhido ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Check className={`w-3.5 h-3.5 shrink-0 ${escolhido ? "text-primary" : "text-transparent"}`} />
                    <span className="text-sm font-medium">{rotulo(s)}</span>
                    {s === pessoa.status && (
                      <span className="text-[11px] text-muted-foreground ml-auto shrink-0">atual</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5 pl-[1.375rem] leading-snug">
                    {STATUS_INFO[s].descricao}
                  </span>
                </button>
              );
            })}
          </div>

          {/* A data aparece junto da escolha, e não numa etapa seguinte: é a
              informação que a torna registrável. */}
          {saindo && (
            <div>
              <Label className="text-sm">
                Data de saída <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={dataSaida}
                onChange={(e) => setDataSaida(e.target.value)}
                className={faltaData ? "border-destructive" : ""}
              />
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {status === "falecido"
                  ? "Data do falecimento."
                  : status === "transferido"
                  ? "Data da transferência para a outra igreja."
                  : "Data em que a assembleia aprovou o desligamento."}
                {" "}Fica assinada com o seu nome na ficha.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          {/* Desabilitado enquanto nada mudou: o botão aceso convida a salvar
              uma gravação sem efeito, que a RLS pode barrar em silêncio. */}
          <Button onClick={salvar} disabled={salvando || !mudou}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar situação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
