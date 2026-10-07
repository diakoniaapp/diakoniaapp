// ─── BoasVindasVisitante — a tela de acolhimento depois do AutoCadastro ───────────────────────────────────────
//
// Uma só peça, usada nos dois lugares: na página pública (o que o visitante vê ao concluir) e na PRÉVIA da tela de
// configuração (/admin/boas-vindas-visitante). Recebe o conteúdo já filtrado (`BoasVindasPublica`); não busca nada.
// Os botões abrem em outra aba (`noopener noreferrer`): o visitante não perde a tela.

import { useState } from "react";
import { CalendarDays, CheckCircle2, Facebook, Globe, Instagram, Link as LinkIcon, MapPin, MessageCircle, Youtube } from "lucide-react";
import { CANAIS, type BoasVindasPublica, type TipoCanal } from "@/lib/boasVindasVisitante";

const ICONE: Record<TipoCanal, typeof Globe> = { instagram: Instagram, facebook: Facebook, youtube: Youtube, site: Globe, whatsapp: MessageCircle };
const ROTULO = Object.fromEntries(CANAIS.map(c => [c.tipo, c.rotulo])) as Record<TipoCanal, string>;

const botao = "flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-[15px] font-medium leading-tight hover:bg-muted";

export function BoasVindasVisitante({ dados }: { dados: BoasVindasPublica }) {
  const [bannerQuebrado, setBannerQuebrado] = useState(false);
  const { canais, links, eventos } = dados;

  return (
    <div className="space-y-5">
      {dados.banner_url && !bannerQuebrado && (
        <img src={dados.banner_url} alt="" onError={() => setBannerQuebrado(true)} className="max-h-48 w-full rounded-lg border object-cover" />
      )}

      <div className="space-y-3 text-center" role="status">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success-text" aria-hidden />
        <h1 className="font-serif text-2xl font-semibold leading-tight">{dados.titulo}</h1>
        {dados.mensagem.trim() !== "" && <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{dados.mensagem}</p>}
      </div>

      {canais.length > 0 && (
        <section className="space-y-2" aria-label="Canais da igreja">
          <h2 className="text-center text-sm font-medium text-muted-foreground">Fique perto de nós</h2>
          <div className={`grid gap-2 ${canais.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {canais.map((c, i) => {
              const Icone = ICONE[c.tipo];
              return (
                <a key={c.tipo} href={c.url} target="_blank" rel="noopener noreferrer"
                  className={`${botao} ${canais.length % 2 === 1 && i === canais.length - 1 && canais.length > 1 ? "col-span-2" : ""}`}>
                  <Icone className="h-5 w-5 shrink-0" aria-hidden /> <span className="truncate">{ROTULO[c.tipo]}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {links.length > 0 && (
        <section className="space-y-2" aria-label="Links">
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className={botao}>
              <LinkIcon className="h-5 w-5 shrink-0" aria-hidden /> <span className="truncate">{l.rotulo}</span>
            </a>
          ))}
        </section>
      )}

      {eventos.length > 0 && (
        <section className="space-y-2" aria-label={dados.eventos_titulo}>
          <h2 className="text-center text-sm font-medium text-muted-foreground">{dados.eventos_titulo}</h2>
          <ul className="space-y-2">
            {eventos.map((e, i) => {
              const miolo = (
                <>
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block font-medium leading-snug">{e.titulo}</span>
                    {e.quando && <span className="block text-sm text-muted-foreground">{e.quando}</span>}
                    {e.local && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{e.local}</span></span>}
                  </span>
                </>
              );
              return (
                <li key={i}>
                  {e.link
                    ? <a href={e.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-md border bg-background p-3 hover:bg-muted">{miolo}</a>
                    : <div className="flex items-start gap-3 rounded-md border bg-background p-3">{miolo}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
