// ─── PostosDoVinculo.tsx ─────────────────────────────────────────────────────
// A fileira de postos de UMA pessoa em UMA área.
//
// ── POR QUE ETIQUETAS, E NÃO UM CAMPO ────────────────────────────────────────
//
// A função era texto livre, e o resultado medido foi 84 vazios, 21 nomes de
// área e 9 "Líder" em 132 vínculos. Agora a área declara os seus postos e a
// pessoa ocupa um deles: a lista é curta, o clique é um só, e o que não é
// posto não entra porque não está na lista.
//
// ── QUEM JÁ TEM POSTO FICA QUIETO ────────────────────────────────────────────
//
// Mostrar todas as opções em todas as linhas encheria a tela de 17 pessoas com
// dezenas de etiquetas cinzentas. Quem ainda não tem posto vê as opções na
// hora — é a fila de trabalho. Quem já tem vê só o que tem, e um "＋" para
// acrescentar. A tela pesa onde falta resposta, e não onde já há.

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X, Check, Loader2, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ocuparPosto, desocuparPosto, criarPosto, confirmarPosto,
  type Posto, type Ocupacao,
} from "@/services/postos";

export function PostosDoVinculo({
  areaId, areaNome, vinculoId, catalogo, ocupacoes, lideranca,
  podeEditar, mostrarArea, onMudou,
}: {
  areaId: string;
  areaNome: string;
  vinculoId: string | undefined;
  catalogo: Posto[];
  ocupacoes: Ocupacao[];
  /** Derivado de `areas.lider_id`. Nunca digitado, e por isso nunca em conflito. */
  lideranca: "Líder" | "Co-líder" | null;
  podeEditar: boolean;
  mostrarArea: boolean;
  onMudou: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [abrindoTodas, setAbrindoTodas] = useState(false);
  const [criando, setCriando] = useState(false);
  const [rascunho, setRascunho] = useState("");

  const porId = new Map(catalogo.map(p => [p.id, p]));
  const minhas = ocupacoes
    .map(o => ({ o, p: porId.get(o.area_funcao_id) }))
    .filter((x): x is { o: Ocupacao; p: Posto } => !!x.p);

  const ocupados = new Set(minhas.map(x => x.p.id));
  const livres = catalogo.filter(p => !ocupados.has(p.id));

  // Sem posto nenhum, as opções aparecem sozinhas: é a linha que precisa de
  // resposta. Com posto, só quando a pessoa pedir.
  const mostrarLivres = podeEditar && !!vinculoId && (minhas.length === 0 || abrindoTodas);

  async function ocupar(posto: Posto) {
    if (!vinculoId) return;
    setOcupado(true);
    const r = await ocuparPosto(vinculoId, posto.id, minhas.length > 0);
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${posto.nome} em ${areaNome}.`);
    setAbrindoTodas(false);
    onMudou();
  }

  // O "amém" da equipe ao que o voluntário declarou no Meu Espaço. Sem este
  // botão, a autodeclaração seria um campo livre com outro nome: alguém diz e
  // ninguém responde.
  async function confirmar(x: { o: Ocupacao; p: Posto }) {
    setOcupado(true);
    const r = await confirmarPosto(x.o.id);
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Confirmado: ${x.p.nome} em ${areaNome}.`);
    onMudou();
  }

  async function desocupar(x: { o: Ocupacao; p: Posto }) {
    setOcupado(true);
    const r = await desocuparPosto(x.o.id);
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`Deixou de ser ${x.p.nome}.`);
    onMudou();
  }

  async function criar() {
    const r = await criarPosto(areaId, rascunho, catalogo.length + 1);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${r.posto.nome} agora existe em ${areaNome}.`);
    setRascunho("");
    setCriando(false);
    if (vinculoId) await ocuparPosto(vinculoId, r.posto.id, minhas.length > 0);
    onMudou();
  }

  // Sem permissão de escrita, a fileira vira texto — e diz a ausência com
  // todas as letras, porque "—" parece dado faltando e não pergunta não feita.
  // A etiqueta de liderança vem do cadastro da área e aparece dos dois lados,
  // com ou sem permissão de edição: é um fato sobre a pessoa, não uma ação.
  const selo = lideranca && (
    <Badge variant="outline" className="text-xs h-4 px-1 bg-primary/10 text-primary border-primary/30">
      {lideranca}
    </Badge>
  );

  if (!podeEditar) {
    return (
      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
        {mostrarArea && <span className="font-medium">{areaNome}: </span>}
        {selo}
        {minhas.length > 0
          ? <span>{minhas.map(x => x.p.nome).join(" · ")}</span>
          : <span className="text-warning-text">sem posto definido</span>}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {mostrarArea && (
        <span className="text-xs font-medium text-muted-foreground mr-0.5">{areaNome}:</span>
      )}
      {selo}

      {minhas.map(x => (
        <span
          key={x.o.id}
          className={`inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-xs ${
            x.o.pendente
              ? "bg-warning-soft text-warning-text border-warning-line"
              : "bg-secondary text-secondary-foreground border-transparent"
          }`}
          title={x.o.pendente ? "A pessoa declarou; falta a liderança confirmar." : undefined}
        >
          {x.p.nome}
          {x.o.principal && minhas.length > 1 && (
            <span className="opacity-60" title="Posto principal">★</span>
          )}
          {x.o.pendente && <span className="opacity-70">a confirmar</span>}
          {x.o.pendente && (
            <button
              type="button"
              onClick={() => confirmar(x)}
              disabled={ocupado}
              aria-label={`Confirmar ${x.p.nome}`}
              title="A pessoa declarou isto. Confirmar."
              className="rounded-full p-0.5 hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BadgeCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => desocupar(x)}
            disabled={ocupado}
            aria-label={`Tirar ${x.p.nome}`}
            className="rounded-full p-0.5 hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {mostrarLivres && livres.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => ocupar(p)}
          disabled={ocupado}
          className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground
                     hover:text-foreground hover:border-primary hover:bg-primary/5 transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {p.nome}
        </button>
      ))}

      {ocupado && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}

      {/* Criar posto novo. É o que salva a tela nas 13 áreas sem catálogo —
          sem isto, a fileira nasceria vazia e sem saída. */}
      {criando ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={rascunho}
            onChange={e => setRascunho(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); criar(); }
              if (e.key === "Escape") { setCriando(false); setRascunho(""); }
            }}
            placeholder={`Novo posto em ${areaNome}`}
            className="h-7 w-44 text-xs"
          />
          <button type="button" onClick={criar} aria-label="Criar posto"
            className="rounded p-1 text-primary hover:bg-primary/10">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => { setCriando(false); setRascunho(""); }} aria-label="Cancelar"
            className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : vinculoId && (
        <button
          type="button"
          onClick={() => (minhas.length > 0 && !abrindoTodas ? setAbrindoTodas(true) : setCriando(true))}
          className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs text-muted-foreground
                     hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={minhas.length > 0 && !abrindoTodas ? "Acrescentar posto" : "Criar posto novo"}
        >
          <Plus className="w-3 h-3" />
          {/* A frase "esta área ainda não tem postos" cabia aqui, e chegou a
              estar — repetida nas oito linhas da Cantina, porque a falta é da
              ÁREA e a lista é de pessoas. Dizer oito vezes a mesma coisa é
              ruído; o rótulo do botão diz o mesmo uma vez por linha, e sem
              interromper a leitura. */}
          {catalogo.length === 0 ? "criar o primeiro posto"
            : minhas.length === 0 || abrindoTodas ? "novo" : ""}
        </button>
      )}
    </div>
  );
}
