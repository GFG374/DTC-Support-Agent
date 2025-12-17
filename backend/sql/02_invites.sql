-- Admin invites table + RPC for atomic redeem

-- Table: admin_invites
create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  email text,
  status text not null default 'unused' check (status in ('unused','used','revoked','expired')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  expires_at timestamptz,
  used_by uuid references auth.users(id),
  used_at timestamptz
);

-- RLS: fully deny to non-service/non-admin (admin ops go through service role)
alter table public.admin_invites enable row level security;

drop policy if exists "deny all admin_invites" on public.admin_invites;
create policy "deny all admin_invites"
  on public.admin_invites
  using (false);

-- RPC: atomic redeem + elevate role
create or replace function public.redeem_invite_code(
  p_user_id uuid,
  p_email text,
  p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv record;
begin
  select * into inv
  from public.admin_invites
  where code_hash = p_code_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if inv.status = 'used' then
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;

  if inv.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;

  if inv.expires_at is not null and now() >= inv.expires_at then
    update public.admin_invites
      set status = 'expired', used_at = now(), used_by = p_user_id
      where id = inv.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if inv.email is not null and (p_email is null or lower(inv.email) <> lower(p_email)) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  update public.admin_invites
    set status = 'used',
        used_by = p_user_id,
        used_at = now()
    where id = inv.id;

  -- Elevate role to admin
  update public.user_profiles
    set role = 'admin'
    where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'role', 'admin');
exception when others then
  -- rollback and surface generic error
  raise;
end;
$$;
