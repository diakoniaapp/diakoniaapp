// ─── DisponibilidadeDialog.tsx ───────────────────────────────────────────────
// Editar quando uma pessoa pode servir, sem sair da lista.
//
// Reaproveita inteiro o `PassoDisponibilidade` do formulário de cadastro. É o
// mesmo componente, o mesmo serviço e a mesma gravação — só noutra moldura.
// Duplicar os campos aqui seria garantir que um dia os dois divirjam.
//
// ── POR QUE UM DIÁLOGO, E NÃO UM LINK PARA A FICHA ───────────────────────────
//
// Um líder olhando o painel do ministério e vendo 33 "ninguém perguntou ainda"
// vai querer resolver ali, uma pessoa após a outra. Mandá-lo para a ficha
// significaria: sair do painel, achar a pessoa no catálogo, abrir o
// formulário, avançar quatro passos, salvar, voltar, e procurar onde parou.
// Trinta e três vezes.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  carregarPerfil, salvarPerfil, PERFIL_VAZIO, type PerfilServico,
} from "@/services/perfilServico";
import { PassoDisponibilidade } from "@/components/membros/PassoDisponibilidade";

interface Props {
  pessoaId: string | null;
  nome: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado só quando a gravação deu certo — o painel recarrega a linha. */
  onSalvo?: () => void;
}

export function DisponibilidadeDialog({ pessoaId, nome, open, onOpenChange, onSalvo }: Props) {
  const [perfil, setPerfil] = useState<PerfilServico>(PERFIL_VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !pessoaId) return;
    setCarregando(true);
    carregarPerfil(pessoaId)
      .then(p => setPerfil(p ?? PERFIL_VAZIO))
      .finally(() => setCarregando(false));
  }, [open, pessoaId]);

  const salvar = async () => {
    if (!pessoaId) return;
    setSalvando(true);
    const r = await salvarPerfil(pessoaId, perfil);
    setSalvando(false);

    // `conferir` distingue "deu erro" de "a política barrou em silêncio" — sem
    // ele, um perfil descartado pela RLS fecharia o diálogo dizendo "salvo".
    if (!r.ok) return toast.error(r.erro);

    toast.success("Disponibilidade salva");
    onSalvo?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Quando {nome.split(" ")[0]} pode servir</DialogTitle>
          <DialogDescription className="text-xs">
            Fica na ficha da pessoa e vale para todas as áreas em que ela serve.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="space-y-3 py-2" aria-busy="true">
            <span className="sr-only">Carregando a disponibilidade…</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-11" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11" />
          </div>
        ) : (
          <PassoDisponibilidade valor={perfil} onChange={setPerfil} />
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando || carregando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
