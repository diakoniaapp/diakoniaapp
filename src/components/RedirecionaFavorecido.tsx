// O endereço antigo da ficha (/financas/fornecedor/:id) continua valendo: favoritos fixados, links e histórico do navegador
// apontam para ele. Leva para /financas/favorecido/:id (07/10/2026: "Fornecedor" virou "Favorecido Financeiro").
import { Navigate, useParams } from "react-router-dom";

export default function RedirecionaFavorecido() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/financas/favorecido/${id ?? ""}`} replace />;
}
