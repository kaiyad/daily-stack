-- The Weekly Shelf: one book a week, read in depth, published Friday night.
--
-- Deliberately parallel to editions and not part of them. An edition is a
-- fifteen-minute read of nineteen links; a shelf piece is four thousand words
-- about one book. Sharing a table would mean one of the two renders wrong.

-- A curated catalogue, pinned to Fridays in order, exactly like concepts.
-- Nothing here is generated: the model writes about the book it is given.
create table books (
  id             serial primary key,
  slug           text not null unique,
  title          text not null,
  author         text not null,
  year           int,
  genre          text not null,
  pitch          text not null,
  scheduled_date date unique
);
create index books_unscheduled_idx on books (genre, id) where scheduled_date is null;

-- One row per published week, holding a frozen copy of everything the page
-- renders: the catalogue row can be re-worded later, the piece cannot.
create table shelf_editions (
  shelf_date    date primary key,
  book_id       int not null references books(id) on delete restrict,
  status        text not null default 'draft' check (status in ('draft','frozen')),
  -- How the piece came to exist. A reader is told, because "written ahead of
  -- time" and "generated on the night" are not the same claim.
  provenance    text not null check (provenance in ('written','claude','gemini')),
  slug          text not null unique,
  title         text not null,
  author        text not null,
  year          int,
  genre         text not null,
  headline      text not null,
  dek           text not null,
  -- [{ "heading": text, "body_md": text }], in reading order.
  sections      jsonb not null default '[]',
  takeaways     text[] not null default '{}',
  -- [{ "title": text, "url": text, "note": text, "kind": text }]. Every url
  -- here was returned by a real web search during the build - see
  -- src/pipeline/shelf.ts.
  context_links jsonb not null default '[]',
  sources       jsonb not null default '[]',
  word_count    int not null default 0,
  searches      int not null default 0,
  links_dropped int not null default 0,
  model         text,
  built_at      timestamptz not null default now(),
  frozen_at     timestamptz
);
create index shelf_editions_published_idx on shelf_editions (shelf_date desc)
  where status = 'frozen';

-- Immutability, enforced where application code cannot bypass it. A draft may
-- be rebuilt as often as you like; the freeze is one-way and final.
create or replace function enforce_shelf_not_frozen() returns trigger
language plpgsql as $$
begin
  if old.status = 'frozen' then
    if tg_op = 'DELETE' then
      raise exception 'shelf edition % is frozen and cannot be deleted', old.shelf_date
        using errcode = 'read_only_sql_transaction';
    elsif new.status <> 'frozen' then
      raise exception 'shelf edition % cannot be un-frozen', old.shelf_date
        using errcode = 'read_only_sql_transaction';
    else
      raise exception 'shelf edition % is frozen and cannot be modified', old.shelf_date
        using errcode = 'read_only_sql_transaction';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger shelf_editions_immutable
  before update or delete on shelf_editions
  for each row execute function enforce_shelf_not_frozen();
