create table if not exists crm_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists crm_operating_contexts (
  context_id bigserial primary key,
  platform_tenant_id text not null,
  accounts_organization_id text not null,
  display_name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_tenant_id, accounts_organization_id)
);

create table if not exists crm_platform_links (
  link_id bigserial primary key,
  context_id bigint references crm_operating_contexts(context_id)
    on delete cascade,
  service_slug text not null
    check (service_slug in ('pyrosa-platform', 'pyrosa-iam', 'pyrosa-accounts')),
  external_ref text not null,
  purpose text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_slug, external_ref, purpose)
);

create table if not exists crm_audit_events (
  audit_event_id bigserial primary key,
  context_id bigint references crm_operating_contexts(context_id)
    on delete set null,
  actor_subject text,
  actor_source text not null default 'pyrosa-iam',
  event_type text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_audit_events_context_created_idx
  on crm_audit_events (context_id, created_at desc);

create index if not exists crm_audit_events_entity_idx
  on crm_audit_events (entity_type, entity_id);

insert into crm_schema_migrations (version)
values ('0001_crm_core')
on conflict (version) do nothing;
