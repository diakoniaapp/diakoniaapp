/**
 * AcolhimentoPanel — Trilha de Acolhimento Pastoral
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import type { Membro } from "@/pages/Membros";

interface Tarefa {
  id: string;
  titulo: string;
  data: string;
  concluida: boolean;
}

interface Props {
  pessoa: Membro;
  onUpdated?: () => void;
}

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "novo",              label: "Novo",              color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "contatar",         label: "A contatar",        color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "contatado",        label: "Contatado",         color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "retornou",         label: "Retornou",          color: "bg-green-100 text-green-700 border-green-300" },
  { value: "em_relacionamento",label: "Em relacionamento", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "em_acompanhamento",label: "Em acompanhamento", color: "bg-teal-100 text-teal-700 border-teal-300" },
  { value: "congregado",       label: "Congregado",        color: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "membro",           label: "Membro",            color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
];

const WHATSAPP_TEMPLATES = [
  { id: "boas_vindas",    label: "Boas-vindas",    emoji: "💙", text: "Oi! Que alegria ter você conosco 💙 Estamos à disposição!" },
  { id: "contato",        label: "Contato",        emoji: "😊", text: "Oi! Foi muito bom ter você com a gente 😊" },
  { id: "convite",        label: "Convite",        emoji: "💙", text: "Neste domingo teremos algo especial, esperamos você 💙" },
  { id: "acompanhamento", label: "Acompanhamento", emoji: "😊", text: "Passando para saber como você está 😊" },
];

export function AcolhimentoPanel({ pessoa, onUpdated }: Props) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(false);

  const telefone    = (pessoa as any).telefone_celular ?? "";
  const statusAtual = (pessoa as any).status_acolhimento ?? "novo";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("acolhimento_tarefas")
      .select("*")
      .eq("visitante_id", pessoa.id)
      .order("data", { ascending: true });
    setTarefas((data ?? []) as Tarefa[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [pessoa.id]);

  const toggleTarefa = async (tarefa: Tarefa) => {
    const novaConcluida = !tarefa.concluida;
    const { error } = await supabase
      .from("acolhimento_tarefas")
      .update({ concluida: novaConcluida, data_conclusao: novaConcluida ? new Date().toISOString() : null })
      .eq("id", tarefa.id);
    if (error) return toast.error(error.message);
    setTarefas((ts) => ts.map((t) => (t.id === tarefa.id ? { ...t, concluida: novaConcluida } : t)));
  };

  const updateStatus = async (novoStatus: string) => {
    const { error } = await supabase
      .from("membros")
      .update({ status_acolhimento: novoStatus as any })
      .eq("id", pessoa.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    onUpdated?.();
  };

  const adicionarLembrete = async () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const { error } = await supabase.from("acolhimento_tarefas").insert({
      visitante_id: pessoa.id,
      titulo: `Recontato adicional — ${pessoa.nome_completo}`,
      data: d.toISOString().slice(0, 10),
    });
    if (error) return toast.error(error.message);
    toast.success("Lembrete adicionado");
    load();
  };

  const sendWhatsApp = (tpl: typeof WHATSAPP_TEMPLATES[0]) => {
    if (!telefone) { toast.error("Telefone não cadastrado para este visitante"); return; }
    const numero = telefone.replace(/\D/g, "");
    window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(tpl.text)}`, "_blank");
  };

  const checklist = [
    { label: "Contato inicial realizado", done: ["contatado","retornou","em_relacionamento","em_acompanhamento","congregado","membro"].includes(statusAtual) },
    { label: "Retornou à igreja",         done: ["retornou","em_relacionamento","em_acompanhamento","congregado","membro"].includes(statusAtual) },
    { label: "Convidado para evento",     done: tarefas.some((t) => t.titulo.toLowerCase().includes("convidar") && t.concluida) },
    { label: "Em acompanhamento",         done: ["em_acompanhamento","congregado","membro"].includes(statusAtual) },
    { label: "Convertido em congregado",  done: ["congregado","membro"].includes(statusAtual) },
  ];

  return (
    <div className="space-y-6 p-1">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Status da trilha</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" onClick={() => updateStatus(opt.value)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${opt.color} ${statusAtual === opt.value ? "ring-2 ring-offset-1 ring-current opacity-100 scale-105" : "opacity-60 hover:opacity-90"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Progresso pastoral</p>
        <div className="space-y-2">
          {checklist.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />}
              <span className={`text-sm ${item.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tarefas</p>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={adicionarLembrete}>
            <Plus className="h-3 w-3" />Lembrete
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : tarefas.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nenhuma tarefa ainda</p>
        ) : (
          <div className="space-y-2">
            {tarefas.map((t) => (
              <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${t.concluida ? "bg-muted/40 border-transparent opacity-60" : "bg-background border-border"}`}>
                <Checkbox checked={t.concluida} onCheckedChange={() => toggleTarefa(t)} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${t.concluida ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.titulo.split(" — ")[0]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(t.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {telefone ? (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Enviar por WhatsApp</p>
          <div className="grid grid-cols-2 gap-2">
            {WHATSAPP_TEMPLATES.map((tpl) => (
              <Button key={tpl.id} type="button" variant="outline" size="sm"
                className="h-auto py-2 px-3 flex-col items-start justify-start text-left gap-0.5"
                onClick={() => sendWhatsApp(tpl)}>
                <span className="text-xs font-semibold">{tpl.emoji} {tpl.label}</span>
                <span className="text-[11px] text-muted-foreground leading-tight line-clamp-2 w-full" title={tpl.text}>{tpl.text}</span>
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground italic">Cadastre o telefone celular para enviar mensagens pelo WhatsApp.</p>
      )}
    </div>
  );
}
