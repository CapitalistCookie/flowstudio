import os
from pydantic import BaseModel, Field


class Settings(BaseModel):
    gcs_bucket: str = Field(default_factory=lambda: os.getenv("GCS_BUCKET", "flowstudio-assets"))
    gcp_project_id: str = Field(default_factory=lambda: os.getenv("GCP_PROJECT_ID", ""))
    google_ai_api_key: str = Field(default_factory=lambda: os.getenv("GOOGLE_AI_API_KEY", ""))
    vertex_region: str = Field(default_factory=lambda: os.getenv("VERTEX_REGION", "us-central1"))
    vertex_project_id: str = Field(default_factory=lambda: os.getenv("VERTEX_PROJECT_ID", ""))
    anthropic_api_key: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    stdb_host: str = Field(default_factory=lambda: os.getenv("STDB_INTERNAL_HOST", "localhost"))
    stdb_module: str = Field(default_factory=lambda: os.getenv("STDB_MODULE", "flowstudio"))
    allowed_origins: list[str] = Field(
        default_factory=lambda: os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    )


def get_settings() -> Settings:
    return Settings()
