// Links e favoritos antigos do Malote Contábil (`/financas/relatorio` e `/financas/relatorio/:ano/:mes`) caem no Fechamento do mês certo (Fase B, 20/10/2026).
import { Navigate, useParams } from "react-router-dom";

export function RedirecionaParaOFechamento() {
  const { ano, mes } = useParams();
  const a = Number(ano), m = Number(mes);
  const mesPedido = a >= 2000 && a <= 2100 && m >= 1 && m <= 12 ? `?mes=${a}-${String(m).padStart(2, "0")}` : "";
  return <Navigate to={`/painel-tesouraria${mesPedido}#fechamento`} replace />;
}
