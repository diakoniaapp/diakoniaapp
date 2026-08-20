// ─── PassoDisponibilidade.tsx ────────────────────────────────────────────────
// O passo do formulário onde a pessoa diz quando pode servir.
//
// Quatro perguntas, nesta ordem, porque é a ordem em que alguém pensa sobre o
// assunto: primeiro quando posso, depois com que frequência, depois se estou
// fora agora, depois o que não consigo fazer.
//
// Nenhuma delas é obrigatória. Um voluntário que só responde "domingo à noite"
// já vale mais para a escala do que um cadastro completo e vazio — e exigir o
// resto faria a pessoa abandonar o passo inteiro.

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CalendarDays, Clock, Repeat, PauseCircle, TriangleAlert } from "lucide-react";
import {
  DIAS, TURNOS, FREQUENCIAS,
  type PerfilServico, type DiaSemana, type Turno, type Frequencia,
} from "@/services/perfilServico";

interface Props {
  valor: PerfilServico;
  onChange: (p: PerfilServico) => void;
  /** Sem pessoa salva ainda, o perfil só pode ser gravado depois. */
  novaPessoa?: boolean;
}

/** Botão de marcar/desmarcar. Alvo de 44px, que é o mínimo de toque da WCAG. */
function Alvo({ ativo, onClick, children, titulo }: {
  ativo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={titulo}
      className={`min-h-[44px] px-3 rounded-md border text-sm font-medium transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        ativo
          ? "bg-primary/10 border-primary/40 text-primary"
          : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Titulo({ Icone, children, ajuda }: {
  Icone: typeof CalendarDays; children: React.ReactNode; ajuda?: string;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        <Icone className="w-3.5 h-3.5 text-muted-foreground" /> {children}
      </Label>
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

export function PassoDisponibilidade({ valor, onChange, novaPessoa }: Props) {
  const alternar = <T extends string>(lista: T[], item: T): T[] =>
    lista.includes(item) ? lista.filter(x => x !== item) : [...lista, item];

  const set = (mudanca: Partial<PerfilServico>) => onChange({ ...valor, ...mudanca });

  return (
    <div className="space-y-6">

      {novaPessoa && (
        <p className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-2">
          A disponibilidade é gravada junto com o cadastro, ao salvar.
        </p>
      )}

      {/* ── 1. Dias ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Titulo Icone={CalendarDays} ajuda="Marque todos os dias em que ela costuma poder servir.">
          Quando pode servir
        </Titulo>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map(d => (
            <Alvo
              key={d.valor}
              titulo={d.longo}
              ativo={valor.dias_disponiveis.includes(d.valor)}
              onClick={() => set({ dias_disponiveis: alternar<DiaSemana>(valor.dias_disponiveis, d.valor) })}
            >
              {d.curto}
            </Alvo>
          ))}
        </div>
      </div>

      {/* ── 2. Turnos ───────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Titulo Icone={Clock}>Em que horário</Titulo>
        <div className="flex flex-wrap gap-1.5">
          {TURNOS.map(t => (
            <Alvo
              key={t.valor}
              ativo={valor.turnos_disponiveis.includes(t.valor)}
              onClick={() => {
                // "Dia todo" não convive com os outros três: marcar manhã E dia
                // todo não quer dizer nada. Escolher um limpa os outros.
                const ehDiaTodo = t.valor === "dia_todo";
                const jaMarcado = valor.turnos_disponiveis.includes(t.valor);
                if (ehDiaTodo) {
                  set({ turnos_disponiveis: jaMarcado ? [] : (["dia_todo"] as Turno[]) });
                } else {
                  const semDiaTodo = valor.turnos_disponiveis.filter(x => x !== "dia_todo");
                  set({ turnos_disponiveis: alternar<Turno>(semDiaTodo, t.valor) });
                }
              }}
            >
              {t.rotulo}
            </Alvo>
          ))}
        </div>
      </div>

      {/* ── 3. Frequência ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Titulo Icone={Repeat} ajuda="Com que frequência ela topa entrar numa escala.">
          Com que frequência
        </Titulo>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {FREQUENCIAS.map(f => {
            const ativo = valor.frequencia_maxima === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => set({ frequencia_maxima: f.valor as Frequencia })}
                aria-pressed={ativo}
                className={`min-h-[44px] px-3 py-2 rounded-md border text-left transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  ativo ? "bg-primary/10 border-primary/40" : "bg-background border-border hover:border-primary/30"
                }`}
              >
                <span className={`block text-sm font-medium ${ativo ? "text-primary" : ""}`}>{f.rotulo}</span>
                <span className="block text-xs text-muted-foreground">{f.ajuda}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Descanso ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="ps-descanso" className="flex items-center gap-1.5 text-sm font-medium">
              <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" /> Está afastado agora
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sai das sugestões de escala, sem sair do cadastro de voluntários.
            </p>
          </div>
          <Switch
            id="ps-descanso"
            checked={valor.em_descanso}
            onCheckedChange={v => set({ em_descanso: v })}
          />
        </div>

        {valor.em_descanso && (
          <div className="grid gap-3 sm:grid-cols-2 pl-3 border-l-2 border-warning-line">
            <div className="space-y-1">
              <Label htmlFor="ps-ate" className="text-xs">Volta em</Label>
              <Input
                id="ps-ate"
                type="date"
                value={valor.descanso_ate ?? ""}
                onChange={e => set({ descanso_ate: e.target.value || null })}
              />
              {/* Sem data, ninguém sabe quando receber a pessoa de volta — e o
                  afastamento vira permanente por esquecimento. */}
              {!valor.descanso_ate && (
                <p className="text-xs text-warning-text flex items-center gap-1">
                  <TriangleAlert className="w-3 h-3" /> Sem data, ninguém lembra de chamar de volta
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ps-motivo" className="text-xs">Motivo (opcional)</Label>
              <Input
                id="ps-motivo"
                value={valor.motivo_descanso ?? ""}
                onChange={e => set({ motivo_descanso: e.target.value })}
                placeholder="Licença maternidade, viagem, saúde…"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 5. Restrições ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Titulo Icone={TriangleAlert} ajuda="O que ela não consegue fazer, para não ser escalada para isso.">
          Alguma restrição
        </Titulo>
        <Textarea
          value={valor.restricoes ?? ""}
          onChange={e => set({ restricoes: e.target.value })}
          placeholder="Não consigo carregar peso · Só depois das 10h · Preciso sair antes do fim"
          rows={2}
        />
      </div>

    </div>
  );
}
