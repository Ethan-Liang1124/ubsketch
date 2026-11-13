-- 在 Supabase 的 SQL Editor 貼上並執行一次
create extension if not exists pgcrypto;

create table landmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create table pieces (
  id uuid primary key default gen_random_uuid(),
  landmark_id uuid not null references landmarks(id) on delete cascade,
  owner uuid default auth.uid(),
  path text not null,                 -- Storage 裡的圖片路徑
  cat text not null,                  -- 鳥/人/車/樹/貓/其他
  az real not null,                   -- 相對「對準地標」方向的水平角度（度）
  el real not null,                   -- 仰角（度）
  size real not null,                 -- 物件高度所佔視角（度）
  period text check (period in ('day','night')),
  created_at timestamptz default now()
);
create index on pieces(landmark_id);
create table reports (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid references pieces(id) on delete cascade,
  reporter uuid default auth.uid(),
  created_at timestamptz default now()
);

alter table landmarks enable row level security;
alter table pieces enable row level security;
alter table reports enable row level security;

create policy "read landmarks" on landmarks for select using (true);
create policy "add landmarks" on landmarks for insert to authenticated with check (created_by = auth.uid());
create policy "read pieces" on pieces for select using (true);
create policy "add pieces" on pieces for insert to authenticated with check (owner = auth.uid());
create policy "delete own pieces" on pieces for delete to authenticated using (owner = auth.uid());
create policy "add reports" on reports for insert to authenticated with check (reporter = auth.uid());

insert into storage.buckets (id, name, public) values ('cutouts', 'cutouts', true) on conflict do nothing;
create policy "read cutouts" on storage.objects for select using (bucket_id = 'cutouts');
create policy "upload cutouts" on storage.objects for insert to authenticated with check (bucket_id = 'cutouts');
