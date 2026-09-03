"use client";

import { FormEvent, useEffect, useState } from "react";

type ThesisForm = {
  sectors: string;
  stage: string;
  geo: string;
  check_size: string;
  ownership_target: string;
  risk: string;
};

const empty: ThesisForm = {
  sectors: "AI infra, developer tools, agentic software",
  stage: "pre-seed",
  geo: "global",
  check_size: "100000",
  ownership_target: "10",
  risk: "moderate",
};

const PRESETS: { label: string; form: ThesisForm }[] = [
  {
    label: "AI infra / pre-seed",
    form: {
      sectors: "AI infra, developer tools, agentic software, LLM ops",
      stage: "pre-seed",
      geo: "US, global remote",
      check_size: "100000",
      ownership_target: "10",
      risk: "moderate",
    },
  },
  {
    label: "Fintech / seed",
    form: {
      sectors: "fintech, payments, embedded finance, B2B SaaS",
      stage: "seed",
      geo: "US, UK",
      check_size: "250000",
      ownership_target: "8",
      risk: "conservative",
    },
  },
];

export default function ThesisPage() {
  const [form, setForm] = useState<ThesisForm>(empty);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/thesis");
        const data = (await res.json()) as {
          thesis: {
            sectors: string[];
            stage: string;
            geo: string;
            check_size: number;
            ownership_target: number;
            risk: string;
          } | null;
        };
        if (data.thesis) {
          setForm({
            sectors: data.thesis.sectors.join(", "),
            stage: data.thesis.stage,
            geo: data.thesis.geo,
            check_size: String(data.thesis.check_size),
            ownership_target: String(
              data.thesis.ownership_target <= 1
                ? Math.round(data.thesis.ownership_target * 100)
                : data.thesis.ownership_target,
            ),
            risk: data.thesis.risk,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/thesis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectors: form.sectors.split(",").map((s) => s.trim()).filter(Boolean),
          stage: form.stage,
          geo: form.geo,
          check_size: Number(form.check_size) || 100000,
          ownership_target: `${form.ownership_target}%`,
          risk: form.risk,
        }),
      });
      if (!res.ok) {
        setStatus("Save failed");
        return;
      }
      setStatus("Thesis saved — every screen runs through this lens.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading thesis…</p>;
  }

  return (
    <div>
      <p className="section-label mb-2">Thesis engine</p>
      <h1 className="font-display text-3xl font-bold tracking-tight">
        Fund thesis
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Sectors, stage, geo, check size, ownership, risk. Recommendations are
        filtered and scored through this config.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="btn-ghost focus-ring !px-3 !py-1.5 text-sm"
            onClick={() => {
              setForm(preset.form);
              setStatus(`Preset loaded — ${preset.label}. Review and Save.`);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-8 max-w-lg space-y-4">
        {(
          [
            ["sectors", "Sectors (comma-separated)", "text"],
            ["stage", "Stage", "text"],
            ["geo", "Geography", "text"],
            ["check_size", "Check size (USD)", "number"],
            ["ownership_target", "Ownership target (%)", "number"],
            ["risk", "Risk appetite", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <div key={key}>
            <label htmlFor={key} className="mb-1 block text-sm text-muted">
              {label}
            </label>
            <input
              id={key}
              type={type}
              className="input-field focus-ring"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required
            />
          </div>
        ))}
        <button
          type="submit"
          className="btn-primary focus-ring"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save thesis"}
        </button>
        {status ? (
          <p className="text-sm text-ok" role="status">
            {status}
          </p>
        ) : null}
      </form>
    </div>
  );
}
