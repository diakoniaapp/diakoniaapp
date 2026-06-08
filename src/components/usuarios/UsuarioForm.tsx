// ─── UsuarioForm.tsx — Modal de criação de novo usuário ──────────────────────

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle, MessageCircle, RefreshCw, UserPlus } from "lucide-react";
import { limparTelefone, nomeValido } from "@/services/userService";
import type { NovoUsuarioDados, RoleOption } from "@/types/usuario";

// ─── Props ────────────────────────────────────────────────────────────────────

interface UsuarioFormProps {
  aberto:      boolean;
  processando: boolean;
  onFechar:    () => void;
  onSubmit:    (dados: NovoUsuarioDados) => Promise<void>;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function UsuarioForm({ aberto, processando, onFechar, onSubmit }: UsuarioFormProps) {
  const [nome,     setNome]     = useState("");
  const [telefone, setTelefone] = useState("");
  const [role,     setRole]     = useState<RoleOption>("voluntario");
  const [erroNome, setErroNome] = useState("");
  const [erroTel,  setErroTel]  = useState("");

  // ── Validação ──────────────────────────────────────────────────────────────

  function validar(): boolean {
    let ok = true;

    const n = nome.trim();
    if (!n) {
      setErroNome("Nome é obrigatório."); ok = false;
    } else if (!nomeValido(n)) {
      setErroNome("Nome inválido. Não pode ser apenas números."); ok = false;
    } else {
      setErroNome("");
    }

    const t = limparTelefone(telefone);
    if (!t) {
      setErroTel("Telefone é obrigatório."); ok = false;
    } else if (t.length < 10 || t.length > 13) {
      setErroTel("Telefone inválido (10 a 13 dígitos)."); ok = false;
    } else {
      setErroTel("");
    }

    return ok;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validar()) return;
    await onSubmit({ nome: nome.trim(), telefone, role });
  }

  // ── Reset ao fechar ────────────────────────────────────────────────────────

  function handleFechar() {
    if (processando) return;
    setNome(""); setTelefone(""); setRole("voluntario");
    setErroNome(""); setErroTel("");
    onFechar();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) handleFechar(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            Novo usuário
          </DialogTitle>
          <DialogDescription>
            Um acesso será criado e enviado via WhatsApp com login e senha gerados automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="form-nome">
              Nome completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="form-nome"
              placeholder="Ex: Maria Silva"
              value={nome}
              onChange={(e) => { setNome(e.target.value); if (erroNome) setErroNome(""); }}
              disabled={processando}
              autoFocus
              className={erroNome ? "border-destructive" : ""}
            />
            {erroNome && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {erroNome}
              </p>
            )}
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label htmlFor="form-telefone">
              Telefone (WhatsApp) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="form-telefone"
              placeholder="Ex: 21999887766"
              value={telefone}
              onChange={(e) => { setTelefone(e.target.value.replace(/\D/g, "")); if (erroTel) setErroTel(""); }}
              disabled={processando}
              inputMode="tel"
              maxLength={13}
              className={erroTel ? "border-destructive" : ""}
            />
            {erroTel ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {erroTel}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Somente números. Será usado como login no sistema.
              </p>
            )}
          </div>

          {/* Perfil */}
          <div className="space-y-1.5">
            <Label>Perfil de acesso</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as RoleOption)}
              disabled={processando}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* Enum app_role após migration Fase C: voluntario, lideranca, secretaria, pastor, admin */}
                <SelectItem value="voluntario">Voluntário</SelectItem>
                <SelectItem value="lideranca">Liderança</SelectItem>
                <SelectItem value="secretaria">Secretaria</SelectItem>
                <SelectItem value="pastor">Pastor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            variant="outline"
            onClick={handleFechar}
            disabled={processando}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={processando}
            className="gap-2 w-full sm:w-auto"
          >
            {processando ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Criando...</>
            ) : (
              <><UserPlus className="w-4 h-4" /> Criar e enviar WhatsApp</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
