// ─── Pgm.tsx — Listagem de PGMs ──────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, Plus, Loader2, ChevronRight, Pencil,
  Calendar, Clock, MapPin, MessageCircle, Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  listarGrupos, diaSemanaTexto, horarioTexto,
  type PgmGrupoResumo, type PgmGrupo,
} from "@/services/pgmService";
import { GrupoForm } from "@/components/pgm/GrupoForm";

export default function Pgm() {
  const { hasRole } = useAuth();
  const podeCriar = hasRole(["admin", "secretaria", "pastor", "diakonia"]);
  const [grupos, setGrupos] = useState<PgmGrupoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<PgmGrupo | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativos]);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarGrupos(mostrarInativos);
      setGrupos(data);
    } finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando grupos...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <Users className="w-6 h-6 text-gold" /> Pequenos Grupos
          </h1>
          <p className="text-xs text-muted-foreground">
            Onde a vida da igreja acontece durante a semana — relacionamento, discipulado e multiplicação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar desativados
          </label>
          {podeCriar && (
            <Button onClick={() => { setEditando(null); setFormOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Novo PGM
            </Button>
          )}
        </div>
      </div>

      {grupos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <Users className="w-10 h-10 mx-auto opacity-30" />
            <p>Ainda não há PGMs cadastrados.</p>
            {podeCriar && (
              <Button onClick={() => setFormOpen(true)} variant="outline" className="gap-1.5 mt-2">
                <Plus className="w-4 h-4" /> Criar o primeiro PGM
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {grupos.map((g) => (
            <Card key={g.id} className={`rounded-2xl shadow hover:shadow-md transition-shadow ${!g.ativo ? "opacity-60 border-dashed" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-start gap-2 justify-between">
                  <span className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-gold shrink-0" />
                    <span className="truncate">{g.nome}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {g.qtd_filhos > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300" title={`Multiplicou em ${g.qtd_filhos} grupo(s)`}>
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" /> Multiplicador
                      </Badge>
                    )}
                    {!g.ativo && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                        Desativado
                      </Badge>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2 text-xs">
                {g.descricao && (
                  <p className="text-muted-foreground italic line-clamp-2">"{g.descricao}"</p>
                )}

                {(g.dia_semana != null || g.horario) && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {diaSemanaTexto(g.dia_semana)}
                    {g.horario && <><Clock className="w-3 h-3 ml-1" /> {horarioTexto(g.horario)}</>}
                  </p>
                )}

                {(g.bairro || g.endereco) && (
                  <p className="flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="truncate">{[g.endereco, g.bairro].filter(Boolean).join(" · ")}</span>
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <strong>{g.qtd_membros}</strong>
                  <span className="text-muted-foreground">participantes</span>
                </div>

                {g.lider_nome && (
                  <p className="text-muted-foreground">
                    Líder: <strong className="text-foreground">{g.lider_nome}</strong>
                  </p>
                )}

                <div className="flex gap-1 pt-2">
                  <Link to={`/pgm/${g.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      Abrir <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  {g.whatsapp_link && (
                    <a href={g.whatsapp_link} target="_blank" rel="noopener noreferrer"
                      title="Abrir grupo do WhatsApp">
                      <Button type="button" variant="outline" size="sm"
                        className="text-emerald-700 hover:text-emerald-700 hover:bg-emerald-50">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                  )}
                  {podeCriar && (
                    <Button type="button" variant="ghost" size="sm"
                      onClick={(e) => { e.preventDefault(); setEditando(g); setFormOpen(true); }}
                      title="Editar PGM">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GrupoForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        grupo={editando}
        onSaved={carregar}
      />
    </div>
  );
}
