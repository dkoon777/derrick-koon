# Agent Reasoning and Design Explanation
   
   ## Overview
   AI Research Scout addresses the challenge of CTOs, VCs, and Tech Leaders 
   needing to quickly assess emerging AI technologies without drowning in hype.
   
   ## Reasoning Flow (Detailed)
   
   ### 1. Planning Phase (PlannerAgent)
   - **Input**: User query + persona context
   - **Process**: Gemini-2.0-flash decomposes the query into:
     - Primary topic and subtopics
     - Targeted search queries for each channel (papers/repos/blogs)
     - Time window (days_back) and result limits
   - **Output**: Structured JSON plan (plan_json)
   - **Why this matters**: Ensures all downstream agents have clear, bounded tasks
   
   ### 2. Research Phase (ParallelResearchAgent)
   - **Parallel Execution**: Three agents run simultaneously:
     - PaperAgent: Queries arXiv API with date filtering
     - RepoAgent: Searches GitHub by stars + relevance
     - BlogAgent: Uses Google Search for recent commentary
   - **Process**: Each agent:
     1. Reads plan_json
     2. Calls its assigned tool
     3. Enriches results with persona-specific relevance
     4. Outputs structured JSON
   - **Why parallel**: Reduces latency by 3x vs sequential
   
   ### 3. Analysis Phase (AnalystAgent)
   - **Input**: All three research results + original plan
   - **Process**: Gemini-2.5-pro synthesizes:
     - Executive summary with key takeaways
     - Technical themes grouping related signals
     - Persona-specific recommendations
   - **Output**: Markdown report optimized for the chosen persona
   - **Why Gemini Pro**: Longer context, better synthesis quality
   
   ## Tool Integration Strategy
   
   ### Gemini's Role
   - **Planning**: Structured JSON generation ensures deterministic parsing
   - **Research**: Each agent uses Gemini to add analytical context
   - **Synthesis**: Gemini Pro consolidates multi-source signals
   
   ### External Tools
   - **arXiv**: Authoritative academic signal
   - **GitHub**: Implementation reality check
   - **Google Search**: Industry commentary and trends
   
   ## Memory Design
   
   For this hackathon, memory is intentionally simple:
   - Logs each run to run_log.jsonl
   - Stores: timestamp, query, plan, final_summary
   - Purpose: Audit trail and debugging
   
   Future: Could implement RAG over past searches to avoid redundant research.
   
   ## Known Limitations
   
   1. **Heuristic scoring**: Relevance is LLM-generated, not quantitatively validated
   2. **Non-exhaustive retrieval**: Limited to top 3-5 results per channel
   3. **Advisory output**: Recommendations require human judgment
   4. **No citation verification**: URLs copied from tools but not validated
   5. **Static time windows**: days_back is fixed per query, not adaptive
   
   ## Future Enhancements
   
   ### VC Persona
   - Startup technical diligence: Assess founding team's technical depth
   - Market timing analysis: Is the research → product gap closing?
   - Competitive landscape: Who else is working on this?
   
   ### CTO Persona
   - Implementation strategies: Build vs buy vs partner
   - Resource requirements: Team size, timeline, budget
   - Risk assessment: Technical debt, vendor lock-in
   
   ### Tech Leader Persona
   - Talent and training: What skills does our team need?
   - Platform implications: How does this affect our stack?
   - Timeline recommendations: When to move from POC to production
   
   ## Design Decisions
   
   **Why ADK?** Google's agent framework with built-in Gemini integration
   **Why Plan & Execute?** Balances structure with flexibility
   **Why parallel research?** Speed matters for decision-makers
   **Why multi-persona?** Same signals, different lenses