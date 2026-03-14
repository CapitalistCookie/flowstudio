"""Configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
_env_path = Path(__file__).resolve().parents[3] / ".env"
if _env_path.exists():
    load_dotenv(_env_path)


class Config:
    """Gateway configuration from environment."""

    # GCP / GCS
    GCS_BUCKET: str = os.getenv("GCS_BUCKET", "flowstudio-assets")
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "")

    # LLM provider — prefer Gemini since GCP keys are already set up
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "gemini")  # "gemini" | "openai" | "anthropic"
    GOOGLE_AI_API_KEY: str = os.getenv("GOOGLE_AI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Railtracks
    RAILTRACKS_STORAGE: str = os.getenv("RAILTRACKS_STORAGE", ".railtracks")

    # Server
    PORT: int = int(os.getenv("GATEWAY_PORT", "8000"))
    HOST: str = os.getenv("GATEWAY_HOST", "0.0.0.0")

    # Validation
    MAX_VALIDATION_RETRIES: int = int(os.getenv("MAX_VALIDATION_RETRIES", "2"))

    @classmethod
    def get_llm_model_name(cls) -> str:
        """Return the model name based on configured provider."""
        provider = cls.LLM_PROVIDER.lower()
        if provider == "gemini":
            return "gemini-2.0-flash"
        elif provider == "openai":
            return "gpt-4o"
        elif provider == "anthropic":
            return "claude-sonnet-4-20250514"
        else:
            return "gemini-2.0-flash"  # fallback


config = Config()
