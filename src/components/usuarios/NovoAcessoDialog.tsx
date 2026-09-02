// ─── Novo acesso — a porta que faltava ────────────────────────────────────
//
// ── O DEFEITO ──────────────────────────────────────────────────────────────
//
// `criarAcessoPessoa` existe em `acessoService.ts` desde sempre, completa:
// cria no Auth, vincula o perfil à ficha, registra no log de auditoria e
// devolve a senha temporária para o WhatsApp.
//
// **Nenhuma tela a chamava.** Medido em 01/09/2026 — `grep` por
// `criarAcessoPessoa` fora do próprio serviço não devolve nada.
//
// E o Painel de Acessos dizia, no subtítulo: "Para criar acesso, abra a ficha
// da pessoa em Pessoas". A ficha não oferece isso. A tela apontava para uma
// porta que não existe, e a igreja ficou com três acessos — os mesmos três
// desde o começo.
//
// ── POR QUE AQUI, E NÃO NA FICHA ───────────────────────────────────────────
//
// A ficha é a tela de quem cuida da pessoa; o Painel de Acessos é a tela de
// quem administra o sistema, e já reúne reenviar, trocar perfil e revogar.
// Criar é a quarta operação da mesma família, e quem a faz já está aqui.
//
// O subtítulo do painel foi corrigido junto: apontava para a porta errada.
//
// ── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
//
// Não inventa senha nem a envia. `criarAcessoPessoa` gera a senha temporária,
// e o que sai daqui é a mensagem de WhatsApp PRONTA, aberta para quem
// administra revisar e enviar. Quem envia é uma pessoa — é o padrão de todo o
// resto do sistema, que fala com a igreja por `wa.me` e nunca por API.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, UserPlus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { criarAcessoPessoa, definirPerfil } from "@/services/acessoService";
import { montarMensagemWhatsApp } from "@/services/userService";
import { formatarTelefone, limparTelefone } from "@/lib/telefone";
import { ROLE_LABEL } from "@/types/usuario";
import type { AppRole } from "@/hooks/useAuth";

interface PessoaSemAcesso {
  id: string;
  nome_completo: string;
  telefone_celular: string | null;
  tipo_pessoa: string | null;
}

export function NovoAcessoDialog({ aberto, onFechar, perfis, aoCriar }: {
  aberto: boolean;
  onFechar: () => void;
  /** Os mesmos perfis que a troca oferece — uma lista só para as duas. */
  perfis: AppRole[];
  aoCriar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [pessoas, setPessoas] = useState<PessoaSemAcesso[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [escolhida, setEscolhida] = useState<PessoaSemAcesso | null>(null);
  const [papel, setPapel] = useState<AppRole>("membro");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!aberto) { setBusca(""); setPessoas([]); setEscolhida(null); setPapel("membro"); }
  }, [aberto]);

  // ── Só quem ainda NÃO tem acesso ────────────────────────────────────
  //
  // Oferecer quem já tem produziria o erro "este telefone já possui acesso"
  // depois de a pessoa escolher — e a tela já sabe a resposta antes de
  // perguntar. Quem já tem aparece na lista de baixo do painel, com
  // "Reenviar".
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setPessoas([]); return; }
    let cancelado = false;
    setCarregando(true);
    (async () => {
      const [{ data: membros }, { data: perfisExistentes }] = await Promise.all([
        supabase.from("membros")
          .select("id, nome_completo, telefone_celular, tipo_pessoa")
          .eq("status", "ativo")
          .ilike("nome_completo", `%${termo}%`)
          .order("nome_completo").limit(30),
        supabase.from("profiles").select("pessoa_id"),
      ]);
      if (cancelado) return;
      const jaTem = new Set((perfisExistentes ?? []).map((p: any) => p.pessoa_id).filter(Boolean));
      setPessoas(((membros ?? []) as PessoaSemAcesso[]).filter(m => !jaTem.has(m.id)));
      setCarregando(false);
    })().catch(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [busca]);

  const semTelefone = !!escolhida && !limparTelefone(escolhida.telefone_celular);

  const criar = async () => {
    if (!escolhida) return;
    const tel = limparTelefone(escolhida.telefone_celular);
    if (!tel) return;

    // A janela abre ANTES do `await`: navegador bloqueia `window.open` que não
    // nasce de um clique. É o mesmo cuidado que `handleReenviar` já toma.
    const janelaWa = window.open("about:blank", "_blank", "noopener,noreferrer");
    setCriando(true);
    try {
      const r = await criarAcessoPessoa({
        pessoaId: escolhida.id,
        nomeCompleto: escolhida.nome_completo,
        telefone: tel,
        role: papel,
      });
      if (!r.ok) { janelaWa?.close(); toast.error(r.erro ?? "Não foi possível criar o acesso."); return; }

      // ── O PAPEL PRECISA DE UM SEGUNDO PASSO ──────────────────────────
      //
      // `criarAcessoPessoa` grava o papel em `profiles.role`, e quem manda no
      // sistema é `user_roles` — o CLAUDE.md registra que os dois divergem e
      // que `profiles.role` "não deve ser lido".
      //
      // O gatilho `handle_new_user` põe o papel mais fraco, `membro`, em toda
      // conta nova (ou `admin`, se for a primeira do banco — 20260901250000).
      // Quem escolheu outro precisa desta chamada.
      //
      // ── POR QUE SEM ATALHO ─────────────────────────────────────────────
      //
      // Aqui havia um `if (papel !== "lideranca")`, que pulava este passo
      // justamente quando o papel escolhido era igual ao padrão do gatilho.
      // Era uma chamada economizada ao preço de um acoplamento invisível
      // entre esta tela e uma função do banco — e quando o padrão mudou de
      // `lideranca` para `membro`, o atalho passaria a fazer TODA nova
      // liderança nascer como membro, calada.
      //
      // Agora chama sempre. Quando o papel escolhido já é o que o gatilho
      // pôs, `definir_perfil` reescreve o mesmo valor e ninguém sente.
      const conta = await supabase.from("profiles").select("id").eq("pessoa_id", escolhida.id).maybeSingle();
      const uid = (conta.data as any)?.id as string | undefined;
      if (uid) {
        const rp = await definirPerfil(uid, papel);
        if (!rp.ok) {
          toast.warning(
            `Acesso criado, mas o perfil ficou como Membro — o mais restrito. ${rp.mensagem}`,
            { duration: 20000 },
          );
        }
      }

      const wa = montarMensagemWhatsApp(r.tel ?? tel, escolhida.nome_completo, r.senha!, false);
      if (janelaWa && !janelaWa.closed && wa.url) {
        try { janelaWa.location.href = wa.url; } catch { /* ignore */ }
        toast.success(`Acesso criado para ${escolhida.nome_completo}. WhatsApp aberto para envio.`);
      } else {
        janelaWa?.close();
        // Sem WhatsApp, a senha não pode se perder na tela: fica por 30s com
        // o botão de copiar. É a única cópia dela.
        toast.success(`Acesso criado. Senha temporária: ${r.senha}`, {
          duration: 30000,
          action: { label: "Copiar", onClick: () => navigator.clipboard.writeText(r.senha!) },
        });
      }
      aoCriar();
      onFechar();
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Novo acesso</DialogTitle>
          <DialogDescription>
            Escolha a pessoa e o perfil. A senha temporária é gerada pelo sistema
            e sai numa mensagem de WhatsApp pronta para você enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="busca-pessoa" className="text-xs text-muted-foreground">
              Quem vai receber o acesso
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input id="busca-pessoa" value={busca} className="pl-8"
                placeholder="Digite o nome…"
                onChange={e => { setBusca(e.target.value); setEscolhida(null); }} />
            </div>
          </div>

          {carregando && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Procurando…
            </p>
          )}

          {!carregando && busca.trim().length >= 2 && pessoas.length === 0 && !escolhida && (
            <p className="text-xs text-muted-foreground">
              Ninguém sem acesso com esse nome. Quem já tem aparece na lista do painel,
              com a opção de reenviar.
            </p>
          )}

          {pessoas.length > 0 && !escolhida && (
            <ul className="max-h-52 overflow-y-auto divide-y rounded-md border">
              {pessoas.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => setEscolhida(p)}
                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors min-w-0">
                    <p className="text-sm truncate min-w-0">{p.nome_completo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.telefone_celular
                        ? formatarTelefone(p.telefone_celular)
                        : "sem telefone — o login é o telefone"}
                      {p.tipo_pessoa ? ` · ${p.tipo_pessoa}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {escolhida && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{escolhida.nome_completo}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Login: {escolhida.telefone_celular ? formatarTelefone(escolhida.telefone_celular) : "—"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="text-xs shrink-0"
                  onClick={() => setEscolhida(null)}>Trocar</Button>
              </div>

              {/* O login é o telefone: sem ele, não há conta possível. Dizer
                  isso aqui evita a pessoa preencher o resto para descobrir
                  depois. */}
              {semTelefone && (
                <p className="text-xs text-warning-text flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Esta pessoa não tem telefone no cadastro, e o login do sistema é o
                  telefone. Cadastre o número na ficha dela antes de criar o acesso.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Perfil</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {perfis.map(p => (
                    <button key={p} type="button" onClick={() => setPapel(p)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors
                        ${papel === p ? "border-gold bg-muted ring-1 ring-gold/40" : "hover:bg-muted"}`}>
                      {ROLE_LABEL[p] ?? p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={criando}>Cancelar</Button>
          <Button onClick={criar} disabled={!escolhida || semTelefone || criando} className="gap-1.5">
            {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Criar acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
