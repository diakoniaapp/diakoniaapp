// ============================================================
// PessoaCard.tsx
// Card completo de pessoa — mini-perfil com todos os vínculos
// ============================================================

import { useEffect, useState } from "react";
import { supabase, supabaseRel } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Shield, Church, MapPin, Calendar, Star, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useAuth } from "@/hooks/useAuth";
import { cargosDaPessoa } from "@/services/diretoriaService";
import { TIPO_PESSOA_LABEL, TIPO_PESSOA_COR, type TipoPessoa } from "@/lib/tipoPessoa";
import { Skeleton } from "@/components/ui/skeleton";
import { LinhaDoTempo } from "@/components/membros/LinhaDoTempo";
import { historiaDaPessoa, diasDesdeOUltimoContato, type EventoDaHistoria } from "@/services/historiaPessoa";

// ── Tipos ─────────────────────────────────────────────────────

interface PessoaCompleta {
  id: string;
  nome_completo: string;
  nome_social: string | null;
  foto_url: string | null;
  tipo_pessoa: string;
  status: string;
  data_entrada: string | null;
  email: string | null;
  telefone_celular: string | null;
  perfil_acesso: string | null;
}

interface CargoEstatutario {
  cargo: string;
  nivel: number;
  mandato: string | null;
}

interface MinisterioVinculo {
  ministerio_nome: string;
  funcao: string;
  cor: string | null;
}

interface AreaVinculo {
  ministerio_nome: string;
  area_nome: string;
  funcao: string;
}

// ── Helpers visuais ───────────────────────────────────────────

// Antes daqui saía congregado em VERDE e membro em AZUL, enquanto o
// catálogo mostrava dourado e cobre para as mesmas pessoas. Agora as duas
// telas leem do mesmo lugar — ver o comentário em lib/tipoPessoa.ts.
const TIPO_CONFIG: Record<string, { label: string; cor: string }> =
  Object.fromEntries(
    (Object.keys(TIPO_PESSOA_LABEL) as TipoPessoa[]).map(t => [
      t, { label: TIPO_PESSOA_LABEL[t], cor: TIPO_PESSOA_COR[t] },
    ]),
  );

const FUNCAO_CONFIG: Record<string, { label: string; cor: string }> = {
  // O roxo saiu. Ele não existe na paleta da igreja, e numa lista de
  // etiquetas ao lado de co-líder, tesoureiro e diácono ele dizia "isto
  // aqui é de outro sistema". Liderar é a função de maior peso da lista:
  // fica com a cor da casa. Mesmo caminho que QuadrosInstitucionais.tsx já
  // tinha tomado para a diretoria.
  lider:       { label: "Líder",       cor: "bg-primary/10 text-primary border-primary/30" },
  co_lider:    { label: "Co-líder",    cor: "bg-info-soft text-info-text border-info-line" },
  secretario:  { label: "Secretário",  cor: "bg-info-soft text-info-text border-info-line" },
  tesoureiro:  { label: "Tesoureiro",  cor: "bg-warning-soft text-warning-text border-warning-line" },
  voluntario:  { label: "Voluntário",  cor: "bg-success-soft text-success-text border-success-line" },
  diacono:     { label: "Diácono",     cor: "bg-warning-soft text-warning-text border-warning-line" },
  obreiro:     { label: "Obreiro",     cor: "bg-teal/15 text-teal border-teal/30" },
  colaborador: { label: "Colaborador", cor: "bg-gray-100 text-gray-600 border-gray-300" },
};

const PERFIL_CONFIG: Record<string, { label: string; cor: string }> = {
  admin:        { label: "Admin",        cor: "bg-primary/10 text-primary" },
  pastor:       { label: "Pastor",       cor: "bg-info-soft text-info-text" },
  secretaria:   { label: "Secretaria",   cor: "bg-info-soft text-info-text" },
  tesoureiro:   { label: "Tesoureiro",   cor: "bg-warning-soft text-warning-text" },
  lideranca:    { label: "Liderança",    cor: "bg-success-soft text-success-text" },
  voluntario:   { label: "Voluntário",   cor: "bg-gray-100 text-gray-600" },
  membro:       { label: "Membro",       cor: "bg-gray-100 text-gray-600" },
};

const NIVEL_CARGO_EMOJI: Record<number, string> = {
  1: "👑", 2: "⭐", 3: "📋", 4: "💰",
};

function calcularTempo(dataEntrada: string | null): string {
  if (!dataEntrada) return "–";
  const anos = Math.floor((Date.now() - new Date(dataEntrada).getTime()) / (365.25 * 86_400_000));
  if (anos === 0) return "menos de 1 ano";
  return `${anos} ano${anos !== 1 ? "s" : ""}`;
}

// ── Componente Principal ──────────────────────────────────────

interface PessoaCardProps {
  pessoaId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function PessoaCard({ pessoaId, open, onClose }: PessoaCardProps) {
  const navigate = useNavigate();
  const { podeEditarPessoas } = useAuth();
  const { podeFazer, permissoes: permsCarregadas, loading: permsCarregando } = usePermissoes();
  // Mesmo piso usado no catalogo: conjunto vazio quer dizer consulta falhada,
  // nao usuario sem direito.
  const semResposta = permsCarregando || permsCarregadas.size === 0;
  const podeEditar  = semResposta ? podeEditarPessoas : podeFazer("editar_pessoa");

  // Fecha a ficha e abre o formulário na tela de Pessoas.
  //
  // O parâmetro `?abrir=<id>` já existia e já fazia exatamente isso — não
  // precisou de rota nem de estado novo. Renderizar o MembroForm aqui dentro
  // seria um diálogo sobre outro, e o formulário tem seis passos: não cabe.
  function irParaEdicao() {
    if (!pessoaId) return;
    onClose();
    navigate(`/membros?abrir=${pessoaId}`);
  }
  const [pessoa, setPessoa]         = useState<PessoaCompleta | null>(null);
  const [cargos, setCargos]         = useState<CargoEstatutario[]>([]);
  const [ministerios, setMinerios]  = useState<MinisterioVinculo[]>([]);
  const [areas, setAreas]           = useState<AreaVinculo[]>([]);
  const [historia, setHistoria]     = useState<EventoDaHistoria[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!pessoaId || !open) return;
    const carregar = async () => {
      setLoading(true);

      // Pessoa
      const { data: p } = await supabase
        .from("membros")
        .select("id,nome_completo,nome_social,foto_url,tipo_pessoa,status,data_entrada,email,telefone_celular,perfil_acesso")
        .eq("id", pessoaId)
        .single();
      setPessoa(p ?? null);

      // Cargo de diretoria — vem da função na ficha. Ver diretoriaService.ts.
      setCargos(await cargosDaPessoa(pessoaId));

      // A história vem junto com o resto: ela é o corpo da ficha agora,
      // não um extra que se busca depois de a tela já estar montada.
      setHistoria(await historiaDaPessoa(pessoaId));

      // ── Onde a pessoa serve ────────────────────────────────────────
      //
      // Contado em produção: ministerio_membros tem 0 linhas e
      // pessoa_participacao tem 0 linhas. Os vínculos de verdade — 113 —
      // estão em area_voluntarios. Esta ficha vinha mostrando "nenhum
      // ministério" para TODO MUNDO, em silêncio, porque perguntava nas
      // duas tabelas vazias.
      //
      // As duas continuam sendo lidas: se um dia forem povoadas, o que
      // estiver lá aparece. Mas quem responde hoje é area_voluntarios.
      //
      // Com embed: a chave estrangeira para `areas` existe desde 19/08/2026
      // (migration 20260819110000), e o PostgREST voltou a aceitar o join.
      // As duas consultas que moravam aqui viraram uma.
      const { data: av } = await supabase
        .from("area_voluntarios")
        .select("area_id, funcao, status, areas(id, nome, ministerios(nome, cor))")
        .eq("membro_id", pessoaId)
        // .eq e nao .in(["ativa","ativo"]): status e o enum atuacao_status, e
        // "ativo" NAO e um valor dele — so "ativa" e "encerrada". Passar um
        // valor invalido nao filtra a mais: o Postgres rejeita a consulta
        // INTEIRA com "invalid input value for enum", e a ficha mostrava
        // "sem vinculos" para quem serve em duas areas.
        .eq("status", "ativa");

      const { data: mm } = await supabaseRel
        .from("ministerio_membros")
        .select("funcao, ministerios(nome, cor)")
        .eq("membro_id", pessoaId)
        .eq("ativo", true);
      // TABELA AUSENTE EM PRODUCAO — ver migration 20260528_estrutura_organizacional.sql
      const { data: pp } = await supabase
        .from("pessoa_participacao")
        .select("funcao, ministerios(nome, cor)")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .is("area_id", null);

      const todosMin = [
        ...(av ?? []).filter((r: any) => r.areas?.ministerios).map((r: any) => ({
          ministerio_nome: r.areas.ministerios.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.areas.ministerios.cor ?? null,
        })),
        ...(mm ?? []).map((r: any) => ({
          ministerio_nome: r.ministerios?.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.ministerios?.cor ?? null,
        })),
        ...(pp ?? []).filter((r: any) => r.ministerios).map((r: any) => ({
          ministerio_nome: r.ministerios?.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
          cor: r.ministerios?.cor ?? null,
        })),
      ];
      // Dedup por nome
      const uniqMin = todosMin.filter(
        (m, i, arr) => arr.findIndex(x => x.ministerio_nome === m.ministerio_nome) === i
      );
      setMinerios(uniqMin);

      // Áreas
      // TABELA AUSENTE EM PRODUCAO — ver migration 20260528_estrutura_organizacional.sql
      const { data: pa } = await supabase
        .from("pessoa_participacao")
        .select("funcao, areas(nome, ministerios(nome))")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .not("area_id", "is", null);
      setAreas([
        ...(av ?? []).filter((r: any) => r.areas).map((r: any) => ({
          ministerio_nome: r.areas.ministerios?.nome ?? "–",
          area_nome: r.areas.nome ?? "–",
          funcao: r.funcao ?? "voluntario",
        })),
        ...(pa ?? []).filter((r: any) => r.areas).map((r: any) => ({
          ministerio_nome: (r.areas as any).ministerios?.nome ?? "–",
          area_nome: (r.areas as any).nome ?? "–",
          funcao: r.funcao ?? "voluntario",
        })),
      ]);

      setLoading(false);
    };
    carregar();
  }, [pessoaId, open]);

  const tipoCfg  = TIPO_CONFIG[(pessoa?.tipo_pessoa as string) ?? ""] ?? TIPO_CONFIG.visitante;
  const perfilCfg = PERFIL_CONFIG[(pessoa?.perfil_acesso as string) ?? ""] ?? PERFIL_CONFIG.membro;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil da pessoa</DialogTitle>
        </DialogHeader>

        {loading || !pessoa ? (
          <div className="space-y-4 py-2" aria-busy="true">
            <span className="sr-only">Carregando a ficha…</span>
            <div className="flex items-center gap-4">
              <Skeleton className="w-16 h-16 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-24" />
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-4" style={{ width: `${70 - i * 12}%` }} />)}
          </div>
        ) : (
          <div className="space-y-5">

            {/* Cabeçalho: foto + nome + status.
                Sem foto nao entra nada no lugar: as iniciais eram um
                circulo de 64px repetindo a letra que ja esta no nome ao
                lado. Foto de verdade identifica; duas letras nao. */}
            <div className="flex items-center gap-4">
              {pessoa.foto_url && (
                <img src={pessoa.foto_url} alt={pessoa.nome_completo}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {/* O lápis ao lado do nome, e não num rodapé.

                    A ficha abre a partir de um nome clicado em qualquer tela —
                    na chamada da EBD, na escala, no acolhimento. Quem chega
                    aqui muitas vezes chega porque viu algo errado no cadastro,
                    e sem esta saída teria de fechar, ir a Pessoas, buscar de
                    novo e só então editar.

                    Só aparece para quem pode editar: a tela de Pessoas barra
                    quem não tem `editar_pessoa`, e um lápis que leva a uma
                    tela que não deixa fazer nada é pior que lápis nenhum. */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="font-serif font-semibold text-base leading-tight truncate">
                    {pessoa.nome_social ?? pessoa.nome_completo}
                  </h2>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={irParaEdicao}
                      title={`Editar a ficha de ${pessoa.nome_social ?? pessoa.nome_completo}`}
                      aria-label={`Editar a ficha de ${pessoa.nome_social ?? pessoa.nome_completo}`}
                      className="shrink-0 text-muted-foreground hover:text-primary p-1 -m-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {pessoa.nome_social && (
                  <p className="text-xs text-muted-foreground truncate">{pessoa.nome_completo}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Badge variant="outline" className={`text-xs h-4 px-1.5 ${tipoCfg.cor}`}>
                    {tipoCfg.label}
                  </Badge>
                  {pessoa.perfil_acesso && (
                    <Badge variant="outline" className={`text-xs h-4 px-1.5 ${perfilCfg.cor}`}>
                      <Shield className="w-2.5 h-2.5 mr-1" />{perfilCfg.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* ── Há quanto tempo ninguém fala com esta pessoa ──────────

                Uma linha, e é a que muda o que se faz nos próximos cinco
                minutos. Só aparece a partir de 30 dias: abaixo disso não há
                nada a dizer, e um aviso que aparece sempre deixa de ser
                aviso. */}
            {(() => {
              const dias = diasDesdeOUltimoContato(historia);
              if (dias === null || dias < 30) return null;
              const muito = dias >= 180;
              return (
                <div className={`rounded-lg border px-3 py-2 text-sm ${
                  muito ? "border-warning-line bg-warning-soft text-warning-text"
                        : "border-border bg-muted/50 text-muted-foreground"}`}>
                  Último contato há <strong>{dias} dias</strong>
                  {muito && " — mais de meio ano"}
                </div>
              );
            })()}

            {/* ── A história ────────────────────────────────────────────

                Ela vem antes dos cargos e dos ministérios de propósito.
                "Onde a pessoa se encaixa" é organograma; "o que aconteceu
                com ela" é cuidado pastoral, e é a pergunta de quem abre a
                ficha de alguém.

                Material: 283 registros de contato cobrindo 276 das 282
                pessoas, 141 mudanças de vínculo, 113 entradas em áreas e as
                datas de consagração — tudo já gravado, e nada disso
                aparecia em lugar nenhum do sistema. */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="w-3 h-3" /> História
              </div>
              <LinhaDoTempo eventos={historia} />
            </div>

            {/* Cargo estatutário (Diretoria) */}
            {cargos.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/[0.07] px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Diretoria Estatutária
                </p>
                {cargos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{NIVEL_CARGO_EMOJI[c.nivel] ?? "📌"}</span>
                    <span className="text-sm font-medium text-primary">{c.cargo}</span>
                    {c.mandato && (
                      <span className="text-xs text-primary/70 ml-auto">
                        Mandato {c.mandato}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Ministérios */}
            {ministerios.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Church className="w-3 h-3" /> Ministérios
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ministerios.map((m, i) => {
                    const fCfg = FUNCAO_CONFIG[m.funcao] ?? FUNCAO_CONFIG.voluntario;
                    return (
                      <div key={i} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background">
                        <span className="font-medium truncate max-w-[140px]">{m.ministerio_nome}</span>
                        <Badge variant="outline" className={`text-xs h-3.5 px-1 ${fCfg.cor}`}>
                          {fCfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Áreas */}
            {areas.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="w-3 h-3" /> Áreas de atuação
                </div>
                <div className="space-y-1">
                  {areas.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{a.area_nome}</span>
                      <span>em</span>
                      <span>{a.ministerio_nome}</span>
                      <Badge variant="outline" className="text-xs h-3.5 px-1 ml-auto">
                        {FUNCAO_CONFIG[a.funcao]?.label ?? a.funcao}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rodapé: tempo + contato */}
            <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Na igreja há {calcularTempo(pessoa.data_entrada)}</span>
              </div>
              {ministerios.length === 0 && areas.length === 0 && cargos.length === 0 && (
                <span className="flex items-center gap-1 text-warning-text">
                  <Star className="w-3.5 h-3.5" />
                  Sem vínculos cadastrados
                </span>
              )}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
