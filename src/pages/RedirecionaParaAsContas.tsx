// Endereços antigos que a Fase D (20/10/2026) uniu na página da conta: links e favoritos continuam valendo.
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PaginaSkeleton } from "@/components/ListState";
import { listarContas } from "@/services/finService";
import { enderecoDaAba } from "@/components/financas/contas/AbasDaConta";

/** `/financas/auditoria-extrato` → aba Diagnóstico da conta de banco (a Bradesco, como a página antiga já preferia; senão a primeira). */
export function RedirecionaParaODiagnostico() {
  const [destino, setDestino] = useState<string | null>(null);
  useEffect(() => {
    listarContas(true).then(cs => {
      const bancos = cs.filter(c => c.tipo === "banco");
      const alvo = bancos.find(c => /^bradesco$/i.test(c.nome)) ?? bancos[0];
      setDestino(alvo ? enderecoDaAba(alvo.id, "diagnostico") : "/financas");
    }).catch(() => setDestino("/financas"));
  }, []);
  return destino ? <Navigate to={destino} replace /> : <PaginaSkeleton />;
}

/** `/financas/relatorio-contas?inicio=&fim=` → o extrato de "Todas as Contas" no mesmo período (o relatório combinado virou essa visão). */
export function RedirecionaParaTodasAsContas() {
  const [p] = useSearchParams();
  const inicio = p.get("inicio"), fim = p.get("fim");
  const periodo = inicio && fim ? `?periodo=personalizado&de=${inicio}&ate=${fim}` : "";
  return <Navigate to={`/financas/conta/todas${periodo}`} replace />;
}
