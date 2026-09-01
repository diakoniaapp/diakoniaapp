// ─── A minha ficha ────────────────────────────────────────────────────────
//
// O cadastro desta igreja tem 297 pessoas e uma secretaria. Toda correção de
// endereço, todo celular novo, todo ano de nascimento que faltava passa hoje
// por uma pessoa só — que precisa ser avisada, lembrar, e digitar.
//
// Este bloco tira a secretaria do meio do que é dado da PESSOA, e a mantém no
// meio do que é decisão da IGREJA.
//
//   edita quem é dono      nome, nascimento, casamento, celular, e-mail,
//                          endereço completo
//   decide a igreja        vínculo (visitante/congregado/membro), situação,
//                          funções ministeriais, observações pastorais
//
// A separação não é opinião de tela: ela está no banco, dentro de
// `salvar_meus_dados`, que é a única porta por onde esta tela escreve. Uma
// política de RLS não serviria — RLS decide quais LINHAS, nunca quais COLUNAS.
//
// ── O AVISO DO TELEFONE ────────────────────────────────────────────────────
//
// O login desta igreja é o telefone. Só que não este: o acesso guarda um
// e-mail fabricado uma vez a partir dos dígitos (5521983991229@app.diakonia) e
// nunca mais consultado. Trocar o celular aqui corrige o cadastro e NÃO move o
// login — quem trocar de número continua entrando pelo antigo.
//
// Um sistema que deixa a pessoa acreditar que trocou o acesso é um sistema que
// vai trancá-la para fora. Por isso o aviso fica colado ao campo, e não num
// rodapé.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Phone, Mail, MapPin, Cake, Heart, Info, Loader2 } from "lucide-react";
import { rotuloFuncao, ordenarFuncoes } from "@/lib/funcaoMinisterial";
import { formatarTelefone, limparTelefone } from "@/lib/telefone";
import {
  minhaFicha, salvarMeusDados,
  type MinhaFicha as Ficha, type MeusDadosEditaveis,
} from "@/services/meuEspacoService";

/** "14/06/1979" a partir de "1979-06-14", sem passar por Date — ver `idade.ts`. */
function porExtenso(iso?: string | null): string | null {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : null;
}

/** "14/06" para quem só tem dia e mês. O ano guardado é 2000 e não vale nada. */
function soDiaEMes(iso?: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-");
  return m && d ? `${d}/${m}` : null;
}

function enderecoEmUmaLinha(f: Ficha): string | null {
  const rua = [f.endereco, f.numero].filter(Boolean).join(", ");
  const partes = [rua, f.complemento, f.bairro, f.cidade, f.uf].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export function MinhaFicha({ pessoaId }: { pessoaId: string }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try { setFicha(await minhaFicha(pessoaId)); }
    finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, [pessoaId]);

  if (carregando) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Buscando sua ficha…
      </CardContent></Card>
    );
  }

  // Conta sem ficha ligada. Acontece quando o acesso é criado antes de a
  // pessoa existir no cadastro — e a mensagem diz o que fazer, porque quem vai
  // ler é ela, não quem programou.
  if (!ficha) {
    return (
      <Card><CardContent className="p-4">
        <p className="text-sm">Sua conta ainda não está ligada a uma ficha de cadastro.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Fale com a secretaria para que ela faça a ligação — depois disso seus dados aparecem aqui.
        </p>
      </CardContent></Card>
    );
  }

  const nasc = porExtenso(ficha.data_nascimento);
  const meia = soDiaEMes(ficha.nascimento_dia_mes);
  const endereco = enderecoEmUmaLinha(ficha);

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif text-lg leading-tight truncate">
                {ficha.nome_social || ficha.nome_completo}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {ficha.tipo_pessoa && (
                  <Badge variant="secondary" className="text-xs capitalize">{ficha.tipo_pessoa}</Badge>
                )}
                {/* `rotuloFuncao`, e não o código cru: a coluna guarda
                    "lider_area" e "voluntario", e a ficha estava exibindo
                    exatamente isso. A ordem é a de `FUNCOES_EM_ORDEM` — a
                    principal primeiro, que é a regra do catálogo. */}
                {ordenarFuncoes(ficha.funcoes_ministeriais ?? []).slice(0, 2).map(f => (
                  <Badge key={f} variant="outline" className="text-xs">{rotuloFuncao(f)}</Badge>
                ))}
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
              onClick={() => setEditando(true)}>
              <Pencil className="w-3.5 h-3.5" /> Corrigir
            </Button>
          </div>

          <div className="grid gap-1.5 text-sm sm:grid-cols-2">
            <Linha icon={Phone} valor={ficha.telefone_celular ? formatarTelefone(ficha.telefone_celular) : null} falta="Celular não informado" />
            <Linha icon={Mail} valor={ficha.email} falta="E-mail não informado" />
            {/* O ano que falta é PENDÊNCIA, e a pessoa é quem pode fechá-la —
                por isso ela aparece com o convite junto, e não como um traço
                cinza igual aos outros campos vazios. São 10 fichas assim. */}
            <Linha icon={Cake}
              valor={nasc ?? (meia ? `${meia} — falta o ano` : null)}
              falta="Data de nascimento não informada"
              alerta={!nasc} />
            <Linha icon={Heart} valor={porExtenso(ficha.data_casamento)} falta={null} />
            <div className="sm:col-span-2">
              <Linha icon={MapPin} valor={endereco} falta="Endereço não informado" />
            </div>
          </div>
        </CardContent>
      </Card>

      <DialogCorrigir
        aberto={editando}
        onFechar={() => setEditando(false)}
        ficha={ficha}
        onSalvo={() => { setEditando(false); carregar(); }}
      />
    </>
  );
}

function Linha({ icon: Icon, valor, falta, alerta }: {
  icon: typeof Phone; valor: string | null; falta: string | null; alerta?: boolean;
}) {
  // Campo opcional e vazio simplesmente não aparece: uma lista de "não
  // informado" transforma a própria ficha numa lista de cobranças.
  if (!valor && !falta) return null;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${alerta ? "text-gold" : "text-muted-foreground"}`} />
      <span className={`truncate ${valor ? (alerta ? "text-foreground" : "") : "text-muted-foreground italic"}`}>
        {valor ?? falta}
      </span>
    </div>
  );
}

// ─── O diálogo ────────────────────────────────────────────────────────────

function DialogCorrigir({ aberto, onFechar, ficha, onSalvo }: {
  aberto: boolean; onFechar: () => void; ficha: Ficha; onSalvo: () => void;
}) {
  const [form, setForm] = useState<MeusDadosEditaveis>(paraFormulario(ficha));
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof MeusDadosEditaveis, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Reabrir com o que está no banco, e não com o que ficou da vez anterior.
  useEffect(() => { if (aberto) setForm(paraFormulario(ficha)); }, [aberto, ficha]);

  const telefoneMudou =
    (form.telefone_celular ?? "").replace(/\D/g, "") !==
    (ficha.telefone_celular ?? "").replace(/\D/g, "");

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarMeusDados(form);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Seus dados foram atualizados.");
      onSalvo();
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Corrigir meus dados</DialogTitle>
          <DialogDescription>
            Vínculo, situação e funções ministeriais não estão aqui — quem cuida deles é a secretaria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Campo id="nome" rotulo="Nome completo">
            <Input id="nome" value={form.nome_completo}
              onChange={e => set("nome_completo", e.target.value)} />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="nasc" rotulo="Data de nascimento">
              <Input id="nasc" type="date" value={form.data_nascimento ?? ""}
                onChange={e => set("data_nascimento", e.target.value)} />
              {/* O convite só aparece para quem tem a pendência. Para os
                  outros seria ruído num campo já preenchido. */}
              {!ficha.data_nascimento && ficha.nascimento_dia_mes && (
                <p className="text-xs text-gold mt-1">
                  Seu cadastro tem só o dia e o mês. Informando o ano, a pendência se resolve.
                </p>
              )}
            </Campo>
            <Campo id="casam" rotulo="Data de casamento">
              <Input id="casam" type="date" value={form.data_casamento ?? ""}
                onChange={e => set("data_casamento", e.target.value)} />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="cel" rotulo="Celular">
              {/* O padrão do projeto, escrito em `lib/telefone.ts`: a tela
                  mostra "+55 (21) 99999-9999" e o banco guarda só os dígitos.

                  A primeira versão deste campo mostrava "5521983991229" cru e
                  mandava ao banco o que fosse digitado — e a coluna tem um
                  CHECK exigindo `^55[0-9]{10,11}$`. Quem escrevesse "(21)
                  98399-1229", que é como se escreve telefone, receberia uma
                  linha de erro do Postgres na cara. Descoberto ensaiando a
                  função com ROLLBACK, antes de chegar a alguém. */}
              <Input id="cel" inputMode="tel" placeholder="+55 (21) 99999-9999"
                value={formatarTelefone(form.telefone_celular)}
                onChange={e => set("telefone_celular", limparTelefone(e.target.value))} />
            </Campo>
            <Campo id="email" rotulo="E-mail">
              <Input id="email" type="email" value={form.email ?? ""}
                onChange={e => set("email", e.target.value)} />
            </Campo>
          </div>

          {/* Colado ao campo, e só quando o número muda de fato. Ver a nota do
              cabeçalho: o celular da ficha não é o login. */}
          {telefoneMudou && (
            <div className="flex gap-2 rounded-md border border-gold/40 bg-gold/5 p-2.5">
              <Info className="w-4 h-4 shrink-0 text-gold mt-0.5" />
              <p className="text-xs leading-snug">
                Este é o telefone do seu <strong>cadastro</strong>. O número que você usa para{" "}
                <strong>entrar no sistema</strong> continua o mesmo — para trocá-lo, fale com a secretaria.
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id="cep" rotulo="CEP">
              <Input id="cep" inputMode="numeric" value={form.cep ?? ""}
                onChange={e => set("cep", e.target.value)} />
            </Campo>
            <div className="sm:col-span-2">
              <Campo id="rua" rotulo="Rua">
                <Input id="rua" value={form.endereco ?? ""}
                  onChange={e => set("endereco", e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="num" rotulo="Número">
              <Input id="num" value={form.numero ?? ""} onChange={e => set("numero", e.target.value)} />
            </Campo>
            <Campo id="compl" rotulo="Complemento">
              <Input id="compl" value={form.complemento ?? ""}
                onChange={e => set("complemento", e.target.value)} />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo id="bairro" rotulo="Bairro">
              <Input id="bairro" value={form.bairro ?? ""} onChange={e => set("bairro", e.target.value)} />
            </Campo>
            <Campo id="cidade" rotulo="Cidade">
              <Input id="cidade" value={form.cidade ?? ""} onChange={e => set("cidade", e.target.value)} />
            </Campo>
            <Campo id="uf" rotulo="Estado">
              <Input id="uf" maxLength={2} value={form.uf ?? ""}
                onChange={e => set("uf", e.target.value.toUpperCase())} />
            </Campo>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-1.5">
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ id, rotulo, children }: { id: string; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</Label>
      {children}
    </div>
  );
}

function paraFormulario(f: Ficha): MeusDadosEditaveis {
  return {
    nome_completo:    f.nome_completo ?? "",
    data_nascimento:  f.data_nascimento ?? "",
    data_casamento:   f.data_casamento ?? "",
    telefone_celular: f.telefone_celular ?? "",
    email:            f.email ?? "",
    cep:              f.cep ?? "",
    endereco:         f.endereco ?? "",
    numero:           f.numero ?? "",
    complemento:      f.complemento ?? "",
    bairro:           f.bairro ?? "",
    cidade:           f.cidade ?? "",
    uf:               f.uf ?? "",
  };
}
