// ─── BotaoFavoritar — ★ Favoritar / Favorito, na barra de contexto de toda tela do Financeiro ──────────────────────────────────────────────────────
// Pedido (16/10/2026): abrir a tela, clicar em Favoritar e vê-la na Mesa de Operações (os Favoritos da Tesouraria), sem diálogo nem configuração; clicar de novo remove.
// Aparece sozinho em TODA tela do Financeiro que o registro (`lib/navegacao.ts`) considera fixável (ver `lib/favoritosFinanceiros.ts`): tela nova ganha o botão sem ninguém lembrar dele.
// O favorito é pessoal (fin_favoritos, RLS por usuário). Sem a tabela/permissão, o botão simplesmente não aparece — nunca atrapalha a tela.
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { desfixarFavorito, fixarFavorito, listarFavoritos, type FinFavorito } from "@/services/favoritosService";
import type { DestinoFixavel } from "@/lib/favoritosFinanceiros";

export function BotaoFavoritar({ destino }: { destino: DestinoFixavel }) {
  const [lista, setLista] = useState<FinFavorito[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLista(null);
    listarFavoritos().then(l => { if (vivo) setLista(l); }).catch(() => { if (vivo) setLista(null); });
    return () => { vivo = false; };
  }, [destino.rota]);

  if (lista === null) return null;
  const atual = lista.find(f => f.rota === destino.rota) ?? null;

  async function alternar() {
    setOcupado(true);
    try {
      if (atual) {
        await desfixarFavorito(atual.id);
        setLista(l => (l ?? []).filter(f => f.id !== atual.id));
        toast.success(`"${atual.rotulo}" saiu dos favoritos`);
      } else {
        const novo = await fixarFavorito({ tipo: destino.tipo, rotulo: destino.rotulo, rota: destino.rota });
        setLista(l => [...(l ?? []), novo]);
        toast.success(`"${destino.rotulo}" fixado nos favoritos da Tesouraria`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o favorito");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 shrink-0 ml-auto" disabled={ocupado} aria-pressed={!!atual} onClick={() => void alternar()}
      title={atual ? "Tirar dos favoritos da Tesouraria" : "Fixar nos favoritos da Tesouraria (aparece no topo da Mesa de Operações)"}>
      <Star className={`w-3.5 h-3.5 ${atual ? "fill-gold text-gold" : ""}`} aria-hidden />
      {atual ? "Favorito" : "Favoritar"}
    </Button>
  );
}
