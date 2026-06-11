import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

export type MembroStatus = "ativo" | "inativo" | "transferido" | "desligado" | "falecido";

interface StatusInfo {
  label: string;
  cor: string;
  descricao: string;
}

export const STATUS_INFO: Record<MembroStatus, StatusInfo> = {
  ativo: {
    label: "Ativo",
    cor: "bg-success/15 text-success border-success/30",
    descricao: "Membro em comunhão e atividade regular na igreja.",
  },
  inativo: {
    label: "Inativo",
    cor: "bg-muted text-muted-foreground border-border",
    descricao: "Afastamento temporário (saúde, viagem, etc). Continua membro — pode retornar a qualquer momento.",
  },
  transferido: {
    label: "Transferido",
    cor: "bg-warning/15 text-warning border-warning/30",
    descricao: "Mudou de igreja com carta de transferência. Não é mais membro daqui.",
  },
  desligado: {
    label: "Desligado",
    cor: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700",
    descricao: "Saiu da membresia por decisão própria ou disciplinar. Mantido no histórico mas não conta como membro.",
  },
  falecido: {
    label: "Falecido",
    cor: "bg-destructive/10 text-destructive border-destructive/30",
    descricao: "Mantido no histórico em memória.",
  },
};

interface Props {
  status: MembroStatus | string | null | undefined;
  /** Mostra ícone de ajuda ao lado do label — default true */
  showHelp?: boolean;
  /** Tamanho compacto (para listas densas) */
  compact?: boolean;
  className?: string;
}

export function StatusMembroBadge({ status, showHelp = true, compact, className }: Props) {
  if (!status) return null;
  const info = STATUS_INFO[status as MembroStatus];
  if (!info) {
    return <Badge variant="outline" className={className}>{status}</Badge>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${info.cor} ${compact ? "text-[10px] py-0 px-1.5" : ""} cursor-help ${className ?? ""}`}
          >
            {info.label}
            {showHelp && <HelpCircle className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          <strong className="block mb-0.5">{info.label}</strong>
          {info.descricao}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
