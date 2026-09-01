import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RecorrenciaFreq, RecorrenciaRegra } from "@/lib/agenda/types";
import { descreverRegra, daquiAMeses, hojeLocal } from "@/lib/agenda/recurrence";
import { cn } from "@/lib/utils";

interface Props {
  freq: RecorrenciaFreq;
  regra: RecorrenciaRegra | null;
  onChange: (freq: RecorrenciaFreq, regra: RecorrenciaRegra | null) => void;
  /** A data do evento. Sem ela não dá para sugerir um fim que faça sentido,
   *  nem avisar que o fim escolhido é anterior ao começo. */
  dataInicio?: string;
}

// ── Por que três letras, e não uma ─────────────────────────────────────────
//
// Era `["D","S","T","Q","Q","S","S"]`: dois Q seguidos (quarta e quinta) e
// dois S (sexta e sábado), sem nada que os distinga. Quem quer marcar "de
// segunda a quinta" tem de contar as bolinhas da esquerda para a direita para
// saber qual Q é qual — e errar é silencioso, porque o evento simplesmente
// nasce no dia errado.
//
// Três letras é o que o Google Agenda usa na mesma grade, e é o mínimo que
// desambigua em português. O nome inteiro vai no `title`, para quem passa o
// cursor, e no `aria-label`, para quem não vê a tela.
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_POR_EXTENSO = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

export function RecurrenceEditor({ freq, regra, onChange, dataInicio }: Props) {
  const setFreq = (f: RecorrenciaFreq) => {
    if (f === "nao") return onChange("nao", null);
    const novo: RecorrenciaRegra = {
      freq: f,
      intervalo: 1,
      dias_semana: f === "semanal" ? [new Date().getDay()] : undefined,
      fim: { tipo: "nunca" },
    };
    onChange(f, novo);
  };

  const update = (patch: Partial<RecorrenciaRegra>) => {
    if (!regra) return;
    onChange(freq, { ...regra, ...patch });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-sm">Repetição</Label>
      <Select value={freq} onValueChange={(v) => setFreq(v as RecorrenciaFreq)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nao">Não se repete</SelectItem>
          <SelectItem value="diario">Diariamente</SelectItem>
          <SelectItem value="semanal">Semanalmente</SelectItem>
          <SelectItem value="mensal">Mensalmente</SelectItem>
          <SelectItem value="anual">Anualmente</SelectItem>
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {regra && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">A cada</Label>
              <Input type="number" min={1} value={regra.intervalo}
                onChange={(e) => update({ intervalo: Math.max(1, +e.target.value || 1) })} />
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              {regra.freq === "diario" && "dia(s)"}
              {regra.freq === "semanal" && "semana(s)"}
              {regra.freq === "mensal" && "mês(es)"}
              {regra.freq === "anual" && "ano(s)"}
              {regra.freq === "personalizado" && "dia(s)"}
            </div>
          </div>

          {regra.freq === "semanal" && (
            <div>
              <Label className="text-xs">Dias da semana</Label>
              {/* Pode marcar quantos quiser: um evento de segunda a quinta são
                  quatro botões ligados, e a linha de resumo lá embaixo lê a
                  escolha de volta em palavras. */}
              <div className="flex gap-1 mt-1 flex-wrap">
                {DIAS.map((d, i) => {
                  const sel = regra.dias_semana?.includes(i);
                  return (
                    <button type="button" key={i}
                      onClick={() => {
                        const cur = regra.dias_semana || [];
                        update({ dias_semana: sel ? cur.filter(x => x !== i) : [...cur, i].sort() });
                      }}
                      aria-pressed={!!sel}
                      aria-label={DIAS_POR_EXTENSO[i]}
                      title={DIAS_POR_EXTENSO[i]}
                      className={cn(
                        "px-2.5 h-8 rounded-full text-xs font-medium border transition-colors tabular-nums",
                        sel ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                      )}>{d}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Termina</Label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "nunca"}
                  onChange={() => update({ fim: { tipo: "nunca" } })} />
                Nunca
              </label>
              {/* ── O padrão era HOJE, e isso apagava séries ────────────────
                  Clicar em "Em" preenchia a data final com
                  `new Date().toISOString().slice(0,10)` — que além de ser UTC
                  (das 21h à meia-noite em Brasília responde amanhã) é o dia de
                  hoje, ou seja, quase sempre o próprio dia do evento.

                  O resultado é uma série semanal que começa e termina no mesmo
                  dia: aparece uma vez no calendário e nunca mais. Foi assim
                  que a Escola Bíblica Dominical ficou com regra de 04/01/2026
                  a 04/01/2026 e sumiu da agenda o ano inteiro.

                  Agora sugere três meses a partir do próprio evento — um
                  trimestre é o horizonte com que a igreja planeja, e qualquer
                  valor é melhor que um que produz uma ocorrência só. */}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "data"}
                  onChange={() => update({
                    fim: { tipo: "data", data: daquiAMeses(dataInicio || hojeLocal(), 3) },
                  })} />
                Em
                <Input type="date" className="h-8 w-40 ml-1"
                  disabled={regra.fim.tipo !== "data"}
                  value={regra.fim.tipo === "data" ? regra.fim.data : ""}
                  onChange={(e) => update({ fim: { tipo: "data", data: e.target.value } })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "ocorrencias"}
                  onChange={() => update({ fim: { tipo: "ocorrencias", n: 10 } })} />
                Após
                <Input type="number" min={1} className="h-8 w-20 ml-1"
                  disabled={regra.fim.tipo !== "ocorrencias"}
                  value={regra.fim.tipo === "ocorrencias" ? regra.fim.n : 0}
                  onChange={(e) => update({ fim: { tipo: "ocorrencias", n: Math.max(1, +e.target.value || 1) } })} />
                <span className="text-xs text-muted-foreground">ocorrências</span>
              </label>
            </div>
          </div>
          {/* A leitura de volta. É aqui que se confere se o que foi marcado é
              o que se queria — sete botões redondos não dizem "de segunda a
              quinta", esta linha diz. Deixou de ser itálico cinza-claro para
              ser o que ela é: a confirmação da regra. */}
          <p className="text-xs">
            <span className="text-muted-foreground">Resumo: </span>
            <span className="font-medium text-foreground">{descreverRegra(regra)}</span>
          </p>

          {/* Fim antes do começo não é erro de digitação sem consequência: a
              série passa a existir sem nenhuma data, ou com uma só, e o evento
              some do calendário sem que nada reclame. */}
          {regra.fim.tipo === "data" && dataInicio && regra.fim.data && regra.fim.data <= dataInicio && (
            <p className="text-xs text-warning-text">
              {regra.fim.data === dataInicio
                ? "A série termina no mesmo dia em que começa — vai gerar um único encontro."
                : "A data final é anterior à do evento — a série não vai gerar nenhum encontro."}
            </p>
          )}
        </>
      )}
    </div>
  );
}