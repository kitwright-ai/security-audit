create table bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users,
  starts_at timestamptz not null
);
alter table bookings enable row level security;
