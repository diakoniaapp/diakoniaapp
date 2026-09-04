// ─── DiaconiaChamada.tsx — a chamada de uma ocasião de atendimento ─────────
//
// Mesmo desenho da chamada da EBD (`EbdChamada.tsx`): ocasião por data, lista
// com toque para confirmar, "+ novo" para quem chega sem cadastro. A igreja
// pediu explicitamente "'CONFIRMADO' como uma lista de presença da EBD" —
// esta tela é essa frase, para cestas básicas, culto de rua ou jantar,
// qualquer que seja a área.
//
// Quem abre: líder/ministra da Diaconia, e também quem só SERVE na área —
// diácono sem ser `lideranca`. A porta larga (`diaconia_posso_atender`) é do
// banco; esta tela não decide quem entra, só mostra erro se a RPC recusar.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Calendar, Loader2, UserPlus, HeartHandshake, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  obterOuCriarOcasiao, chamadaView, marcarConfirmado, adicionarPessoaNaChamada,
  type LinhaDaChamada,
} from "@/services/diaconiaService";
import { TelefoneInput } from "@/components/ui/TelefoneInput";
import { PaginaSkeleton } from "@/components/ListState";
import { supabase } from "@/integrations/supabase/client";

export default function DiaconiaChamada() {
  const { ministerioId = "", areaId = "" } = useParams();
  const navigate = useNavigate();

  const [areaNome, setAreaNome] = useState<string>("");
  const [data, setData] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("data") || new Date().toISOString().slice(0, 10);
  });
  const [ocasiaoId, setOcasiaoId] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaDaChamada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoBusy, setNovoBusy] = useState(false);

  useEffect(() => { carregar(); }, [areaId, data]);

  async function carregar() {
    if (!areaId) return;
    setLoading(true);
    setErro(null);
    try {
      const { data: area } = await supabase.from("areas").select("nome").eq("id", areaId).maybeSingle();
      setAreaNome((area as any)?.nome ?? "");
      const id = await obterOuCriarOcasiao(areaId, data);
      setOcasiaoId(id);
      setLinhas(await chamadaView(id));
    } catch (e: any) {
      setErro(e?.message ?? "Não foi possível abrir a chamada.");
    } finally {
      setLoading(false);
    }
  }

  async function alternar(l: LinhaDaChamada) {
    if (!ocasiaoId) return;
    const novoValor = !l.confirmado;
    setSalvando(l.pessoa_assistida_id);
    setLinhas(prev => prev.map(r =>
      r.pessoa_assistida_id === l.pessoa_assistida_id ? { ...r, confirmado: novoValor } : r));
    try {
      await marcarConfirmado(ocasiaoId, l.pessoa_assistida_id, novoValor);
    } catch (e: any) {
      setLinhas(prev => prev.map(r =>
        r.pessoa_assistida_id === l.pessoa_assistida_id ? { ...r, confirmado: !novoValor } : r));
      toast.error(e?.message ?? "Erro ao marcar");
    } finally {
      setSalvando(null);
    }
  }

  async function handleNovaPessoa(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim()) { toast.error("Nome obrigatório"); return; }
    if (!ocasiaoId) return;
    setNovoBusy(true);
    try {
      const r = await adicionarPessoaNaChamada(ocasiaoId, areaId, novoNome, novoTel || undefined);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Cadastrada e confirmada");
      setNovoNome(""); setNovoTel(""); setNovoOpen(false);
      await carregar();
    } finally {
      setNovoBusy(false);
    }
  }

  const confirmados = useMemo(() => linhas.filter(l => l.confirmado).length, [linhas]);

  if (loading && linhas.length === 0 && !erro) return <PaginaSkeleton />;

  if (erro) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/ministerios/${ministerioId}/painel`}><ArrowLeft className="w-4 h-4 mr-1.5" />Voltar</Link>
        </Button>
        <p className="text-sm text-destructive-text">{erro}</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/ministerios/${ministerioId}/painel`}><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 truncate">
            <HeartHandshake className="w-5 h-5 text-gold" />
            {areaNome || "Chamada"}
          </h1>
          <p className="text-xs text-muted-foreground">Confirmação de atendimento</p>
        </div>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="flex-1" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card><CardContent className="py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Confirmados</p>
          <p className="text-xl font-semibold text-success-text">{confirmados}</p>
        </CardContent></Card>
        <Card><CardContent className="py-2 text-center">
          <p className="text-xs text-muted-foreground uppercase">Cadastrados</p>
          <p className="text-xl font-semibold">{linhas.length}</p>
        </CardContent></Card>
      </div>

      <Button onClick={() => setNovoOpen(true)} className="w-full gap-1.5">
        <UserPlus className="w-4 h-4" /> + Nova pessoa
      </Button>

      <div className="space-y-1.5">
        {linhas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Ninguém cadastrado nesta área ainda.
          </p>
        )}
        {linhas.map((l) => (
          <button
            key={l.pessoa_assistida_id}
            type="button"
            onClick={() => alternar(l)}
            disabled={salvando === l.pessoa_assistida_id}
            className={`w-full flex items-center justify-between border rounded-lg px-3 py-3 transition-all active:scale-[0.99] ${
              l.confirmado ? "bg-success-soft border-success-line/30" : "bg-background hover:bg-muted/40"
            }`}
          >
            <div className="text-left min-w-0">
              <p className="font-medium truncate">{l.nome_completo}</p>
              {l.telefone && <p className="text-xs text-muted-foreground">{l.telefone}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {salvando === l.pessoa_assistida_id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : l.confirmado
                ? <CheckCircle2 className="w-6 h-6 text-success-text" />
                : <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />}
            </div>
          </button>
        ))}
      </div>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova pessoa</DialogTitle></DialogHeader>
          <form onSubmit={handleNovaPessoa} className="space-y-3">
            <div>
              <Label>Nome completo *</Label>
              <Input required autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Como ela se chama?" />
            </div>
            <div>
              <Label>Telefone (opcional)</Label>
              <TelefoneInput value={novoTel} onChange={setNovoTel} />
            </div>
            <p className="text-xs text-muted-foreground">
              Será cadastrada e já marcada como confirmada hoje. A ficha socioeconômica
              fica para a liderança preencher depois, em "Pessoas".
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoOpen(false)} disabled={novoBusy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={novoBusy}>{novoBusy ? "Salvando..." : "Adicionar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
