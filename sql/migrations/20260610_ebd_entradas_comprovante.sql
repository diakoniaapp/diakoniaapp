-- ─────────────────────────────────────────────────────────────────────────
-- EBD Campanhas — adicionar comprovante às entradas
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Coluna comprovante_url na tabela ebd_entradas
alter table public.ebd_entradas
  add column if not exists comprovante_url text;

-- 2) Storage bucket privado para comprovantes
insert into storage.buckets (id, name, public)
values ('ebd-comprovantes', 'ebd-comprovantes', false)
on conflict (id) do nothing;

-- 3) Policies para o bucket — apenas autenticados podem subir/ver/apagar
drop policy if exists "ebd-comprovantes-select" on storage.objects;
drop policy if exists "ebd-comprovantes-insert" on storage.objects;
drop policy if exists "ebd-comprovantes-update" on storage.objects;
drop policy if exists "ebd-comprovantes-delete" on storage.objects;

create policy "ebd-comprovantes-select"
  on storage.objects for select
  using (bucket_id = 'ebd-comprovantes' and auth.role() = 'authenticated');

create policy "ebd-comprovantes-insert"
  on storage.objects for insert
  with check (bucket_id = 'ebd-comprovantes' and auth.role() = 'authenticated');

create policy "ebd-comprovantes-update"
  on storage.objects for update
  using (bucket_id = 'ebd-comprovantes' and auth.role() = 'authenticated');

create policy "ebd-comprovantes-delete"
  on storage.objects for delete
  using (bucket_id = 'ebd-comprovantes' and auth.role() = 'authenticated');

-- 4) Trigger opcional: ao excluir entrada com comprovante, registra remoção no audit_logs
--    (deixei comentado — só ativar se você quiser auditoria por linha)
-- create or replace function public.audit_ebd_entrada_delete()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if old.comprovante_url is not null then
--     insert into public.audit_logs(acao, alvo, payload)
--     values ('ebd_entrada_excluida', old.id, jsonb_build_object('comprovante_url', old.comprovante_url));
--   end if;
--   return old;
-- end;$$;
