# src/memory.py
""" 
Memory / logging for the Plan & Execute pipeline.

For the hackathon, we implement a simple "memory" that logs each run as:
- timestamp
- user_request
- generated plan (plan_json)
- final summary (final_summary)

We print the log to stdout and also append to a JSONL file (run_log.jsonl)
for basic persistence and auditability.
"""

import json
import datetime
from typing import Dict, Any


def log_state(user_request: str, final_state: Dict[str, Any], logfile: str = "run_log.jsonl") -> None:
    """ 
    Logs the final state of the agent run to stdout and to a JSONL file.
    """
    timestamp = datetime.datetime.now().isoformat()
    log_entry = {
        "timestamp": timestamp,
        "user_request": user_request,
        "final_summary": final_state.get("final_summary", "N/A"),
        "plan_generated": final_state.get("plan_json", "N/A"),
    }

    # Print for immediate feedback
    print("\n--- [memory.py] Logging run details ---")
    print(json.dumps(log_entry, indent=2)[:1000] + "...")

    # Append to JSONL file for simple persistence
    try:
        with open(logfile, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        print(f"[memory.py] Warning: could not write to {logfile}: {e}")
