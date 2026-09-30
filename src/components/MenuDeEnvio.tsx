// ─── MenuDeEnvio.tsx — WhatsApp, e-mail ou copiar, no mesmo botão ──────────
//
// Revisão do fluxo de WhatsApp (29/09/2026): o botão de contato de uma
// pessoa era um único link fixo — "Falar no WhatsApp" — sem alternativa
// quando o WhatsApp não é o canal certo (a pessoa só tem e-mail, ou quem usa
// só quer copiar o número pra outro aplicativo). Pedido dela: um menu
// "Enviar via" com WhatsApp/E-mail/Copiar mensagem/Copiar número, nos
// pontos de maior uso — ficha de pessoa (`PessoaCard.tsx`) e ficha de
// assistido da Diaconia (`DiaconiaPessoas.tsx`).
//
// Cada opção só aparece quando faz sentido: sem telefone, some WhatsApp e
// "Copiar número"; sem e-mail, some E-mail; sem `texto`, some "Copiar
// mensagem" (copiar mensagem nenhuma não é ação, é confusão). Sem telefone
// E sem e-mail, o componente inteiro não renderiza nada — não há pra onde
// mandar.
//
// `window.open` dentro do clique do item do menu, não depois de um
// `await`: é a mesma armadilha que já mudou goals no projeto (comentário em
// `PessoaCard.tsx`) — navegador/WebView trata `window.open` de um retorno
// assíncrono como pop-up e bloqueia em silêncio. Como o Radix
// `DropdownMenuItem` dispara o `onClick` de forma síncrona ao clique, isso
// nunca sai do mesmo gesto do usuário — seguro.

import { MessageCircle, Mail, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { montarLinkWhatsApp } from "@/lib/whatsapp";
import { formatarTelefoneSemDDI, normalizarTelefone } from "@/lib/telefone";
import { toast } from "sonner";

interface Props {
  telefone?: string | null;
  email?: string | null;
  /** Mensagem sugerida — vira o corpo do WhatsApp/e-mail, e some o item
   *  "Copiar mensagem" quando ausente. */
  texto?: string | null;
  /** Assunto do e-mail, quando `email` está presente. */
  assunto?: string;
  /** Rótulo do botão-gatilho. Padrão "Enviar". */
  label?: string;
  className?: string;
}

async function copiar(valor: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(valor);
    toast.success(`${rotulo} copiado`);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
  }
}

export function MenuDeEnvio({ telefone, email, texto, assunto, label = "Enviar", className }: Props) {
  const temTelefone = !!normalizarTelefone(telefone);
  const temEmail = !!email;
  if (!temTelefone && !temEmail) return null;

  const linkWhats = temTelefone ? montarLinkWhatsApp({ telefone, texto }) : null;
  const linkEmail = temEmail
    ? `mailto:${email}${assunto ? `?subject=${encodeURIComponent(assunto)}` : ""}${
        texto ? `${assunto ? "&" : "?"}body=${encodeURIComponent(texto)}` : ""
      }`
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="whatsapp" size="sm" className={className}>
          <MessageCircle className="w-4 h-4" /> {label}
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {temTelefone && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => window.open(linkWhats!, "_blank", "noopener,noreferrer")}
          >
            <MessageCircle className="w-4 h-4 mr-2 text-muted-foreground" /> WhatsApp
          </DropdownMenuItem>
        )}
        {temEmail && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <a href={linkEmail!}>
              <Mail className="w-4 h-4 mr-2 text-muted-foreground" /> E-mail
            </a>
          </DropdownMenuItem>
        )}
        {texto && (
          <DropdownMenuItem className="cursor-pointer" onClick={() => copiar(texto, "Mensagem")}>
            <Copy className="w-4 h-4 mr-2 text-muted-foreground" /> Copiar mensagem
          </DropdownMenuItem>
        )}
        {temTelefone && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => copiar(formatarTelefoneSemDDI(telefone), "Número")}
          >
            <Copy className="w-4 h-4 mr-2 text-muted-foreground" /> Copiar número
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default MenuDeEnvio;
