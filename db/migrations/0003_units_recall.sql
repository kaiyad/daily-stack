-- One teaching unit a day, rotated by kind, plus spaced recall of units the
-- reader has already seen.

-- A unit is a concept, an algorithm, a data structure or a pattern. The slot
-- in the edition does not change; only what fills it rotates.
alter table concepts
  add column kind text not null default 'concept'
    check (kind in ('concept','algorithm','data-structure','pattern')),
  -- Hand-written recall question. The answer is the one_liner, which is
  -- already a complete statement of the single fact worth keeping.
  add column recall_q text,
  -- Optional exercise: { "prompt": text, "hint": text, "link": {title,url} }.
  add column practice jsonb;

create index concepts_kind_unscheduled_idx on concepts (kind, id)
  where scheduled_date is null;

-- Frozen copies, exactly like edition_slots: a published edition keeps the
-- wording it shipped with even if the concept is later rewritten.
create table edition_revisions (
  edition_date  date not null references editions(edition_date) on delete cascade,
  concept_id    int not null references concepts(id) on delete restrict,
  interval_days int not null,
  origin_date   date not null,
  slug          text not null,
  title         text not null,
  kind          text not null,
  question      text not null,
  answer        text not null,
  primary key (edition_date, concept_id)
);
create index edition_revisions_date_idx on edition_revisions (edition_date);

create trigger edition_revisions_immutable
  before insert or update or delete on edition_revisions
  for each row execute function enforce_edition_not_frozen();
