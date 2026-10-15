# The Daily Stack

One dated edition a day of software and computer-science information, collated
from Hacker News, Lobsters, GitHub, arXiv, Reddit and ~90 engineering blogs,
changelogs and language feeds.

An edition is **frozen** when it publishes and never changes again. That is what
makes "go back and read day N" mean something: a feed that keeps backfilling has
no stable yesterday. Immutability is enforced by database triggers, not by
application code.

## Shape of an edition

| Section | Slots | What goes in it |
|---|---|---|
| Unit of the Day | 1 | From a fixed curriculum, hand-written, never generated per day |
| Top Reads | 5 | Articles and engineering write-ups |
| Shipped | 4 | Releases, changelogs, cloud and language news |
| Repos | 3 | Projects gaining real traction |
| Discussion | 3 | Threads where the comments are the content |
| AI | 3 | Capped on purpose, or it eats the whole edition |
| Deep | 1 | One paper or long teardown |
| Revision | 0-3 | Recall questions from units published 3, 10 and 30 days ago |

19 entries plus one unit. Roughly a fifteen-minute read.

## Running it

```bash
docker compose up -d          # Postgres 17 on :55432
cp .env.example .env          # then fill in ANTHROPIC_API_KEY if you want summaries
npm install
npm run db:migrate
npm run db:seed               # 109 sources, 84 curriculum units
npm run ingest                # ~25s for every source
npm run candidates            # ranked pool, nothing written - this is the thing to judge
npm run edition               # cut today's edition as a draft
npm run edition -- --freeze   # ...and freeze it
npm run dev                   # http://localhost:3000
npm run doctor                # is any of this still working?
npm test                      # pure-logic tests, no database needed
```

`npm run daily` is ingest + build + freeze in one command, and
`GET /api/cron` with `Authorization: Bearer $CRON_SECRET` is the same job for a
platform scheduler.

## Knowing it still works

A frozen daily cannot show a reader that it has died. The last edition is
immutable, so it looks exactly as final on the day the job breaks as it did the
day it was cut - there is no spinner, no stale timestamp, nothing. That is the
one real hazard of the format, and `npm run doctor` is the answer to it:

```
edition   2026-10-15 (frozen, 19 entries, expected 2026-10-15)
ingest    0.1h ago · 92/93 sources ok
units     53 days scheduled
shelf     12 books scheduled, next 2026-10-16
storage   14 MB · 3% of 500MB
WARN 1 source(s) failing: rachelbythebay
```

It **exits non-zero on a problem**, and the daily workflow runs it as its last
step, so a degradation becomes a failed run that GitHub emails you about. The
line between a warning and a problem:

| Problem (exit 1, HTTP 503) | Warning (exit 0) |
|---|---|
| newest edition more than a day behind | some sources failing |
| last ingest older than the 36h window | under 14 days of units left |
| over a quarter of enabled sources failing | storage past 70% of the cap |
| no units scheduled at all | no books scheduled |
| storage past 90% of `DB_CAP_MB` | |

`GET /api/health` is the same report as JSON, uncached, 200 or 503. It needs no
secret - it exposes aggregates and the slugs of failing feeds, all of which are
already in this repo - so a free uptime pinger can watch it directly.

## Syndication

`/feed.xml` is an Atom feed of the last 20 **frozen** editions, and each entry
carries the whole edition as HTML: a daily that syndicated only headlines would
make a reader open nineteen tabs to use it, and an edition is already a
finished page. Drafts are excluded, unlike everywhere else on the site - a page
corrects itself on the next revalidate, but a feed entry a reader's client has
already fetched is theirs for good, so only a final edition may be syndicated.

`/sitemap.xml` lists every edition, unit and shelf piece, with past editions
marked `never` since they cannot change. `/robots.txt` and
`/manifest.webmanifest` are generated the same way; the manifest makes the site
installable, opening on today.

Everything absolute needs an origin: Vercel supplies it automatically, and
`SITE_URL` overrides it for any other host or a custom domain.

## How the cut is made

`fetch → canonicalise → cluster → filter → score → select → enrich → freeze`

**Canonicalise.** Strip tracking parameters, collapse `github.com/o/r/tree/main`
to the repo, `youtu.be/ID` to the video, AMP suffixes, and so on. This removes
most duplicates before anything else runs.

**Cluster.** Identical canonical URLs merge outright; trigram similarity over
normalised titles catches the same release written up by four outlets. The
result carries a `mention_count`, which is a ranking signal in its own right.

**Filter.** Items that reach us only through an aggregator must show a technical
signal in the title, summary or tags. Aggregators carry a lot of excellent
non-software material and none of it belongs here. Dropped items are printed by
`npm run candidates` so the filter stays auditable.

**Score.** Engagement is percentile-ranked *within each source* first, because
HN points and Reddit upvotes are not the same unit. Then trust weight,
cross-source mentions, recency, minus a penalty for domains featured in the last
seven editions and for sources that dump many items per cycle.

**Select.** Greedy per slot, under three constraints: nothing published twice
ever, no domain twice in a section or more than twice in an edition, and a
per-slot AI ceiling.

**Enrich.** One Claude call per chunk of six entries, over the ~19 survivors
only — never the full candidate pool. Without `ANTHROPIC_API_KEY` the edition
still builds, with feed descriptions instead of summaries.

## Dates

`EDITION_TZ` and `EDITION_FREEZE_HOUR` define when an edition is cut. The window
is the 36 hours ending at the freeze hour; papers get seven days, because a
paper is not news and arXiv announces in batches. An item found late lands in
tomorrow's edition, never backwards into a frozen one.

## Sources

`db/seed/sources.json`. Reddit sources are seeded disabled: the public JSON
endpoints return 403, so they need `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`
(a script-type app) and then `update sources set enabled = true where kind = 'reddit'`.

`npm run ingest` records a per-source error in `sources.last_error` and prints a
failure summary, which is how you prune dead feeds.

## Units, practice and revision

`db/seed/concepts.json` holds the curriculum: 84 hand-written units of four
kinds. Nothing in it is written by a model, which is the only reason the slot
is worth trusting.

**One unit a day, rotating by kind.** Three teaching units and an exercise
every morning is a study course; this is a thing you read with coffee. So the
slot count never changes and only the kind rotates, by weekday:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| concept | algorithm | concept | data structure | concept | algorithm | pattern |

`npm run concepts:schedule 30` pins the next 30 dates following that rotation
and then prints the runway per kind — how many days of each are left before the
curriculum needs refilling. A date whose kind has run dry still gets a unit: an
empty slot is worse than an off-rotation one.

**Practice.** Every algorithm, data structure and pattern carries an exercise —
a coding problem or a small system-design question — with a hint behind a
disclosure. Concepts do not; they are reference, not drill.

**Revision.** A unit comes back as a recall question 3, 10 and 30 days after it
was published: the question is visible, the answer is one click away. Due dates
resolve against the editions that actually exist, so a missed day postpones a
recall rather than swallowing it. Revisions are frozen into `edition_revisions`
at build time, exactly like entries — a past edition keeps the wording it
shipped with. The block first appears on the fourth edition, since nothing is
three days old before then.

**Reading.** `j` / `k` move, `o` opens, `m` marks read and `u` hides what you
have already read - read state is localStorage, per viewer, never synced. The
masthead carries a light/dark toggle; with no explicit choice stored, the
system preference wins.

**Cheatsheet.** `/cheatsheet` is every published unit on one page, filterable
by text and kind (`/` focuses the box). That is the "handy" half of the
product: the daily page is for reading, the cheatsheet is for looking up the
thing you half-remember. `/concepts` redirects there, and `/concepts/<slug>`
is still each unit's own page.

## The Weekly Shelf

One famous book a week, summarised at length — 3500-4500 words on the argument,
the evidence, the objections and what has changed since — published Friday
night at `SHELF_PUBLISH_HOUR` in `EDITION_TZ`. It lives at `/shelf` and
`/shelf/<slug>`, on its own routes rather than inside an edition: an edition is
a fifteen-minute read of nineteen links, and this is not.

```bash
npm run books:seed            # 52 curated titles across 16 genres
npm run shelf:schedule 13     # pin the next 13 Fridays, no genre twice in a row
npm run shelf:status          # what the next Fridays publish, and by which writer
npm run shelf                 # write this Friday's piece as a draft
npm run shelf -- --freeze     # ...and publish it
npm run shelf -- --date 2026-10-16 --freeze
```

**The book is never chosen by the model.** `db/seed/books.json` is the
catalogue; `npm run shelf:schedule` pins titles to Fridays in order, skipping a
genre that ran the week before, so a quarter of the shelf is visible ahead of
time. It is a horizon, not a batch - re-running it does nothing. A book that
has published can never publish again: `shelf_editions.slug` is unique.

### Who writes the piece

Three writers, tried in this order, and the page tells the reader which one ran:

| `provenance` | When it runs | Links are |
|---|---|---|
| `written` | `db/seed/shelf/<slug>.json` exists | trusted - a human checked them |
| `claude` | no file, `ANTHROPIC_API_KEY` set | vetted against the search results |
| `gemini` | no file, no Anthropic key, `GEMINI_API_KEY` set | vetted, or probed if ungrounded |

**`written` is the intended path.** You write the pieces ahead of time - in a
Claude Code session, in batches - and commit them. A file is validated against
the same schema the models are held to, so a malformed one fails before Friday
rather than rendering wrong.

### Refilling the queue

Do this when `shelf:status` shows Fridays that are not `written` - monthly is a
comfortable cadence for a four-piece batch.

**1. See what is missing.**

```bash
npm run shelf:status 13
```

Every line that says anything other than `written` or `published` is a Friday a
model will have to write. A committed file that has gone invalid reads
`INVALID` and counts as a gap, with the offending field named - it would throw
on the night rather than fall back, so it is not cover.

**2. Write the pieces.** In a Claude Code session, in this repo:

> Read `db/seed/shelf/README.md` and `db/seed/shelf/EXAMPLE.json.txt`. Write
> the shelf piece for `<slug>` - look it up in `db/seed/books.json` for the
> title, author, year and the angle to hold. Follow `WRITE_SYSTEM` in
> `src/pipeline/writers/piece.ts` for length, shape and the hard rules. Search
> the web for the concept explainers, reviews including a dissenting one,
> primary sources, an author interview, and anything since revised; use only
> URLs you actually retrieved, and fetch each one to confirm it is the page you
> think it is. Save it as `db/seed/shelf/<slug>.json`.

The links are the reason to do it this way: in a session the URLs are fetched
and read, not recalled, which is a stronger guarantee than either model path
can give on its own.

**3. Check them.**

```bash
npm run shelf:status 13       # the Friday should now read `written`
npm test                      # every committed piece is parsed by the suite
```

**4. Commit them.** This is the step that actually publishes. The Friday job
runs `actions/checkout`, so it only sees pieces that are in the repo - a file
sitting uncommitted on your machine is invisible to it and that Friday will
fall back to a model, or to nothing.

```bash
git add db/seed/shelf/
git commit -m "shelf: write the next four pieces"
git push
```

**5. Optional - read it as a reader would.** The site only renders frozen
pieces, so to see one laid out, freeze it against your local database (never
the hosted one) and open `/shelf`:

```bash
npm run shelf -- --date 2026-10-16            # draft; prints words, links, dropped
npm run shelf -- --date 2026-10-16 --freeze   # local only
npm run dev
```

A frozen row cannot be edited or deleted, so if you want to iterate on the
wording afterwards, rebuild the draft before freezing. To start the local shelf
over, the migration has to be forgotten as well as the tables dropped -
`db:migrate` skips anything already recorded in `schema_migrations`:

```sql
drop table shelf_editions, books cascade;
drop function if exists enforce_shelf_not_frozen() cascade;
delete from schema_migrations where name = '0004_shelf.sql';
```

**The model paths exist so a missed refill still publishes something.** Both
work the same way, in two calls, and that is what makes their links real: the
first call searches and reports what it found, and every URL the API actually
returned is collected from the response - `web_search_tool_result` blocks for
Claude, `url_citation` annotations for Gemini. The second call writes the piece
under a schema citing only that dossier, and `vetLinks` drops any URL not in
the collected set, so a plausible-looking but invented link never reaches the
page. Dropped links are counted in `shelf_editions.links_dropped`.

Gemini's `google_search` tool carries a free monthly search allowance, so the
fallback is grounded in the normal case. If search is unavailable on the key,
the run continues without it and every proposed link is probed for existence
instead (`src/pipeline/writers/probe.ts`) - weaker, since a live page is not
evidence the model read it, but it still catches the invented URL. A link is
dropped only on proof it is gone: 404, 410, or unreachable.

**Nothing to write means nothing published.** No file, no keys - the run warns
and exits without assigning a book, so a dry Friday does not spend a catalogue
slot. A Friday that has already passed with no book scheduled is skipped rather
than back-filled.

A piece freezes exactly like an edition, by a database trigger rather than by
application code: a draft can be rebuilt as often as you like, and after the
freeze no update, un-freeze or delete is possible, nor can the book row it
points at be deleted.

## Deploying free

Three pieces, none of which needs a card:

| Piece | Where | Why |
|---|---|---|
| Postgres | **Neon** free tier (0.5GB) | Scales to zero; the daily job wakes it |
| Web | **Vercel** Hobby | Past editions are static, so almost nothing is served at runtime |
| Daily job | **GitHub Actions** | No function timeout, and it already has the repo |

**Do not run the daily job as a Vercel cron.** A full ingest of ~90 sources runs
close to 30 seconds and the Hobby plan kills a function at 60. `/api/cron` is
kept for platforms with a longer ceiling and for manual triggering;
`.github/workflows/daily.yml` is the path that works.

### Steps

1. **Neon** — create a project, copy the pooled connection string.
2. **Vercel** — import the repo. Set `DATABASE_URL`, `EDITION_TZ`,
   `EDITION_FREEZE_HOUR`, and `ANTHROPIC_API_KEY` if you want summaries. Deploy.
   Set `SITE_URL` as well if the site answers on a custom domain, or the feed
   and sitemap will name the Vercel one.
3. **Seed it once**, from your machine against the hosted database:
   ```bash
   DATABASE_URL='postgres://…neon…' npm run db:migrate
   DATABASE_URL='postgres://…neon…' npm run db:seed
   DATABASE_URL='postgres://…neon…' npm run concepts:schedule 60
   ```
4. **GitHub Actions** — add repository secrets `DATABASE_URL` and
   `ANTHROPIC_API_KEY` (plus `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` if you
   enable Reddit). The workflow already exists; run it once by hand from the
   Actions tab to confirm, then it fires daily at 00:30 UTC.

No deploy hook is needed after a new edition: `/` and `/[date]` revalidate every
five minutes, so a new date appears on its own.

**Migrations are not deployed by the web deploy.** `next build` prerenders every
past edition, which means it reads the schema; Vercel builds on push, while
`db:migrate` runs in the daily job. So when a change adds a migration, apply it
to the hosted database *before* pushing:

```bash
DATABASE_URL='postgres://…neon…' npm run db:migrate
```

Forgetting it used to fail the whole build on one missing table. The revision
query now degrades to an empty block with a warning instead, so a deploy that
runs ahead of its migration loses that section for one cycle rather than taking
the site down.

### The things that actually bite

- **Storage.** Raw items accrue ~2.6KB each at ~1000/day, which is ~900MB/year
  against a 0.5GB cap. `npm run prune` (in the workflow) deletes items past
  `RETENTION_DAYS`. Published editions are unaffected — `edition_slots` holds a
  frozen copy of everything a page renders, and a `restrict` foreign key means a
  published edition cannot be cascade-deleted by housekeeping even by mistake.
  Measured: pruning 941 of 979 items left both editions rendering identically.
- **The cron is UTC.** `vercel.json` and the workflow both say `30 0 * * *`,
  which is 06:00 for the default `Asia/Kolkata`. Change both if you change
  `EDITION_TZ` or `EDITION_FREEZE_HOUR`; nothing links them automatically.
- **GitHub disables scheduled workflows** in a repo with no commits for 60 days.
  A push, or a manual run, resets that. This is exactly the failure `/api/health`
  exists to catch: the site keeps serving a frozen edition and looks fine.
- **Scheduled runs start late**, sometimes by an hour. This does not matter: the
  edition window closed at the freeze hour whenever the job happens to start.
- **Vercel Hobby is non-commercial.** Fine for a personal reader; not for
  anything with ads or a paywall.
- **Not free: Anthropic.** Enrichment runs over ~19 entries a day on
  `claude-haiku-5-5` — on the order of cents a month, but not zero. Omit the key
  and editions build with feed descriptions instead.

## Verified / not verified

Verified end to end on 2026-10-14: migration, seed, ingest of 93 enabled sources
(91 ok: arXiv timed out, rachelbythebay returned 429), candidate ranking,
clustering, edition build, freeze, the database-level refusal to modify or
un-freeze a frozen edition, zero repeated URLs across two editions,
`tsc --noEmit`, `eslint .`, `npm test` (11 tests), `next build`, and every route.

The unit rotation was verified by scheduling 21 days and checking each date
against its weekday. Revision was verified against three synthetic past
editions: a unit published on day N-3 and one published on day N-10 both came
back, one published on day N-2 did not, and the rows landed in
`edition_revisions`. That synthetic history was then removed, so a local
database will show no Revision block until four editions exist.

The shelf was verified on 2026-10-14: migration `0004_shelf.sql`, 52 books
seeded, 8 Fridays scheduled with no genre twice in a row, and — against a
committed fixture piece — `/shelf` and `/shelf/sapiens` prerendering with their
prose, link groups and takeaways intact. The trigger was exercised inside a
transaction: a draft rebuilt, the freeze transition allowed, and then a reword,
an un-freeze, a delete and a delete of the book row all refused (`25006`,
`25006`, `25006`, `23503`). The fixture was removed afterwards, so a local
database shows an empty shelf.

Verified on 2026-10-16, against a local database holding three editions, one of
them a draft: `npm run doctor` reporting correctly and exiting 0, then exiting 1
with a problem once `DB_CAP_MB` was lowered under the real size; `/api/health`
returning 200 and the same figures as JSON; `/feed.xml` parsing as well-formed
Atom with the full edition in each entry and **two** entries, the draft
correctly left out; `/sitemap.xml` listing 62 URLs; `/robots.txt`,
`/manifest.webmanifest` and `/icon.svg` served; the dated page carrying its own
canonical and Open Graph URL; `tsc --noEmit`, `eslint .`, `npm test`
(56 tests) and `next build`, which prerenders the feed, sitemap, robots and
manifest as static and leaves only `/api/*` dynamic.

The thresholds themselves are pure logic in `src/lib/health.ts`, covered by
`src/lib/health.test.ts` at each boundary - a day behind versus two, 36 hours
versus 37, a quarter of the feeds versus a quarter plus one.

**Not verified: the theme toggle and hide-read in a browser.** Both are
client-only and were checked by their rendered markup and by the stores they
read, not by clicking them.

**Not verified: either model call.** No `ANTHROPIC_API_KEY` was available, so
neither `src/pipeline/enrich.ts` nor `src/pipeline/shelf.ts` has ever executed
against the API. Editions here were built on the no-key path, which falls back
to feed descriptions; no shelf piece has been generated at all. Both follow the
current SDK (`messages.parse` with `zodOutputFormat`, and for the shelf the
`web_search_20260209` server tool), but treat the first run with a key as
untested — in particular the length of the piece, whether the search dossier is
rich enough that few links get dropped, and the real cost per piece.
