// ─── VisitanteAutocadastro.tsx — a página PÚBLICA do QR Code (sem login, feita para o celular) ────────────
//
// Substitui o cartão físico: o visitante preenche os dados, e o banco cria a ficha (ou registra a nova visita de quem
// já existe) e abre o acompanhamento pastoral. Só "nome + um telefone + aceite" são obrigatórios: cabe em 1 minuto.
// Quem fala com o banco é UMA função (`visitante_autocadastro`); esta página nunca lê dado de ninguém.
// Docs: docs/AUTOCADASTRO_VISITANTES_QR.md.

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/AuthShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  FORMULARIO_VAZIO, OPCOES_COMO_CONHECEU, TEXTO_DO_ACEITE, mascararTelefone, montarPedido, problemasDoFormulario,
  type FormularioDoVisitante, type SimNao,
} from "@/lib/autocadastroVisitante";

function SimNaoCampo({ rotulo, valor, onChange }: { rotulo: string; valor: SimNao; onChange: (v: SimNao) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{rotulo}</legend>
      <div className="grid grid-cols-2 gap-2">
        {([["sim", "Sim"], ["nao", "Não"]] as const).map(([v, r]) => (
          <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
            className={`h-11 rounded-md border text-sm font-medium ${valor === v ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}>
            {r}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function VisitanteAutocadastro() {
  const [params] = useSearchParams();
  const codigo = params.get("p") ?? "";
  const [f, setF] = useState<FormularioDoVisitante>(FORMULARIO_VAZIO);
  const [armadilha, setArmadilha] = useState(""); // campo escondido: robô preenche, gente não
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const set = <K extends keyof FormularioDoVisitante>(k: K, v: FormularioDoVisitante[K]) => setF(x => ({ ...x, [k]: v }));
  const problemas = useMemo(() => problemasDoFormulario(f), [f]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (armadilha) { setFeito(true); return; } // robô: finge que deu certo, não grava
    if (problemas.length > 0) { setErro(problemas[0]); return; }
    setEnviando(true);
    const { error } = await supabase.rpc("visitante_autocadastro" as never, { p_codigo: codigo, p_dados: montarPedido(f) } as never);
    setEnviando(false);
    if (error) { setErro(error.message || "Não foi possível registrar agora. Tente novamente."); return; }
    setFeito(true);
  }

  if (!codigo) {
    return (
      <AuthShell wide semVersiculo>
        <div className="rounded-xl border bg-card p-6 text-center space-y-2">
          <h1 className="text-lg font-semibold">Link incompleto</h1>
          <p className="text-sm text-muted-foreground">Leia novamente o QR Code da recepção da igreja.</p>
        </div>
      </AuthShell>
    );
  }

  if (feito) {
    return (
      <AuthShell wide semVersiculo>
        <div className="rounded-xl border bg-card p-8 text-center space-y-4" role="status">
          <h1 className="font-serif text-2xl font-semibold">Obrigado por sua visita!</h1>
          <p className="text-muted-foreground">
            Foi uma alegria receber você na<br />
            <strong className="text-foreground">Quarta Igreja Batista do Rio de Janeiro</strong>.
          </p>
          <p className="text-base font-medium">✅ Sua visita foi registrada.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell wide semVersiculo>
      <form onSubmit={enviar} className="rounded-xl border bg-card p-5 space-y-5" noValidate>
        <div className="text-center space-y-1">
          <h1 className="font-serif text-xl font-semibold">Bem-vindo(a)!</h1>
          <p className="text-sm text-muted-foreground">Conte um pouco sobre você. Leva menos de 1 minuto.</p>
        </div>

        <section className="space-y-3">
          <div>
            <Label htmlFor="v-nome">Nome completo *</Label>
            <Input id="v-nome" autoComplete="name" className="h-11" value={f.nome} onChange={e => set("nome", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="v-tel">Telefone (com DDD) *</Label>
            <Input id="v-tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" className="h-11"
              value={f.telefone} onChange={e => set("telefone", mascararTelefone(e.target.value))} />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={f.mesmoNumero} onChange={e => set("mesmoNumero", e.target.checked)} />
              Este número também é meu WhatsApp
            </label>
          </div>
          {!f.mesmoNumero && (
            <div>
              <Label htmlFor="v-zap">WhatsApp (com DDD)</Label>
              <Input id="v-zap" type="tel" inputMode="tel" placeholder="(21) 99999-9999" className="h-11"
                value={f.whatsapp} onChange={e => set("whatsapp", mascararTelefone(e.target.value))} />
            </div>
          )}
          <div>
            <Label htmlFor="v-nasc">Data de nascimento</Label>
            <Input id="v-nasc" type="date" className="h-11" value={f.dataNascimento} onChange={e => set("dataNascimento", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="v-end">Endereço</Label>
            <Input id="v-end" autoComplete="street-address" placeholder="Rua, número, bairro" className="h-11" value={f.endereco} onChange={e => set("endereco", e.target.value)} />
          </div>
        </section>

        <section className="space-y-2">
          <Label htmlFor="v-como">Como conheceu a igreja?</Label>
          <select id="v-como" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.comoConheceu}
            onChange={e => set("comoConheceu", e.target.value as FormularioDoVisitante["comoConheceu"])}>
            <option value="">Selecione</option>
            {OPCOES_COMO_CONHECEU.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
          {f.comoConheceu === "amigo_familiar" && (
            <div>
              <Label htmlFor="v-quem">Quem convidou você?</Label>
              <Input id="v-quem" className="h-11" value={f.quemConvidou} onChange={e => set("quemConvidou", e.target.value)} />
            </div>
          )}
          {f.comoConheceu === "outros" && (
            <div>
              <Label htmlFor="v-outro">Conte como foi</Label>
              <Input id="v-outro" className="h-11" value={f.comoConheceuOutro} onChange={e => set("comoConheceuOutro", e.target.value)} />
            </div>
          )}
        </section>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Pedidos de oração</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["oracaoFamilia", "Família"], ["oracaoSaude", "Saúde"], ["oracaoTrabalho", "Trabalho"], ["oracaoOutro", "Outro"]] as const).map(([k, r]) => (
              <label key={k} className={`flex h-11 items-center gap-2 rounded-md border px-3 text-sm ${f[k] ? "border-primary bg-primary/10" : "border-input"}`}>
                <input type="checkbox" className="h-4 w-4" checked={f[k]} onChange={e => set(k, e.target.checked)} /> {r}
              </label>
            ))}
          </div>
          {f.oracaoOutro && (
            <Textarea rows={3} placeholder="Escreva o seu pedido" value={f.oracaoOutroTexto} onChange={e => set("oracaoOutroTexto", e.target.value)} />
          )}
        </fieldset>

        <section className="space-y-3">
          <SimNaoCampo rotulo="É sua primeira visita?" valor={f.primeiraVisita} onChange={v => set("primeiraVisita", v)} />
          <SimNaoCampo rotulo="Deseja receber contato pastoral?" valor={f.desejaContato} onChange={v => set("desejaContato", v)} />
          <SimNaoCampo rotulo="Deseja receber informações da igreja?" valor={f.desejaInformacoes} onChange={v => set("desejaInformacoes", v)} />
        </section>

        {/* armadilha para robôs: fora da tela e fora do teclado */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Site <input tabIndex={-1} autoComplete="off" value={armadilha} onChange={e => setArmadilha(e.target.value)} /></label>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={f.lgpd} onChange={e => set("lgpd", e.target.checked)} />
          <span>{TEXTO_DO_ACEITE}</span>
        </label>

        {erro && <p role="alert" className="rounded-md border border-destructive-line bg-destructive-soft p-2.5 text-sm text-destructive-text">{erro}</p>}

        <Button type="submit" size="lg" className="w-full h-12 text-base" disabled={enviando}>
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar"}
        </Button>
      </form>
    </AuthShell>
  );
}
