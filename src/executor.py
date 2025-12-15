# src/executor.py
#
# Backend agents + tools for AI Research Scout.
#
# Fixes included:
# - Deterministic sanitization of agent JSON outputs (no extra LLM calls)
# - Prevent blog ``` fences + duplicated JSON from breaking parsing
# - Reduce MAX_TOKENS truncation risk by raising output budgets
# - Normalize URLs to avoid common 404 caused by trailing punctuation
# - Force Analyst markdown structure so "Technical Landscape" themes don't lump together

import os
import datetime
import json
from typing import Any, Dict, List

import httpx
import feedparser

from google.adk.agents import LlmAgent, ParallelAgent
from google.adk.tools import FunctionTool, google_search
from google.genai import types as genai_types

# -------------------------------------------------------------------
# Deterministic sanitizers (NO extra LLM calls)
# -------------------------------------------------------------------

def _extract_first_json_value(text: str) -> Any:
    """
    Extract the first valid JSON value from a messy string.

    Handles:
    - Markdown fences: ```json ... ```
    - Leading commentary
    - Duplicate JSON concatenation: {..}{..} or ```{..}\n{..}
    - JSON arrays too: [...]
    """
    if not text or not isinstance(text, str):
        raise ValueError("empty/non-string text")

    s = text.strip()

    # Remove markdown fences (very common from LLMs)
    if s.startswith("```"):
        # Drop first fence line(s)
        s = s.replace("```json", "```", 1)
        s = s[3:].lstrip()  # remove leading ```
    if s.endswith("```"):
        s = s[:-3].rstrip()

    # Find first JSON start
    first_curly = s.find("{")
    first_square = s.find("[")
    starts = [p for p in [first_curly, first_square] if p != -1]
    if not starts:
        raise ValueError("no JSON start found")

    start = min(starts)
    s = s[start:]

    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(s)  # parses only the first JSON value
    return obj


def _normalize_url(u: str) -> str:
    u = (u or "").strip()
    # Strip trailing punctuation that breaks URLs
    while u and u[-1] in [")", "]", ".", ",", ";", "\"", "'"]:
        u = u[:-1]
    return u.strip()


def _sanitize_links(obj: Any) -> Any:
    """
    Walk a nested JSON-like structure and normalize any "url" fields.
    """
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k == "url" and isinstance(v, str):
                obj[k] = _normalize_url(v)
            else:
                obj[k] = _sanitize_links(v)
        return obj
    if isinstance(obj, list):
        return [_sanitize_links(x) for x in obj]
    return obj


def sanitize_json_str(raw: str) -> str:
    """
    Convert messy JSON-ish output into strict JSON string.
    If parsing fails, returns original raw unchanged.
    """
    if not isinstance(raw, str) or not raw.strip():
        return raw

    try:
        obj = _extract_first_json_value(raw)
        obj = _sanitize_links(obj)
        # Compact JSON to reduce prompt size for AnalystAgent
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        return raw


def after_agent_sanitize_json(callback_context) -> None:
    """
    ADK after_agent_callback: sanitize the agent's output under agent.output_key.
    Must accept a single positional arg (callback_context).
    """
    agent = getattr(callback_context, "agent", None)
    state = getattr(callback_context, "state", None)

    if not agent or not isinstance(state, dict):
        return None

    output_key = getattr(agent, "output_key", None)
    if not output_key:
        return None

    raw = state.get(output_key)
    if isinstance(raw, str):
        state[output_key] = sanitize_json_str(raw)

    return None


def after_agent_trim_final_summary(callback_context) -> None:
    state = getattr(callback_context, "state", None)
    if not isinstance(state, dict):
        return None
    fs = state.get("final_summary")
    if isinstance(fs, str):
        state["final_summary"] = fs.strip()
    return None


# -------------------------------------------------------------------
# Model config helpers
# -------------------------------------------------------------------

def get_model(name_env: str, default: str) -> str:
    return os.getenv(name_env, default)

FAST_MODEL = get_model("GEMINI_MODEL_FAST", "gemini-2.0-flash")
ANALYST_MODEL = get_model("GEMINI_MODEL_ANALYST", "gemini-2.5-pro")


# -------------------------------------------------------------------
# Tools
# -------------------------------------------------------------------

ARXIV_API_URL = "https://export.arxiv.org/api/query"

def search_papers_func(query: str, days_back: int = 30, max_results: int = 5) -> Dict[str, Any]:
    search_query = f"all:{query.replace(' ', '+')}"
    max_results = max(1, min(max_results, 20))
    params = {"search_query": search_query, "start": 0, "max_results": max_results}

    resp = httpx.get(ARXIV_API_URL, params=params, timeout=15.0)
    resp.raise_for_status()

    feed = feedparser.parse(resp.text)
    papers: List[Dict[str, Any]] = []

    cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=days_back)

    for entry in feed.entries:
        published_str = entry.get("published", "")
        try:
            published_dt = datetime.datetime.strptime(published_str[:10], "%Y-%m-%d")
        except Exception:
            published_dt = None

        if published_dt and published_dt < cutoff_date:
            continue

        year = published_dt.year if published_dt else datetime.datetime.utcnow().year

        papers.append(
            {
                "title": (entry.get("title", "") or "").strip(),
                "authors": [a.name for a in entry.get("authors", [])],
                "year": year,
                "venue": "arXiv",
                "url": entry.get("link", "") or "",
                "summary": (entry.get("summary", "") or "").strip(),
            }
        )

    return {"papers": papers}


GITHUB_API_URL = "https://api.github.com/search/repositories"

def search_repos_func(query: str, max_results: int = 5) -> Dict[str, Any]:
    max_results = max(1, min(max_results, 10))

    token = os.getenv("GITHUB_TOKEN")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "ai-research-scout"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    params = {"q": query, "sort": "stars", "order": "desc", "per_page": max_results}

    resp = httpx.get(GITHUB_API_URL, params=params, headers=headers, timeout=15.0)
    resp.raise_for_status()

    data = resp.json()
    items = data.get("items", [])

    repos: List[Dict[str, Any]] = []
    for item in items[:max_results]:
        repos.append(
            {
                "name": item.get("full_name") or "",
                "url": item.get("html_url") or "",
                "description": item.get("description") or "",
                "stars": int(item.get("stargazers_count", 0) or 0),
                "last_updated": item.get("updated_at") or "",
            }
        )

    return {"repos": repos}


search_papers_tool = FunctionTool(search_papers_func)
search_repos_tool = FunctionTool(search_repos_func)


# -------------------------------------------------------------------
# Research sub-agents (strict JSON + "copy URLs exactly")
# -------------------------------------------------------------------

PAPER_AGENT_INSTRUCTION = """
You are PaperAgent.

Inputs:
- plan_json in session_state (JSON string)
- tool: search_papers_tool

Do:
1) Parse plan_json and read paper_query, days_back, max_papers
2) Call search_papers_tool ONCE using:
   (query=paper_query, days_back=days_back, max_results=max_papers)

3) Output ONLY valid JSON:
{
  "papers": [
    {
      "title": "...",
      "authors": ["..."],
      "year": 2024,
      "venue": "arXiv",
      "url": "https://...",
      "summary": "...",
      "relevance_for_vc": "...",
      "relevance_for_cto": "...",
      "relevance_for_tech_leader": "..."
    }
  ]
}

CRITICAL:
- You MUST copy each paper's url EXACTLY from the tool output. Do NOT rewrite it.
- If tool output has empty url, use "".
Rules:
- No markdown fences, no extra text.
- Do not invent titles/authors/venues beyond tool results.
"""


REPO_AGENT_INSTRUCTION = """
You are RepoAgent.

Inputs:
- plan_json in session_state (JSON string)
- tool: search_repos_tool

Do:
1) Parse plan_json and read repo_query, max_repos
2) Call search_repos_tool ONCE using:
   (query=repo_query, max_results=max_repos)

3) Output ONLY valid JSON:
{
  "repos": [
    {
      "name": "owner/project",
      "url": "https://github.com/owner/project",
      "description": "...",
      "stars": 0,
      "last_updated": "2024-05-04T01:44:09Z",
      "activity": "...",
      "tech_stack": "...",
      "fit_for_vc": "...",
      "fit_for_cto": "...",
      "fit_for_tech_leader": "..."
    }
  ]
}

CRITICAL:
- You MUST copy each repo url EXACTLY from the tool output. Do NOT rewrite it.
- If tool output has empty url, use "".
Rules:
- No markdown fences, no extra text.
- Do not invent URLs.
"""


BLOG_AGENT_INSTRUCTION = """
You are BlogAgent.

Inputs:
- plan_json in session_state (JSON string)
- tool: google_search

Do:
1) Parse plan_json and read blog_query, max_blogs, days_back
2) Use google_search to find relevant sources.
3) Output ONLY valid JSON:
{
  "blogs": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "...",
      "source": "...",
      "signal_for_vc": "...",
      "signal_for_cto": "...",
      "signal_for_tech_leader": "..."
    }
  ]
}

CRITICAL:
- Output MUST be ONLY ONE JSON object. No duplication. No markdown fences.
- You MUST copy each url EXACTLY as returned by google_search results.
- If a result has no url, use "".
Rules:
- Do not invent URLs.
"""


paper_agent = LlmAgent(
    name="PaperAgent",
    model=FAST_MODEL,
    instruction=PAPER_AGENT_INSTRUCTION,
    tools=[search_papers_tool],
    output_key="papers_result",
    after_agent_callback=after_agent_sanitize_json,
    generate_content_config=genai_types.GenerateContentConfig(
        max_output_tokens=2600,
        response_mime_type="application/json",
    ),
)

repo_agent = LlmAgent(
    name="RepoAgent",
    model=FAST_MODEL,
    instruction=REPO_AGENT_INSTRUCTION,
    tools=[search_repos_tool],
    output_key="repos_result",
    after_agent_callback=after_agent_sanitize_json,
    generate_content_config=genai_types.GenerateContentConfig(
        max_output_tokens=2400,
        response_mime_type="application/json",
    ),
)

blog_agent = LlmAgent(
    name="BlogAgent",
    model=FAST_MODEL,
    instruction=BLOG_AGENT_INSTRUCTION,
    tools=[google_search],
    output_key="blogs_result",
    after_agent_callback=after_agent_sanitize_json,
    generate_content_config=genai_types.GenerateContentConfig(
        max_output_tokens=2200,
        response_mime_type="application/json",
    ),
)

parallel_research_agent = ParallelAgent(
    name="ParallelResearchAgent",
    sub_agents=[paper_agent, repo_agent, blog_agent],
    description="Runs paper, repo, and blog research in parallel.",
)


# -------------------------------------------------------------------
# Analyst agent (final step): force theme separation in Markdown
# -------------------------------------------------------------------

ANALYST_INSTRUCTION = """
You are AnalystAgent.

Inputs in session_state (strings):
- plan_json
- papers_result
- repos_result
- blogs_result

Output:
- Write a plain-text Markdown report (NO code fences) to output_key final_summary.

Hard requirements:
- MUST include these top-level headings exactly once:
  # Executive Summary
  # Technical Landscape
  # Signals & Recommendations

Under "# Technical Landscape":
- MUST create 2–4 themes, formatted like:

## Theme 1: <short title>
<1–2 sentence overview>

- Paper (P0): <title> — <why it matters>
- Repo (R0): <name> — <why it matters>
- Blog (B0): <title> — <why it matters>

(Blank line)
## Theme 2: ...

Rules:
- Use ONLY papers/repos/blogs present in inputs.
- Do NOT invent URLs, titles, authors, years, or stats.
- Keep each bullet tight (1 sentence).
- For persona emphasis: if persona is VC, lead with market signals; if CTO, lead with feasibility/integration.
"""

analyst_agent = LlmAgent(
    name="AnalystAgent",
    model=ANALYST_MODEL,
    instruction=ANALYST_INSTRUCTION,
    output_key="final_summary",
    after_agent_callback=after_agent_trim_final_summary,
    generate_content_config=genai_types.GenerateContentConfig(
        max_output_tokens=2600,
        response_mime_type="text/plain",
    ),
)
