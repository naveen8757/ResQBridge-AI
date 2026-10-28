-- ResQBridge AI core schema and workflow functions.
-- Apply to the intended Supabase project after reviewing/backing up existing data.
-- This migration is designed to be repeatable for a fresh project and additive for
-- most existing project tables. Review existing column types before applying to a mature database.

create extension if not exists pgcrypto;

-- 1) User profiles and roles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'community' check (role in ('administrator','coordinator','responder','community')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_resqbridge_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_resqbridge_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_resqbridge on auth.users;
create trigger on_auth_user_created_resqbridge
after insert on auth.users
for each row execute procedure public.handle_new_resqbridge_user();

-- Create community profiles for accounts that existed before this migration.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email,''), '@', 1))
from auth.users u
on conflict (id) do nothing;

create or replace function public.current_resqbridge_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_resqbridge_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_resqbridge_role() in ('administrator','coordinator','responder'), false)
$$;

create or replace function public.is_resqbridge_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_resqbridge_role() in ('administrator','coordinator'), false)
$$;

-- 2) Disaster reports
create table if not exists public.disaster_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null,
  disaster_type text not null default 'Other',
  description text not null default '',
  location_text text not null default '',
  latitude double precision,
  longitude double precision,
  severity text not null default 'Medium',
  status text not null default 'Submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.disaster_reports add column if not exists client_id uuid;
alter table public.disaster_reports add column if not exists user_id uuid references auth.users(id) on delete set null default auth.uid();
alter table public.disaster_reports add column if not exists title text not null default 'Untitled report';
alter table public.disaster_reports add column if not exists disaster_type text not null default 'Other';
alter table public.disaster_reports add column if not exists description text not null default '';
alter table public.disaster_reports add column if not exists location_text text not null default '';
alter table public.disaster_reports add column if not exists latitude double precision;
alter table public.disaster_reports add column if not exists longitude double precision;
alter table public.disaster_reports add column if not exists severity text not null default 'Medium';
alter table public.disaster_reports add column if not exists status text not null default 'Submitted';
alter table public.disaster_reports add column if not exists created_at timestamptz not null default now();
alter table public.disaster_reports add column if not exists updated_at timestamptz not null default now();
create unique index if not exists disaster_reports_client_id_uidx on public.disaster_reports(client_id) where client_id is not null;
create index if not exists disaster_reports_created_at_idx on public.disaster_reports(created_at desc);
create index if not exists disaster_reports_status_severity_idx on public.disaster_reports(status, severity);

-- 3) Resource inventory and assignments
create table if not exists public.response_resources (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  resource_name text not null,
  resource_type text not null default 'Other',
  quantity integer not null default 0 check (quantity >= 0),
  quantity_allocated integer not null default 0 check (quantity_allocated >= 0),
  location_text text not null default '',
  availability text not null default 'Available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.response_resources add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.response_resources add column if not exists resource_name text not null default 'Unnamed resource';
alter table public.response_resources add column if not exists resource_type text not null default 'Other';
alter table public.response_resources add column if not exists quantity integer not null default 0;
alter table public.response_resources add column if not exists quantity_allocated integer not null default 0;
alter table public.response_resources add column if not exists location_text text not null default '';
alter table public.response_resources add column if not exists availability text not null default 'Available';
alter table public.response_resources add column if not exists created_at timestamptz not null default now();
alter table public.response_resources add column if not exists updated_at timestamptz not null default now();
create index if not exists response_resources_availability_idx on public.response_resources(availability, quantity);

create table if not exists public.resource_assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.disaster_reports(id) on delete cascade,
  resource_id uuid not null references public.response_resources(id) on delete restrict,
  quantity_assigned integer not null check (quantity_assigned > 0),
  notes text not null default '',
  status text not null default 'Assigned',
  assigned_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resource_assignments add column if not exists report_id uuid references public.disaster_reports(id) on delete cascade;
alter table public.resource_assignments add column if not exists resource_id uuid references public.response_resources(id) on delete restrict;
alter table public.resource_assignments add column if not exists quantity_assigned integer not null default 1;
alter table public.resource_assignments add column if not exists notes text not null default '';
alter table public.resource_assignments add column if not exists status text not null default 'Assigned';
alter table public.resource_assignments add column if not exists assigned_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.resource_assignments add column if not exists created_at timestamptz not null default now();
alter table public.resource_assignments add column if not exists updated_at timestamptz not null default now();
create index if not exists resource_assignments_report_idx on public.resource_assignments(report_id, created_at desc);
create index if not exists resource_assignments_resource_idx on public.resource_assignments(resource_id, created_at desc);

-- Audit logging is used by the atomic assignment function below.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Atomic allocation: locks the inventory row, validates availability, then writes both records.
create or replace function public.assign_resource(
  p_report_id uuid,
  p_resource_id uuid,
  p_quantity integer,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.response_resources%rowtype;
  v_assignment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_resqbridge_coordinator() then raise exception 'Coordinator or administrator role required to assign resources'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be a positive whole number'; end if;
  if not exists (select 1 from public.disaster_reports where id = p_report_id) then raise exception 'Selected disaster report was not found'; end if;

  select * into v_resource from public.response_resources where id = p_resource_id for update;
  if not found then raise exception 'Selected resource was not found'; end if;
  if lower(coalesce(v_resource.availability, '')) not in ('available','partially allocated') then
    raise exception 'Resource is not marked available';
  end if;
  if v_resource.quantity < p_quantity then
    raise exception 'Insufficient stock: % available, % requested', v_resource.quantity, p_quantity;
  end if;

  -- Idempotency guard against a rapid duplicate submit of the same payload.
  if exists (
    select 1 from public.resource_assignments ra
    where ra.report_id = p_report_id
      and ra.resource_id = p_resource_id
      and ra.quantity_assigned = p_quantity
      and coalesce(ra.notes, '') = coalesce(p_notes, '')
      and ra.assigned_by = auth.uid()
      and ra.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'A matching assignment was just submitted. Refresh assignment history before retrying.';
  end if;

  update public.response_resources
  set quantity = quantity - p_quantity,
      quantity_allocated = coalesce(quantity_allocated, 0) + p_quantity,
      availability = case when quantity - p_quantity <= 0 then 'Allocated' else 'Available' end,
      updated_at = now()
  where id = p_resource_id;

  insert into public.resource_assignments(report_id, resource_id, quantity_assigned, notes, status, assigned_by)
  values (p_report_id, p_resource_id, p_quantity, coalesce(p_notes, ''), 'Assigned', auth.uid())
  returning id into v_assignment_id;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, details)
  values (auth.uid(), 'resource_assignment', v_assignment_id, 'created', jsonb_build_object('report_id', p_report_id, 'resource_id', p_resource_id, 'quantity', p_quantity));

  return v_assignment_id;
end;
$$;

-- 4) Risk assessments
create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  disaster_report_id uuid references public.disaster_reports(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  disaster_type text not null default 'Other',
  severity text not null default 'Medium',
  conditions text not null default 'Concerning',
  risk_level text not null default 'Medium',
  risk_score integer not null default 0,
  weather_score integer not null default 0,
  weather_location text,
  weather_timestamp text,
  weather_retrieved_at timestamptz,
  weather_precipitation numeric,
  weather_wind_speed numeric,
  weather_source text,
  assessment_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.risk_assessments add column if not exists disaster_report_id uuid references public.disaster_reports(id) on delete set null;
alter table public.risk_assessments add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.risk_assessments add column if not exists disaster_type text not null default 'Other';
alter table public.risk_assessments add column if not exists severity text not null default 'Medium';
alter table public.risk_assessments add column if not exists conditions text not null default 'Concerning';
alter table public.risk_assessments add column if not exists risk_level text not null default 'Medium';
alter table public.risk_assessments add column if not exists risk_score integer not null default 0;
alter table public.risk_assessments add column if not exists weather_score integer not null default 0;
alter table public.risk_assessments add column if not exists weather_location text;
alter table public.risk_assessments add column if not exists weather_timestamp text;
alter table public.risk_assessments add column if not exists weather_retrieved_at timestamptz;
alter table public.risk_assessments add column if not exists weather_precipitation numeric;
alter table public.risk_assessments add column if not exists weather_wind_speed numeric;
alter table public.risk_assessments add column if not exists weather_source text;
alter table public.risk_assessments add column if not exists assessment_reasons jsonb not null default '[]'::jsonb;
alter table public.risk_assessments add column if not exists created_at timestamptz not null default now();
create index if not exists risk_assessments_report_idx on public.risk_assessments(disaster_report_id, created_at desc);

-- 5) Recovery tracking
create table if not exists public.recovery_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null default '',
  description text not null default '',
  status text not null default 'Submitted',
  disaster_report_id uuid references public.disaster_reports(id) on delete set null,
  progress integer not null default 0 check (progress between 0 and 100),
  priority text not null default 'Medium',
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recovery_tasks add column if not exists title text not null default 'Untitled recovery task';
alter table public.recovery_tasks add column if not exists location text not null default '';
alter table public.recovery_tasks add column if not exists description text not null default '';
alter table public.recovery_tasks add column if not exists status text not null default 'Submitted';
alter table public.recovery_tasks add column if not exists disaster_report_id uuid references public.disaster_reports(id) on delete set null;
alter table public.recovery_tasks add column if not exists progress integer not null default 0;
alter table public.recovery_tasks add column if not exists priority text not null default 'Medium';
alter table public.recovery_tasks add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.recovery_tasks add column if not exists due_at timestamptz;
alter table public.recovery_tasks add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.recovery_tasks add column if not exists created_at timestamptz not null default now();
alter table public.recovery_tasks add column if not exists updated_at timestamptz not null default now();
create index if not exists recovery_tasks_status_idx on public.recovery_tasks(status, due_at);

-- 6) Community alert drafts and reviewer access
create table if not exists public.community_alerts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.disaster_reports(id) on delete set null,
  title text not null,
  message text not null,
  disaster_type text not null default 'Other',
  severity text not null default 'High',
  location_text text,
  status text not null default 'Pending Approval',
  source_verified boolean not null default false,
  evaluation_reason text not null default 'Automatically drafted from a submitted report; not independently verified.',
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_alerts add column if not exists report_id uuid references public.disaster_reports(id) on delete set null;
alter table public.community_alerts add column if not exists title text not null default 'Disaster alert draft';
alter table public.community_alerts add column if not exists message text not null default '';
alter table public.community_alerts add column if not exists disaster_type text not null default 'Other';
alter table public.community_alerts add column if not exists severity text not null default 'High';
alter table public.community_alerts add column if not exists location_text text;
alter table public.community_alerts add column if not exists status text not null default 'Pending Approval';
alter table public.community_alerts add column if not exists source_verified boolean not null default false;
alter table public.community_alerts add column if not exists evaluation_reason text not null default 'Automatically drafted; not independently verified.';
alter table public.community_alerts add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.community_alerts add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.community_alerts add column if not exists reviewed_at timestamptz;
alter table public.community_alerts add column if not exists created_at timestamptz not null default now();
alter table public.community_alerts add column if not exists updated_at timestamptz not null default now();
create index if not exists community_alerts_status_idx on public.community_alerts(status, created_at desc);
create unique index if not exists community_alerts_report_once_uidx on public.community_alerts(report_id) where report_id is not null;

create table if not exists public.community_alert_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- These notification tables must exist before the alert-review function can run.
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  alert_id uuid references public.community_alerts(id) on delete set null,
  email_status text not null default 'not_queued',
  email_claimed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.review_community_alert(p_alert_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (public.is_resqbridge_coordinator() or exists (select 1 from public.community_alert_reviewers r where r.user_id = auth.uid())) then
    raise exception 'Authorized alert reviewer required';
  end if;
  if p_decision not in ('Approved','Rejected') then raise exception 'Decision must be Approved or Rejected'; end if;

  update public.community_alerts
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_alert_id and status = 'Pending Approval';
  if not found then raise exception 'Alert not found or it has already been reviewed'; end if;

  insert into public.audit_logs(actor_id, entity_type, entity_id, action, details)
  values (auth.uid(), 'community_alert', p_alert_id, 'reviewed', jsonb_build_object('decision', p_decision));

  -- In-app notifications are created only for verified, approved drafts.
  -- Email delivery remains a separate explicitly configured server-side operation.
  if p_decision = 'Approved' then
    insert into public.user_notifications(user_id, title, message, notification_type, alert_id, email_status)
    select p.id,
           'Verified community alert',
           a.title || ' — ' || a.message,
           'community_alert',
           a.id,
           case when coalesce(pref.email_enabled, false) then 'queued' else 'skipped' end
    from public.community_alerts a
    cross join public.profiles p
    left join public.user_notification_preferences pref on pref.user_id = p.id
    where a.id = p_alert_id and a.status = 'Approved' and a.source_verified = true
    on conflict (user_id, alert_id, notification_type) where alert_id is not null do nothing;
  end if;
end;
$$;

create or replace function public.verify_community_alert(p_alert_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_resqbridge_coordinator() then raise exception 'Coordinator or administrator role required to verify sources'; end if;
  update public.community_alerts
  set source_verified = p_verified, updated_at = now()
  where id = p_alert_id and status = 'Pending Approval';
  if not found then raise exception 'Pending alert draft not found'; end if;
  insert into public.audit_logs(actor_id, entity_type, entity_id, action, details)
  values (auth.uid(), 'community_alert', p_alert_id, 'source_verification_changed', jsonb_build_object('source_verified', p_verified));
end;
$$;

-- 7) Notifications and user email preferences
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  alert_id uuid references public.community_alerts(id) on delete set null,
  email_status text not null default 'not_queued',
  email_claimed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_notifications add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_notifications add column if not exists title text not null default 'Notification';
alter table public.user_notifications add column if not exists message text not null default '';
alter table public.user_notifications add column if not exists notification_type text not null default 'info';
alter table public.user_notifications add column if not exists alert_id uuid references public.community_alerts(id) on delete set null;
alter table public.user_notifications add column if not exists email_status text not null default 'not_queued';
alter table public.user_notifications add column if not exists email_claimed_at timestamptz;
alter table public.user_notifications add column if not exists read_at timestamptz;
alter table public.user_notifications add column if not exists created_at timestamptz not null default now();
create unique index if not exists user_notifications_alert_unique_idx on public.user_notifications(user_id, alert_id, notification_type) where alert_id is not null;
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 8) Environmental weather-model observations
create table if not exists public.environmental_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  location text not null,
  latitude double precision not null,
  longitude double precision not null,
  temperature numeric,
  relative_humidity numeric,
  precipitation numeric,
  wind_speed numeric,
  weather_code integer,
  observation_time text,
  retrieved_at timestamptz not null default now(),
  source text not null default 'Open-Meteo weather model',
  created_at timestamptz not null default now()
);
create index if not exists environmental_observations_location_time_idx on public.environmental_observations(location, retrieved_at desc);

-- 9) Agricultural impact reports. Area is self-reported unless separately verified.
create table if not exists public.agricultural_impact_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  location text not null,
  crop_type text not null,
  affected_hectares numeric not null check (affected_hectares > 0),
  impact_severity text not null default 'Moderate',
  rain_related text not null default 'Unknown',
  description text not null default '',
  estimate_method text not null default 'Community-reported estimate',
  review_status text not null default 'Pending Review',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agricultural_impact_location_idx on public.agricultural_impact_reports(location, created_at desc);

-- 10) Audit log
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Trigger: create alert drafts for high-severity reports. Drafts are explicitly unverified.
create or replace function public.create_resqbridge_alert_draft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if upper(coalesce(new.severity,'')) in ('HIGH','CRITICAL') then
    insert into public.community_alerts(report_id, title, message, disaster_type, severity, location_text, status, source_verified, evaluation_reason, created_by)
    values (
      new.id,
      'Review required: ' || new.title,
      'A community member reported an incident. This draft has not been independently verified. Review the report and official sources before approving any public notice.',
      new.disaster_type,
      new.severity,
      new.location_text,
      'Pending Approval',
      false,
      'Automatically drafted from a user-submitted report; not independently verified.',
      auth.uid()
    )
    on conflict (report_id) where report_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists resqbridge_create_alert_draft_after_report on public.disaster_reports;
create trigger resqbridge_create_alert_draft_after_report
after insert on public.disaster_reports
for each row execute procedure public.create_resqbridge_alert_draft();

-- Trigger: notify current coordinators about new reports.
create or replace function public.notify_resqbridge_staff_new_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_notifications(user_id, title, message, notification_type, email_status)
  select p.id,
         'New disaster report submitted',
         coalesce(new.title, 'A disaster report') || ' was submitted for ' || coalesce(new.location_text, 'an unspecified location') || '.',
         'incident',
         'not_queued'
  from public.profiles p
  where p.role in ('administrator','coordinator') and p.id is distinct from new.user_id;
  return new;
end;
$$;

drop trigger if exists resqbridge_notify_staff_after_report on public.disaster_reports;
create trigger resqbridge_notify_staff_after_report
after insert on public.disaster_reports
for each row execute procedure public.notify_resqbridge_staff_new_report();

create or replace function public.notify_resqbridge_recovery_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status and new.assigned_to is not null then
    insert into public.user_notifications(user_id, title, message, notification_type, email_status)
    values (new.assigned_to, 'Recovery task status updated', coalesce(new.title, 'A recovery task') || ' is now ' || coalesce(new.status, 'updated') || '.', 'recovery', 'not_queued');
  end if;
  return new;
end;
$$;

drop trigger if exists resqbridge_notify_recovery_update on public.recovery_tasks;
create trigger resqbridge_notify_recovery_update
after update of status on public.recovery_tasks
for each row execute procedure public.notify_resqbridge_recovery_status();

-- 10) Row-level security policies
alter table public.profiles enable row level security;
alter table public.disaster_reports enable row level security;
alter table public.response_resources enable row level security;
alter table public.resource_assignments enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.recovery_tasks enable row level security;
alter table public.community_alerts enable row level security;
alter table public.community_alert_reviewers enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.environmental_observations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.agricultural_impact_reports enable row level security;

-- Profiles: users see their own profile; staff may view workspace profiles.
drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff on public.profiles for select to authenticated
using (id = auth.uid() or public.is_resqbridge_staff());
drop policy if exists profiles_update_self_no_role_change on public.profiles;
-- Profile role changes are performed through trusted administrative SQL only.
drop policy if exists profiles_admin_update on public.profiles;
-- No client-side profile update policy is granted; this prevents self-promotion.

-- Reports are visible to authenticated responders; creators may insert their own reports.
drop policy if exists disaster_reports_read_authenticated on public.disaster_reports;
create policy disaster_reports_read_authenticated on public.disaster_reports for select to authenticated using (true);
drop policy if exists disaster_reports_insert_owner on public.disaster_reports;
create policy disaster_reports_insert_owner on public.disaster_reports for insert to authenticated
with check (user_id is null or user_id = auth.uid());
drop policy if exists disaster_reports_update_staff on public.disaster_reports;
create policy disaster_reports_update_staff on public.disaster_reports for update to authenticated
using (public.is_resqbridge_staff()) with check (public.is_resqbridge_staff());

-- Resources: authenticated users can view inventory; staff manage it.
drop policy if exists response_resources_read_authenticated on public.response_resources;
create policy response_resources_read_authenticated on public.response_resources for select to authenticated using (true);
drop policy if exists response_resources_insert_staff on public.response_resources;
create policy response_resources_insert_staff on public.response_resources for insert to authenticated with check (public.is_resqbridge_coordinator());
drop policy if exists response_resources_update_staff on public.response_resources;
create policy response_resources_update_staff on public.response_resources for update to authenticated using (public.is_resqbridge_coordinator()) with check (public.is_resqbridge_coordinator());

-- Assignments are visible to staff and only created through the checked RPC.
drop policy if exists resource_assignments_select_staff on public.resource_assignments;
create policy resource_assignments_select_staff on public.resource_assignments for select to authenticated using (public.is_resqbridge_staff());
drop policy if exists resource_assignments_insert_staff on public.resource_assignments;
create policy resource_assignments_insert_staff on public.resource_assignments for insert to authenticated with check (public.is_resqbridge_coordinator());

-- Risk results: owner or staff may read; signed-in user may save their own.
drop policy if exists risk_assessments_select_owner_or_staff on public.risk_assessments;
create policy risk_assessments_select_owner_or_staff on public.risk_assessments for select to authenticated using (created_by = auth.uid() or public.is_resqbridge_staff());
drop policy if exists risk_assessments_insert_owner on public.risk_assessments;
create policy risk_assessments_insert_owner on public.risk_assessments for insert to authenticated with check (created_by = auth.uid() or created_by is null);

-- Recovery tasks: signed-in users can read; only coordinators/admins manage progress.
drop policy if exists recovery_tasks_read_authenticated on public.recovery_tasks;
create policy recovery_tasks_read_authenticated on public.recovery_tasks for select to authenticated using (true);
drop policy if exists recovery_tasks_insert_coordinator on public.recovery_tasks;
create policy recovery_tasks_insert_coordinator on public.recovery_tasks for insert to authenticated with check (public.is_resqbridge_coordinator());
drop policy if exists recovery_tasks_update_coordinator on public.recovery_tasks;
create policy recovery_tasks_update_coordinator on public.recovery_tasks for update to authenticated using (public.is_resqbridge_coordinator()) with check (public.is_resqbridge_coordinator());

-- Only staff can review drafts. Verified/approved alerts can be viewed by signed-in users.
drop policy if exists community_alerts_read_public_verified_or_staff on public.community_alerts;
create policy community_alerts_read_public_verified_or_staff on public.community_alerts for select to authenticated using ((status = 'Approved' and source_verified = true) or public.is_resqbridge_coordinator() or exists (select 1 from public.community_alert_reviewers r where r.user_id = auth.uid()));
drop policy if exists community_alert_reviewers_self_read on public.community_alert_reviewers;
create policy community_alert_reviewers_self_read on public.community_alert_reviewers for select to authenticated using (user_id = auth.uid() or public.is_resqbridge_coordinator());
drop policy if exists community_alert_reviewers_admin_manage on public.community_alert_reviewers;
create policy community_alert_reviewers_admin_manage on public.community_alert_reviewers for all to authenticated using (public.is_resqbridge_coordinator()) with check (public.is_resqbridge_coordinator());

-- Notifications are private to their recipient.
drop policy if exists user_notifications_read_own on public.user_notifications;
create policy user_notifications_read_own on public.user_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own on public.user_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notification_preferences_read_own on public.user_notification_preferences;
create policy notification_preferences_read_own on public.user_notification_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists notification_preferences_insert_own on public.user_notification_preferences;
create policy notification_preferences_insert_own on public.user_notification_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists notification_preferences_update_own on public.user_notification_preferences;
create policy notification_preferences_update_own on public.user_notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Weather history is visible to its creator and staff. A signed-in user may save an observation only for themselves.
drop policy if exists environmental_observations_read_owner_or_staff on public.environmental_observations;
create policy environmental_observations_read_owner_or_staff on public.environmental_observations for select to authenticated using (user_id = auth.uid() or public.is_resqbridge_staff());
drop policy if exists environmental_observations_insert_owner on public.environmental_observations;
create policy environmental_observations_insert_owner on public.environmental_observations for insert to authenticated with check (user_id = auth.uid() or user_id is null);

drop policy if exists audit_logs_select_staff on public.audit_logs;
create policy audit_logs_select_staff on public.audit_logs for select to authenticated using (public.is_resqbridge_staff());

drop policy if exists agricultural_impact_read_owner_or_staff on public.agricultural_impact_reports;
create policy agricultural_impact_read_owner_or_staff on public.agricultural_impact_reports for select to authenticated
using (user_id = auth.uid() or public.is_resqbridge_staff());
drop policy if exists agricultural_impact_insert_owner on public.agricultural_impact_reports;
create policy agricultural_impact_insert_owner on public.agricultural_impact_reports for insert to authenticated
with check (user_id = auth.uid() or user_id is null);
drop policy if exists agricultural_impact_update_staff on public.agricultural_impact_reports;
create policy agricultural_impact_update_staff on public.agricultural_impact_reports for update to authenticated
using (public.is_resqbridge_coordinator()) with check (public.is_resqbridge_coordinator());

-- Restrict privileged workflow RPCs; each function also checks roles internally.
revoke all on function public.assign_resource(uuid, uuid, integer, text) from public, anon;
revoke all on function public.review_community_alert(uuid, text) from public, anon;
revoke all on function public.verify_community_alert(uuid, boolean) from public, anon;
grant execute on function public.assign_resource(uuid, uuid, integer, text) to authenticated;
grant execute on function public.review_community_alert(uuid, text) to authenticated;
grant execute on function public.verify_community_alert(uuid, boolean) to authenticated;
