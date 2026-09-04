-- ═══════════════════════════════════════════════════════════════════════════
-- Diakonia também abre a porta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ela tentou salvar uma ficha e levou "Só a liderança da Diaconia preenche
-- a ficha" — bloqueada na própria conta. `diaconia_lidera_area()` e
-- `diaconia_posso_atender()` só abriam para `admin`/`secretaria` (mais
-- líder/quem serve na área) — nunca para `diakonia`, o papel de dono do
-- sistema que outras partes do banco (`assinaturas_oficiais_equipe`,
-- `assuntos_equipe`, e o resto do lote de governança) já tratam como
-- staff. Pedido dela: "dê permissões ao ADMIN e ao DIAKONIA."

BEGIN;

CREATE OR REPLACE FUNCTION public.diaconia_posso_atender(p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','diakonia']::app_role[])
    OR (public.has_role((SELECT auth.uid()), 'lideranca')
        AND p_area_id IN (SELECT public.fn_minhas_areas()))
    OR EXISTS (
         SELECT 1 FROM public.area_voluntarios av
          WHERE av.membro_id = public.minha_pessoa_id() AND av.area_id = p_area_id AND av.status = 'ativa'
       );
$$;

CREATE OR REPLACE FUNCTION public.diaconia_lidera_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','diakonia']::app_role[])
    OR (public.has_role((SELECT auth.uid()), 'lideranca')
        AND p_area_id IN (SELECT public.fn_minhas_areas()));
$$;

COMMIT;
