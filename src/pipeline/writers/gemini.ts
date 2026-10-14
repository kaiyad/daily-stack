import { fetchRaw } from "../../lib/http";
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
import { probeUrls } from "./probe";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** The Interactions API response, narrowed to the parts this file reads. */
type Interaction = {
  steps?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
  usage?: { tool_use?: Record<string, number> };
  error?: { message?: string };
};

const LINK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    note: { type: "string" },
    kind: {
      type: "string",
      enum: ["concept", "context", "review", "author", "primary-source", "adaptation"],
    },
  },
  required: ["title", "url", "note", "kind"],
};

// Hand-written rather than derived from the zod schema: the response is still
// validated by `Piece` after parsing, so this only has to be good enough to
// steer the model, and a generated schema would drag in a converter for it.
const PIECE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    dek: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { heading: { type: "string" }, body_md: { type: "string" } },
        required: ["heading", "body_md"],
      },
    },
    takeaways: { type: "array", items: { type: "string" } },
    context_links: { type: "array", items: LINK_SCHEMA },
    sources: { type: "array", items: LINK_SCHEMA },
  },
  required: ["headline", "dek", "sections", "takeaways", "context_links", "sources"],
};

type CallOpts = {
  system: string;
  input: string;
  maxTokens: number;
  search?: boolean;
  schema?: object;
};

async function call(opts: CallOpts): Promise<Interaction> {
  const body: Record<string, unknown> = {
    model: env.geminiModel,
    system_instruction: opts.system,
    input: opts.input,
    generation_config: { max_output_tokens: opts.maxTokens },
  };
  if (opts.search) body.tools = [{ type: "google_search", search_types: ["web_search"] }];
  if (opts.schema) {
    body.response_format = { type: "text", mime_type: "application/json", schema: opts.schema };
  }

  const res = await fetchRaw(ENDPOINT, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 300_000,
    headers: { "x-goog-api-key": env.geminiKey, "content-type": "application/json" },
  });

  const json = (await res.json()) as Interaction;
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${json.error?.message ?? res.statusText}`);
  }
  return json;
}

function modelOutput(interaction: Interaction): {
  text: string;
  cited: Map<string, string>;
} {
  const cited = new Map<string, string>();
  let text = "";

  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (part.type !== "text") continue;
      text += part.text ?? "";
      for (const note of part.annotations ?? []) {
        if (note.type === "url_citation" && note.url) cited.set(canonicalizeUrl(note.url), note.url);
      }
    }
  }

  return { text, cited };
}

/**
 * The free fallback, used when no piece was written ahead of time and there is
 * no Anthropic key. Same two-call shape as the Claude writer.
 *
 * Grounding is attempted but not assumed: `google_search` is billed with a
 * free monthly allowance, and if it is unavailable on this key the research
 * call is retried without it. An ungrounded run has no searched-URL set to vet
 * against, so every proposed link is probed for existence instead - weaker,
 * and the piece records that it was written this way.
 */
export async function write(book: BookRow): Promise<Written> {
  let grounded = true;
  let found: Interaction;

  try {
    found = await call({
      system: RESEARCH_SYSTEM,
      input: researchPrompt(book),
      maxTokens: 16000,
      search: true,
    });
  } catch (err) {
    log.warn(`gemini search unavailable, researching without it: ${
      err instanceof Error ? err.message : err
    }`);
    grounded = false;
    found = await call({ system: RESEARCH_SYSTEM, input: researchPrompt(book), maxTokens: 16000 });
  }

  const dossier = modelOutput(found);
  const searches = Object.values(found.usage?.tool_use ?? {}).reduce((a, b) => a + b, 0);
  log.info(
    grounded
      ? `${searches} searches, ${dossier.cited.size} cited urls`
      : "ungrounded research - links will be probed instead of vetted",
  );

  const res = await call({
    system: WRITE_SYSTEM,
    input: writePrompt(book, dossier.text),
    maxTokens: 32000,
    schema: PIECE_SCHEMA,
  });

  const out = modelOutput(res);
  if (!out.text.trim()) throw new Error("gemini returned no model output");

  let raw: unknown;
  try {
    raw = JSON.parse(out.text);
  } catch {
    throw new Error("gemini did not return JSON despite a response schema");
  }

  const parsed = Piece.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `gemini output does not match the piece schema - ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
  }

  const urls = grounded
    ? dossier.cited
    : await probeUrls([...parsed.data.context_links, ...parsed.data.sources]);

  return { piece: parsed.data, urls, searches, model: env.geminiModel };
}
