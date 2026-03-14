# FlowStudio Railtracks Gateway

Agentic AI video editing pipeline powered by [Railtracks](https://railtownai.github.io/railtracks/).

## Architecture

```
Upstream TS Workers → GCS Signals → [This Gateway] → Edit Plan → GCS
                                          │
                                   IntentAgent (Railtracks)
                                          │
                                   NarrativeAgent (Railtracks)
                                          │
                                   EditAgent (Railtracks)
                                          │
                                   Validation Loop
```

## Quick Start

```bash
# Create venv and install
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set up environment (copy from project root .env)
export LLM_PROVIDER=gemini
export GOOGLE_AI_API_KEY=your-key

# Run
uvicorn app.main:app --port 8000 --reload

# Run tests (no LLM needed)
pytest tests/ -v

# Railtracks visualization
railtracks init
railtracks viz
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/generate-edits` | Full pipeline: signals → edit plan |
| POST | `/api/v1/reprompt` | Modify edit plan with user feedback |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/runs/{run_id}` | Flow run status |

## Why Railtracks?

- **Pure Python agents** — no config files, no graph editors
- **Full observability** — see every LLM call, token usage, latency via `railtracks viz`
- **Validation loops** — programmatic output quality checks with automatic retry
- **Sequential flows** — IntentAgent → NarrativeAgent → EditAgent chained naturally
