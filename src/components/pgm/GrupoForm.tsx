import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Users, MapPin, MessageCircle } from "lucide-react";
import {
  criarGrupo, atualizarGrupo, DIA_SEMANA_LABEL,
  type PgmGrupo,
} from "@/services/pgmService";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grupo?: PgmGrupo | null;
  onSaved: () => void;
}

export function GrupoForm({ open, onOpenChange, grupo, onSaved }: Props) {
  const isEdit = !!grupo;
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [diaSemana, setDiaSemana] = useState<number | null>(null);
  const [horario, setHorario] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Rio de Janeiro");
  const [whatsappLink, setWhatsappLink] = useState("");
  const [liderId, setLiderId] = useState<string>("");
  const [coLiderId, setCoLiderId] = useState<string>("");
  const [anfitriaoId, setAnfitriaoId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (grupo) {
      setNome(grupo.nome);
      setDescricao(grupo.descricao ?? "");
      setDiaSemana(grupo.dia_semana);
      setHorario(grupo.horario ?? "");
      setEndereco(grupo.endereco ?? "");
      setBairro(grupo.bairro ?? "");
      setCidade(grupo.cidade ?? "Rio de Janeiro");
      setWhatsappLink(grupo.whatsapp_link ?? "");
      setLiderId(grupo.lider_id ?? "");
      setCoLiderId(grupo.co_lider_id ?? "");
      setAnfitriaoId(grupo.anfitriao_id ?? "");
    } else {
      setNome(""); setDescricao(""); setDiaSemana(null); setHorario("");
      setEndereco(""); setBairro(""); setCidade("Rio de Janeiro");
      setWhatsappLink("");
      setLiderId(""); setCoLiderId(""); setAnfitriaoId("");
    }
  }, [open, grupo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome do PGM"); return; }

    setBusy(true);
    try {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        dia_semana: diaSemana,
        horario: horario || null,
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        whatsapp_link: whatsappLink.trim() || null,
        lider_id: liderId || null,
        co_lider_id: coLiderId || null,
        anfitriao_id: anfitriaoId || null,
      };
      if (isEdit && grupo) {
        await atualizarGrupo(grupo.id, payload);
        toast.success("Grupo atualizado");
      } else {
        await criarGrupo(payload);
        toast.success("Grupo criado");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" />
            {isEdit ? "Editar PGM" : "Novo PGM"}
          </DialogTitle>
          <DialogDescription>
            Pequeno Grupo Multiplicador — onde a vida da igreja acontece durante a semana.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome do grupo *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required
              placeholder="Ex: PGM Tijuca · Família Silva" autoFocus />
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Foco do grupo, perfil dos participantes…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dia da semana</Label>
              <Select value={diaSemana?.toString() ?? ""}
                onValueChange={(v) => setDiaSemana(v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {DIA_SEMANA_LABEL.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 border rounded-md p-3 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Onde se reúne
            </p>
            <Input value={endereco} onChange={(e) => setEndereco(e.target.value)}
              placeholder="Endereço (rua, número)" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" />
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Liderança</Label>
            <div>
              <Label className="text-xs">Líder</Label>
              <BuscaPessoa value={liderId} onChange={(id) => setLiderId(id)} placeholder="Buscar líder…" />
            </div>
            <div>
              <Label className="text-xs">Co-líder</Label>
              <BuscaPessoa value={coLiderId} onChange={(id) => setCoLiderId(id)} placeholder="Buscar co-líder…" />
            </div>
            <div>
              <Label className="text-xs">Anfitrião</Label>
              <BuscaPessoa value={anfitriaoId} onChange={(id) => setAnfitriaoId(id)} placeholder="Quem cede a casa…" />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> Grupo do WhatsApp
            </Label>
            <Input value={whatsappLink} onChange={(e) => setWhatsappLink(e.target.value)}
              placeholder="https://chat.whatsapp.com/..." />
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cole o link de convite. Vai virar botão de acesso rápido no card.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline"
              onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Criar grupo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
