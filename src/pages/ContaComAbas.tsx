// ─── ContaComAbas — /financas/conta/:contaId/:aba — Conciliação · Diagnóstico · Importações da conta ──────────────────────────────────────────────
// Fase D (20/10/2026). O Extrato continua sendo `FinancasConta` (`/financas/conta/:contaId`), que desenha as mesmas abas na própria barra; esta página é o casco das outras três,
// com o cabeçalho que o extrato já tem (conta + saldo) para a pessoa não sentir que trocou de lugar.
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginaSkeleton } from "@/components/ListState";
import { useRotuloDaTela } from "@/hooks/useNavegacao";
import { AbasDaConta, ABAS_VALIDAS, abasDaConta, enderecoDaAba, type AbaDaConta } from "@/components/financas/contas/AbasDaConta";
import { ConciliacaoDaConta } from "@/components/financas/contas/ConciliacaoDaConta";
import { DiagnosticoDoExtrato } from "@/components/financas/contas/DiagnosticoDoExtrato";
import { ImportacoesDaConta } from "@/components/financas/contas/ImportacoesDaConta";
import { brl, carregarConta, CONTA_TIPO_LABEL, listarContas, type FinConta } from "@/services/finService";

const ROTULO: Record<AbaDaConta, string> = { extrato: "Extrato", conciliacao: "Conciliação", diagnostico: "Diagnóstico", importacoes: "Importações" };

export default function ContaComAbas() {
  const { contaId = "", aba = "" } = useParams();
  const navigate = useNavigate();
  const [conta, setConta] = useState<FinConta | null>(null);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  useRotuloDaTela(conta?.nome ? `${conta.nome} · ${ROTULO[aba as AbaDaConta] ?? "Conta"}` : undefined);

  useEffect(() => { listarContas().then(setContas).catch(() => setContas([])); }, []);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarConta(contaId).then(c => { if (vivo) { setConta(c); setCarregando(false); } }).catch(() => { if (vivo) { setConta(null); setCarregando(false); } });
    return () => { vivo = false; };
  }, [contaId, recarga]);

  if (carregando && !conta) return <PaginaSkeleton />;
  // conta que não existe, aba que não existe ou que esta conta não tem (diagnóstico de cartão…): volta para o extrato, que sempre existe
  const abaValida = ABAS_VALIDAS.includes(aba as AbaDaConta) && aba !== "extrato" && !!conta && abasDaConta(conta.tipo).some(a => a.aba === aba);
  if (!conta || !abaValida) return <Navigate to={enderecoDaAba(contaId, "extrato")} replace />;

  const atual = aba as AbaDaConta;
  const aoMudar = () => setRecarga(n => n + 1);

  return (
    <div className="mx-auto max-w-[120rem] space-y-4 p-3 md:p-5">
      <div className="space-y-2 border-b">
        <div className="min-w-0">
          <Select value={conta.id} onValueChange={id => navigate(enderecoDaAba(id, atual))}>
            <SelectTrigger aria-label="Conta" className="-mx-1 h-auto w-fit max-w-full gap-1.5 rounded-md border-0 p-0 px-1 font-serif text-lg shadow-none hover:bg-muted/40 [&>svg]:opacity-50">
              <DollarSign className="h-5 w-5 shrink-0 text-gold" />
              <SelectValue>
                <span className="flex items-center gap-2 truncate">
                  {conta.nome}
                  <Badge variant="outline" className="font-sans text-xs font-normal">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {contas.filter(c => abasDaConta(c.tipo).some(a => a.aba === atual)).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">{c.nome}<span className="text-xs text-muted-foreground">{CONTA_TIPO_LABEL[c.tipo]}</span></span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="truncate text-xs text-muted-foreground">
            Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
          </p>
        </div>
        <AbasDaConta contaId={conta.id} tipo={conta.tipo} aba={atual} />
      </div>

      {atual === "conciliacao" && <ConciliacaoDaConta key={conta.id} contaId={conta.id} contaNome={conta.nome} onChange={aoMudar} />}
      {atual === "diagnostico" && <DiagnosticoDoExtrato key={conta.id} contaId={conta.id} contaNome={conta.nome} />}
      {atual === "importacoes" && <ImportacoesDaConta key={conta.id} contaId={conta.id} contaNome={conta.nome} tipo={conta.tipo} onChange={aoMudar} />}
    </div>
  );
}
