-- ═══════════════════════════════════════════════════════════════════════════
-- Finalizar a chamada, e o relatório que faltava
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela: "verifique tanto em EBD como em Diaconia, a chamada; pois
-- para onde vão as informações? onde está o botão salvar, editar? [...]
-- é preciso finalizar a chamada e gerar relatório". Medido antes de mexer:
-- presença em EBD/Diaconia/PGM já salva no toque, sem botão — não falta
-- "salvar". O que falta é diferente: PGM já tem relatório (impressão +
-- WhatsApp) mas EBD e Diaconia não têm nenhum; e as três não têm
-- "finalizar" de verdade — `pgm_reunioes.fechada` existe no banco desde
-- sempre, mas nenhuma tela lê ou grava nela (mesmo padrão do
-- `diaconia_reabrir_vinculo` sem botão, achado dias atrás).
--
-- Decisão dela: "finalizar" é carimbo, não cadeado — continua editável
-- depois, sem precisar de ninguém destravar. Por isso `fechada` aqui é só
-- um boolean que qualquer um que já mexe na chamada pode marcar/desmarcar
-- (mesma porta larga de sempre, `diaconia_posso_atender`) — não é RLS
-- restritiva, é sinalização.
--
-- EBD: `ebd_aulas` já é atualizada direto pelo cliente (`atualizarAula`,
-- ebdService.ts) — a política de UPDATE já é larga o bastante, então só
-- precisa da coluna nova, sem RPC.
--
-- Diaconia: `diaconia_ocasioes` só aceita escrita de admin/secretaria via
-- RLS (medido: só 3 políticas, nenhuma de UPDATE pra líder/diácono) — por
-- isso precisa de RPC, como todo o resto do módulo.

BEGIN;

ALTER TABLE public.ebd_aulas
  ADD COLUMN fechada boolean NOT NULL DEFAULT false;

ALTER TABLE public.diaconia_ocasioes
  ADD COLUMN fechada boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.diaconia_marcar_ocasiao(p_ocasiao_id uuid, p_fechada boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_area_id uuid;
BEGIN
  SELECT area_id INTO v_area_id FROM public.diaconia_ocasioes WHERE id = p_ocasiao_id;
  IF v_area_id IS NULL THEN
    RAISE EXCEPTION 'Ocasião não encontrada.';
  END IF;
  IF NOT public.diaconia_posso_atender(v_area_id) THEN
    RAISE EXCEPTION 'Você não atende esta área.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.diaconia_ocasioes SET fechada = p_fechada WHERE id = p_ocasiao_id;
END;
$$;

COMMIT;
