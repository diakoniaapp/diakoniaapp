// ─── PainelDiaconia.tsx — o endereço fixo do painel da Diaconia ────────────
//
// ── NÃO É UMA TELA NOVA, DE PROPÓSITO ────────────────────────────────────
//
// Primeira versão (09/09/2026) construía aqui uma leitura própria —
// cabeçalho, frase-resumo, `SecaoDiaconia` — paralela ao painel genérico de
// ministério (`/ministerios/:id/painel`), que já mostra exatamente a mesma
// `SecaoDiaconia`, ao lado de áreas, equipe, escalas e checklist. Ela
// apontou a sobreposição no mesmo dia: duas telas com o mesmo conteúdo é o
// "segundo caminho" que este projeto vem fechando a cada auditoria, não
// abrindo — ver o comentário de `MeusPaineis.tsx` sobre "Crescimento" e o
// de `navConfig.ts` sobre "Administração".
//
// Esta versão não duplica nada: só resolve QUAL ministério tem
// `modulo = 'diaconia'` e redireciona para o painel de verdade dele. O
// endereço `/painel-diaconia` continua existindo — é o que cabe num atalho
// fixo do menu, que não pode carregar um id de ministério dentro da URL —
// mas quem chega aqui sai direto para a única tela que mostra a Diaconia.

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ministerioDiaconiaId } from "@/services/diaconiaService";

export default function PainelDiaconia() {
  const [ministerioId, setMinisterioId] = useState<string | null | undefined>(undefined);

  useEffect(() => { ministerioDiaconiaId().then(setMinisterioId); }, []);

  if (ministerioId === undefined) return null;

  if (ministerioId === null) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Sem ministério de Diaconia cadastrado.
        </p>
      </div>
    );
  }

  return <Navigate to={`/ministerios/${ministerioId}/painel`} replace />;
}
