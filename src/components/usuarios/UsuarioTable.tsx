// ─── UsuarioTable.tsx — Tabela de usuários do sistema ────────────────────────

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Send, KeyRound, Users, TriangleAlert } from "lucide-react";
import { nomeExibido, nomeValido } from "@/services/userService";
import { ROLE_LABEL, ROLE_VARIANT } from "@/types/usuario";
import type { Usuario } from "@/types/usuario";

// ─── Props ────────────────────────────────────────────────────────────────────

interface UsuarioTableProps {
  usuarios:          Usuario[];
  podeGerenciar:     boolean;
  acaoEmAndamento:   string | null;
  onReenviar:        (u: Usuario) => void;
  onResetar:         (u: Usuario) => void;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string | null }) {
  return (
    <Badge variant={ROLE_VARIANT[role ?? ""] ?? "outline"} className="text-xs font-medium">
      {ROLE_LABEL[role ?? ""] ?? role ?? "—"}
    </Badge>
  );
}

function SituacaoBadge({ primeiroAcesso }: { primeiroAcesso: boolean | null }) {
  return primeiroAcesso ? (
    <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
      Aguardando 1º acesso
    </Badge>
  ) : (
    <Badge variant="outline" className="text-xs text-green-600 border-green-400">
      Ativo
    </Badge>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function UsuarioTable({
  usuarios,
  podeGerenciar,
  acaoEmAndamento,
  onReenviar,
  onResetar,
}: UsuarioTableProps) {
  return (
    <Card className="rounded-2xl shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="w-4 h-4" />
          {usuarios.length}{" "}
          {usuarios.length === 1 ? "usuário cadastrado" : "usuários cadastrados"}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Telefone</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Perfil</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Situação</th>
                {podeGerenciar && (
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, idx) => {
                const emAndamento      = acaoEmAndamento === u.id;
                const nomeInconsistente = !nomeValido(u.nome);

                return (
                  <tr
                    key={u.id}
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                      idx % 2 === 0 ? "" : "bg-muted/10"
                    }`}
                  >
                    {/* Nome */}
                    <td className="px-4 py-3">
                      <span className={nomeInconsistente ? "text-muted-foreground italic" : "font-medium"}>
                        {nomeExibido(u.nome)}
                      </span>
                      {nomeInconsistente && (
                        <TriangleAlert
                          className="inline w-3.5 h-3.5 text-amber-500 mb-0.5 ml-1"
                          title="Nome inválido no banco — execute o SQL de limpeza"
                        />
                      )}
                    </td>

                    {/* Telefone */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.telefone ?? "—"}
                    </td>

                    {/* Perfil */}
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>

                    {/* Situação */}
                    <td className="px-4 py-3">
                      <SituacaoBadge primeiroAcesso={u.primeiro_acesso} />
                    </td>

                    {/* Ações */}
                    {podeGerenciar && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emAndamento}
                            onClick={() => onReenviar(u)}
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
                            variant="ghost"
                            size="sm"
                            disabled={emAndamento}
                            onClick={() => onResetar(u)}
                            title="Gerar nova senha e enviar via WhatsApp"
                            className="gap-1 text-xs h-7 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          >
                            {emAndamento
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <KeyRound className="w-3.5 h-3.5" />
                            }
                            <span className="hidden sm:inline">Resetar senha</span>
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
  );
}
