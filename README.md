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
| Concept of the Day | 1 | From a fixed curriculum, hand-written, never generated per day |
| Top Reads | 5 | Articles and engineering write-ups |
| Shipped | 4 | Releases, changelogs, cloud and language news |
| Repos | 3 | Projects gaining real traction |
| Discussion | 3 | Threads where the comments are the content |
| AI | 3 | Capped on purpose, or it eats the whole edition |
| Deep | 1 | One paper or long teardown |

19 entries plus the concept. Roughly a fifteen-minute read.

## Running it

```bash
docker compose up -d          # Postgres 17 on :55432
cp .env.example .env          # then fill in ANTHROPIC_API_KEY if you want summaries
npm install
npm run db:migrate
npm run db:seed               # 109 sources, 59 concepts
npm run ingest                # ~25s for every source
npm run candidates            # ranked pool, nothing written - this is the thing to judge
npm run edition               # cut today's edition as a draft
npm run edition -- --freeze   # ...and freeze it
npm run dev                   # http://localhost:3000
```

`npm run daily` is ingest + build + freeze in one command, and
`GET /api/cron` with `Authorization: Bearer $CRON_SECRET` is the same job for a
platform scheduler.

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

## Concepts

`db/seed/concepts.json` holds the curriculum. `npm run concepts:schedule 30`
pins the next 30 unscheduled concepts to the next 30 dates. A concept is
published when its date arrives; nothing is written by a model.

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
  A push, or a manual run, resets that.
- **Scheduled runs start late**, sometimes by an hour. This does not matter: the
  edition window closed at the freeze hour whenever the job happens to start.
- **Vercel Hobby is non-commercial.** Fine for a personal reader; not for
  anything with ads or a paywall.
- **Not free: Anthropic.** Enrichment runs over ~19 entries a day on
  `claude-haiku-5-5` — on the order of cents a month, but not zero. Omit the key
  and editions build with feed descriptions instead.

## Verified / not verified

Verified end to end on 2026-10-14: migration, seed, ingest of 93 enabled sources
(92 ok), candidate ranking, clustering, edition build, freeze, the database-level
refusal to modify or un-freeze a frozen edition, zero repeated URLs across two
editions, `tsc --noEmit`, `eslint .`, `next build`, and every route.

**Not verified: the enrichment call.** No `ANTHROPIC_API_KEY` was available, so
`src/pipeline/enrich.ts` has never executed against the API. Both editions here
were built on the no-key path, which falls back to feed descriptions. The request
shape follows the current SDK (`messages.parse` with `zodOutputFormat`), but
treat the first run with a key as untested.
