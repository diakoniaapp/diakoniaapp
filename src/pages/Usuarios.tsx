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
  Users, KeyRound, Send, Search, ExternalLink,
} from "lucide-react";

import { listarTodosAcessos, reenviarAcessoPessoa, type AcessoPessoa } from "@/services/acessoService";
import { enviarWhatsApp } from "@/services/userService";
import { ROLE_LABEL, ROLE_VARIANT } from "@/types/usuario";
import { Badge as UiBadge } from "@/components/ui/badge";

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type AcessoComNome = AcessoPessoa & { nomeCompleto: string };

const STATUS_STYLE = {
  sem_acesso: { label: "Sem acesso",           cor: "text-slate-500 border-slate-300"  },
  aguardando: { label: "Aguardando 1º acesso", cor: "text-amber-600 border-amber-400"  },
  ativo:      { label: "Ativo",                cor: "text-green-600 border-green-400"  },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Usuarios() {
  const { hasRole } = useAuth();

  const [acessos,   setAcessos]   = useState<AcessoComNome[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro,      setErro]      = useState<string | null>(null);
  const [busca,     setBusca]     = useState("");
  const [agindo,    setAgindo]    = useState<string | null>(null);

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

  async function handleReenviar(a: AcessoComNome) {
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
      toast.success(`Acesso reenviado para ${a.nomeCompleto}!`);
      enviarWhatsApp(resultado.tel, a.nomeCompleto, resultado.senha!, true);
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
                          {a.pessoaId ? (
                            <Link
                              to="/membros"
                              className="font-medium hover:underline flex items-center gap-1"
                            >
                              {a.nomeCompleto}
                              <ExternalLink className="w-3 h-3 opacity-40" />
                            </Link>
                          ) : (
                            <span className="font-medium">{a.nomeCompleto}</span>
                          )}
                          {!a.pessoaId && (
                            <span className="block text-xs text-muted-foreground italic">sem vínculo com pessoa</span>
                          )}
                        </td>

                        {/* Login */}
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {a.telefone || "—"}
                        </td>

                        {/* Perfil */}
                        <td className="px-4 py-3">
                          <Badge
                            variant={ROLE_VARIANT[a.role] ?? "outline"}
                            className="text-xs font-medium"
                          >
                            {ROLE_LABEL[a.role] ?? a.role}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusCfg.cor}`}>
                            {statusCfg.label}
                          </Badge>
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
                                className="gap-1 text-xs h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
                                className="gap-1 text-xs h-7 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              >
                                {emAndamento
                                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  : <KeyRound className="w-3.5 h-3.5" />
                                }
                                <span className="hidden sm:inline">Resetar</span>
                              </Button>
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

    </div>
  );
}
