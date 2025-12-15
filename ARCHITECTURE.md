# System Architecture

AI Research Scout uses a hybrid sequential + parallel agentic architecture built on Google ADK.

## High-Level Flow (ASCII)
```
User (Persona: CTO / VC / Tech Leader)
              |
              v
+--------------------------+
|        Planner           |
|  (Gemini-powered)        |
+--------------------------+
              |
              v
+--------------------------+
|        Executor          |
|  (Orchestration Layer)   |
+--------------------------+
     |          |          |
     v          v          v
+---------+ +---------+ +---------+
| Paper   | | Repo    | | Blog    |
| Agent   | | Agent   | | Agent   |
+---------+ +---------+ +---------+
      \         |          /
       \        |         /
        v       v        v
+--------------------------------+
|     Gemini API Synthesis        |
+--------------------------------+
              |
              v
Decision-Oriented Recommendation
```

## Detailed Sequence Flow

The following diagram shows the complete request lifecycle through the agentic system:

![Sequence Diagram](images/sequence_diagram.png)

## Key Design Points
- Gemini-powered planning
- Parallel multi-agent execution
- Sequential + parallel orchestration

## ADK Layout
The `research_scout_agent/` directory lives at repo root per ADK conventions. Shared logic resides in `src/`.
