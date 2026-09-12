// ─── FinancasDoadores.tsx ────────────────────────────────────────────────
//
// Histórico de contribuição por pessoa — gap achado na auditoria do ERP
// financeiro (12/09/2026), construído depois que a Telma respondeu a nota
// de privacidade do doador: "os tesoureiros e administrador do sistema
// podem ver tudo sobre as doações". Por isso esta tela e a de detalhe
// (`FinancasDoadorDetalhe.tsx`) são fechadas a `ROLES_DOADORES` — mais
// estreito que `ROLES_FINANCEIRO`, que também vê aluguel/conta de luz.
//
// Ordenado por NOME por padrão, não por valor — a mesma nota de
// privacidade registrava o risco pastoral de virar "ranking de
// doadores". Quem quiser ver por valor pode trocar a ordenação.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Users, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { listarDoadoresComResumo, type DoadorResumo } from "@/services/doadorService";
import { brl } from "@/services/finService";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type Ordenacao = "nome" | "valor";

export default function FinancasDoadores() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [doadores, setDoadores] = useState<DoadorResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("nome");

  useEffect(() => { carregar(); }, [ano]);

  async function carregar() {
    setLoading(true);
    try {
      setDoadores(await listarDoadoresComResumo(ano));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar doadores");
    } finally { setLoading(false); }
  }

  const filtrados = useMemo(() => {
    let lista = doadores;
    if (busca.length >= 2) {
      lista = lista.filter(d => d.nome.toLowerCase().includes(busca.toLowerCase()));
    }
    if (ordenacao === "valor") {
      lista = [...lista].sort((a, b) => b.totalAno - a.totalAno);
    }
    return lista;
  }, [doadores, busca, ordenacao]);

  const totalGeral = doadores.reduce((s, d) => s + d.totalAno, 0);

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas/doacoes"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" /> Doadores
          </h1>
          <p className="text-xs text-muted-foreground">
            Histórico de contribuição por pessoa — visível só para tesouraria e administração.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setAno(a => a - 1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-medium px-2">{ano}</span>
          <Button size="sm" variant="outline" onClick={() => setAno(a => a + 1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-2 relative">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs pl-6" placeholder="Buscar nome..." />
          </div>
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Ordenar por nome</SelectItem>
              <SelectItem value="valor">Ordenar por valor</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {doadores.length} pessoa{doadores.length !== 1 ? "s" : ""} contribuiu{doadores.length !== 1 ? "ram" : ""} em {ano} · total {brl(totalGeral)}
      </p>

      {filtrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {doadores.length === 0 ? `Nenhuma contribuição vinculada a pessoa em ${ano}.` : "Sem doadores com esse filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {filtrados.map(d => (
            <Link key={d.pessoaId} to={`/financas/doadores/${d.pessoaId}`}
              className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{d.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {d.qtdContribuicoesAno} {d.qtdContribuicoesAno === 1 ? "contribuição" : "contribuições"}
                  {d.ultimaContribuicao && ` · última em ${dataBr(d.ultimaContribuicao)}`}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-success-text shrink-0">{brl(d.totalAno)}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
