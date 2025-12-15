# AI Research Scout

AI Research Scout is an agentic AI decision-support tool designed to help CTOs, VCs, and technical leaders make informed, high-stakes technology and investment decisions as AI adoption moves from experimentation to real enterprise spending.

Built using the Google Gemini API and Google ADK, the system synthesizes signals from research papers, open-source repositories, and technical blogs to distinguish durable technology trends from short-lived hype.

While the demo focuses on the CTO persona due to time constraints, the architecture is explicitly designed to support VC and Tech Leader personas as well.

## Key Capabilities
- Gemini-powered planning and reasoning
- Parallel multi-agent research execution
- Multi-source signal synthesis (papers, repos, blogs)
- Decision-oriented recommendations rather than raw summaries
- Multi-persona architecture (CTO, VC, Tech Leader)

## Project Structure Notes
The `research_scout_agent/` directory is intentionally located at the repository root rather than under `src/`. This follows Google ADK conventions, where each agent is treated as a first-class application module that can be launched independently via `adk web` or `adk api_server`.

The `src/` directory contains shared logic, utilities, planners, executors, and tool integrations that are imported by the agent application.

## 🚀 Getting Started

### Create virtual environment (from repo root)
```bash
python -m venv .venv
```

### Activate environment
```bash
source .venv/bin/activate
```

### Install dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Start ADK backend
```bash
export PYTHONPATH=.
adk web
# OR
adk api_server research_scout_agent --allow_origins="http://localhost:3000"
```

### Sanity test (API server)
```bash
curl -X POST http://localhost:8000/apps/research_scout_agent/users/u_123/sessions/s_123 -H "Content-Type: application/json"

curl -X POST http://localhost:8000/run -H "Content-Type: application/json" -d '{"appName":"research_scout_agent","userId":"u_123","sessionId":"s_123","newMessage":{"role":"user","parts":[{"text":"I am looking for companies to invest in. Show me who is doing interesting work in robotics and supply chain."}]}}'

curl -X DELETE http://localhost:8000/apps/research_scout_agent/users/u_123/sessions/s_123
```

### React UI
```bash
cd frontend
npx create-next-app@latest next-ui
cd next-ui
npm install react-markdown remark-gfm
npm run dev
```

## Demo
See `DEMO.md` for the Loom video.
