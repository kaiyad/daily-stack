import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "../../lib/env";
import { log } from "../../lib/log";
import { canonicalizeUrl } from "../../lib/url";
import type { BookRow } from "../../lib/shelf";
import {
  Piece,
  RESEARCH_SYSTEM,
  WRITE_SYSTEM,
  researchPrompt,
  writePrompt,
  type Written,
} from "./piece";

/** URLs the API actually returned, as the only addresses the piece may cite. */
function searchedUrls(content: Anthropic.ContentBlock[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    // An error comes back as a single object where a success is a list.
    if (!Array.isArray(block.content)) {
      log.warn(`web search failed: ${block.content.error_code}`);
      continue;
    }
    for (const result of block.content) found.set(canonicalizeUrl(result.url), result.url);
  }
  return found;
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * Two calls: one that searches and reports what it found, one that writes from
 * that report under a schema. Splitting them is what makes the links
 * trustworthy - the second call may only cite URLs the first was actually
 * handed, and `vetLinks` drops anything else.
 */
export async function write(book: BookRow): Promise<Written> {
  const client = new Anthropic({ apiKey: env.anthropicKey });

  const found = await client.messages.create({
    model: env.shelfModel,
    max_tokens: 16000,
    system: RESEARCH_SYSTEM,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: env.shelfMaxSearches }],
    messages: [{ role: "user", content: researchPrompt(book) }],
  });

  if (found.stop_reason === "refusal") {
    throw new Error(`research refused: ${found.stop_details?.category ?? "unknown"}`);
  }
  // A paused turn still carries every search result it completed, which is the
  // part the piece is built from. Continuing it would cost another full pass.
  if (found.stop_reason === "pause_turn") log.warn("research paused early");

  const urls = searchedUrls(found.content);
  const searches = found.usage.server_tool_use?.web_search_requests ?? 0;
  log.info(`${searches} searches, ${urls.size} distinct urls`);

  const res = await client.messages.parse({
    model: env.shelfModel,
    max_tokens: 32000,
    system: WRITE_SYSTEM,
    output_config: { effort: "high", format: zodOutputFormat(Piece) },
    messages: [{ role: "user", content: writePrompt(book, textOf(found.content)) }],
  });

  if (res.stop_reason === "refusal") {
    throw new Error(`writing refused: ${res.stop_details?.category ?? "unknown"}`);
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("writing hit max_tokens - the piece would be truncated");
  }
  if (!res.parsed_output) throw new Error("the model returned no parseable piece");

  return { piece: res.parsed_output, urls, searches, model: env.shelfModel };
}
