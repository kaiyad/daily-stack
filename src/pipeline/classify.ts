import type { SlotId } from "../lib/slots";
import type { Cluster } from "./cluster";

const AGGREGATORS = new Set(["news.ycombinator.com", "reddit.com", "lobste.rs"]);
const CODE_HOSTS = new Set(["github.com", "gitlab.com", "codeberg.org", "sr.ht", "git.sr.ht"]);

/** Unambiguous AI markers - one hit is enough. */
const AI_STRONG =
  /\b(llm|llms|gpt-?\d|chatgpt|claude|anthropic|openai|gemini|deepseek|mistral|qwen|llama\s?\d|hugging\s?face|pytorch|tensorflow|diffusion model|stable diffusion|transformer(s)? (model|architecture)|rag\b|retrieval[- ]augmented|agentic|ai agent(s)?|coding agent|prompt engineering|fine[- ]?tun(e|ing|ed)|embedding(s)? model|vector (database|search|store)|mcp server|model context protocol|inference server|vllm|ollama|langchain|copilot|machine learning|deep learning|neural network)\b/i;

/** Needs company to count, because each word has a non-AI life too. */
const AI_WEAK = /\b(ai|ml|model|models|inference|token(s)?|agent(s)?|training|dataset|gpu(s)?)\b/gi;

const RELEASE_WORDS =
  /\b(release[sd]?|released|releasing|announc(e|es|ing|ed)|now (generally )?available|generally available|\bga\b|launch(es|ed|ing)?|introducing|ships?|shipped|deprecat(e|ed|ing|ion)|end[- ]of[- ]life|\beol\b|changelog|patch|hotfix|security advisory|cve-\d)\b/i;

const RELEASE_PATH =
  /\/(releases?|release-notes|changelog|whats-new|what-s-new|announcements?)(\/|$)/i;

const VERSION = /\bv?\d+\.\d+(\.\d+)?\b/;

/**
 * Only phrases that genuinely promise a teardown. An earlier version matched
 * "inside" and "benchmark" anywhere in a feed blurb, which handed the single
 * Deep slot to conference announcements.
 */
const DEEP_WORDS =
  /\b(deep dive|under the hood|anatomy of|architecture of|internals of|how we (built|scaled|migrated|rewrote)|a tour of|from scratch|postmortem|post-mortem|lessons from|we present|formal(ly)? verif)/i;

function haystack(c: Cluster): string {
  return `${c.title} ${c.summaryRaw ?? ""} ${c.tags.join(" ")}`;
}

export function isAiTopic(c: Cluster): boolean {
  const text = haystack(c);
  if (AI_STRONG.test(text)) return true;
  const weak = text.match(AI_WEAK)?.length ?? 0;
  return weak >= 3 && /\b(ai|ml)\b/i.test(text);
}

function slotHintOf(c: Cluster): string | null {
  for (const item of c.items) {
    const hint = (item.raw as { slot_hint?: unknown }).slot_hint;
    if (typeof hint === "string" && hint) return hint;
    if (item.slot_hint) return item.slot_hint;
  }
  return null;
}

/**
 * Slot is a question of *form*, decided by rules so an edition is reproducible
 * without an API key. AI is a topic: AI articles move out of Top Reads into the
 * capped AI section, and other slots get an AI quota at selection time.
 */
export function classify(c: Cluster): SlotId {
  const hint = slotHintOf(c);
  const path = (() => {
    try {
      return new URL(c.url).pathname;
    } catch {
      return "";
    }
  })();

  if (c.domain === "arxiv.org" || hint === "deep") return "deep";

  if (CODE_HOSTS.has(c.domain) && path.split("/").filter(Boolean).length === 2) return "repos";
  if (hint === "repos") return "repos";

  if (hint === "shipped" || RELEASE_PATH.test(path)) return "shipped";
  if (
    RELEASE_WORDS.test(c.title) &&
    (VERSION.test(c.title) ||
      /\b(release|announc|launch|available|introducing|deprecat)/i.test(c.title))
  ) {
    return "shipped";
  }

  // Threads whose *content is the thread*: Ask HN, a self-post, or an argument
  // heavy enough that the comments outnumber the upvotes. Merely drawing a lot
  // of comments is not enough - an article is still an article.
  if (c.discussionUrl === c.url || AGGREGATORS.has(c.domain)) return "discussion";
  if (c.comments >= 80 && c.comments > c.points) return "discussion";

  if (DEEP_WORDS.test(c.title) && (c.summaryRaw?.length ?? 0) > 180) return "deep";

  return isAiTopic(c) ? "ai" : "reads";
}
