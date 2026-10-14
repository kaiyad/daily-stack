import { pool, query, one, tx } from "../lib/db";
import { log } from "../lib/log";
import { EDITION_BUDGET } from "../lib/slots";
import { loadCandidates, alreadyFeatured, recentDomainCounts } from "./candidates";
import { groupCandidates, persistClusters, clusterInMemory, type Cluster } from "./cluster";
import { classify } from "./classify";
import { isOnTopic } from "./topicality";
import { scoreAll, type Scored } from "./score";
import { select, type Selection } from "./select";
import { enrich } from "./enrich";
import { assignConcept } from "./concepts";
import { planRevisions, type DueRevision } from "./revision";

export type BuildOptions = {
  freeze?: boolean;
  force?: boolean;
  skipEnrich?: boolean;
};

export type BuildResult = {
  editionDate: string;
  candidates: number;
  clusters: number;
  entries: number;
  frozen: boolean;
  concept?: string;
  revisions: number;
};

/** Candidate pool ranked but not written anywhere. Used by `npm run candidates`. */
export async function reportCandidates(
  editionDate: string,
): Promise<{ scored: Scored[]; offTopic: Cluster[] }> {
  const candidates = await loadCandidates(editionDate);
  const all = clusterInMemory(candidates);
  const clusters = all.filter(isOnTopic);
  const recent = await recentDomainCounts(editionDate);
  return {
    scored: scoreAll(clusters, classify, editionDate, recent).sort((a, b) => b.score - a.score),
    offTopic: all.filter((c) => !isOnTopic(c)),
  };
}

export async function buildEdition(
  editionDate: string,
  opts: BuildOptions = {},
): Promise<BuildResult> {
  const existing = await one<{ status: string }>(
    `select status from editions where edition_date = $1`,
    [editionDate],
  );
  if (existing?.status === "frozen" && !opts.force) {
    throw new Error(
      `edition ${editionDate} is already frozen; it is immutable by design (use --force only to rebuild a draft)`,
    );
  }
  if (existing?.status === "frozen" && opts.force) {
    throw new Error(
      `edition ${editionDate} is frozen and the database will reject writes to it; frozen editions cannot be rebuilt`,
    );
  }

  const candidates = await loadCandidates(editionDate);
  log.info(`${editionDate}: ${candidates.length} candidate items in window`);

  const allClusters = await persistClusters(groupCandidates(candidates));
  const clusters = allClusters.filter(isOnTopic);
  log.info(
    `${candidates.length} items collapsed into ${allClusters.length} stories ` +
      `(${allClusters.length - clusters.length} dropped as off-topic)`,
  );

  const [featured, recent] = await Promise.all([
    alreadyFeatured(editionDate),
    recentDomainCounts(editionDate),
  ]);

  const scored = scoreAll(clusters, classify, editionDate, recent);
  const selections = select(scored, featured);
  log.info(`selected ${selections.length}/${EDITION_BUDGET} slots`);

  const enrichment = opts.skipEnrich ? new Map() : await enrich(selections);
  const concept = await assignConcept(editionDate);
  // Only units from *earlier* editions are eligible, so today's unit never
  // comes back for revision in the edition that introduces it.
  const revisions = await planRevisions(editionDate);
  log.info(`${revisions.length} unit(s) up for revision`);

  await writeDraft(editionDate, selections, enrichment, revisions, concept?.id);

  if (opts.freeze) {
    await query(
      `update editions set status = 'frozen', frozen_at = now() where edition_date = $1`,
      [editionDate],
    );
  }

  return {
    editionDate,
    candidates: candidates.length,
    clusters: clusters.length,
    entries: selections.length,
    frozen: Boolean(opts.freeze),
    concept: concept?.slug,
    revisions: revisions.length,
  };
}

async function writeDraft(
  editionDate: string,
  selections: Selection[],
  enrichment: Map<number, { summary: string; why: string; tags: string[] }>,
  revisions: DueRevision[],
  conceptId?: number,
): Promise<void> {
  await tx(async (client) => {
    await client.query(
      `insert into editions (edition_date, status, concept_id, entry_count, built_at)
       values ($1, 'draft', $2, $3, now())
       on conflict (edition_date) do update set
         concept_id = coalesce(excluded.concept_id, editions.concept_id),
         entry_count = excluded.entry_count,
         built_at = now()`,
      [editionDate, conceptId ?? null, selections.length],
    );

    await client.query(`delete from edition_slots where edition_date = $1`, [editionDate]);
    await client.query(`delete from edition_revisions where edition_date = $1`, [editionDate]);

    for (const r of revisions) {
      await client.query(
        `insert into edition_revisions
           (edition_date, concept_id, interval_days, origin_date, slug, title, kind, question, answer)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [editionDate, r.conceptId, r.intervalDays, r.originDate, r.slug, r.title, r.kind, r.question, r.answer],
      );
    }

    for (const [i, sel] of selections.entries()) {
      const c = sel.entry.cluster;
      const e = enrichment.get(i);
      const tags = [...new Set([...(e?.tags ?? []), ...c.tags])].slice(0, 5);

      await client.query(
        `insert into edition_slots
           (edition_date, slot, rank, cluster_id, title, url, domain, source_label,
            summary, why, tags, score, mention_count, discussion_url, points, comments, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          editionDate,
          sel.slot,
          sel.rank,
          c.id,
          c.title,
          c.url,
          c.domain,
          c.sources.length > 1 ? `${c.primary.source_name} +${c.sources.length - 1}` : c.primary.source_name,
          e?.summary ?? c.summaryRaw?.slice(0, 400) ?? null,
          e?.why ?? null,
          tags,
          sel.entry.score,
          c.mentionCount,
          c.discussionUrl,
          c.points || null,
          c.comments || null,
          c.publishedAt.toISOString(),
        ],
      );
    }
  });
}

export async function closePool(): Promise<void> {
  await pool.end();
}
