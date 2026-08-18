// ─── ConvidarParaEvento.tsx ────────────────────────────────────────────────
//
// Convite de um evento para a igreja.
//
// POR QUE NÃO EXISTE "ENVIAR PARA TODOS" AQUI
//
// O WhatsApp não tem link que envie para várias pessoas. Um `wa.me` abre UMA
// conversa. "Envio em massa" por links significaria abrir uma aba por pessoa
// — coisa que o WhatsApp trata como spam e que costuma custar o bloqueio do
// número da igreja.
//
// O que o WhatsApp oferece de verdade é a LISTA DE TRANSMISSÃO: criada dentro
// do aplicativo, a partir de uma lista de números, e que entrega a mensagem
// individualmente a cada contato que tenha o número da igreja salvo.
//
// Então este diálogo faz as duas coisas que funcionam:
//
//   1. Compartilhar — abre o WhatsApp com o texto pronto e o seletor de
//      contatos, para mandar a quem se quiser na hora.
//   2. Copiar os telefones — para montar a lista de transmissão uma vez e
//      reusá-la nos próximos convites.
//
// E diz, sem rodeio, para quantos a igreja consegue mandar: o alcance real é
// menor que o número de cadastros, e esconder isso faria a liderança acreditar
// que avisou a igreja inteira.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Copy, Check, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizarTelefone, validarTelefone } from "@/lib/telefone";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  data: string;                 // ISO (yyyy-mm-dd)
  horaInicio?: string | null;
  horaFim?: string | null;
  local?: string | null;
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function montarMensagem(p: Omit<Props, "open" | "onOpenChange">): string {
  const linhas = [`📅 *${p.titulo}*`];

  const quando = [formatarData(p.data), p.horaInicio ? `às ${p.horaInicio.slice(0, 5)}` : null]
    .filter(Boolean).join(" ");
  linhas.push(quando + (p.horaFim ? ` — até ${p.horaFim.slice(0, 5)}` : ""));

  if (p.local) linhas.push(`📍 ${p.local}`);
  linhas.push("");
  linhas.push("Será uma alegria ter você conosco! 🙏");

  return linhas.join("\n");
}

export function ConvidarParaEvento({ open, onOpenChange, ...evento }: Props) {
  const [mensagem, setMensagem] = useState("");
  const [telefones, setTelefones] = useState<string[] | null>(null);
  const [totalAtivos, setTotalAtivos] = useState(0);
  const [copiado, setCopiado] = useState<"texto" | "fones" | null>(null);

  // Recompõe ao abrir: se o texto foi editado e o diálogo fechado, a próxima
  // abertura começa do convite limpo, e não do rascunho anterior.
  useEffect(() => {
    if (open) setMensagem(montarMensagem(evento));
  }, [open, evento.titulo, evento.data, evento.horaInicio, evento.horaFim, evento.local]);

  useEffect(() => {
    if (!open || telefones !== null) return;
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("membros")
        .select("telefone_celular")
        .eq("status", "ativo");
      if (cancelado) return;

      const lista = data ?? [];
      setTotalAtivos(lista.length);

      // Set para não mandar duas vezes a quem divide o telefone com a família.
      const validos = new Set<string>();
      for (const m of lista) {
        if (!validarTelefone(m.telefone_celular).ok) continue;
        const e164 = normalizarTelefone(m.telefone_celular);
        if (e164) validos.add(e164);
      }
      setTelefones([...validos]);
    })();
    return () => { cancelado = true; };
  }, [open, telefones]);

  const copiar = async (texto: string, qual: "texto" | "fones") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  };

  const abrirWhats = () => {
    // Sem número: o WhatsApp abre o seletor de contatos com o texto pronto.
    window.open(
      `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
      "_blank", "noopener,noreferrer",
    );
  };

  const alcance = telefones?.length ?? 0;
  const pct = totalAtivos > 0 ? Math.round((alcance / totalAtivos) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar para {evento.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="msg-convite">
              Mensagem — pode editar antes de enviar
            </label>
            <Textarea
              id="msg-convite"
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={7}
              className="mt-1 font-mono text-sm"
            />
          </div>

          {/* O alcance dito em número, não em promessa. */}
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {telefones === null ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Contando quem tem telefone...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>
                  <strong className="text-foreground tabular-nums">{alcance}</strong> de{" "}
                  <span className="tabular-nums">{totalAtivos}</span> pessoas ativas têm telefone
                  cadastrado <span className="tabular-nums">({pct}%)</span>.
                </span>
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button" variant="outline"
            onClick={() => copiar(mensagem, "texto")}
            className="gap-1.5 w-full sm:w-auto"
          >
            {copiado === "texto" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado === "texto" ? "Copiado" : "Copiar mensagem"}
          </Button>

          <Button
            type="button" variant="outline"
            disabled={!alcance}
            onClick={() => copiar((telefones ?? []).join("\n"), "fones")}
            className="gap-1.5 w-full sm:w-auto"
            title="Para montar uma lista de transmissão no WhatsApp"
          >
            {copiado === "fones" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiado === "fones" ? "Copiados" : `Copiar ${alcance} telefones`}
          </Button>

          <Button
            type="button"
            onClick={abrirWhats}
            className="gap-1.5 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <MessageCircle className="w-4 h-4" /> Compartilhar
          </Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground -mt-1">
          <strong>Compartilhar</strong> abre o WhatsApp para você escolher os contatos.
          Para avisar a igreja inteira de uma vez, copie os telefones e crie uma{" "}
          <strong>lista de transmissão</strong> no WhatsApp — ela entrega a mensagem
          individualmente, e só chega a quem tem o número da igreja salvo.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export default ConvidarParaEvento;
