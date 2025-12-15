# research_scout_agent/agent.py
""" 
ADK agent bridge for the AI Research Scout.

This file exists ONLY to satisfy the ADK `api_server` expectation that
AGENTS_DIR contains subdirectories with an agent.py defining `root_agent`.

The actual Plan & Execute pipeline and agents live under src/:
- Planner, pipeline, and root_agent: src/planner.py
- Tools + execution agents: src/executor.py
- Memory / logging: src/memory.py

Here we simply import `root_agent` from src.planner and re-export it.
"""

from src.planner import root_agent  # type: ignore[attr-defined]

# ADK's api_server will look for `root_agent` in this module.
