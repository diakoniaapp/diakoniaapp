// ============================================================
// PessoaCard.tsx
// Card completo de pessoa — mini-perfil com todos os vínculos
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Shield, Church, MapPin, Calendar, Star } from "lucide-react";

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

const TIPO_CONFIG: Record<string, { label: string; cor: string }> = {
  membro:     { label: "Membro",     cor: "bg-blue-100 text-blue-700 border-blue-300" },
  congregado: { label: "Congregado", cor: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  visitante:  { label: "Visitante",  cor: "bg-yellow-100 text-yellow-700 border-yellow-300" },
};

const FUNCAO_CONFIG: Record<string, { label: string; cor: string }> = {
  lider:       { label: "Líder",       cor: "bg-purple-100 text-purple-700 border-purple-300" },
  co_lider:    { label: "Co-líder",    cor: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  secretario:  { label: "Secretário",  cor: "bg-sky-100 text-sky-700 border-sky-300" },
  tesoureiro:  { label: "Tesoureiro",  cor: "bg-amber-100 text-amber-700 border-amber-300" },
  voluntario:  { label: "Voluntário",  cor: "bg-green-100 text-green-700 border-green-300" },
  diacono:     { label: "Diácono",     cor: "bg-orange-100 text-orange-700 border-orange-300" },
  obreiro:     { label: "Obreiro",     cor: "bg-teal-100 text-teal-700 border-teal-300" },
  colaborador: { label: "Colaborador", cor: "bg-gray-100 text-gray-600 border-gray-300" },
};

const PERFIL_CONFIG: Record<string, { label: string; cor: string }> = {
  admin:        { label: "Admin",        cor: "bg-purple-100 text-purple-700" },
  pastor:       { label: "Pastor",       cor: "bg-indigo-100 text-indigo-700" },
  secretaria:   { label: "Secretaria",   cor: "bg-blue-100 text-blue-700" },
  tesoureiro:   { label: "Tesoureiro",   cor: "bg-amber-100 text-amber-700" },
  lideranca:    { label: "Liderança",    cor: "bg-green-100 text-green-700" },
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

function Inicial({ nome }: { nome: string }) {
  const iniciais = nome.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
  return (
    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-bold text-xl border-2 border-primary/20 shrink-0">
      {iniciais}
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────

interface PessoaCardProps {
  pessoaId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function PessoaCard({ pessoaId, open, onClose }: PessoaCardProps) {
  const [pessoa, setPessoa]         = useState<PessoaCompleta | null>(null);
  const [cargos, setCargos]         = useState<CargoEstatutario[]>([]);
  const [ministerios, setMinerios]  = useState<MinisterioVinculo[]>([]);
  const [areas, setAreas]           = useState<AreaVinculo[]>([]);
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

      // Cargos estatutários
      const { data: ce } = await supabase
        .from("pessoa_cargo_estatutario")
        .select("mandato, cargos_estatutarios(nome, nivel)")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true);
      setCargos((ce ?? []).map((r: any) => ({
        cargo: r.cargos_estatutarios?.nome ?? "–",
        nivel: r.cargos_estatutarios?.nivel ?? 9,
        mandato: r.mandato,
      })));

      // Ministérios (via ministerio_membros legado + pessoa_participacao)
      const { data: mm } = await supabase
        .from("ministerio_membros")
        .select("funcao, ministerios(nome, cor)")
        .eq("membro_id", pessoaId)
        .eq("ativo", true);
      const { data: pp } = await supabase
        .from("pessoa_participacao")
        .select("funcao, ministerios(nome, cor)")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .is("area_id", null);

      const todosMin = [
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
      const { data: pa } = await supabase
        .from("pessoa_participacao")
        .select("funcao, areas(nome, ministerios(nome))")
        .eq("pessoa_id", pessoaId)
        .eq("ativo", true)
        .not("area_id", "is", null);
      setAreas((pa ?? []).filter((r: any) => r.areas).map((r: any) => ({
        ministerio_nome: (r.areas as any).ministerios?.nome ?? "–",
        area_nome: (r.areas as any).nome ?? "–",
        funcao: r.funcao ?? "voluntario",
      })));

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* Cabeçalho: foto + nome + status */}
            <div className="flex items-center gap-4">
              {pessoa.foto_url ? (
                <img src={pessoa.foto_url} alt={pessoa.nome_completo}
                  className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 shrink-0" />
              ) : (
                <Inicial nome={pessoa.nome_completo} />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-serif font-semibold text-base leading-tight truncate">
                  {pessoa.nome_social ?? pessoa.nome_completo}
                </h2>
                {pessoa.nome_social && (
                  <p className="text-xs text-muted-foreground truncate">{pessoa.nome_completo}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${tipoCfg.cor}`}>
                    {tipoCfg.label}
                  </Badge>
                  {pessoa.perfil_acesso && (
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${perfilCfg.cor}`}>
                      <Shield className="w-2.5 h-2.5 mr-1" />{perfilCfg.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Cargo estatutário (Diretoria) */}
            {cargos.length > 0 && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/60 px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-700">
                  Diretoria Estatutária
                </p>
                {cargos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{NIVEL_CARGO_EMOJI[c.nivel] ?? "📌"}</span>
                    <span className="text-sm font-medium text-purple-800">{c.cargo}</span>
                    {c.mandato && (
                      <span className="text-[10px] text-purple-500 ml-auto">
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
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Church className="w-3 h-3" /> Ministérios
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ministerios.map((m, i) => {
                    const fCfg = FUNCAO_CONFIG[m.funcao] ?? FUNCAO_CONFIG.voluntario;
                    return (
                      <div key={i} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-background">
                        <span className="font-medium truncate max-w-[140px]">{m.ministerio_nome}</span>
                        <Badge variant="outline" className={`text-[9px] h-3.5 px-1 ${fCfg.cor}`}>
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
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="w-3 h-3" /> Áreas de atuação
                </div>
                <div className="space-y-1">
                  {areas.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{a.area_nome}</span>
                      <span>em</span>
                      <span>{a.ministerio_nome}</span>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 ml-auto">
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
                <span className="flex items-center gap-1 text-warning">
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
