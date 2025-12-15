"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Persona = "VC" | "CTO" | "Tech leader";

interface PaperItem {
  title?: string;
  url?: string;
  venue?: string;
}

interface RepoItem {
  name?: string;
  url?: string;
  description?: string;
}

interface BlogItem {
  title?: string;
  url?: string;
  source?: string;
}

interface SessionState {
  final_summary?: string;
  plan_json?: unknown;
  papers_result?: unknown;
  repos_result?: unknown;
  blogs_result?: unknown;
  [key: string]: unknown;
}

interface SessionResponse {
  id: string;
  appName: string;
  userId: string;
  state: SessionState;
}

const API_BASE =
  process.env.NEXT_PUBLIC_ADK_BASE_URL ?? "http://localhost:8000";
const APP_NAME = "research_scout_agent";
const USER_ID = "user";

/* ---------- Markdown helpers ---------- */

function extractExecutiveSummary(md: string): string | null {
  const match = md.match(/#+\s*Executive Summary([\s\S]*?)(\n#+\s|\n$)/);
  if (!match || match.index === undefined) return null;
  return match[1].trim();
}

function removeExecutiveSummary(md: string): string {
  const match = md.match(/#+\s*Executive Summary([\s\S]*?)(\n#+\s|\n$)/);
  if (!match || match.index === undefined) return md;
  const before = md.slice(0, match.index);
  const after = md.slice(match.index + match[0].length);
  return `${before.trim()}\n\n${after.trim()}`.trim();
}

function extractKeyTakeaways(execSummary: string): string[] {
  const lines = execSummary.split("\n");
  const bullets = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .slice(0, 4);
  return bullets.length > 0 ? bullets : [];
}

/* ---------- Technical themes (collapsible) ---------- */

interface Theme {
  title: string;
  body: string;
}

function extractTechnicalThemes(md: string): Theme[] {
  const match = md.match(/#+\s*Technical Landscape([\s\S]*?)(\n#+\s|\n$)/);
  if (!match) return [];
  const section = match[1].trim();

  // Split whenever we see a heading like "## Theme 1: ..." or "### Theme 2: ..."
  const parts = section.split(
    /\n(?=(?:#+\s*)?Theme\s+\d+:\s)/ // newline, then optional ###, then "Theme X:"
  );

  const themes: Theme[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Require that the chunk actually starts with a Theme heading (with or without #)
    if (!/^(?:#+\s*)?Theme\s+\d+:/i.test(trimmed)) continue;

    // Strip heading hashes
    const noHashes = trimmed.replace(/^#+\s*/, "");
    const lines = noHashes.split("\n");
    const [firstLine, ...rest] = lines;

    const title = firstLine.replace(/^Theme\s+\d+:\s*/, "").trim();
    const body = rest.join("\n").trim();

    if (title && body) {
      themes.push({ title, body });
    }
  }

  return themes;
}

/* ---------- Source extraction (robust to messy JSON) ---------- */

function extractPapers(raw: unknown): PaperItem[] {
  if (!raw || typeof raw !== "string") return [];
  const lines = raw.split("\n");
  const items: PaperItem[] = [];
  let current: Partial<PaperItem> = {};

  for (const line of lines) {
    const titleMatch = line.match(/"title":\s*"(.+?)"/);
    if (titleMatch) {
      if (current.title || current.url || current.venue) {
        items.push(current as PaperItem);
        current = {};
      }
      current.title = titleMatch[1];
    }

    const urlMatch = line.match(/"url":\s*"(.+?)"/);
    if (urlMatch) {
      current.url = urlMatch[1];
    }

    const venueMatch = line.match(/"venue":\s*"(.+?)"/);
    if (venueMatch) {
      current.venue = venueMatch[1];
    }
  }

  if (current.title || current.url || current.venue) {
    items.push(current as PaperItem);
  }

  return items;
}

function extractRepos(raw: unknown): RepoItem[] {
  if (!raw || typeof raw !== "string") return [];
  const lines = raw.split("\n");
  const items: RepoItem[] = [];
  let current: Partial<RepoItem> = {};

  for (const line of lines) {
    const nameMatch = line.match(/"name":\s*"(.+?)"/);
    if (nameMatch) {
      if (current.name || current.url || current.description) {
        items.push(current as RepoItem);
        current = {};
      }
      current.name = nameMatch[1];
    }

    const urlMatch = line.match(/"url":\s*"(.+?)"/);
    if (urlMatch) {
      current.url = urlMatch[1];
    }

    const descMatch = line.match(/"description":\s*"(.+?)"/);
    if (descMatch) {
      current.description = descMatch[1];
    }
  }

  if (current.name || current.url || current.description) {
    items.push(current as RepoItem);
  }

  return items;
}

function extractBlogs(raw: unknown): BlogItem[] {
  if (!raw || typeof raw !== "string") return [];
  // Strip leading ``` if present
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```+/, "").trim();
  }

  const lines = text.split("\n");
  const items: BlogItem[] = [];
  let current: Partial<BlogItem> = {};

  for (const line of lines) {
    const titleMatch = line.match(/"title":\s*"(.+?)"/);
    if (titleMatch) {
      if (current.title || current.url || current.source) {
        items.push(current as BlogItem);
        current = {};
      }
      current.title = titleMatch[1];
    }

    const urlMatch = line.match(/"url":\s*"(.+?)"/);
    if (urlMatch) {
      current.url = urlMatch[1];
    }

    const sourceMatch = line.match(/"source":\s*"(.+?)"/);
    if (sourceMatch) {
      current.source = sourceMatch[1];
    }
  }

  if (current.title || current.url || current.source) {
    items.push(current as BlogItem);
  }

  return items;
}

/* ---------- Component ---------- */

export default function Home() {
  const [query, setQuery] = useState("");
  const [persona, setPersona] = useState<Persona>("VC");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);
  const [rawState, setRawState] = useState<SessionState | null>(null);
  const [rawRunResponse, setRawRunResponse] = useState<unknown>(null);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;

    const resp = await fetch(
      `${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    if (!resp.ok) {
      throw new Error(
        `Failed to create session: ${resp.status} ${resp.statusText}`
      );
    }

    const data: SessionResponse = await resp.json();
    setSessionId(data.id);
    return data.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setFinalSummary(null);
    setRawState(null);
    setRawRunResponse(null);

    try {
      const sid = await ensureSession();

      const personaPrefix =
        persona === "VC"
          ? "Persona: VC (investor evaluating startup opportunities).\n\n"
          : persona === "CTO"
          ? "Persona: CTO (technical leader evaluating architecture and roadmap).\n\n"
          : "Persona: Tech leader (director/VP assessing product and platform direction).\n\n";

      const userText = `${personaPrefix}${query.trim()}`;

      const runResp = await fetch(`${API_BASE}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: APP_NAME,
          user_id: USER_ID,
          session_id: sid,
          new_message: {
            role: "user",
            parts: [{ text: userText }],
          },
          streaming: false,
        }),
      });

      if (!runResp.ok) {
        throw new Error(
          `Agent run failed: ${runResp.status} ${runResp.statusText}`
        );
      }

      const runJson = await runResp.json();
      setRawRunResponse(runJson);

      const sessionResp = await fetch(
        `${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions/${sid}`
      );

      if (!sessionResp.ok) {
        throw new Error(
          `Failed to load session state: ${sessionResp.status} ${sessionResp.statusText}`
        );
      }

      const sessionJson: SessionResponse = await sessionResp.json();
      setRawState(sessionJson.state);

      const summary = sessionJson.state?.final_summary;
      if (typeof summary === "string" && summary.trim().length > 0) {
        setFinalSummary(summary);
      } else {
        setError(
          "Agent run completed, but no final_summary was found in the session state."
        );
      }
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Unexpected error running agent."
      );
    } finally {
      setLoading(false);
    }
  }

  const execSummarySection =
    finalSummary != null ? extractExecutiveSummary(finalSummary) : null;
  const keyTakeaways =
    execSummarySection != null
      ? extractKeyTakeaways(execSummarySection)
      : [];

  // Use the report with Executive Summary removed for the full body
  const cleanReport =
    finalSummary != null ? removeExecutiveSummary(finalSummary) : "";

  const technicalThemes =
    finalSummary != null ? extractTechnicalThemes(finalSummary) : [];

  // Extract sources from raw strings (robust to malformed JSON)
  const paperItems = extractPapers(rawState?.papers_result);
  const repoItems = extractRepos(rawState?.repos_result);
  const blogItems = extractBlogs(rawState?.blogs_result);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-6xl space-y-8">
        {/* Header */}
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Plan &amp; Execute Agent Pattern
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              AI Research Scout
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              A structured research assistant for{" "}
              <span className="font-medium">VCs, CTOs, and tech leaders</span>{" "}
              to quickly map the AI landscape for a specific thesis.
            </p>
          </div>
        </header>

        {/* Input card */}
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-slate-950/40 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Persona toggle */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 mr-1">Perspective:</span>
              {(["VC", "CTO", "Tech leader"] as Persona[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPersona(p);
                    // Clear previous outputs to avoid confusion
                    setFinalSummary(null);
                    setRawState(null);
                    setRawRunResponse(null);
                    setError(null);
                  }}
                  className={[
                    "px-3 py-1 rounded-full border transition text-xs",
                    persona === p
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-200 shadow-sm shadow-emerald-500/40"
                      : "border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-900",
                  ].join(" ")}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Query */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Research brief
              </label>
              <textarea
                className="w-full h-32 md:h-28 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                placeholder="e.g. Scout the last two weeks of agentic AI work on robotics and supply chain..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                Tip: Mention timeframe, domain, and what you care about (e.g.
                robotics + logistics, evals, agents for infrastructure).
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 text-slate-950 text-sm font-medium px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition"
              >
                {loading ? "Running research…" : "Run research"}
              </button>
              {sessionId && (
                <span className="text-[11px] text-slate-500">
                  Session: <code>{sessionId}</code>
                </span>
              )}
            </div>
          </form>

          {/* Loading indicator with pipeline stages */}
          {loading && (
            <div className="mt-3 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                <span>Running research pipeline…</span>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Planning – decomposing your brief into queries.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80 animate-pulse" />
                  <span>Research – papers, repos, and blogs in parallel.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-200/80 animate-pulse" />
                  <span>Analysis – synthesizing into an investor / CTO brief.</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </section>

        {/* Results */}
        {!loading && finalSummary && (
          <section className="space-y-5">
            {/* Top row: executive highlights + why this matters */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="bg-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-emerald-300 tracking-tight">
                    Executive highlights
                  </h2>
                  <span className="text-[11px] text-emerald-200/80 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                    {persona} view
                  </span>
                </div>
                {keyTakeaways.length > 0 && execSummarySection ? (
                  <ul className="list-disc list-inside text-xs text-slate-100 space-y-1">
                    {keyTakeaways.map((line, idx) => (
                      <li key={idx}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: (props) => <span {...props} />,
                          }}
                        >
                          {line.replace(/^[-*]\s*/, "")}
                        </ReactMarkdown>
                      </li>
                    ))}
                  </ul>
                ) : execSummarySection ? (
                  <div className="text-xs text-slate-100 whitespace-pre-line">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {execSummarySection}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    No dedicated executive summary section found; see full
                    report below.
                  </div>
                )}
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 space-y-2">
                <h3 className="text-xs font-semibold text-slate-100">
                  Why this matters
                </h3>
                <p className="text-xs text-slate-300">
                  This report is designed to help a {persona} quickly see{" "}
                  <span className="italic">where the signal is</span> in the AI
                  research landscape for your query, and how that should shape
                  upcoming bets, roadmaps, or investment decisions.
                </p>
                <p className="text-[11px] text-slate-500">
                  Under the hood, a planner agent decomposes your brief, three
                  research agents run in parallel (papers, repos, blogs), and an
                  analyst agent synthesizes everything into this view.
                </p>
              </div>
            </div>

            {/* Collapsible technical themes */}
            {technicalThemes.length > 0 && (
              <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Technical themes (click to expand / collapse)
                </h2>
                <div className="space-y-2 text-xs">
                  {technicalThemes.map((theme, idx) => (
                    <details
                      key={idx}
                      className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2"
                      open={idx === 0}
                    >
                      <summary className="cursor-pointer list-none font-medium text-slate-100 flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>
                          Theme {idx + 1}: {theme.title}
                        </span>
                      </summary>
                      <div className="mt-2 text-slate-200">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          className="prose prose-invert prose-xs max-w-none"
                        >
                          {theme.body}
                        </ReactMarkdown>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Full report (Executive Summary removed) */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  Full research report
                </h2>
                <span className="text-[11px] text-slate-500">
                  Generated by planner → parallel research → analyst pipeline
                </span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => (
                      <h1
                        className="mt-6 text-lg font-semibold text-slate-100 border-b border-slate-800 pb-1"
                        {...props}
                      />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2
                        className="mt-4 text-sm font-semibold text-slate-100 border-b border-slate-800/60 pb-1"
                        {...props}
                      />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3
                        className="mt-3 text-sm font-semibold text-slate-100"
                        {...props}
                      />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="mt-1" {...props} />
                    ),
                  }}
                >
                  {cleanReport}
                </ReactMarkdown>
              </div>
            </div>

            {/* Sources with links */}
            {(paperItems.length || repoItems.length || blogItems.length) && (
              <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Sources by channel
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    Open in new tabs to inspect the raw signal.
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-3 text-xs">
                  {paperItems.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-slate-100 text-xs">
                        Papers
                      </h3>
                      <ul className="space-y-1">
                        {paperItems.map((p, idx) => (
                          <li key={idx} className="space-y-0.5">
                            <a
                              href={p.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-300 hover:text-emerald-200 hover:underline"
                            >
                              {p.title || "Untitled paper"}
                            </a>
                            {p.venue && (
                              <div className="text-[10px] text-slate-500">
                                {p.venue}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {repoItems.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-slate-100 text-xs">
                        GitHub repos
                      </h3>
                      <ul className="space-y-1">
                        {repoItems.map((r, idx) => (
                          <li key={idx} className="space-y-0.5">
                            <a
                              href={r.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-300 hover:text-emerald-200 hover:underline"
                            >
                              {r.name || "Unnamed repo"}
                            </a>
                            {r.description && (
                              <div className="text-[10px] text-slate-500">
                                {r.description}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {blogItems.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-slate-100 text-xs">
                        Blogs &amp; commentary
                      </h3>
                      <ul className="space-y-1">
                        {blogItems.map((b, idx) => (
                          <li key={idx} className="space-y-0.5">
                            <a
                              href={b.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-300 hover:text-emerald-200 hover:underline"
                            >
                              {b.title || "Blog post"}
                            </a>
                            {b.source && (
                              <div className="text-[10px] text-slate-500">
                                {b.source}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Debug */}
            <details className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 text-[11px] text-slate-400">
              <summary className="cursor-pointer text-xs text-slate-300">
                Debug: show raw agent state
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="font-semibold mb-1 text-slate-200">
                    Session state
                  </div>
                  <pre className="overflow-x-auto text-[10px] leading-snug">
                    {rawState
                      ? JSON.stringify(rawState, null, 2)
                      : "No state loaded"}
                  </pre>
                </div>
                <div>
                  <div className="font-semibold mb-1 text-slate-200">
                    Raw /run response
                  </div>
                  <pre className="overflow-x-auto text-[10px] leading-snug">
                    {rawRunResponse
                      ? JSON.stringify(rawRunResponse, null, 2)
                      : "No /run response captured"}
                  </pre>
                </div>
              </div>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
