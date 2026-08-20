// ─── Usuarios.tsx — Painel Administrativo de Acessos ─────────────────────────
//
// DOMÍNIO: supervisão técnica, auditoria, controle de acessos.
// NÃO é onde se cria usuário — acesso é criado na ficha da Pessoa.
//
// Acesso restrito: admin e secretaria.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertCircle, RefreshCw, ShieldCheck, UserX,
  Users, KeyRound, Send, Search, ExternalLink, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  listarTodosAcessos, reenviarAcessoPessoa, revogarAcesso, type AcessoPessoa,
} from "@/services/acessoService";
import { enviarWhatsApp, montarMensagemWhatsApp } from "@/services/userService";
import { ROLE_LABEL, ROLE_VARIANT } from "@/types/usuario";
import { Badge as UiBadge } from "@/components/ui/badge";
import { formatarTelefoneSemDDI } from "@/lib/telefone";
import { PermissoesDosPerfis } from "@/components/usuarios/PermissoesDosPerfis";

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type AcessoComNome = AcessoPessoa & { nomeCompleto: string };

// "Sem acesso" virou "Bloqueado": nesta lista só entra quem TEM conta, então
// a antiga etiqueta nunca descrevia ninguém. Depois que `revogar_acesso`
// passou a bloquear o login em vez de sempre apagar a conta, o estado
// existe de verdade e precisava de nome.
const STATUS_STYLE = {
  sem_acesso: { label: "Bloqueado",            cor: "text-destructive-text border-destructive-line" },
  aguardando: { label: "Aguardando 1º acesso", cor: "text-warning-text border-warning-line"  },
  ativo:      { label: "Ativo",                cor: "text-success-text border-success-line"  },
};

/** "hoje às 16:09", "ontem às 20:14", "04/06 às 01:02". */
function quandoEntrou(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d);  dia.setHours(0, 0, 0, 0);
  const diff = Math.round((hoje.getTime() - dia.getTime()) / 86_400_000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return "hoje às " + hora;
  if (diff === 1) return "ontem às " + hora;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + hora;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Usuarios() {
  const { hasRole, user } = useAuth();

  const [acessos,   setAcessos]   = useState<AcessoComNome[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,      setErro]      = useState<string | null>(null);
  const [busca,     setBusca]     = useState("");
  const [agindo,    setAgindo]    = useState<string | null>(null);
  const [aRemover,  setARemover]  = useState<AcessoComNome | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const podeGerenciar = hasRole(["admin", "secretaria"]);

  // ── Carregar ────────────────────────────────────────────────────────────────

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarTodosAcessos();
      setAcessos(lista);
    } catch {
      setErro("Erro ao carregar acessos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  // ── Filtro ──────────────────────────────────────────────────────────────────

  const filtrados = acessos.filter((a) => {
    const q = busca.toLowerCase();
    return (
      a.nomeCompleto.toLowerCase().includes(q) ||
      a.telefone.includes(q) ||
      (ROLE_LABEL[a.role] ?? a.role).toLowerCase().includes(q)
    );
  });

  // ── Ação: resetar/reenviar ──────────────────────────────────────────────────

  async function handleRemover() {
    if (!aRemover) return;
    setRemovendo(true);
    const r = await revogarAcesso(aRemover.userId);
    setRemovendo(false);
    setARemover(null);
    if (!r.ok) return toast.error(r.mensagem);
    // A frase vem do banco de propósito: remover de vez e bloquear
    // mantendo o histórico são desfechos diferentes, e quem clicou precisa
    // saber qual dos dois aconteceu.
    toast.success(r.mensagem);
    carregar();
  }

  async function handleReenviar(a: AcessoComNome) {
    const waWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
    setAgindo(a.userId);
    const resultado = await reenviarAcessoPessoa({
      userId:       a.userId,
      pessoaId:     a.pessoaId || undefined,
      nomeCompleto: a.nomeCompleto,
      telefone:     a.telefone,
    });
    setAgindo(null);
    await carregar();

    if (!resultado.ok) {
      toast.error(resultado.erro ?? "Erro ao reenviar acesso.");
      return;
    }

    if (resultado.tel) {
      const wa = montarMensagemWhatsApp(resultado.tel, a.nomeCompleto, resultado.senha!, true);
      if (waWindow && !waWindow.closed && wa.url) {
        try { waWindow.location.href = wa.url; } catch { /* ignore */ }
        toast.success(`Acesso reenviado para ${a.nomeCompleto}! WhatsApp aberto.`);
      } else if (wa.url) {
        toast.success(`Acesso reenviado para ${a.nomeCompleto}!`, {
          duration: 20000,
          action: {
            label: "Abrir WhatsApp",
            onClick: () => window.open(wa.url!, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.success(`Nova senha: ${resultado.senha} (envie manualmente)`, { duration: 20000 });
      }
    } else {
      toast.success(
        `Nova senha para ${a.nomeCompleto}: ${resultado.senha}  (copie manualmente)`,
        { duration: 15000 }
      );
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Painel de Acessos</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Supervisão técnica · Para criar acesso, abra a ficha da pessoa em{" "}
            <Link to="/membros" className="underline hover:text-foreground">Pessoas</Link>
          </p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={carregar} disabled={carregando}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          {carregando ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {/* Resumo */}
      {!carregando && !erro && (
        <div className="grid grid-cols-3 gap-3">
          {(["ativo", "aguardando", "sem_acesso"] as const).map((s) => {
            const count = acessos.filter(a => a.status === s).length;
            const cfg   = STATUS_STYLE[s];
            return (
              <Card key={s} className="rounded-2xl shadow">
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className={`text-xs mt-0.5 ${cfg.cor.split(" ")[0]}`}>{cfg.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Busca */}
      {!carregando && !erro && acessos.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou perfil..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Carregando */}
      {carregando && (
        <Card className="rounded-2xl shadow">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <p className="text-sm">Carregando acessos...</p>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {!carregando && erro && (
        <Card className="rounded-2xl shadow border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive text-sm">Erro ao carregar</p>
              <p className="text-sm text-muted-foreground mt-1">{erro}</p>
              <Button variant="outline" size="sm" onClick={carregar} className="mt-3">
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vazio */}
      {!carregando && !erro && acessos.length === 0 && (
        <Card className="rounded-2xl shadow">
          <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <UserX className="w-8 h-8 opacity-40" />
            <p className="text-sm">Nenhum acesso cadastrado.</p>
          </CardContent>
        </Card>
      )}

      {/* Tabela de acessos */}
      {!carregando && !erro && filtrados.length > 0 && (
        <Card className="rounded-2xl shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              {filtrados.length} {filtrados.length === 1 ? "acesso" : "acessos"}
              {busca && ` · filtrado de ${acessos.length}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Pessoa</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Login</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Perfil</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    {podeGerenciar && (
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ações</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((a, idx) => {
                    const emAndamento = agindo === a.userId;
                    const statusCfg   = STATUS_STYLE[a.status];

                    return (
                      <tr
                        key={a.userId}
                        className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                          idx % 2 === 0 ? "" : "bg-muted/10"
                        }`}
                      >
                        {/* Pessoa */}
                        <td className="px-4 py-3">
                          {/* min-w-0 + truncate: nome comprido encurta em vez de quebrar em
                              três linhas, que era o que acontecia com "Isabela Rodrigues de
                              Oliveira Ramos" quando a coluna ficava com 116px. */}
                          {a.pessoaId ? (
                            <Link
                              to="/membros"
                              className="font-medium hover:underline flex items-center gap-1 min-w-0"
                            >
                              <span className="truncate">{a.nomeCompleto}</span>
                              <ExternalLink className="w-3 h-3 opacity-40 shrink-0" />
                            </Link>
                          ) : (
                            <span className="font-medium block truncate">{a.nomeCompleto}</span>
                          )}
                          {/* A segunda linha existe sempre — vazia quando há vínculo. Sem isso
                              as 6 linhas mediam 61, 64 e 67px, com 4 mudanças de altura em 5
                              transições: numa tabela de seis linhas, o olho tropeça o tempo
                              todo. Mesmo remédio do catálogo de Pessoas. */}
                          <span className="block h-[18px] text-xs text-muted-foreground italic truncate">
                            {!a.pessoaId && "sem vínculo com pessoa"}
                          </span>
                        </td>

                        {/* Login */}
                        {/* whitespace-nowrap: "(21) 97930-3125" estava quebrando em três
    linhas quando a coluna apertava. Número de telefone não tem
    onde quebrar que faça sentido. */}
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                          {formatarTelefoneSemDDI(a.telefone) || "—"}
                        </td>

                        {/* Perfil — TODOS os papéis.

                            Antes mostrava um só, vindo de `profiles.role`, que
                            estava nulo em 3 dos 6 e virava "Voluntário" pelo
                            valor padrão. Três pessoas com papel de liderança
                            apareciam aqui como voluntárias. Agora vem de
                            `user_roles`, que é o que o sistema obedece — e
                            como lá cabe mais de um papel por pessoa, todos
                            aparecem. */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(a.papeis?.length ? a.papeis : []).map(p => (
                              <Badge key={p} variant={ROLE_VARIANT[p] ?? "outline"} className="text-xs font-medium">
                                {ROLE_LABEL[p] ?? p}
                              </Badge>
                            ))}
                            {!a.papeis?.length && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                Sem perfil
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Status — de `auth.users.last_sign_in_at`.

                            A tela lia `profiles.primeiro_acesso`, uma marca que
                            ninguém limpa: estava `true` para os seis, e o painel
                            dizia "Aguardando 1º acesso" para todo mundo e
                            "0 Ativo" — com os seis já tendo entrado. Quem
                            entrou é fato do `auth`, não lembrança de alguém. */}
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusCfg.cor}`}>
                            {statusCfg.label}
                          </Badge>
                          <span className="block h-[18px] text-xs text-muted-foreground truncate">
                            {a.ultimoAcesso ? quandoEntrou(a.ultimoAcesso) : ""}
                          </span>
                        </td>

                        {/* Ações */}
                        {podeGerenciar && (
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <Button
                                variant="ghost" size="sm"
                                disabled={emAndamento}
                                onClick={() => handleReenviar(a)}
                                title="Reenviar acesso via WhatsApp"
                                className="gap-1 text-xs h-7 px-2 text-info-text hover:text-info-text hover:bg-info-soft"
                              >
                                {emAndamento
                                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  : <Send className="w-3.5 h-3.5" />
                                }
                                <span className="hidden sm:inline">Reenviar</span>
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                disabled={emAndamento}
                                onClick={() => handleReenviar(a)}
                                title="Resetar senha"
                                className="gap-1 text-xs h-7 px-2 text-warning-text hover:text-warning-text hover:bg-warning-soft"
                              >
                                {emAndamento
                                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  : <KeyRound className="w-3.5 h-3.5" />
                                }
                                <span className="hidden sm:inline">Resetar</span>
                              </Button>
                              {/* Só admin, e nunca em si mesmo — a função do
                                  banco recusa os dois casos, e esconder o botão
                                  evita oferecer o que vai dar erro. */}
                              {hasRole(["admin"]) && a.userId !== user?.id && (
                                <Button
                                  variant="ghost" size="sm"
                                  disabled={emAndamento}
                                  onClick={() => setARemover(a)}
                                  title="Remover acesso"
                                  className="gap-1 text-xs h-7 px-2 text-destructive-text hover:text-destructive-text"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Excluir</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vazio após filtro */}
      {!carregando && !erro && acessos.length > 0 && filtrados.length === 0 && (
        <Card className="rounded-2xl shadow">
          <CardContent className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <Search className="w-7 h-7 opacity-40" />
            <p className="text-sm">Nenhum acesso encontrado para "{busca}".</p>
          </CardContent>
        </Card>
      )}

      {/* ── Permissões dos perfis ────────────────────────────────────────

          Depois da lista de acessos, e não antes: quem abre esta tela vem
          quase sempre reenviar um convite ou resetar uma senha. Configurar
          o que um perfil pode fazer é raro e vale para todos de uma vez —
          pôr isso no topo faria a tarefa do dia descer para baixo da dobra
          por causa de uma tarefa que acontece uma vez por semestre. */}
      <PermissoesDosPerfis podeGerenciar={hasRole(["admin"])} />

      {/* ── Confirmação de remoção ───────────────────────────────────────

          O diálogo diz o que vai acontecer com o HISTÓRICO, e não só com a
          conta. É a parte que quem clica não tem como adivinhar: em muitos
          sistemas "excluir usuário" apaga junto tudo o que a pessoa
          registrou, e aqui não apaga — nem poderia, porque 36 tabelas
          apontam para a conta e boa parte segura a exclusão. */}
      <AlertDialog open={!!aRemover} onOpenChange={(o) => { if (!o) setARemover(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o acesso de {aRemover?.nomeCompleto}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A pessoa deixa de entrar no sistema e perde todos os perfis na hora.
                </p>
                <p>
                  O que ela registrou <strong>continua no lugar</strong> — contatos,
                  cadastros, lançamentos. Se houver registros feitos por ela, a conta
                  fica bloqueada em vez de ser apagada, para o histórico não ficar
                  sem autor.
                </p>
                <p className="text-muted-foreground">
                  A ficha da pessoa em Pessoas não é afetada.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRemover(); }}
              disabled={removendo}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {removendo ? "Removendo..." : "Remover acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
