// ─── EbdClasseDoAluno — a página da classe, vista por quem estuda (ou ensina) nela ───────────────────────────────────────────────────────────────
//
// Pedido (16/10/2026): o voluntário deve abrir a página da classe em que está matriculado. A tela de gestão (EbdClasse) é de quem opera a EBD: lista de matriculados, "esperados" (nomes
// de outras pessoas por idade/gênero), mover aluno, chamada, relatórios. Nada disso é do aluno — e a RLS nem entrega: ele só enxerga a própria matrícula.
//
// Por isso esta é uma visão à parte, curta e SÓ DE LEITURA: o nome e o perfil da classe, o vínculo da pessoa com ela e a frequência dela.
//
// Só abre para quem é DA classe (matriculado ou professor nela). Quem digita o endereço de outra classe volta à Home com um aviso: a página de uma classe alheia não é dele.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useRotuloDaTela } from "@/hooks/useNavegacao";
import { supabase } from "@/integrations/supabase/client";
import { carregarClasse, type EbdClasse } from "@/services/ebdService";
import { minhaEbd, type MinhaEbd } from "@/services/meuEspacoService";
import { Frequencia } from "@/components/eu/MinhaVida";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const TIPO_PROFESSOR: Record<string, string> = { principal: "principal", auxiliar: "auxiliar", substituto: "substituto" };

interface Vinculo { matriculadaDesde: string | null; professor: { tipo: string } | null }

export function EbdClasseDoAluno({ classeId }: { classeId: string }) {
  const { pessoaId, pessoaCarregada } = useAuth();
  const navigate = useNavigate();
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [frequencia, setFrequencia] = useState<MinhaEbd | null>(null);
  const [carregando, setCarregando] = useState(true);
  useRotuloDaTela(classe?.nome);

  useEffect(() => {
    if (!pessoaCarregada) return;
    let vivo = true;
    (async () => {
      const recusar = () => { toast.error("Você não está matriculado nesta classe."); navigate("/", { replace: true }); };
      if (!pessoaId || !classeId) { recusar(); return; }
      try {
        const [mat, prof] = await Promise.all([
          supabase.from("ebd_matriculas").select("data_matricula").eq("classe_id", classeId).eq("pessoa_id", pessoaId).eq("ativo", true).maybeSingle(),
          supabase.from("ebd_professores").select("tipo").eq("classe_id", classeId).eq("pessoa_id", pessoaId).eq("ativo", true).maybeSingle(),
        ]);
        if (!vivo) return;
        const matriculada = mat.data?.data_matricula ? String(mat.data.data_matricula).slice(0, 10) : null;
        if (!mat.data && !prof.data) { recusar(); return; }
        const [c, f] = await Promise.all([carregarClasse(classeId), minhaEbd(pessoaId).catch(() => null)]);
        if (!vivo) return;
        setClasse(c);
        setVinculo({ matriculadaDesde: matriculada, professor: prof.data ? { tipo: String(prof.data.tipo) } : null });
        setFrequencia(f && f.classeId === classeId ? f : null);
      } catch (e) {
        if (vivo) toast.error(e instanceof Error ? e.message : "Não foi possível carregar a classe.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [classeId, pessoaId, pessoaCarregada, navigate]);

  if (carregando || !classe || !vinculo) {
    return <div className="p-8 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" aria-label="Carregando" /></div>;
  }

  const faixa = `${classe.idade_min ?? 0}–${classe.idade_max ?? "+"} anos · ${classe.genero === "misto" ? "Misto" : classe.genero === "feminino" ? "Mulheres" : "Homens"}`;
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-2xl flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-gold shrink-0" />
          <span className="min-w-0 break-words">{classe.nome}</span>
        </h1>
        <p className="text-sm text-muted-foreground">Escola Bíblica Dominical · {faixa}</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {vinculo.professor ? (
            <p className="text-sm">Você ensina nesta classe — professor {TIPO_PROFESSOR[vinculo.professor.tipo] ?? vinculo.professor.tipo}.</p>
          ) : (
            <p className="text-sm">
              Você está matriculado nesta classe{vinculo.matriculadaDesde ? <> desde <strong>{dataBr(vinculo.matriculadaDesde)}</strong></> : ""}.
            </p>
          )}
          {classe.descricao && <p className="text-sm text-muted-foreground">{classe.descricao}</p>}
          {frequencia && <Frequencia dados={frequencia} />}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        A lista de alunos, a chamada e os relatórios da classe ficam com a equipe da Escola Bíblica Dominical.
      </p>
    </div>
  );
}
