// ─── VisitanteAutocadastro.tsx — a página PÚBLICA do QR Code (sem login, feita para o celular) ────────────
//
// Substitui o cartão físico: o visitante preenche os dados, e o banco cria a ficha (ou registra a nova visita de quem
// já existe) e abre o acompanhamento pastoral. Três passos curtos, cada um cabe numa tela de celular sem rolar:
// 1 Dados pessoais · 2 Sobre sua visita · 3 Oração e acompanhamento. Só "nome + um telefone + aceite" são obrigatórios.
// Quem fala com o banco é UMA função (`visitante_autocadastro`); esta página nunca lê dado de ninguém.
// Endereços: /bemvindo (o do QR), /visita e /visitante — todos abrem este formulário, sem código na URL; o link antigo
// com `?p=<código>` continua valendo. A medição (até que passo chegou, em quantos segundos) não leva dado da pessoa.
// Docs: docs/AUTOCADASTRO_UX_MOBILE.md.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/AuthShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BoasVindasVisitante } from "@/components/visitante/BoasVindasVisitante";
import { BOAS_VINDAS_PADRAO, lerRespostaPublica, type BoasVindasPublica } from "@/lib/boasVindasVisitante";
import {
  FORMULARIO_VAZIO, OPCOES_COMO_CONHECEU, PASSOS, TEXTO_DO_ACEITE, mascararData, mascararTelefone, montarPedido, problemasDoPasso,
  type FormularioDoVisitante, type Problema,
} from "@/lib/autocadastroVisitante";

const CHAVE_RASCUNHO = "autocadastro-visitante-rascunho";
type Passo = 1 | 2 | 3;

/** Rascunho no navegador (sessionStorage): se a tela recarregar ou o visitante voltar do WhatsApp, nada se perde. O aceite NUNCA é guardado. */
function lerRascunho(): { f: FormularioDoVisitante; passo: Passo } | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_RASCUNHO);
    if (!bruto) return null;
    const { f, passo } = JSON.parse(bruto);
    return { f: { ...FORMULARIO_VAZIO, ...f, lgpd: false }, passo: [1, 2, 3].includes(passo) ? passo : 1 };
  } catch { return null; }
}
const guardarRascunho = (f: FormularioDoVisitante, passo: Passo) => {
  try { sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ f: { ...f, lgpd: false }, passo })); } catch { /* sem armazenamento: segue sem rascunho */ }
};
const apagarRascunho = () => { try { sessionStorage.removeItem(CHAVE_RASCUNHO); } catch { /* idem */ } };

const novoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 3) | 8).toString(16); });

const CAMPO = "h-12 text-base aria-[invalid=true]:border-destructive";   // 48 px de altura e 16 px de fonte: o iPhone não dá zoom

function Opcoes<T extends string>({ rotulo, valor, opcoes, onChange }: {
  rotulo: string; valor: T | ""; opcoes: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{rotulo}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
        {opcoes.map(([v, r]) => (
          <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
            className={`h-12 min-w-0 rounded-md border px-2 text-[15px] font-medium leading-tight ${valor === v ? "border-primary bg-primary/10 text-primary" : "border-input bg-background"}`}>
            {r}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Erro({ id, erros }: { id: string; erros: Problema[] }) {
  const e = erros.find(x => x.campo === id);
  return e ? <p id={`${id}-erro`} role="alert" className="mt-1 text-sm text-destructive-text">{e.msg}</p> : null;
}

export default function VisitanteAutocadastro() {
  const [params] = useSearchParams();
  const codigo = params.get("p") ?? "";            // link antigo; sem ele vale o ponto ativo
  const rascunho = useMemo(lerRascunho, []);
  const [f, setF] = useState<FormularioDoVisitante>(rascunho?.f ?? FORMULARIO_VAZIO);
  const [passo, setPasso] = useState<Passo>(rascunho?.passo ?? 1);
  const [erros, setErros] = useState<Problema[]>([]);
  const [armadilha, setArmadilha] = useState(""); // campo escondido: robô preenche, gente não
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  // a tela de acolhimento (configurada em Configurações → Boas-vindas ao Visitante), buscada já ao abrir para estar pronta ao concluir
  const [boasVindas, setBoasVindas] = useState<BoasVindasPublica>(BOAS_VINDAS_PADRAO);
  const sessaoId = useRef(novoId());
  const inicio = useRef(Date.now());
  const titulo = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof FormularioDoVisitante>(k: K, v: FormularioDoVisitante[K]) => {
    setF(x => ({ ...x, [k]: v }));
    if (erros.length) setErros([]);
  };

  useEffect(() => { guardarRascunho(f, passo); }, [f, passo]);

  useEffect(() => {
    Promise.resolve(supabase.rpc("visitante_boasvindas" as never))
      .then(({ data, error }) => { if (!error) setBoasVindas(lerRespostaPublica(data)); })
      .catch(() => undefined);   // sem a configuração: fica o acolhimento padrão
  }, []);

  // a medição: o passo que apareceu na tela (nunca falha para o visitante)
  useEffect(() => {
    if (feito) return;
    Promise.resolve(supabase.rpc("visitante_funil_passo" as never, { p_codigo: codigo, p_sessao: sessaoId.current, p_passo: passo } as never)).catch(() => undefined);
  }, [passo, codigo, feito]);

  // ao trocar de passo: volta ao topo e põe o foco no título (o teclado não abre sozinho)
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    window.scrollTo({ top: 0 });
    titulo.current?.focus({ preventScroll: true });
  }, [passo]);

  function avancar() {
    const p = problemasDoPasso(f, passo);
    if (p.length > 0) {
      setErros(p);
      document.getElementById(p[0].campo)?.focus();
      return;
    }
    setErros([]);
    if (passo < 3) setPasso((passo + 1) as Passo);
  }

  async function enviar() {
    setErroEnvio(null);
    if (armadilha) { setFeito(true); return; } // robô: finge que deu certo, não grava
    const p = problemasDoPasso(f, passo);
    if (p.length > 0) { setErros(p); document.getElementById(p[0].campo)?.focus(); return; }
    const antes = ([1, 2] as const).find(n => problemasDoPasso(f, n).length > 0);   // algo ficou inválido lá atrás
    if (antes) { setPasso(antes); setErros(problemasDoPasso(f, antes)); return; }
    setEnviando(true);
    const { error } = await supabase.rpc("visitante_autocadastro" as never, {
      p_codigo: codigo, p_dados: montarPedido(f, { sessaoId: sessaoId.current, duracaoS: (Date.now() - inicio.current) / 1000 }),
    } as never);
    setEnviando(false);
    if (error) { setErroEnvio(error.message || "Não foi possível registrar agora. Tente novamente."); return; }
    apagarRascunho();
    setFeito(true);
  }

  function aoEnviarFormulario(e: React.FormEvent) {
    e.preventDefault();               // o Enter do teclado avança, e no último passo envia
    if (passo < 3) avancar(); else enviar();
  }

  if (feito) {
    return (
      <AuthShell wide semVersiculo compacto>
        <div className="rounded-xl border bg-card p-6"><BoasVindasVisitante dados={boasVindas} /></div>
      </AuthShell>
    );
  }

  const barra = Math.round((passo / PASSOS.length) * 100);

  return (
    <AuthShell wide semVersiculo compacto>
      <form onSubmit={aoEnviarFormulario} className="rounded-xl border bg-card p-5 pb-0 space-y-4" noValidate>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Passo {passo} de {PASSOS.length}</span>
            <span className="text-muted-foreground">{PASSOS[passo - 1].titulo}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={1} aria-valuemax={PASSOS.length} aria-valuenow={passo} aria-label="Progresso do cadastro">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${barra}%` }} />
          </div>
        </div>

        <h1 ref={titulo} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
          {passo === 1 ? "Bem-vindo(a)!" : passo === 2 ? "Sobre sua visita" : "Oração e acompanhamento"}
        </h1>
        {passo === 1 && <p className="-mt-3 text-sm text-muted-foreground">Conte um pouco sobre você. Leva menos de 1 minuto.</p>}

        {passo === 1 && (
          <section className="space-y-3">
            <div>
              <Label htmlFor="v-nome">Nome completo *</Label>
              <Input id="v-nome" autoComplete="name" enterKeyHint="next" className={CAMPO} value={f.nome}
                aria-invalid={erros.some(e => e.campo === "v-nome")} onChange={e => set("nome", e.target.value)} />
              <Erro id="v-nome" erros={erros} />
            </div>
            <div>
              <Label htmlFor="v-tel">Telefone (com DDD) *</Label>
              <Input id="v-tel" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="(21) 99999-9999" className={CAMPO}
                value={f.telefone} aria-invalid={erros.some(e => e.campo === "v-tel")} onChange={e => set("telefone", mascararTelefone(e.target.value))} />
              <Erro id="v-tel" erros={erros} />
              <label className="mt-1 flex min-h-12 items-center gap-3 text-sm">
                <input type="checkbox" className="h-6 w-6 shrink-0" checked={f.mesmoNumero} onChange={e => set("mesmoNumero", e.target.checked)} />
                Este número também é meu WhatsApp
              </label>
            </div>
            {!f.mesmoNumero && (
              <div>
                <Label htmlFor="v-zap">WhatsApp (com DDD)</Label>
                <Input id="v-zap" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="(21) 99999-9999" className={CAMPO}
                  value={f.whatsapp} aria-invalid={erros.some(e => e.campo === "v-zap")} onChange={e => set("whatsapp", mascararTelefone(e.target.value))} />
                <Erro id="v-zap" erros={erros} />
              </div>
            )}
            <div>
              <Label htmlFor="v-nasc">Data de nascimento</Label>
              <Input id="v-nasc" inputMode="numeric" autoComplete="bday" enterKeyHint="next" placeholder="dd/mm/aaaa" maxLength={10} className={CAMPO}
                value={f.dataNascimento} aria-invalid={erros.some(e => e.campo === "v-nasc")} onChange={e => set("dataNascimento", mascararData(e.target.value))} />
              <Erro id="v-nasc" erros={erros} />
            </div>
            <div>
              <Label htmlFor="v-email">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="v-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                enterKeyHint="next" placeholder="nome@email.com" className={CAMPO}
                value={f.email} aria-invalid={erros.some(e => e.campo === "v-email")} onChange={e => set("email", e.target.value)} />
              <Erro id="v-email" erros={erros} />
            </div>
            <div>
              <Label htmlFor="v-end">Endereço</Label>
              <Input id="v-end" autoComplete="street-address" enterKeyHint="next" placeholder="Rua, número, bairro" className={CAMPO}
                value={f.endereco} onChange={e => set("endereco", e.target.value)} />
            </div>
          </section>
        )}

        {passo === 2 && (
          <section className="space-y-4">
            <div>
              <Label htmlFor="v-como">Como conheceu a igreja?</Label>
              <select id="v-como" className="h-12 w-full rounded-md border border-input bg-background px-3 text-base" value={f.comoConheceu}
                onChange={e => set("comoConheceu", e.target.value as FormularioDoVisitante["comoConheceu"])}>
                <option value="">Selecione</option>
                {OPCOES_COMO_CONHECEU.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            </div>
            {f.comoConheceu === "amigo_familiar" && (
              <div>
                <Label htmlFor="v-quem">Quem convidou você?</Label>
                <Input id="v-quem" enterKeyHint="next" className={CAMPO} placeholder="Nome de quem convidou" value={f.quemConvidou} onChange={e => set("quemConvidou", e.target.value)} />
              </div>
            )}
            {f.comoConheceu === "outros" && (
              <div>
                <Label htmlFor="v-outro">Conte como foi</Label>
                <Input id="v-outro" enterKeyHint="next" className={CAMPO} value={f.comoConheceuOutro} onChange={e => set("comoConheceuOutro", e.target.value)} />
              </div>
            )}
            <Opcoes rotulo="É sua primeira visita?" valor={f.primeiraVisita} onChange={v => set("primeiraVisita", v)}
              opcoes={[["sim", "Sim"], ["nao", "Não, já vim antes"]] as const} />
          </section>
        )}

        {passo === 3 && (
          <section className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Pedidos de oração</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["oracaoFamilia", "Família"], ["oracaoSaude", "Saúde"], ["oracaoTrabalho", "Trabalho"], ["oracaoOutro", "Outro"]] as const).map(([k, r]) => (
                  <label key={k} className={`flex h-12 items-center gap-3 rounded-md border px-3 text-[15px] ${f[k] ? "border-primary bg-primary/10" : "border-input"}`}>
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={f[k]} onChange={e => set(k, e.target.checked)} /> {r}
                  </label>
                ))}
              </div>
              {f.oracaoOutro && (
                <div>
                  <Textarea id="v-oracao-texto" rows={3} className="text-base aria-[invalid=true]:border-destructive" placeholder="Escreva o seu pedido" value={f.oracaoOutroTexto}
                    aria-invalid={erros.some(e => e.campo === "v-oracao-texto")} onChange={e => set("oracaoOutroTexto", e.target.value)} />
                  <Erro id="v-oracao-texto" erros={erros} />
                </div>
              )}
            </fieldset>

            <Opcoes rotulo="Deseja receber contato pastoral?" valor={f.desejaContato} onChange={v => set("desejaContato", v)}
              opcoes={[["sim", "Sim"], ["nao", "Não"]] as const} />
            {f.desejaContato === "sim" && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <Opcoes rotulo="Melhor forma de contato" valor={f.canalContato} onChange={v => set("canalContato", v)}
                  opcoes={[["whatsapp", "WhatsApp"], ["ligacao", "Ligação"]] as const} />
                <Opcoes rotulo="Melhor horário" valor={f.horarioContato} onChange={v => set("horarioContato", v)}
                  opcoes={[["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]] as const} />
              </div>
            )}

            <Opcoes rotulo="Deseja receber informações da igreja?" valor={f.desejaInformacoes} onChange={v => set("desejaInformacoes", v)}
              opcoes={[["sim", "Sim"], ["nao", "Não"]] as const} />

            {/* armadilha para robôs: fora da tela e fora do teclado */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Site <input tabIndex={-1} autoComplete="off" value={armadilha} onChange={e => setArmadilha(e.target.value)} /></label>
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm leading-snug">
                <input id="v-lgpd" type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" checked={f.lgpd} onChange={e => set("lgpd", e.target.checked)} />
                <span>{TEXTO_DO_ACEITE}</span>
              </label>
              <Erro id="v-lgpd" erros={erros} />
            </div>

            {erroEnvio && <p role="alert" className="rounded-md border border-destructive-line bg-destructive-soft p-2.5 text-sm text-destructive-text">{erroEnvio}</p>}
          </section>
        )}

        {/* a barra de baixo fica sempre à vista: o polegar alcança, mesmo com o teclado aberto */}
        <div className="sticky bottom-0 -mx-5 flex gap-2 rounded-b-xl border-t bg-card px-5 py-3">
          {passo > 1 && (
            <Button type="button" variant="outline" className="h-12 shrink-0 gap-1 px-4 text-base" onClick={() => { setErros([]); setPasso((passo - 1) as Passo); }}>
              <ChevronLeft className="h-5 w-5" aria-hidden /> Voltar
            </Button>
          )}
          <Button type="submit" className="h-12 flex-1 text-base" disabled={enviando}>
            {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Enviando" /> : passo < 3 ? "Continuar" : "Enviar cadastro"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
