// ─── Atuações da pessoa — onde serve, e o que faz ─────────────────────────
//
// ── POR QUE ESTA TELA GANHOU EDIÇÃO ────────────────────────────────────────
//
// Medido em 02/09/2026: **80 dos 128 vínculos ativos não têm função**, e a
// Comunhão tem 40 de 44. Quem lidera não monta escala de recepção sem saber
// quem faz o quê.
//
// E não havia como corrigir. Procurando em todo o `src`, os únicos `update`
// em `area_voluntarios` mudam `status` para 'encerrada' — a função só nascia,
// nunca era editada. Consertar a de alguém exigia encerrar a atuação e criar
// outra, em duas telas diferentes. Para as 40 da Comunhão seriam 80
// operações.
//
// Esta tela já mostrava a função num selo. Faltava deixar tocar nele.
//
// ── SÓ AS ATIVAS ───────────────────────────────────────────────────────────
//
// Atuação encerrada é história: a pessoa serviu naquela função até aquela
// data. Reescrevê-la depois faria a linha do tempo mentir sobre o passado.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { conferir } from "@/lib/escritaConferida";

interface Pessoa { id: string; nome_completo: string; }
interface Row {
  id: string; funcao: string; data_inicio: string; data_fim: string|null;
  status: "ativa"|"encerrada"; area_id: string; ministerio_id: string;
  area_nome?: string; ministerio_nome?: string;
}

interface Props { pessoa: Pessoa | null; open: boolean; onOpenChange: (o:boolean)=>void; }

/** O genérico que o formulário da ficha grava quando ninguém informa nada. */
const GENERICO = new Set(["", "voluntário", "voluntario"]);

export default function AtuacoesDialog({ pessoa, open, onOpenChange }: Props) {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  // A RLS decide de verdade (20260902230000: admin em qualquer área, liderança
  // só nas suas). Isto aqui é só para não oferecer um lápis que vai falhar —
  // e quando a tela e o banco discordarem, `conferir` avisa em vez de mentir.
  const podeEditar = hasRole(["admin", "diakonia", "secretaria", "lideranca"]);

  const carregar = async (pessoaId: string) => {
    setLoading(true);
    const { data } = await supabase.from("area_voluntarios").select("*")
      .eq("membro_id", pessoaId)
      .order("status").order("data_inicio", { ascending: false });
    const list = (data ?? []) as Row[];
    const areaIds = [...new Set(list.map(r=>r.area_id))];
    const minIds = [...new Set(list.map(r=>r.ministerio_id))];
    const [{ data: areas }, { data: mins }] = await Promise.all([
      areaIds.length ? supabase.from("areas").select("id, nome").in("id", areaIds) : Promise.resolve({ data: [] as any }),
      minIds.length ? supabase.from("ministerios").select("id, nome").in("id", minIds) : Promise.resolve({ data: [] as any }),
    ]);
    const aMap = new Map<string,string>((areas ?? []).map((a:any)=>[a.id, a.nome]));
    const mMap = new Map<string,string>((mins ?? []).map((m:any)=>[m.id, m.nome]));
    setRows(list.map(r => ({ ...r, area_nome: aMap.get(r.area_id), ministerio_nome: mMap.get(r.ministerio_id) })));
    setLoading(false);
  };

  useEffect(()=>{
    if (!open || !pessoa) return;
    setEditando(null);
    carregar(pessoa.id);
  }, [open, pessoa?.id]);

  // ── As funções que este ministério já usa ────────────────────────────
  //
  // Sugestão, e não lista fechada: a igreja escreve as próprias palavras, e
  // fechar a lista aqui obrigaria a mexer no código para cadastrar um
  // instrumento novo. O que a sugestão evita é a mesma função escrita de três
  // jeitos — que é como `funcao` virou a bagunça que é.
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  useEffect(() => {
    if (!editando) return;
    const linha = rows.find(r => r.id === editando);
    if (!linha) return;
    (async () => {
      const { data } = await supabase.from("area_voluntarios")
        .select("funcao, area_id, areas(nome)")
        .eq("ministerio_id", linha.ministerio_id).eq("status", "ativa");
      const nomesDeArea = new Set(
        (data ?? []).map((d: any) => (d.areas?.nome ?? "").trim().toLowerCase()).filter(Boolean),
      );
      setSugestoes([...new Set(
        (data ?? [])
          .map((d: any) => (d.funcao ?? "").trim())
          .filter((f: string) => f && !GENERICO.has(f.toLowerCase()) && !nomesDeArea.has(f.toLowerCase())),
      )].sort((a, b) => a.localeCompare(b, "pt-BR")));
    })();
  }, [editando, rows]);

  const salvar = async (r: Row) => {
    const nova = rascunho.trim();
    if (!nova) return toast.error("Escreva a função, ou cancele.");
    if (nova === r.funcao) { setEditando(null); return; }
    setSalvando(true);
    // `.select()` porque a RLS barra devolvendo SUCESSO com zero linhas — o
    // defeito que `conferir` existe para pegar. Sem ele, o líder de outro
    // ministério veria "salvo" e nada teria mudado.
    const resultado = await supabase.from("area_voluntarios")
      .update({ funcao: nova }).eq("id", r.id).select("id");
    setSalvando(false);
    const rc = conferir(resultado, "A função");
    if (!rc.ok) return toast.error(rc.erro);
    toast.success(`Agora é ${nova} em ${r.area_nome ?? "esta área"}.`);
    setEditando(null);
    if (pessoa) carregar(pessoa.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Briefcase className="w-5 h-5"/> Atuações — {pessoa?.nome_completo}
          </DialogTitle>
        </DialogHeader>

        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
          rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atuação registrada.</p> : (
          <div className="space-y-2">
            {rows.map(r => {
              const emEdicao = editando === r.id;
              const semFuncao = GENERICO.has((r.funcao ?? "").trim().toLowerCase())
                || (r.area_nome ?? "").trim().toLowerCase() === (r.funcao ?? "").trim().toLowerCase();
              return (
              <Card key={r.id} className={r.status === "encerrada" ? "opacity-60 border-dashed" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium">{r.ministerio_nome ?? "—"}</span>
                    <span className="text-muted-foreground">›</span>
                    <span>{r.area_nome ?? "—"}</span>

                    {emEdicao ? (
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Input
                          autoFocus
                          value={rascunho}
                          onChange={e => setRascunho(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); salvar(r); }
                            if (e.key === "Escape") setEditando(null);
                          }}
                          list={`funcoes-${r.id}`}
                          placeholder="O que faz aqui?"
                          className="h-8 w-44 text-sm"
                        />
                        <datalist id={`funcoes-${r.id}`}>
                          {sugestoes.map(s => <option key={s} value={s} />)}
                        </datalist>
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          disabled={salvando} onClick={() => salvar(r)} aria-label="Salvar função">
                          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          onClick={() => setEditando(null)} aria-label="Cancelar">
                          <X className="w-4 h-4" />
                        </Button>
                      </span>
                    ) : (
                      <>
                        {/* Sem função, o selo diz o que falta em vez de repetir
                            "Voluntário" — que não informa nada e ainda parece
                            um cargo. */}
                        <Badge variant="outline"
                          className={semFuncao
                            ? "border-warning-line text-warning-text"
                            : "bg-muted/50"}>
                          {semFuncao ? "sem função definida" : r.funcao}
                        </Badge>
                        {podeEditar && r.status === "ativa" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            aria-label={`Editar a função em ${r.area_nome ?? "esta área"}`}
                            title="Editar função"
                            onClick={() => { setEditando(r.id); setRascunho(semFuncao ? "" : r.funcao); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </>
                    )}

                    {r.status === "ativa"
                      ? <Badge variant="outline" className="bg-success/10 text-success-text border-success-line/30">Ativa</Badge>
                      : <Badge variant="outline" className="bg-muted text-muted-foreground">Encerrada</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Início: {r.data_inicio}{r.data_fim ? ` • Encerramento: ${r.data_fim}` : ""}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
