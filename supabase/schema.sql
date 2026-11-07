-- Run this once in Supabase Dashboard → SQL Editor.
create table if not exists public.mindmaps (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '새 마인드맵',
  content jsonb not null default '{"nodes": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, owner_id)
);

alter table public.mindmaps enable row level security;
revoke all on public.mindmaps from anon;
grant select, insert, update, delete on public.mindmaps to authenticated;

drop policy if exists "Owners can read their mindmaps" on public.mindmaps;
create policy "Owners can read their mindmaps" on public.mindmaps
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create their mindmaps" on public.mindmaps;
create policy "Owners can create their mindmaps" on public.mindmaps
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can update their mindmaps" on public.mindmaps;
create policy "Owners can update their mindmaps" on public.mindmaps
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can delete their mindmaps" on public.mindmaps;
create policy "Owners can delete their mindmaps" on public.mindmaps
  for delete to authenticated using ((select auth.uid()) = owner_id);

create index if not exists mindmaps_owner_updated_idx on public.mindmaps (owner_id, updated_at desc);

-- Workspace migration: safe to re-run on an existing installation.
begin;
create table if not exists public.workspaces (
  id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (id, owner_id)
);
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;
drop policy if exists "Owners manage workspaces" on public.workspaces;
create policy "Owners manage workspaces" on public.workspaces for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
alter table public.mindmaps add column if not exists workspace_id uuid;
-- Existing maps retain their IDs and content, and receive a default workspace.
insert into public.workspaces (id, owner_id, name)
select gen_random_uuid(), m.owner_id, '내 워크스페이스'
from public.mindmaps m
where m.workspace_id is null and not exists (select 1 from public.workspaces w where w.owner_id = m.owner_id)
group by m.owner_id;
update public.mindmaps m set workspace_id = (
  select w.id from public.workspaces w where w.owner_id = m.owner_id order by w.created_at, w.id limit 1
) where m.workspace_id is null;
alter table public.mindmaps alter column workspace_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mindmaps_workspace_owner_fk' and conrelid = 'public.mindmaps'::regclass) then
    alter table public.mindmaps add constraint mindmaps_workspace_owner_fk
      foreign key (workspace_id, owner_id) references public.workspaces (id, owner_id);
  end if;
end $$;
create index if not exists mindmaps_workspace_updated_idx on public.mindmaps (owner_id, workspace_id, updated_at desc);
commit;
