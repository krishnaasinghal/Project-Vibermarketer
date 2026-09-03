"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Cmd = {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setNote(null);
    setActive(0);
  }, []);

  const commands: Cmd[] = useMemo(
    () => [
      {
        id: "cmo",
        label: "CMO desk",
        hint: "Agents · GEO · chat",
        run: () => {
          router.push("/app/cmo");
          close();
        },
      },
      {
        id: "onboarding",
        label: "Brand onboarding",
        hint: "URL → memory",
        run: () => {
          router.push("/app/onboarding");
          close();
        },
      },
      {
        id: "dogfood-brand",
        label: "Load Anand dogfood brand",
        hint: "Prefetched memory",
        run: async () => {
          setBusy("dogfood-brand");
          try {
            const res = await fetch("/api/marketing/brand", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: "https://www.vibemarketer.fun",
                name: "vibemarketer",
                oneliner:
                  "Cursor for marketing — brand brief, campaigns, and approval-gated drafts. Built by Anand Vashishtha (0xanand.tech).",
                icp: "Solo SaaS founders and small technical teams who ship fast but lack distribution — especially AI/Web3 builders",
                tone: "direct/technical, founder-native, no agency fluff — Anand's builder voice",
                pillars: [
                  "distribution is the scarce asset",
                  "HITL brand safety",
                  "persistent brand memory",
                  "agentic loops not chat assistants",
                  "dogfood: Anand Vashishtha · @AnandVashisht15 · 0xanand.tech",
                ],
              }),
            });
            if (!res.ok) throw new Error("Brand save failed");
            router.push("/app/studio");
            close();
          } finally {
            setBusy(null);
          }
        },
      },
      {
        id: "studio",
        label: "Open Studio",
        hint: "Drafts + loops",
        run: () => {
          router.push("/app/studio");
          close();
        },
      },
      {
        id: "queue",
        label: "HITL queue",
        hint: "Approve outbound",
        run: () => {
          router.push("/app/queue");
          close();
        },
      },
      {
        id: "connectors",
        label: "Connect accounts",
        hint: "OAuth",
        run: () => {
          router.push("/app/connectors");
          close();
        },
      },
      {
        id: "radar",
        label: "Founder radar",
        hint: "Identify · live",
        run: () => {
          router.push("/app/radar");
          close();
        },
      },
      {
        id: "compare",
        label: "Gravity compare",
        hint: "Top radar pair",
        run: () => {
          router.push("/app/compare");
          close();
        },
      },
      {
        id: "apply",
        label: "Inbound apply",
        hint: "Founder intake",
        run: () => {
          router.push("/app/apply");
          close();
        },
      },
      {
        id: "query",
        label: "NL founder query",
        hint: "Multi-attribute",
        run: () => {
          router.push(
            "/app/query?q=" +
              encodeURIComponent("technical founder, AI infra, no prior VC"),
          );
          close();
        },
      },
      {
        id: "thesis",
        label: "Configure thesis",
        hint: "Filter lens",
        run: () => {
          router.push("/app/thesis");
          close();
        },
      },
      {
        id: "report",
        label: "Weekly LEARN report",
        hint: "Marketing",
        run: () => {
          router.push("/app/report");
          close();
        },
      },
      {
        id: "get-started",
        label: "Get started guide",
        hint: "Onboarding path",
        run: () => {
          router.push("/get-started");
          close();
        },
      },
    ],
    [router, close],
  );

  const filtered = useMemo(
    () =>
      commands.filter(
        (c) =>
          !q.trim() ||
          c.label.toLowerCase().includes(q.toLowerCase()) ||
          c.hint.toLowerCase().includes(q.toLowerCase()),
      ),
    [commands, q],
  );

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  const runAt = useCallback(
    async (index: number) => {
      const c = filtered[index];
      if (!c || busy) return;
      try {
        await c.run();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Failed");
      }
    },
    [filtered, busy],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && filtered[active]) {
        e.preventDefault();
        void runAt(active);
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          "input, button:not([disabled])",
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, close, filtered, active, runAt]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring fixed bottom-4 right-4 z-40 border border-line bg-bg-elevated px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted shadow-lg hover:border-accent/50 hover:text-accent md:bottom-6 md:right-6"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={close}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg border border-line bg-bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-3 py-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a surface…"
            className="w-full bg-transparent py-2 font-display text-lg outline-none placeholder:text-muted"
            aria-label="Filter commands"
            aria-controls="cmdk-list"
            aria-activedescendant={
              filtered[active] ? `cmdk-${filtered[active].id}` : undefined
            }
          />
        </div>
        <ul
          id="cmdk-list"
          className="max-h-80 overflow-auto py-1"
          role="listbox"
          aria-label="Commands"
        >
          {filtered.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active} id={`cmdk-${c.id}`}>
              <button
                type="button"
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left ${
                  i === active ? "bg-accent/15" : "hover:bg-accent/10"
                }`}
                disabled={Boolean(busy)}
                onMouseEnter={() => setActive(i)}
                onClick={() => void runAt(i)}
              >
                <span className="text-sm text-ink">{c.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {busy === c.id ? "Running…" : c.hint}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">No matches</li>
          ) : null}
        </ul>
        {note ? (
          <p className="border-t border-line px-4 py-2 font-mono text-xs text-accent">
            {note}
          </p>
        ) : (
          <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-muted">
            ↑↓ Enter · Esc
          </p>
        )}
      </div>
    </div>
  );
}
