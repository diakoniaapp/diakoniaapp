// ─── ConferenciaLideranca.tsx ────────────────────────────────────────────────
// Onde a ficha e o cadastro das equipes discordam — e o botão para acabar com
// a discordância.
//
// ── POR QUE ESTA TELA EXISTE ─────────────────────────────────────────────────
//
// Medido em 03/09/2026: 14 pessoas em que as duas fontes concordam, e 20 em
// que não. Cinco respondem por ministério sem que a ficha diga; treze lideram
// área sem que a ficha diga; e duas dizem "líder de área" na ficha sem liderar
// área nenhuma.
//
// Nenhuma dessas 20 é erro de digitação: são dois cadastros que ninguém
// combinou, feitos em momentos diferentes por pessoas diferentes. Só a igreja
// sabe qual dos dois está certo em cada caso — e é por isso que isto é uma
// tela e não uma migration.
//
// ── O QUE ELA NÃO FAZ ────────────────────────────────────────────────────────
//
// Não muda quem lidera. Trocar o líder de uma área é outro ato, com outras
// consequências — o acesso ao sistema inteiro sai daquela coluna —, e mora no
// cadastro da área. Aqui se ajusta só o rótulo da ficha, que é documentação.
//
// Quando o cadastro é que está errado, o caminho é o link para o ministério.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ScanSearch, Plus, Minus, Check } from "lucide-react";
import {
  carregarConferencia, ajustarRotulo, ROTULO_LEGIVEL,
  type Conferencia, type Divergencia,
} from "@/services/conferenciaLideranca";

export function ConferenciaLideranca({ podeEditar }: { podeEditar: boolean }) {
  const [dados, setDados] = useState<Conferencia | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = () => { carregarConferencia().then(setDados); };
  useEffect(carregar, []);

  if (!dados) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Conferindo ficha e cadastro…
      </div>
    );
  }

  const total = dados.rotuloSozinho.length + dados.cadastroSozinho.length;

  async function ajustar(d: Divergencia, acao: "por" | "tirar") {
    const marca = `${d.pessoa_id}:${d.rotulo}`;
    setOcupado(marca);
    const r = await ajustarRotulo(d.pessoa_id, d.rotulo, acao);
    setOcupado(null);
    if (!r.ok) return toast.error(r.erro);
    toast.success(
      acao === "por"
        ? `A ficha de ${d.nome} passou a dizer ${ROTULO_LEGIVEL[d.rotulo]}.`
        : `${ROTULO_LEGIVEL[d.rotulo]} saiu da ficha de ${d.nome}.`,
    );
    carregar();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
          <ScanSearch className="w-4 h-4 text-gold" /> Liderança — ficha × cadastro
        </h3>
        <p className="text-xs text-muted-foreground max-w-2xl">
          Quem lidera sai do cadastro das equipes, e é de lá que o sistema recorta o
          acesso. A ficha só documenta. Aqui estão as pessoas em que as duas se
          contradizem — <strong className="text-foreground">{dados.deAcordo}</strong> já
          concordam.
        </p>
      </div>

      {total === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-4 py-3 text-sm text-success-text">
          <Check className="w-4 h-4 shrink-0" />
          Ficha e cadastro dizem a mesma coisa sobre todo mundo.
        </p>
      ) : (
        <div className="space-y-5">
          <Grupo
            titulo="Lidera, e a ficha não diz"
            explica="O cadastro da equipe é a verdade operacional. Pôr o rótulo alinha a ficha ao fato."
            itens={dados.cadastroSozinho}
            acao="por"
            podeEditar={podeEditar}
            ocupado={ocupado}
            aoClicar={ajustar}
          />
          <Grupo
            titulo="A ficha diz que lidera, e ela não lidera nada"
            explica="Ou o rótulo ficou de um mandato antigo, ou o cadastro da equipe é que está incompleto. Se ela lidera mesmo, o conserto é no cadastro do ministério — não aqui."
            itens={dados.rotuloSozinho}
            acao="tirar"
            podeEditar={podeEditar}
            ocupado={ocupado}
            aoClicar={ajustar}
          />
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, explica, itens, acao, podeEditar, ocupado, aoClicar }: {
  titulo: string;
  explica: string;
  itens: Divergencia[];
  acao: "por" | "tirar";
  podeEditar: boolean;
  ocupado: string | null;
  aoClicar: (d: Divergencia, acao: "por" | "tirar") => void;
}) {
  if (itens.length === 0) return null;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">
          {titulo} <span className="text-muted-foreground font-normal tabular-nums">· {itens.length}</span>
        </p>
        <p className="text-xs text-muted-foreground max-w-2xl">{explica}</p>
      </div>

      <div className="rounded-lg border divide-y">
        {itens.map(d => {
          const marca = `${d.pessoa_id}:${d.rotulo}`;
          return (
            <div key={marca} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <span className="font-medium text-sm min-w-0 truncate">{d.nome}</span>
              <Badge variant="outline" className="text-xs h-4 px-1.5">
                {ROTULO_LEGIVEL[d.rotulo]}
              </Badge>
              {/* O nome da equipe é a prova. Sem ele a linha pediria um ato de fé. */}
              {d.equipes.length > 0 && (
                <span className="text-xs text-muted-foreground truncate">
                  {d.equipes.join(" · ")}
                </span>
              )}
              {podeEditar && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 gap-1 text-xs"
                  disabled={ocupado === marca}
                  onClick={() => aoClicar(d, acao)}
                  // "Pôr na ficha" repetido dezoito vezes é a mesma frase para
                  // dezoito atos diferentes. Quem navega por leitor de tela ouve
                  // a lista inteira antes de saber de quem é cada botão.
                  aria-label={`${acao === "por" ? "Pôr" : "Tirar"} ${ROTULO_LEGIVEL[d.rotulo]} ${acao === "por" ? "na" : "da"} ficha de ${d.nome}`}
                >
                  {ocupado === marca
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : acao === "por" ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {acao === "por" ? "Pôr na ficha" : "Tirar da ficha"}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {acao === "tirar" && (
        <p className="text-xs text-muted-foreground">
          Se a pessoa lidera de verdade, o conserto é do outro lado:{" "}
          <Link to="/ministerios" className="text-primary underline underline-offset-2">
            abrir Ministérios
          </Link>{" "}
          e nomeá-la na área ou no ministério.
        </p>
      )}
    </div>
  );
}
