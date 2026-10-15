"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Edition, EntryRow } from "../lib/editions";

const STORAGE_KEY = "daily-stack:read";
const HIDE_KEY = "daily-stack:hide-read";

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveRead(ids: Set<string>): void {
  try {
    // Keep the most recent 4000 so the key cannot grow without bound.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-4000)));
  } catch {
    /* private window, blocked storage: read state is a convenience, not state */
  }
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Read state lives in localStorage, which is an external store, not React
 * state - so it is read through useSyncExternalStore. The server snapshot is
 * empty, which is correct: the page renders fully without it.
 */
const readStore = {
  cache: null as ReadonlySet<string> | null,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void): () => void {
    readStore.listeners.add(listener);
    return () => {
      readStore.listeners.delete(listener);
    };
  },

  getSnapshot(): ReadonlySet<string> {
    readStore.cache ??= loadRead();
    return readStore.cache;
  },

  getServerSnapshot(): ReadonlySet<string> {
    return EMPTY;
  },

  mark(id: string): void {
    const current = readStore.getSnapshot();
    if (current.has(id)) return;
    const next = new Set(current);
    next.add(id);
    readStore.cache = next;
    saveRead(next);
    for (const listener of readStore.listeners) listener();
  },
};

/** Whether read entries are hidden, stored the same way and for the same reason. */
const hideStore = {
  cache: null as boolean | null,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void): () => void {
    hideStore.listeners.add(listener);
    return () => {
      hideStore.listeners.delete(listener);
    };
  },

  getSnapshot(): boolean {
    if (hideStore.cache === null) {
      try {
        hideStore.cache = localStorage.getItem(HIDE_KEY) === "1";
      } catch {
        hideStore.cache = false;
      }
    }
    return hideStore.cache;
  },

  getServerSnapshot(): boolean {
    return false;
  },

  toggle(): void {
    const next = !hideStore.getSnapshot();
    hideStore.cache = next;
    try {
      localStorage.setItem(HIDE_KEY, next ? "1" : "0");
    } catch {
      /* blocked storage: the choice holds for this page and no longer */
    }
    for (const listener of hideStore.listeners) listener();
  },
};

/** Read state and keyboard navigation, both per-viewer conveniences. */
export function EditionBody({ edition }: { edition: Edition }) {
  const read = useSyncExternalStore(
    readStore.subscribe,
    readStore.getSnapshot,
    readStore.getServerSnapshot,
  );
  const hideRead = useSyncExternalStore(
    hideStore.subscribe,
    hideStore.getSnapshot,
    hideStore.getServerSnapshot,
  );
  const [cursor, setCursor] = useState(-1);
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);

  const toggleHide = useCallback(() => {
    hideStore.toggle();
    // Indices shift when the list changes, so the cursor cannot survive it.
    setCursor(-1);
  }, []);

  const total = edition.sections.reduce((n, s) => n + s.entries.length, 0);
  const readCount = edition.sections.reduce(
    (n, s) => n + s.entries.filter((e) => read.has(e.cluster_id)).length,
    0,
  );

  // Hiding is applied before the flat list is built, so j/k only ever walks
  // what is actually on the page.
  const sections = hideRead
    ? edition.sections
        .map((s) => ({ ...s, entries: s.entries.filter((e) => !read.has(e.cluster_id)) }))
        .filter((s) => s.entries.length > 0)
    : edition.sections;
  const flat = sections.flatMap((s) => s.entries);

  const markRead = useCallback((id: string) => readStore.mark(id), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setCursor((c) => {
          const nextIndex = e.key === "j" ? Math.min(c + 1, flat.length - 1) : Math.max(c - 1, 0);
          refs.current[nextIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
          refs.current[nextIndex]?.focus({ preventScroll: true });
          return nextIndex;
        });
      } else if (e.key === "o" || e.key === "Enter") {
        const entry = flat[cursor];
        if (entry) {
          markRead(entry.cluster_id);
          window.open(entry.url, "_blank", "noopener,noreferrer");
        }
      } else if (e.key === "m") {
        const entry = flat[cursor];
        if (entry) markRead(entry.cluster_id);
      } else if (e.key === "u") {
        e.preventDefault();
        toggleHide();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, flat, markRead, toggleHide]);

  let index = -1;
  return (
    <>
      <div className="progress">
        <span className="count">
          {readCount} of {total} read
        </span>
        <button
          type="button"
          className="chip"
          aria-pressed={hideRead}
          onClick={toggleHide}
          disabled={readCount === 0}
        >
          hide read
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="empty">
          <p>Every entry in this edition is read.</p>
          <p>
            Press <code>u</code> to show them again.
          </p>
        </div>
      ) : null}

      {sections.map((section) => (
        <section className="section" key={section.slot}>
          <div className="section-head">
            <h3>{section.label}</h3>
            <span className="count">{section.entries.length}</span>
          </div>
          <p className="section-blurb">{section.blurb}</p>
          {section.entries.map((entry) => {
            index++;
            const i = index;
            return (
              <Entry
                key={entry.cluster_id}
                entry={entry}
                isRead={read.has(entry.cluster_id)}
                isCursor={i === cursor}
                onOpen={() => markRead(entry.cluster_id)}
                anchorRef={(el) => {
                  refs.current[i] = el;
                }}
              />
            );
          })}
        </section>
      ))}
    </>
  );
}

function Entry({
  entry,
  isRead,
  isCursor,
  onOpen,
  anchorRef,
}: {
  entry: EntryRow;
  isRead: boolean;
  isCursor: boolean;
  onOpen: () => void;
  anchorRef: (el: HTMLAnchorElement | null) => void;
}) {
  const stats = [
    entry.points ? `${entry.points} points` : null,
    entry.comments ? `${entry.comments} comments` : null,
  ].filter(Boolean);

  return (
    <div className={`entry${isCursor ? " cursor" : ""}`} data-read={isRead ? "1" : "0"}>
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        ref={anchorRef}
        style={{ textDecoration: "none", display: "block" }}
      >
        <p className="entry-title">{entry.title}</p>
        {entry.summary ? <p className="entry-summary">{entry.summary}</p> : null}
        {entry.why ? <p className="entry-why">{entry.why}</p> : null}
      </a>
      <div className="entry-foot">
        <span className="domain">{entry.domain}</span>
        <span className="dot">·</span>
        <span>{entry.source_label}</span>
        {stats.length ? (
          <>
            <span className="dot">·</span>
            <span>{stats.join(" / ")}</span>
          </>
        ) : null}
        {entry.mention_count > 1 ? (
          <>
            <span className="dot">·</span>
            <span className="mentions">{entry.mention_count} sources</span>
          </>
        ) : null}
        {entry.tags.slice(0, 3).map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
        {entry.discussion_url && entry.discussion_url !== entry.url ? (
          <a className="thread" href={entry.discussion_url} target="_blank" rel="noopener noreferrer">
            thread →
          </a>
        ) : null}
      </div>
    </div>
  );
}
