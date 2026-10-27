// ─── useRegistroDeAcesso — "quem viu a lista nominal" (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela: nomes só dentro do sistema, para usuário autorizado, COM registro de quem visualizou. A lista só aparece depois que o acesso foi gravado: sem registro, sem nomes. Exceção única: a
// função do banco ainda não existe (migration 20261027160000 não aplicada) — a lista aparece COM um aviso, para a tela não ficar inutilizável antes de a migration ser aplicada.
// Uma mesma consulta (mesma ação e mesmo recorte) é gravada UMA vez por sessão: reabrir a aba ou digitar na busca não enche o registro de linhas iguais.
import { useCallback, useEffect, useState } from "react";
import { registrarAcessoNominal, type AcaoDoRegistro } from "@/services/contribuicoesService";

export type EstadoDoRegistro = "aguardando" | "registrando" | "ok" | "indisponivel" | "erro";

const jaRegistrados = new Set<string>();
/** Só para testes: esquece o que já foi gravado nesta sessão. */
export function esquecerRegistrosDaSessao() { jaRegistrados.clear(); }

export function useRegistroDeAcesso(acao: AcaoDoRegistro, recorte: Record<string, unknown>, total: number | null, pronto: boolean) {
  const chave = `${acao}|${JSON.stringify(recorte)}`;
  const [estado, setEstado] = useState<EstadoDoRegistro>("aguardando");
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!pronto) { setEstado("aguardando"); return; }
    if (jaRegistrados.has(chave)) { setEstado("ok"); return; }
    let vivo = true;
    setEstado("registrando");
    registrarAcessoNominal(acao, recorte, total).then(r => {
      if (!vivo) return;
      if (r.ok) { jaRegistrados.add(chave); setEstado("ok"); }
      else if (r.indisponivel) setEstado("indisponivel");
      else { setErro(r.erro); setEstado("erro"); }
    });
    return () => { vivo = false; };
  }, [chave, pronto, tentativa]);   // eslint-disable-line react-hooks/exhaustive-deps

  const tentarDeNovo = useCallback(() => setTentativa(t => t + 1), []);
  /** pode mostrar nomes? (gravou, ou a função ainda não existe) */
  const liberado = estado === "ok" || estado === "indisponivel";
  return { estado, erro, liberado, tentarDeNovo };
}

/** O aviso que a tela mostra ao lado da lista nominal, conforme o estado do registro. */
export function textoDoRegistro(estado: EstadoDoRegistro): string | null {
  if (estado === "ok") return "Esta consulta fica registrada: quem viu, quando e com quais filtros (nunca os nomes).";
  if (estado === "indisponivel") return "Atenção: o registro de acessos ainda não está ativo no banco (migration pendente). A lista é mostrada, mas esta consulta NÃO ficou registrada.";
  return null;
}
