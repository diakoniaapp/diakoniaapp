// ─── CampoData.tsx ─────────────────────────────────────────────────────
//
// Campo de data com as DUAS formas de escolher lado a lado — pedido da
// Telma (17/09/2026): "Eu quero a opção de digitar entre datas + a opção
// de escolher a data pelo calendário, como estava antes. mas obedecendo
// a digitação, sem bugs". O `<input type="date">` nativo (1ª tentativa)
// tinha o teclado quebrado no WebView do celular ("está funcionando
// apenas se escolher no ícone do calendário"); trocar só pro calendário
// em popover (2ª tentativa) resolveu o teclado mas tirou de vez a opção
// de digitar, que ela queria de volta.
//
// A digitação aqui NÃO passa pelo `<input type="date">` nativo — é um
// `<input type="text">` comum com máscara dd/mm/aaaa feita à mão (só
// dígitos aceitos, "/" inserido sozinho depois do 2º e do 4º, no máximo
// 8 dígitos). Um `<input>` de texto puro não tem o defeito do teclado
// nativo (esse é específico do controle segmentado de `type="date"`); e
// o teto de 8 dígitos evita de raiz o outro defeito já documentado no
// CLAUDE.md (§6.2) — segmento de ANO crescendo sem fim ao digitar/
// corrigir — porque aqui não existe "segmento", é só um número que para
// de crescer.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { CalendarDays } from "lucide-react";
import { toYmd, parseLocalDate } from "@/lib/data";
import { cn } from "@/lib/utils";

interface Props {
  /** "" ou "yyyy-mm-dd" */
  value: string;
  onChange: (v: string) => void;
  className?: string;
  anoMin?: number;
  anoMax?: number;
}

function formatarDigitando(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "").slice(0, 8);
  const dd = digitos.slice(0, 2);
  const mm = digitos.slice(2, 4);
  const aaaa = digitos.slice(4, 8);
  return [dd, mm, aaaa].filter(Boolean).join("/");
}

function paraIso(digitado: string, anoMin: number, anoMax: number): string | null {
  const m = digitado.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), aaaa = Number(m[3]);
  if (aaaa < anoMin || aaaa > anoMax) return null;
  const d = new Date(aaaa, mm - 1, dd);
  // `new Date` normaliza dia/mês inválido (ex.: 31/04 vira 01/05) em vez
  // de recusar — comparar de volta pra rejeitar, não aceitar em silêncio
  // uma data diferente da que foi digitada.
  if (d.getFullYear() !== aaaa || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return toYmd(d);
}

function paraDigitado(iso: string): string {
  if (!iso) return "";
  const d = parseLocalDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function CampoData({ value, onChange, className, anoMin = 2000, anoMax = 2099 }: Props) {
  const [texto, setTexto] = useState(() => paraDigitado(value));
  const [focado, setFocado] = useState(false);
  const [calAberto, setCalAberto] = useState(false);

  // Sincroniza com o valor de fora (escolhido pelo calendário, ou filtro
  // trocado pela própria tela) — só quando o campo não está sendo
  // digitado, senão apagaria o que a pessoa está no meio de escrever.
  useEffect(() => {
    if (!focado) setTexto(paraDigitado(value));
  }, [value, focado]);

  function aoDigitar(e: React.ChangeEvent<HTMLInputElement>) {
    const formatado = formatarDigitando(e.target.value);
    setTexto(formatado);
    const iso = paraIso(formatado, anoMin, anoMax);
    if (iso) onChange(iso);
  }

  function aoSairDoFoco() {
    setFocado(false);
    // Se o que ficou no campo não fecha uma data válida (incompleto, ou
    // "31/02/2026"), volta a mostrar o último valor válido — não deixa
    // texto quebrado preso na tela.
    setTexto(paraDigitado(value));
  }

  return (
    <div className={cn("flex gap-1", className)}>
      {/* min-w-0 — um `<input>` dentro de flex não encolhe abaixo do
          próprio conteúdo por padrão; sem isso ele empurra o botão de
          calendário pra fora do espaço reservado ao campo, em vez de
          encolher junto. Mesmo transbordo documentado no CLAUDE.md
          (§6.2), aqui dentro de um componente novo. */}
      <Input value={texto} inputMode="numeric" placeholder="dd/mm/aaaa"
        onFocus={() => setFocado(true)} onBlur={aoSairDoFoco}
        onChange={aoDigitar} className="h-8 text-xs min-w-0 flex-1" />
      <Popover open={calAberto} onOpenChange={setCalAberto}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Escolher no calendário">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker mode="single" selected={value ? parseLocalDate(value) : undefined}
            defaultMonth={value ? parseLocalDate(value) : undefined}
            onSelect={(d) => {
              if (!d) return;
              const iso = toYmd(d);
              setTexto(paraDigitado(iso));
              onChange(iso);
              setCalAberto(false);
            }} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
