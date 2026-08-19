// ─── QuadrosInstitucionais.tsx — Diretoria, Conselho e Diaconia ────────────
//
// Os três quadros de governança da igreja, num arquivo só.
//
// Estavam desenhados dentro das páginas, e duas páginas chegaram a mostrar o
// mesmo quadro com dados de fontes diferentes. Componente compartilhado é o
// que impede a próxima cópia: quando o desenho da diretoria mudar, muda aqui,
// e não em dois lugares que alguém precisa lembrar de sincronizar.
//
// Nenhum deles busca dado. Recebem pronto de quem já carregou — as páginas
// costumam precisar dos mesmos números para os cartões do topo, e buscar duas
// vezes seria pagar a consulta em dobro para mostrar o mesmo.

// Sem roxo cru do Tailwind: a diretoria usava purple-700 e purple-50, cores
// que não existem na paleta da igreja. Numa tela ao lado dos ministérios em
// dourado, o roxo dizia "isto aqui é outro produto". A cor da casa marca o
// mesmo destaque sem abrir uma segunda família de cor.
import { Loader2, Crown, Shield, HandHeart } from "lucide-react";
import type { CargoDiretoria } from "@/services/diretoriaService";

// ── Peças comuns ───────────────────────────────────────────────────────────

function Carregando() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Carregando…</span>
    </div>
  );
}

function Vazio({ Icone, titulo, dica }: {
  Icone: typeof Crown; titulo: string; dica?: string;
}) {
  return (
    <div className="text-center py-16 space-y-3">
      <Icone className="w-12 h-12 mx-auto text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm">{titulo}</p>
      {/* O caminho tem de ser o que existe. A instrução antiga mandava a
          pessoa a um "Cargo Estatutário" que a ficha nunca teve, e essa era
          metade do motivo destes quadros viverem vazios. */}
      {dica && <p className="text-xs text-muted-foreground/70">{dica}</p>}
    </div>
  );
}

const CAMINHO_DA_FUNCAO =
  "Preencha em Pessoas → abrir a pessoa → Vínculos → Função ministerial.";

function Cartao({ nome, papel, detalhe, onClick }: {
  nome: string; papel: string; detalhe?: string | null; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border bg-gold/[0.06] border-gold/25 px-3 py-2 text-left hover:bg-gold/10 transition-colors min-h-[44px]"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{nome}</p>
        <p className="text-xs text-gold-text">{papel}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
    </button>
  );
}

// ── Diretoria ──────────────────────────────────────────────────────────────

const NIVEL = {
  1: { emoji: "👑", label: "Presidência" },
  2: { emoji: "⭐", label: "Vice-presidência" },
  3: { emoji: "📋", label: "Secretaria" },
  4: { emoji: "💰", label: "Tesouraria" },
} as const;

export function DiretoriaQuadro({ diretoria, loading, onPessoa }: {
  diretoria: CargoDiretoria[];
  loading: boolean;
  onPessoa: (id: string) => void;
}) {
  if (loading) return <Carregando />;
  if (diretoria.length === 0) {
    return <Vazio Icone={Crown} titulo="Nenhuma função de diretoria preenchida." dica={CAMINHO_DA_FUNCAO} />;
  }

  return (
    <div className="space-y-5">
      {([1, 2, 3, 4] as const).map((nivel) => {
        const deste = diretoria.filter(d => d.nivel === nivel);
        if (deste.length === 0) return null;
        return (
          <div key={nivel}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <span className="text-sm">{NIVEL[nivel].emoji}</span> {NIVEL[nivel].label}
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {deste.map(d => (
                <Cartao
                  key={d.id}
                  nome={d.pessoa_nome}
                  papel={d.cargo}
                  detalhe={d.mandato && `Mandato ${d.mandato}`}
                  onClick={() => onPessoa(d.pessoa_id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Conselho ───────────────────────────────────────────────────────────────

export interface ConselhoMembro {
  pessoa_id: string;
  nome_completo: string;
  foto_url: string | null;
  cargo: string;
  nivel_cargo: number;
  tipo_participacao: string;
  /** O que dá contexto ao cargo: o ministério para quem lidera ministério, a
   *  ÁREA para quem lidera área. Telma lidera Bazar e Apoio Adm, ambas do
   *  ministério de Administração — com o nome do ministério as duas linhas
   *  ficavam idênticas e pareciam registro duplicado. */
  contexto: string | null;
}

const GRUPO_CONSELHO = {
  diretoria:  "Diretoria",
  ministerio: "Líderes de Ministério",
  area:       "Líderes de Área",
  diacono:    "Diáconos",
} as const;

export function ConselhoQuadro({ conselho, loading, onPessoa }: {
  conselho: ConselhoMembro[];
  loading: boolean;
  onPessoa: (id: string) => void;
}) {
  if (loading) return <Carregando />;
  if (conselho.length === 0) {
    return (
      <Vazio
        Icone={Shield}
        titulo="Conselho ainda sem composição."
        dica="Composto automaticamente por Diretoria, Líderes de Ministério, Líderes de Área e Diáconos."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Dizer que ninguém cadastra o conselho evita a pergunta "onde eu
          adiciono alguém aqui?" — a resposta é: mudando o cargo da pessoa. */}
      <p className="text-xs text-muted-foreground">
        {conselho.length} participantes. A composição é consequência do cargo de
        cada um — ninguém é adicionado ao conselho diretamente.
      </p>
      {(Object.keys(GRUPO_CONSELHO) as (keyof typeof GRUPO_CONSELHO)[]).map((tipo) => {
        const grupo = conselho.filter(c => c.tipo_participacao === tipo);
        if (grupo.length === 0) return null;
        return (
          <div key={tipo}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {GRUPO_CONSELHO[tipo]} ({grupo.length})
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {grupo.map(c => (
                <Cartao
                  key={`${c.pessoa_id}-${c.cargo}-${c.contexto ?? ""}`}
                  nome={c.nome_completo}
                  papel={c.cargo + (c.contexto ? ` · ${c.contexto}` : "")}
                  onClick={() => onPessoa(c.pessoa_id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Diaconia ───────────────────────────────────────────────────────────────

export interface Diacono {
  id: string;
  nome_completo: string;
  data_ordenacao_diaconal: string | null;
}

export function DiaconiaQuadro({ diaconos, loading, onPessoa }: {
  diaconos: Diacono[];
  loading: boolean;
  onPessoa: (id: string) => void;
}) {
  if (loading) return <Carregando />;
  if (diaconos.length === 0) {
    return <Vazio Icone={HandHeart} titulo="Nenhum diácono cadastrado." dica={CAMINHO_DA_FUNCAO} />;
  }

  // Por data de ordenação, do mais antigo para o mais novo — é a ordem em que
  // a diaconia se apresenta, e quem não tem data cai no fim em vez de sumir.
  const ordenados = [...diaconos].sort((a, b) => {
    if (!a.data_ordenacao_diaconal) return 1;
    if (!b.data_ordenacao_diaconal) return -1;
    return a.data_ordenacao_diaconal.localeCompare(b.data_ordenacao_diaconal);
  });

  const anos = (d: string | null) => {
    if (!d) return null;
    const desde = Number(d.slice(0, 4));
    const n = new Date().getFullYear() - desde;
    return n <= 0 ? `Ordenado em ${desde}` : `${n} ${n === 1 ? "ano" : "anos"} de diaconato · desde ${desde}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {diaconos.length} {diaconos.length === 1 ? "diácono" : "diáconos"} em exercício.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        {ordenados.map(d => (
          <Cartao
            key={d.id}
            nome={d.nome_completo}
            papel="Diácono"
            detalhe={anos(d.data_ordenacao_diaconal) ?? "Sem data de ordenação"}
            onClick={() => onPessoa(d.id)}
          />
        ))}
      </div>
    </div>
  );
}
