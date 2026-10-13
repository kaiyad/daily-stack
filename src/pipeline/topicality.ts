import type { Cluster } from "./cluster";

const AGGREGATOR_SOURCES = new Set(["hn", "lobsters", "reddit"]);

/** Domains that are technical by definition, whatever the headline says. */
const TECH_DOMAINS = [
  "github.com", "gitlab.com", "codeberg.org", "sr.ht", "arxiv.org", "acm.org",
  "ieee.org", "usenix.org", "sigplan.org", "stackoverflow.com", "lwn.net",
  "phoronix.com", "kernel.org", "python.org", "rust-lang.org", "golang.org",
  "go.dev", "nodejs.org", "postgresql.org", "sqlite.org", "redis.io",
  "kubernetes.io", "docker.com", "mozilla.org", "webkit.org", "chromium.org",
  "developer.mozilla.org", "man7.org", "npmjs.com", "crates.io", "pypi.org",
  "readthedocs.io", "apache.org", "eclipse.org", "openjdk.org", "llvm.org",
  // Our aggregator sources are all technical communities, so a self-post on
  // one is on-topic by provenance.
  "news.ycombinator.com", "lobste.rs", "reddit.com",
];

/**
 * Deliberately broad. A false negative drops a good article; a false positive
 * only means something mildly off-topic reaches the ranking, where it still has
 * to out-score real technical work.
 */
const TECH_TERMS = new RegExp(
  [
    // languages and runtimes
    "\\b(javascript|typescript|python|rust|golang|java|kotlin|swift|scala|clojure|haskell|ocaml|erlang|elixir|ruby|rails|php|perl|lua|zig|nim|c\\+\\+|\\bc#|\\.net|cobol|fortran|assembly|wasm|webassembly|jvm|llvm|clang|gcc|node\\.?js|deno|\\bbun\\b|cpython|pypy|z80|6502)",
    // web and frontend
    "\\b(html|css|react|vue|svelte|angular|next\\.?js|tailwind|webpack|vite|esbuild|\\bdom\\b|browser|chrome|firefox|safari|webkit|http|rest api|graphql|grpc|websocket|\\bapi\\b|\\bsdk\\b|oauth|\\bjwt\\b|cors|csrf|\\bxss\\b|cookie|fingerprint|tracking|telemetry|passkey|webauthn|password|authentication|\\b2fa\\b|\\bmfa\\b|session|web app|\\bweb\\b|frontend|front-end|backend|back-end)",
    // data and storage
    "\\b(database|postgres|mysql|mariadb|sqlite|mongodb|redis|cassandra|dynamodb|clickhouse|duckdb|elasticsearch|kafka|rabbitmq|\\bsql\\b|nosql|\\bquery|index(es|ing)|schema|transaction|\\bacid\\b|replicat|shard|olap|oltp|data ?warehouse|\\betl\\b|filesystem|file system|compression|\\bcodec\\b)",
    // infra and ops
    "\\b(kubernetes|k8s|docker|container|terraform|ansible|\\baws\\b|azure|\\bgcp\\b|cloud|serverless|lambda|devops|\\bci/?cd\\b|jenkins|github|gitlab|observability|prometheus|grafana|opentelemetry|\\bsre\\b|\\bslo\\b|incident|postmortem|deploy|infrastructure|load ?balanc|nginx|envoy|proxy|\\bdns\\b|\\btls\\b|\\bssl\\b|linux|unix|kernel|syscall|systemd|\\bbsd\\b|macos|operating system)",
    // cs and engineering concepts
    "\\b(algorithm|data structure|compiler|interpreter|parser|type system|concurren|parallel|thread|async|coroutine|mutex|lock-?free|atomic|memory (model|safety|leak)|garbage collect|allocator|\\bcache|latency|throughput|benchmark|profil|optimi[sz]|complexity|distributed|consensus|\\braft\\b|paxos|consistency|idempoten|protocol|encrypt|cryptograph|\\bcrypto\\b|hashing|regex|bitwise|\\bsimd\\b|\\bcpu\\b|\\bgpu\\b|arm64|x86|risc-?v|fpga|firmware|embedded|emulator|computation|turing|theorem|formal (verif|method)|lambda calculus|demoscene)",
    // software practice
    "\\b(code|codebase|refactor|debug|\\btest(ing|s|suite)?\\b|unit test|lint|\\bgit\\b|version control|pull request|open ?source|library|framework|package|dependenc|monorepo|microservice|architecture|design pattern|tech(nical)? debt|programming|programmer|developer|engineer|software|compile|runtime|binary|\\bbug|vulnerab|\\bcve-|exploit|\\bpatch|release notes|changelog|hacker|hacking)",
    // ai, squarely in scope for a developer digest
    "\\b(\\bai\\b|\\bml\\b|\\bllm|machine learning|neural|transformer|inference|embedding|fine-?tun|pytorch|tensorflow|cuda|model weights|tokeni[sz]|agentic|coding agent|copilot)",
  ].join("|"),
  "i",
);

/**
 * Aggregators carry plenty of excellent non-software material - tax fraud,
 * electric cars, supermarket refrigeration. It is all interesting and none of
 * it belongs in a software digest.
 */
export function isOnTopic(c: Cluster): boolean {
  const fromAggregatorOnly = c.items.every((i) => AGGREGATOR_SOURCES.has(i.kind));
  if (!fromAggregatorOnly) return true; // a curated feed vouched for it

  if (TECH_DOMAINS.some((d) => c.domain === d || c.domain.endsWith(`.${d}`))) return true;

  const text = `${c.title} ${c.summaryRaw ?? ""} ${c.tags.join(" ")}`;
  return TECH_TERMS.test(text);
}
