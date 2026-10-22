// ─── EnviarMensagemDialog — a mensagem de WhatsApp ao visitante, já escrita pela configuração (Mensagens ao Visitante), para conferir, ajustar e enviar ───────────────────────────────────────────────────
// A situação (primeira visita, segunda visita, não retornou, interesse em membresia, infantil, jovem, indicado por ministério) começa na que o sistema indica e pode ser trocada; trocar refaz o texto enquanto
// ele não tiver sido editado à mão. "Abrir WhatsApp" abre a conversa com o texto pronto e, em seguida, a Central pergunta como foi o contato (para registrar). Sem configuração ligada, usa o texto antigo.
import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ROTULO_DA_SITUACAO, SITUACOES, type PacoteDeMensagens, type SituacaoDaMensagem } from "@/lib/mensagensVisitante";
import { textoDoVisitante } from "@/lib/mensagemDoVisitante";
import { buildWhatsAppLink } from "@/lib/visitantesFluxo";

export interface AlvoDaMensagem { id: string; nome: string; telefone: string | null; situacaoInicial: SituacaoDaMensagem; textoAntigo: string }

export function EnviarMensagemDialog({ alvo, pacote, onFechar, onAberto }: {
  alvo: AlvoDaMensagem | null; pacote: PacoteDeMensagens | null; onFechar: () => void; /** chamado depois de abrir o WhatsApp: a Central pergunta o resultado do contato */ onAberto: (alvo: AlvoDaMensagem) => void;
}) {
  const [situacao, setSituacao] = useState<SituacaoDaMensagem>("primeira_visita");
  const [texto, setTexto] = useState("");
  const [editado, setEditado] = useState(false);

  const sugerido = useMemo(
    () => (alvo ? textoDoVisitante(pacote, situacao, { nome: alvo.nome }) ?? alvo.textoAntigo : ""),
    [alvo, pacote, situacao],
  );
  useEffect(() => { if (alvo) { setSituacao(alvo.situacaoInicial); setEditado(false); } }, [alvo?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (alvo && !editado) setTexto(sugerido); }, [alvo, sugerido, editado]);

  const link = alvo ? buildWhatsAppLink(alvo.telefone, texto) : null;
  const abrir = () => {
    if (!alvo || !link) { toast.error("Telefone não cadastrado para este visitante"); return; }
    window.open(link, "_blank", "noopener,noreferrer");   // síncrono, dentro do clique: o navegador não barra a janela
    onAberto(alvo);
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); toast.success("Texto copiado."); } catch { toast.error("Não consegui copiar: selecione o texto."); } };

  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mensagem para {alvo?.nome.split(" ")[0]}</DialogTitle>
          <DialogDescription>Confira o texto, ajuste se quiser e abra o WhatsApp. Depois você registra como foi o contato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {pacote && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Mensagem para
              <select aria-label="Tipo de mensagem" className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={situacao}
                onChange={e => setSituacao(e.target.value as SituacaoDaMensagem)}>
                {SITUACOES.map(s => <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>)}
              </select>
            </label>
          )}
          <Textarea aria-label="Texto da mensagem" rows={10} className="text-base md:text-sm leading-relaxed" value={texto} onChange={e => { setTexto(e.target.value); setEditado(true); }} />
          {editado && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditado(false)}>Restaurar o texto sugerido</Button>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="whatsapp" className="h-11 flex-1 gap-2" disabled={!link} onClick={abrir}><MessageCircle className="h-4 w-4" /> Abrir WhatsApp</Button>
            <Button type="button" variant="outline" className="h-11 gap-2" onClick={copiar}><Copy className="h-4 w-4" /> Copiar</Button>
          </div>
          {!link && <p className="text-xs text-warning-text">Este visitante não tem telefone cadastrado: copie o texto ou abra a ficha para completar o cadastro.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
