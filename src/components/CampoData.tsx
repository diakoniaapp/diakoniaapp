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
import { toast } from "sonner";
import { toYmd, parseLocalDate } from "@/lib/data";
import { cn } from "@/lib/utils";

interface Props {
  /** "" ou "yyyy-mm-dd" */
  value: string;
  onChange: (v: string) => void;
  className?: string;
  anoMin?: number;
  anoMax?: number;
  /** Três props acrescentadas em 29/09/2026, migrando os 54
   *  `<Input type="date">` restantes (Fase 2 do roadmap) — cada uma tinha
   *  uso real em pelo menos um dos pontos migrados, não é especulativo:
   *  `id` (VisitanteDialog/MinhaFicha/PassoDisponibilidade, associar
   *  `<label htmlFor>`), `disabled` (RecurrenceEditor/VisitanteDialog,
   *  campo condicional) e `placeholder` (ProjetoForm/ReunioesFinanceiras,
   *  substituindo o "dd/mm/aaaa" padrão por um texto mais específico). */
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** O campo de texto é sempre `text-xs` por padrão — pra sobrescrever
   *  (ex.: um filtro isolado, sem outros campos ao lado pra combinar o
   *  tamanho) sem reabrir esse padrão pros outros ~50 usos do componente,
   *  já que `className` só afeta o `<div>` por fora, não o `<input>`. */
  inputClassName?: string;
  /** Só o campo de texto com máscara, sem o botão de calendário — pra
   *  encaixar digitação num lugar que já tem SEU PRÓPRIO calendário com
   *  comportamento especial (ex.: o filtro de coluna "Data" em
   *  FinancasConta.tsx, onde clicar de nome no mesmo dia limpa o filtro —
   *  comportamento que o calendário embutido deste componente não tem, e
   *  duplicar o calendário ali criaria dois jeitos de escolher a mesma
   *  data lado a lado). */
  semCalendario?: boolean;
  /** Chamado com `true` enquanto o campo tem um texto que não fecha uma
   *  data válida, e `false` quando some. É pra tela barrar o "Salvar" —
   *  ela só enxerga o último valor VÁLIDO, então sem isto salvaria a data
   *  antiga enquanto o campo mostra outra coisa (MembroForm usa). */
  onInvalidoChange?: (invalido: boolean) => void;
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

// Por que o texto que ficou no campo não fecha uma data — a mensagem diz o
// que corrigir, em vez de só recusar.
function motivoDoErro(digitado: string, anoMin: number, anoMax: number): string {
  const m = digitado.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "Data incompleta — use dd/mm/aaaa";
  const aaaa = Number(m[3]);
  if (aaaa < anoMin || aaaa > anoMax) return `Ano fora do intervalo (${anoMin} a ${anoMax})`;
  return "Essa data não existe no calendário";
}

export function CampoData({
  value, onChange, className, anoMin = 2000, anoMax = 2099, semCalendario,
  id, disabled, placeholder = "dd/mm/aaaa", inputClassName, onInvalidoChange,
}: Props) {
  const [texto, setTexto] = useState(() => paraDigitado(value));
  const [focado, setFocado] = useState(false);
  const [calAberto, setCalAberto] = useState(false);
  // Texto digitado que não fecha uma data válida (incompleto, ano fora do
  // intervalo, "31/02/2026"). Ver `aoSairDoFoco` — antes o texto era
  // apagado em silêncio.
  const [erro, setErro] = useState<string | null>(null);

  // Valor de fora mudou (calendário, outra tela, outra pessoa aberta): o
  // erro de um texto antigo não vale mais.
  useEffect(() => { setErro(null); }, [value]);

  // Sincroniza com o valor de fora (escolhido pelo calendário, ou filtro
  // trocado pela própria tela) — só quando o campo não está sendo
  // digitado, senão apagaria o que a pessoa está no meio de escrever. Nem
  // quando há erro pendente: o texto errado tem que continuar na tela pra
  // ser corrigido.
  useEffect(() => {
    if (!focado && !erro) setTexto(paraDigitado(value));
  }, [value, focado, erro]);

  // Avisa a tela que usa o campo, pra ela poder barrar o "Salvar" — o valor
  // que ela guarda continua sendo o último VÁLIDO, não o texto errado.
  useEffect(() => { onInvalidoChange?.(!!erro); }, [erro]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onInvalidoChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  function aoDigitar(e: React.ChangeEvent<HTMLInputElement>) {
    const formatado = formatarDigitando(e.target.value);
    setTexto(formatado);
    setErro(null);
    const iso = paraIso(formatado, anoMin, anoMax);
    if (iso) onChange(iso);
  }

  function aoSairDoFoco() {
    setFocado(false);
    // Campo vazio: volta ao último valor (comportamento de sempre).
    if (!texto) { setTexto(paraDigitado(value)); return; }
    if (paraIso(texto, anoMin, anoMax)) return; // válida — já foi pra tela
    // Texto que não fecha uma data: ANTES era apagado em silêncio e o
    // campo voltava ao valor anterior — a pessoa "corrigia" a data de
    // nascimento, salvava, a tela dizia "Pessoa atualizada" e nada mudava
    // (achado em 02/10/2026, teste ponta a ponta: digitar 15/03/90 e sair
    // do campo apagava o texto, sem aviso). Agora o texto fica, o campo
    // fica vermelho e um aviso diz o que está errado.
    const motivo = motivoDoErro(texto, anoMin, anoMax);
    setErro(motivo);
    toast.error(motivo);
  }

  // Piso de largura (03/10/2026): "01/11/2025" em 14px precisa de ~107px de campo com o
  // padding padrão, e com o botão do calendário (32px + 4px de respiro) a caixa inteira de
  // ~148px deixava só ~112px — no limite; em máquinas com a fonte um pouco mais larga a data
  // aparecia cortada ("01/11/202"). Aqui: padding lateral menor (px-2) e um piso de 9rem
  // (144px) na caixa com calendário, que deixa ~108px para o texto contra ~99px necessários.
  // O campo SEM calendário não leva piso extra.
  return (
    <div className={cn("flex gap-1", !semCalendario && "min-w-[9rem]", className)}>
      {/* min-w-0 — um `<input>` dentro de flex não encolhe abaixo do
          próprio conteúdo por padrão; sem isso ele empurra o botão de
          calendário pra fora do espaço reservado ao campo, em vez de
          encolher junto. Mesmo transbordo documentado no CLAUDE.md
          (§6.2), aqui dentro de um componente novo. */}
      <Input id={id} value={texto} inputMode="numeric" placeholder={placeholder} disabled={disabled}
        onFocus={() => setFocado(true)} onBlur={aoSairDoFoco}
        onChange={aoDigitar} aria-invalid={!!erro} title={erro ?? undefined}
        className={cn("h-8 px-2 text-xs min-w-0 flex-1", erro && "border-destructive focus-visible:ring-destructive", inputClassName)} />
      {!semCalendario && (
        <Popover open={calAberto} onOpenChange={setCalAberto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Escolher no calendário" disabled={disabled}>
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarPicker mode="single" selected={value ? parseLocalDate(value) : undefined}
              defaultMonth={value ? parseLocalDate(value) : undefined}
              onSelect={(d) => {
                if (!d) return;
                const iso = toYmd(d);
                setErro(null);
                setTexto(paraDigitado(iso));
                onChange(iso);
                setCalAberto(false);
              }} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
