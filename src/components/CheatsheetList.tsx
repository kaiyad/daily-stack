"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UNIT_KINDS, unitLabel, type UnitKind } from "../lib/units";

export type CheatRow = {
  slug: string;
  title: string;
  kind: string;
  category: string;
  one_liner: string;
  tags: string[];
  scheduled_date: string;
};

/**
 * The lookup surface. Everything published is on one page, because the point
 * is to find the thing you half-remember in two seconds, not to browse.
 */
export function CheatsheetList({ units }: { units: CheatRow[] }) {
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<UnitKind | "all">("all");
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      e.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    return units.filter((u) => {
      if (kind !== "all" && u.kind !== kind) return false;
      if (!q) return true;
      return `${u.title} ${u.one_liner} ${u.category} ${u.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [units, term, kind]);

  const byCategory = useMemo(() => {
    const out = new Map<string, CheatRow[]>();
    for (const u of matches) {
      const list = out.get(u.category) ?? [];
      list.push(u);
      out.set(u.category, list);
    }
    return [...out.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [matches]);

  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const u of units) out.set(u.kind, (out.get(u.kind) ?? 0) + 1);
    return out;
  }, [units]);

  return (
    <>
      <div className="filters">
        <input
          ref={search}
          type="search"
          className="filter-input"
          placeholder="Filter - press /"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Filter units"
        />
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={kind === "all"}
            onClick={() => setKind("all")}
          >
            all {units.length}
          </button>
          {UNIT_KINDS.filter((k) => counts.get(k.id)).map((k) => (
            <button
              type="button"
              key={k.id}
              className="chip"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label.toLowerCase()} {counts.get(k.id)}
            </button>
          ))}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="empty">
          <p>Nothing matches “{term}”.</p>
        </div>
      ) : (
        byCategory.map(([category, list]) => (
          <section className="section" key={category}>
            <div className="section-head">
              <h3>{category}</h3>
              <span className="count">{list.length}</span>
            </div>
            {list.map((u) => (
              <Link href={`/concepts/${u.slug}`} className="entry cheat-row" key={u.slug}>
                <p className="entry-title">
                  {u.title}
                  <span className="badge">{unitLabel(u.kind)}</span>
                </p>
                <p className="entry-summary">{u.one_liner}</p>
                <div className="entry-foot">
                  <span className="domain">{u.scheduled_date}</span>
                  {u.tags.slice(0, 3).map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </section>
        ))
      )}
    </>
  );
}
