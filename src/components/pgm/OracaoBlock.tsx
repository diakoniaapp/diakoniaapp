import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  HandHeart, Plus, CheckCircle2, Archive, Trash2, Eye, EyeOff, Users,
} from "lucide-react";
import {
  listarPedidosOracao, registrarPedidoOracao, responderPedidoOracao,
  arquivarPedidoOracao, excluirPedidoOracao,
  VISIBILIDADE_LABEL,
  type PgmPedidoComPessoa, type PgmOracaoVisibilidade, type PgmOracaoStatus,
} from "@/services/pgmService";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";

interface Props {
  grupoId: string;
  podeEditar: boolean;
}

export function OracaoBlock({ grupoId, podeEditar }: Props) {
  const [pedidos, setPedidos] = useState<PgmPedidoComPessoa[]>([]);
  const [filtro, setFiltro] = useState<PgmOracaoStatus | "todos">("ativo");
  const [loading, setLoading] = useState(true);

  // Form novo pedido
  const [novoTexto, setNovoTexto] = useState("");
  const [novaPessoaId, setNovaPessoaId] = useState("");
  const [novoNomeAvulso, setNovoNomeAvulso] = useState("");
  const [novaVisibilidade, setNovaVisibilidade] = useState<PgmOracaoVisibilidade>("lieranca" as any);
  const [usarPessoaAvulsa, setUsarPessoaAvulsa] = useState(false);

  useEffect(() => { carregar(); }, [grupoId, filtro]);
  useEffect(() => { setNovaVisibilidade("lideranca"); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarPedidosOracao(grupoId, filtro);
      setPedidos(data);
    } finally { setLoading(false); }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoTexto.trim()) { toast.error("Descreva o pedido"); return; }
    try {
      await registrarPedidoOracao({
        grupo_id: grupoId,
        pessoa_id: usarPessoaAvulsa ? null : (novaPessoaId || null),
        nome_avulso: usarPessoaAvulsa ? (novoNomeAvulso.trim() || null) : null,
        texto: novoTexto.trim(),
        visibilidade: novaVisibilidade,
      });
      toast.success("Pedido de oração registrado 🙏");
      setNovoTexto(""); setNovaPessoaId(""); setNovoNomeAvulso("");
      setUsarPessoaAvulsa(false);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function responder(p: PgmPedidoComPessoa) {
    const resp = prompt("Como foi respondido? (testemunho curto)");
    if (resp === null) return;
    try {
      await responderPedidoOracao(p.id, resp || "");
      toast.success("Pedido marcado como respondido 🎉");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function arquivar(p: PgmPedidoComPessoa) {
    if (!confirm("Arquivar este pedido?")) return;
    try {
      await arquivarPedidoOracao(p.id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function excluir(p: PgmPedidoComPessoa) {
    if (!confirm("Excluir definitivamente?")) return;
    try {
      await excluirPedidoOracao(p.id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-serif text-base flex items-center gap-2">
            <HandHeart className="w-4 h-4 text-gold" /> Pedidos de oração
          </h3>
          <Select value={filtro} onValueChange={(v) => setFiltro(v as any)}>
            <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="respondido">Respondidos</SelectItem>
              <SelectItem value="arquivado">Arquivados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {podeEditar && (
          <form onSubmit={adicionar} className="space-y-2 border rounded-md p-2 bg-muted/20">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Plus className="w-3 h-3" /> Novo pedido
            </p>

            <Textarea rows={2} value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)}
              placeholder="O que vamos levar diante do Senhor?" />

            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input type="checkbox" checked={usarPessoaAvulsa} onChange={(e) => setUsarPessoaAvulsa(e.target.checked)} />
              É de alguém de fora (não cadastrado)
            </label>

            {usarPessoaAvulsa ? (
              <Input placeholder="Nome (ex: Mãe da Maria)" value={novoNomeAvulso}
                onChange={(e) => setNovoNomeAvulso(e.target.value)} />
            ) : (
              <BuscaPessoa value={novaPessoaId} onChange={(id) => setNovaPessoaId(id)}
                placeholder="Por quem orar? (opcional)" />
            )}

            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2">
                <Label className="text-[10px]">Visibilidade</Label>
                <Select value={novaVisibilidade} onValueChange={(v) => setNovaVisibilidade(v as PgmOracaoVisibilidade)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="privada">
                      <span className="flex items-center gap-1.5"><EyeOff className="w-3 h-3" /> Só líder</span>
                    </SelectItem>
                    <SelectItem value="lideranca">
                      <span className="flex items-center gap-1.5"><Eye className="w-3 h-3" /> Líder e co-líder</span>
                    </SelectItem>
                    <SelectItem value="grupo">
                      <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> Grupo todo</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm">Registrar</Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-3">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-3">
            {filtro === "ativo" ? "Sem pedidos ativos no momento." : "Sem registros."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {pedidos.map(p => (
              <div key={p.id} className={`border rounded-md p-2 space-y-1 ${
                p.status === "respondido" ? "bg-emerald-50/50 border-emerald-200"
                  : p.status === "arquivado" ? "opacity-60"
                  : ""
              }`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug whitespace-pre-wrap">{p.texto}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {p.pessoa_nome && <span>por <strong className="text-foreground">{p.pessoa_nome}</strong></span>}
                      <Badge variant="outline" className="text-[9px] gap-0.5">
                        {p.visibilidade === "privada" ? <EyeOff className="w-2 h-2" />
                          : p.visibilidade === "grupo" ? <Users className="w-2 h-2" />
                          : <Eye className="w-2 h-2" />}
                        {VISIBILIDADE_LABEL[p.visibilidade]}
                      </Badge>
                      {p.status === "respondido" && (
                        <Badge variant="outline" className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-300">
                          ✓ Respondido
                        </Badge>
                      )}
                      {p.status === "arquivado" && (
                        <Badge variant="outline" className="text-[9px]">Arquivado</Badge>
                      )}
                    </p>
                    {p.resposta && (
                      <p className="text-[11px] italic text-emerald-700 mt-1 pl-2 border-l-2 border-emerald-300">
                        "{p.resposta}"
                      </p>
                    )}
                  </div>
                  {podeEditar && p.status === "ativo" && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => responder(p)} className="h-7 w-7 text-emerald-700 hover:bg-emerald-50"
                        title="Marcar como respondido">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => arquivar(p)} className="h-7 w-7 text-muted-foreground"
                        title="Arquivar">
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => excluir(p)} className="h-7 w-7 text-destructive"
                        title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
