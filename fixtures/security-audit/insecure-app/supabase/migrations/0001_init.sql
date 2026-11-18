create table public.profiles (id uuid primary key, user_id uuid, bio text);
alter table public.profiles enable row level security;
create policy "anyone can edit" on public.profiles for all using (true) with check (true);

-- RLS never enabled:
create table public.invoices (id uuid primary key, organization_id uuid, amount int);

create table public.products (id uuid primary key, name text);
alter table public.products enable row level security;
create policy "public catalog" on public.products for select using (true);
