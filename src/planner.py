"""Plan & Execute pipeline (Planner → ParallelResearch → Analyst).

PlannerAgent produces a planning JSON stored in session state under `plan_json`.
ParallelResearchAgent (papers/repos/blogs) and AnalystAgent are imported from
executor.py.

This file is based on your `planner.py.old` (keeps the same prompt and keys).
"""

import os

from google.adk.agents import LlmAgent, SequentialAgent
from google.genai import types as genai_types

from src.executor import parallel_research_agent, analyst_agent


def get_model(name_env: str, default: str) -> str:
    return os.getenv(name_env, default)


FAST_MODEL = get_model("GEMINI_MODEL_FAST", "gemini-2.0-flash")


PLANNER_INSTRUCTION = """
You are PlannerAgent.

Given a user query, produce a compact JSON plan that downstream agents can use.

Return ONLY a JSON object with this schema:
{
  "primary_topic": "...",
  "subtopics": ["...", "..."],
  "persona": "VC" | "CTO" | "tech leader",
  "paper_query": "...",
  "repo_query": "...",
  "blog_query": "...",
  "days_back": <int>,
  "max_papers": <int>,
  "max_repos": <int>,
  "max_blogs": <int>
}

Guidelines:
- Keep queries short and keyword-like.
- Default persona to VC if not specified.
- Default days_back to 28 (4 weeks).
- Default each max_* to 3.
- Output only JSON (no markdown fences, no commentary).
"""


planner_agent = LlmAgent(
    name="PlannerAgent",
    model=FAST_MODEL,
    instruction=PLANNER_INSTRUCTION,
    output_key="plan_json",
    generate_content_config=genai_types.GenerateContentConfig(
        max_output_tokens=400,
        response_mime_type="application/json",
    ),
)


# --- Plan & Execute pipeline (Planner → ParallelResearch → Analyst) --------

research_pipeline = SequentialAgent(
    name="ResearchPipeline",
    sub_agents=[
        planner_agent,
        parallel_research_agent,
        analyst_agent,
    ],
    description="Orchestrates the planning, research, and analysis pipeline.",
)

# ADK will ultimately use this as the root agent (via research_scout_agent/agent.py)
root_agent = research_pipeline
