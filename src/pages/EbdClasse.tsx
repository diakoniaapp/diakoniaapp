// ─── EbdClasse.tsx — Detalhe de uma classe ─────────────────────────────────
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, UserPlus, UserMinus, Users, GraduationCap, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarClasse, esperadosDaClasse, matriculadosDaClasse,
  matricular, desmatricular, type EbdClasse, type EbdEsperado,
} from "@/services/ebdService";
import { supabase } from "@/integrations/supabase/client";

interface MatRow {
  id: string;
  data_matricula: string;
  pessoa_id: string;
  membros: { id: string; nome_completo: string; sexo: string | null; data_nascimento: string | null } | null;
}

function calcIdade(dn: string | null): number | null {
  if (!dn) return null;
  return Math.floor((Date.now() - new Date(dn).getTime()) / (365.25 * 86_400_000));
}

export default function EbdClasse() {
  const { classeId = "" } = useParams();
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [esperados, setEsperados] = useState<EbdEsperado[]>([]);
  const [matriculados, setMatriculados] = useState<MatRow[]>([]);
  const [naoMatriculados, setNaoMatriculados] = useState<{ id: string; nome_completo: string; data_nascimento: string | null }[]>([]);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { recarregar(); }, [classeId]);

  async function recarregar() {
    if (!classeId) return;
    setLoading(true);
    try {
      const c = await carregarClasse(classeId);
      setClasse(c);
      const [esp, mat] = await Promise.all([
        esperadosDaClasse(classeId),
        matriculadosDaClasse(classeId) as Promise<MatRow[]>,
      ]);
      setEsperados(esp);
      setMatriculados(mat);

      // Não matriculados: pessoas fora da faixa que não estão matriculadas em NENHUMA classe
      const { data: outras } = await supabase
        .from("membros")
        .select("id, nome_completo, data_nascimento")
        .in("tipo_pessoa", ["membro", "congregado"])
        .eq("status", "ativo")
        .order("nome_completo");
      const matIds = new Set(mat.map(m => m.pessoa_id));
      const espIds = new Set(esp.map(e => e.pessoa_id));
      const nao = (outras ?? []).filter(o => !matIds.has(o.id) && !espIds.has(o.id));
      setNaoMatriculados(nao);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar classe");
    } finally {
      setLoading(false);
    }
  }

  async function handleMatricular(pessoaId: string) {
    setBusy(true);
    try {
      await matricular(pessoaId, classeId);
      toast.success("Matrícula registrada");
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao matricular");
    } finally { setBusy(false); }
  }

  async function handleDesmatricular(matriculaId: string) {
    setBusy(true);
    try {
      await desmatricular(matriculaId);
      toast.success("Pessoa removida da classe");
      await recarregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }

  if (!classe) {
    return <div className="p-8 text-center text-muted-foreground">
      Classe não encontrada. <Link to="/ebd" className="text-primary underline">Voltar</Link>
    </div>;
  }

  const filtroLower = filtro.trim().toLowerCase();
  const espFiltrados = esperados.filter(e => e.nome_completo.toLowerCase().includes(filtroLower));
  const matFiltrados = matriculados.filter(m => m.membros?.nome_completo.toLowerCase().includes(filtroLower));
  const naoFiltrados = naoMatriculados.filter(n => n.nome_completo.toLowerCase().includes(filtroLower));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/ebd">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-gold" />
              {classe.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              {classe.idade_min ?? 0}–{classe.idade_max ?? "+"} anos · {classe.genero === "misto" ? "Misto" : classe.genero === "feminino" ? "Mulheres" : "Homens"}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to={`/ebd/${classeId}/chamada`}>Chamada (em breve)</Link>
        </Button>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">Matriculados</p>
          <p className="text-2xl font-semibold text-emerald-600">{matriculados.length}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">Esperados</p>
          <p className="text-2xl font-semibold">{esperados.length}</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 text-center">
          <p className="text-xs text-muted-foreground">Não matriculados</p>
          <p className="text-2xl font-semibold text-amber-600">{naoMatriculados.length}</p>
        </CardContent></Card>
      </div>

      {/* Filtro */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar pessoa por nome..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      {/* Abas */}
      <Tabs defaultValue="matriculados" className="space-y-3">
        <TabsList>
          <TabsTrigger value="matriculados">Matriculados ({matFiltrados.length})</TabsTrigger>
          <TabsTrigger value="esperados">Esperados ({espFiltrados.length})</TabsTrigger>
          <TabsTrigger value="nao_mat">Sem classe ({naoFiltrados.length})</TabsTrigger>
        </TabsList>

        {/* Matriculados */}
        <TabsContent value="matriculados" className="space-y-2">
          {matFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum matriculado ainda. Use a aba "Esperados" para matricular alunos.
            </p>
          )}
          {matFiltrados.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{m.membros?.nome_completo}</p>
                  <p className="text-xs text-muted-foreground">
                    {calcIdade(m.membros?.data_nascimento ?? null) ?? "?"} anos
                    {m.membros?.sexo && ` · ${m.membros.sexo}`}
                    {" · matriculado em "}{new Date(m.data_matricula).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => handleDesmatricular(m.id)}
                  disabled={busy}
                  className="text-destructive"
                >
                  <UserMinus className="w-4 h-4 mr-1" /> Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Esperados (faixa etária) */}
        <TabsContent value="esperados" className="space-y-2">
          {espFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Ninguém na faixa etária ainda.
            </p>
          )}
          {espFiltrados.map((e) => (
            <Card key={e.pessoa_id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{e.nome_completo}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.idade ?? "?"} anos
                    {e.sexo && ` · ${e.sexo}`}
                    {e.ja_matriculado && <Badge variant="outline" className="ml-2 text-[10px] text-emerald-600 border-emerald-300">Matriculado</Badge>}
                  </p>
                </div>
                {!e.ja_matriculado && (
                  <Button
                    size="sm" onClick={() => handleMatricular(e.pessoa_id)}
                    disabled={busy} className="gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" /> Matricular
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Não matriculados (outras pessoas) */}
        <TabsContent value="nao_mat" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Pessoas fora da faixa etária desta classe e que não estão em outra. Útil para matricular adultos em classes específicas (ex: Mulheres).
          </p>
          {naoFiltrados.slice(0, 50).map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{p.nome_completo}</p>
                  <p className="text-xs text-muted-foreground">
                    {calcIdade(p.data_nascimento) ?? "?"} anos
                  </p>
                </div>
                <Button size="sm" variant="outline"
                  onClick={() => handleMatricular(p.id)}
                  disabled={busy} className="gap-1.5">
                  <UserPlus className="w-4 h-4" /> Matricular mesmo assim
                </Button>
              </CardContent>
            </Card>
          ))}
          {naoFiltrados.length > 50 && (
            <p className="text-xs text-muted-foreground text-center">
              ... e mais {naoFiltrados.length - 50} pessoas (afine o filtro).
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
