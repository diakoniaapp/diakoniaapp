import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter, Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AgendaFiltros, AreaOpt, CategoriaEvento, EventoStatus, EventoTipo, LocalOpt, MinisterioOpt,
  STATUS_LABEL, TIPO_LABEL, TODOS_OS_TIPOS,
} from "@/lib/agenda/types";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CATEGORIA_EXTERNAS } from "@/lib/agenda/externalEvents";
import { CATEGORIA_PESSOAS } from "@/lib/agenda/birthdays";

const ALL_CATS: CategoriaEvento[] = ["igreja", "batista", "feriado", "aniversario", "casamento", "arrecadacao"];

interface Props {
  filtros: AgendaFiltros;
  onChange: (f: AgendaFiltros) => void;
  ministerios: MinisterioOpt[];
  areas: AreaOpt[];
  locais: LocalOpt[];
}

function MultiPopover({
  label, items, selected, onToggle, onClear,
}: {
  label: string;
  items: { id: string; nome: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  // Contador so quando o filtro REALMENTE restringe.
  //
  // Antes o badge mostrava selected.length, e o estado salvo vinha com tudo
  // marcado: lia-se "Ministério 11, Área 10, Local 4, Status 3, Categoria 6".
  // Cinco contadores anunciando filtro ativo enquanto nada era filtrado —
  // e, pior, sugerindo que havia eventos escondidos.
  //
  // Selecionar tudo e selecionar nada dao o mesmo resultado: nenhum evento sai
  // da lista. Nos dois casos o filtro esta desligado, e o badge some.
  const restringe = selected.length > 0 && selected.length < items.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={`h-11 gap-1.5 ${restringe ? "border-primary/50 text-primary" : ""}`}
        >
          {label}
          {restringe && (
            // "3/11" diz o que "3" sozinho nao dizia: quanto do total esta a
            // vista. E o numero que responde "estou deixando de ver algo?".
            <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
              {selected.length}/{items.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <button type="button" onClick={onClear} className="text-xs text-primary hover:underline">Limpar</button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Nenhum item.</p>
        ) : items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
            <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
            <span className="text-sm truncate">{it.nome}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AgendaFilters({ filtros, onChange, ministerios, areas, locais }: Props) {
  const tiposItems = useMemo(() => (Object.entries(TIPO_LABEL) as [EventoTipo, string][])
    .map(([id, nome]) => ({ id, nome })), []);
  const statusItems = useMemo(() => (Object.entries(STATUS_LABEL) as [EventoStatus, string][])
    .map(([id, nome]) => ({ id, nome })), []);

  const toggle = <K extends keyof AgendaFiltros>(key: K, value: string) => {
    const arr = filtros[key] as unknown as string[];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    onChange({ ...filtros, [key]: next } as AgendaFiltros);
  };
  const clear = <K extends keyof AgendaFiltros>(key: K) =>
    onChange({ ...filtros, [key]: [] } as AgendaFiltros);

  // Quantos filtros de fato restringem — a mesma definicao do contador de cada
  // chip. Serve de aviso no celular, onde os chips ficam recolhidos: sem isso,
  // um filtro esquecido ligado viraria "sumiram eventos da agenda".
  const totalCategorias =
    2 + CATEGORIA_EXTERNAS.length + CATEGORIA_PESSOAS.length;
  const restringindo = [
    [filtros.ministerios.length, ministerios.length],
    [filtros.areas.length,       areas.length],
    [filtros.tipos.length,       Object.keys(TIPO_LABEL).length],
    [filtros.locais.length,      locais.length],
    [filtros.status.length,      Object.keys(STATUS_LABEL).length],
    [(filtros.categorias ?? ALL_CATS).length, totalCategorias],
  ].filter(([sel, tot]) => sel > 0 && sel < tot).length;

  const chips = (
    <>
      <MultiPopover label="Ministério" items={ministerios.map(m => ({ id: m.id, nome: m.nome }))}
        selected={filtros.ministerios} onToggle={(v) => toggle("ministerios", v)} onClear={() => clear("ministerios")} />
      <MultiPopover label="Área" items={areas.map(a => ({ id: a.id, nome: a.nome }))}
        selected={filtros.areas} onToggle={(v) => toggle("areas", v)} onClear={() => clear("areas")} />
      {/* "Limpar" aqui MARCA todos, não desmarca — igual ao de Categoria.
          Desmarcar as nove devolveria a tela ao estado que se veio consertar:
          nada marcado e a agenda cheia, porque vazio significa "sem
          restrição" no `if` que filtra. Limpar o filtro é voltar a ver tudo,
          e ver tudo agora se escreve com as nove caixas marcadas. */}
      <MultiPopover label="Tipo" items={tiposItems}
        selected={filtros.tipos} onToggle={(v) => toggle("tipos", v)}
        onClear={() => onChange({ ...filtros, tipos: TODOS_OS_TIPOS })} />
      <MultiPopover label="Local" items={locais.map(l => ({ id: l.id, nome: l.nome_completo || l.nome }))}
        selected={filtros.locais} onToggle={(v) => toggle("locais", v)} onClear={() => clear("locais")} />
      <MultiPopover label="Status" items={statusItems}
        selected={filtros.status} onToggle={(v) => toggle("status", v)} onClear={() => clear("status")} />
      <MultiPopover
        label="Categoria"
        items={[
          { id: "igreja", nome: "Igreja" },
          { id: "arrecadacao", nome: "🛍️ Arrecadação" },
          ...CATEGORIA_EXTERNAS.map((c) => ({ id: c.id, nome: c.label })),
          ...CATEGORIA_PESSOAS.map((c) => ({ id: c.id, nome: c.label })),
        ]}
        selected={filtros.categorias ?? ALL_CATS}
        onToggle={(v) => {
          const cur = filtros.categorias ?? ALL_CATS;
          const next = cur.includes(v as CategoriaEvento)
            ? cur.filter((x) => x !== v)
            : [...cur, v as CategoriaEvento];
          onChange({ ...filtros, categorias: next });
        }}
        onClear={() => onChange({ ...filtros, categorias: ALL_CATS })}
      />
    </>
  );

  const corPor = (
    <div className="flex items-center gap-1.5">
      <Palette className="w-3.5 h-3.5 text-muted-foreground" />
      <Label className="text-xs text-muted-foreground">Cor por:</Label>
      <Select value={filtros.colorBy} onValueChange={(v) => onChange({ ...filtros, colorBy: v as "ministerio" | "tipo" })}>
        <SelectTrigger className="h-11 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="tipo">Tipo de evento</SelectItem>
          <SelectItem value="ministerio">Ministério</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // UM controle, em qualquer largura.
  //
  // Antes os seis chips mais o "Cor por" ficavam abertos no desktop: com a
  // navegacao e as abas de visao, a barra chegava a 226px e 16 controles em
  // seis linhas antes do primeiro dia do calendario. Numa agenda, o que se
  // olha e o calendario; filtrar e o que se faz de vez em quando.
  //
  // O painel nao e estrutura nova — e o mesmo que ja existia no celular,
  // agora tambem no desktop. E o botao avisa quando ha filtro ligado, para
  // recolher nao virar esconder.
  //
  // "Cor por" veio junto: e preferencia de exibicao, nao filtro, e ninguem
  // troca duas vezes no mesmo dia.
  /**
   * Devolve tudo ao estado de "não filtrando".
   *
   * Não existia, e a falta dela é metade do problema: um filtro fica salvo no
   * navegador e continua valendo depois de fechar o sistema. Para voltar a ver
   * a agenda inteira era preciso abrir o painel e REMARCAR caixa por caixa —
   * vinte e uma áreas, onze ministérios, nove tipos. Ninguém faz isso; a
   * pessoa conclui que a agenda perdeu eventos.
   *
   * "Tudo marcado" e "nada marcado" filtram igual (ver o comentário sobre
   * narrow em Eventos.tsx), e a lista vazia é a que sobrevive a criar uma
   * área nova — por isso limpa para vazio, e não para tudo-marcado.
   */
  const limparTudo = () => onChange({
    ...filtros,
    ministerios: [], areas: [], tipos: [], locais: [], status: [],
    categorias: ALL_CATS,
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline" size="sm"
          className={`h-11 gap-1.5 ${restringindo ? "border-primary/50 text-primary" : ""}`}
        >
          <Filter className="w-4 h-4" />
          Filtros
          {restringindo > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">{restringindo}</Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif">Filtros da agenda</SheetTitle>
        </SheetHeader>
        {/* O aviso e a saída, juntos: quem chega aqui procurando eventos que
            sumiram precisa ler o que está restrito e poder desfazer num
            clique. */}
        {restringindo > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 mt-3">
            <p className="text-xs text-warning-text">
              {restringindo === 1
                ? "1 filtro está escondendo parte da agenda."
                : `${restringindo} filtros estão escondendo parte da agenda.`}
            </p>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0"
              onClick={limparTudo}>
              Mostrar tudo
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 py-4">{chips}</div>
        <div className="border-t pt-4">{corPor}</div>
      </SheetContent>
    </Sheet>
  );
}