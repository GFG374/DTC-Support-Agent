-- Stage 1: Role Table & Automatic Writing

-- 1. Create user_profiles table
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. Enable RLS on user_profiles
alter table public.user_profiles enable row level security;

-- 3. Create RLS policies for user_profiles
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Create handle_new_user function
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (user_id, role)
  values (new.id, 'customer');
  return new;
end;
$$ language plpgsql security definer;

-- 5. Create trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent role changes from clients
create or replace function public.prevent_user_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role and current_setting('request.jwt.claim.role', true) != 'service_role' then
    raise exception 'Role updates are not allowed';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists prevent_role_change on public.user_profiles;
create trigger prevent_role_change
  before update on public.user_profiles
  for each row execute procedure public.prevent_user_role_change();


-- Additional Tables Setup (Ensuring 'user_id' and RLS)

-- conversations
create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) not null,
    title text,
    status text default 'ai' check (status in ('ai', 'pending_agent', 'agent', 'closed')),
    assigned_agent_id uuid references auth.users(id) on delete set null,
    created_at timestamptz default now()
);
alter table public.conversations enable row level security;

drop policy if exists "Users can select own conversations" on conversations;
create policy "Users can select own conversations" on conversations for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own conversations" on conversations;
create policy "Users can insert own conversations" on conversations for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversations" on conversations;
create policy "Users can update own conversations" on conversations for update using (auth.uid() = user_id);

-- messages
create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    client_message_id uuid,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    user_id uuid references auth.users(id) not null,
    role text not null,
    content text not null,
    created_at timestamptz default now()
);
alter table public.messages enable row level security;

drop policy if exists "Users can select own messages" on messages;
create policy "Users can select own messages" on messages for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own messages" on messages;
create policy "Users can insert own messages" on messages for insert with check (auth.uid() = user_id);

create unique index if not exists messages_client_message_id_unique
  on public.messages (client_message_id)
  where client_message_id is not null;

create table if not exists public.orders (
    order_id text primary key,
    user_id uuid references auth.users(id) not null,
    created_at timestamptz default now(),
    paid_amount int,
    currency text,
    status text,
    shipping_status text,
    tracking_no text
);

-- Legacy column rename to keep backward compatibility
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'orders' and column_name = 'id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_name = 'orders' and column_name = 'order_id'
    ) then
        alter table public.orders rename column id to order_id;
    end if;
end $$;

alter table public.orders alter column order_id set not null;
alter table public.orders drop constraint if exists orders_pkey;
alter table public.orders add constraint orders_pkey primary key (order_id);

alter table public.orders add column if not exists paid_amount int;
alter table public.orders add column if not exists currency text;
alter table public.orders add column if not exists shipping_status text;
alter table public.orders add column if not exists tracking_no text;

alter table public.orders enable row level security;

drop policy if exists "Users can select own orders" on orders;
create policy "Users can select own orders" on orders for select using (auth.uid() = user_id);

-- order_items
create table if not exists public.order_items (
    id text primary key,
    order_id text references public.orders(order_id) on delete cascade not null,
    sku text,
    name text,
    category text,
    qty int,
    unit_price int,
    user_id uuid references auth.users(id)
);

alter table public.order_items add column if not exists user_id uuid references auth.users(id);
alter table public.order_items add column if not exists category text;
alter table public.order_items add column if not exists qty int;
alter table public.order_items add column if not exists unit_price int;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'order_items' and column_name = 'quantity'
    ) and not exists (
        select 1 from information_schema.columns
        where table_name = 'order_items' and column_name = 'qty'
    ) then
        alter table public.order_items rename column quantity to qty;
    end if;
    if exists (
        select 1 from information_schema.columns
        where table_name = 'order_items' and column_name = 'price_cents'
    ) and not exists (
        select 1 from information_schema.columns
        where table_name = 'order_items' and column_name = 'unit_price'
    ) then
        alter table public.order_items rename column price_cents to unit_price;
    end if;
end $$;

alter table public.order_items drop constraint if exists order_items_order_id_fkey;
alter table public.order_items
    add constraint order_items_order_id_fkey foreign key (order_id)
    references public.orders(order_id) on delete cascade;

-- Enforce RLS on order_items
alter table public.order_items enable row level security;

drop policy if exists "Users can select own order_items" on order_items;
create policy "Users can select own order_items" on order_items for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own order_items" on order_items;
create policy "Users can insert own order_items" on order_items for insert with check (auth.uid() = user_id);

-- returns
create table if not exists public.returns (
    id text primary key,
    user_id uuid references auth.users(id) not null,
    order_id text references public.orders(id),
    sku text,
    reason text,
    condition_ok boolean,
    requested_amount int,
    status text,
    created_at timestamptz default now()
);
alter table public.returns enable row level security;

drop policy if exists "Users can select own returns" on returns;
create policy "Users can select own returns" on returns for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own returns" on returns;
create policy "Users can insert own returns" on returns for insert with check (auth.uid() = user_id);

-- approval_tasks
create table if not exists public.approval_tasks (
    id text primary key,
    user_id uuid references auth.users(id) not null,
    return_id text references public.returns(id),
    status text,
    reason text,
    created_at timestamptz default now(),
    updated_at timestamptz
);
alter table public.approval_tasks enable row level security;

drop policy if exists "Users can select own approval_tasks" on approval_tasks;
create policy "Users can select own approval_tasks" on approval_tasks for select using (auth.uid() = user_id);

drop policy if exists "Users can update own approval_tasks" on approval_tasks;
create policy "Users can update own approval_tasks" on approval_tasks for update using (auth.uid() = user_id);


-- agent_events
create table if not exists public.agent_events (
    id text primary key,
    trace_id text,
    event_type text,
    payload jsonb,
    conversation_id text,
    user_id uuid references auth.users(id) not null,
    created_at timestamptz default now()
);
alter table public.agent_events enable row level security;

drop policy if exists "Users can select own agent_events" on agent_events;
create policy "Users can select own agent_events" on agent_events for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own agent_events" on agent_events;
create policy "Users can insert own agent_events" on agent_events for insert with check (auth.uid() = user_id);
