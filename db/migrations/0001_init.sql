-- Daily Stack: dated, immutable editions of software/CS information.

create extension if not exists pg_trgm;

create table sources (
  id             serial primary key,
  slug           text not null unique,
  name           text not null,
  kind           text not null check (kind in ('hn','rss','github','lobsters','arxiv','reddit')),
  feed_url       text,
  homepage       text,
  trust_weight   real not null default 1.0,
  slot_hint      text,
  tags           text[] not null default '{}',
  enabled        boolean not null default true,
  last_fetched_at timestamptz,
  last_error     text
);

create table items (
  id             bigserial primary key,
  source_id      int not null references sources(id) on delete cascade,
  external_id    text,
  url_canonical  text not null,
  url_hash       text not null,
  title          text not null,
  author         text,
  summary_raw    text,
  discussion_url text,
  published_at   timestamptz not null,
  ingested_at    timestamptz not null default now(),
  raw            jsonb not null default '{}',
  unique (source_id, url_hash)
);
create index items_published_idx on items (published_at desc);
create index items_ingested_idx on items (ingested_at desc);
create index items_url_hash_idx on items (url_hash);
create index items_title_trgm_idx on items using gin (title gin_trgm_ops);

-- Latest signal snapshot per item. Upserted on every refetch.
create table item_signals (
  item_id      bigint primary key references items(id) on delete cascade,
  points       int not null default 0,
  comments     int not null default 0,
  stars_total  int,
  stars_delta  int,
  captured_at  timestamptz not null default now()
);

-- A cluster is one story, however many sources carried it.
create table clusters (
  id              bigserial primary key,
  primary_item_id bigint not null references items(id) on delete cascade,
  title           text not null,
  url_canonical   text not null,
  domain          text not null,
  mention_count   int not null default 1,
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index clusters_title_trgm_idx on clusters using gin (title gin_trgm_ops);
create index clusters_seen_idx on clusters (first_seen_at desc);

create table cluster_items (
  cluster_id bigint not null references clusters(id) on delete cascade,
  item_id    bigint not null references items(id) on delete cascade,
  primary key (cluster_id, item_id)
);
-- An item belongs to exactly one cluster.
create unique index cluster_items_item_uniq on cluster_items (item_id);

create table concepts (
  id             serial primary key,
  slug           text not null unique,
  title          text not null,
  category       text not null,
  one_liner      text not null,
  body_md        text not null,
  links          jsonb not null default '[]',
  tags           text[] not null default '{}',
  difficulty     text,
  scheduled_date date unique
);
create index concepts_unscheduled_idx on concepts (id) where scheduled_date is null;

create table editions (
  edition_date date primary key,
  status       text not null default 'draft' check (status in ('draft','frozen')),
  concept_id   int references concepts(id),
  entry_count  int not null default 0,
  built_at     timestamptz not null default now(),
  frozen_at    timestamptz
);

-- Frozen copies of the facts. An edition never changes after it freezes, even
-- if the underlying cluster is later re-titled or re-scored.
create table edition_slots (
  edition_date   date not null references editions(edition_date) on delete cascade,
  slot           text not null,
  rank           int not null,
  cluster_id     bigint not null references clusters(id) on delete cascade,
  title          text not null,
  url            text not null,
  domain         text not null,
  source_label   text not null,
  summary        text,
  why            text,
  tags           text[] not null default '{}',
  score          real not null,
  mention_count  int not null default 1,
  discussion_url text,
  points         int,
  comments       int,
  published_at   timestamptz,
  primary key (edition_date, slot, rank),
  unique (edition_date, cluster_id)
);

create table fetch_runs (
  id          bigserial primary key,
  source_id   int references sources(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  items_seen  int not null default 0,
  items_new   int not null default 0,
  error       text
);
create index fetch_runs_started_idx on fetch_runs (started_at desc);

-- Immutability, enforced where it cannot be bypassed by application code.
create or replace function enforce_edition_not_frozen() returns trigger
language plpgsql as $$
declare
  d date := coalesce(new.edition_date, old.edition_date);
  st text;
begin
  select status into st from editions where edition_date = d;
  if st = 'frozen' then
    raise exception 'edition % is frozen and cannot be modified', d
      using errcode = 'read_only_sql_transaction';
  end if;
  return coalesce(new, old);
end $$;

create trigger edition_slots_immutable
  before insert or update or delete on edition_slots
  for each row execute function enforce_edition_not_frozen();

create or replace function enforce_edition_no_unfreeze() returns trigger
language plpgsql as $$
begin
  if old.status = 'frozen' and new.status <> 'frozen' then
    raise exception 'edition % cannot be un-frozen', old.edition_date
      using errcode = 'read_only_sql_transaction';
  end if;
  if old.status = 'frozen' and new.concept_id is distinct from old.concept_id then
    raise exception 'edition % is frozen; concept cannot change', old.edition_date
      using errcode = 'read_only_sql_transaction';
  end if;
  return new;
end $$;

create trigger editions_no_unfreeze
  before update on editions
  for each row execute function enforce_edition_no_unfreeze();
