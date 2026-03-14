"""GCS tools for reading/writing signal data and edit plans.

These tools allow the Railtracks gateway to interoperate with the
TS workers via shared GCS storage.
"""

import json
import logging
import os
from typing import Optional

from google.cloud import storage

logger = logging.getLogger(__name__)


class GCSClient:
    """Simple GCS client for reading/writing JSON signal files."""

    def __init__(self, bucket_name: Optional[str] = None, project_id: Optional[str] = None):
        self.bucket_name = bucket_name or os.getenv("GCS_BUCKET", "flowstudio-assets")
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID", "")
        self._client: Optional[storage.Client] = None

    @property
    def client(self) -> storage.Client:
        if self._client is None:
            self._client = storage.Client(project=self.project_id)
        return self._client

    @property
    def bucket(self) -> storage.Bucket:
        return self.client.bucket(self.bucket_name)

    def _path(self, project_id: str, *parts: str) -> str:
        """Build a GCS path: projects/{project_id}/{parts...}"""
        return "/".join(["projects", project_id, *parts])

    def read_json(self, project_id: str, *path_parts: str) -> Optional[list | dict]:
        """Read a JSON file from GCS. Returns None if not found."""
        gcs_path = self._path(project_id, *path_parts)
        blob = self.bucket.blob(gcs_path)

        try:
            content = blob.download_as_text()
            return json.loads(content)
        except Exception as e:
            logger.warning(f"Failed to read GCS {gcs_path}: {e}")
            return None

    def write_json(self, project_id: str, data: list | dict, *path_parts: str) -> str:
        """Write a JSON file to GCS. Returns the GCS path."""
        gcs_path = self._path(project_id, *path_parts)
        blob = self.bucket.blob(gcs_path)
        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type="application/json",
        )
        logger.info(f"Wrote {gcs_path} ({len(json.dumps(data))} bytes)")
        return f"gs://{self.bucket_name}/{gcs_path}"

    def read_all_signals(self, project_id: str) -> dict:
        """Read all upstream signal files for a project.

        Returns dict matching SignalData schema with all available signals.
        """
        signal_files = {
            "speech_segments": ("signals", "speech_segments.json"),
            "scene_descriptions": ("signals", "scene_descriptions.json"),
            "ui_transitions": ("signals", "ui_transitions.json"),
            "interaction_clusters": ("signals", "interaction_clusters.json"),
        }

        result = {}
        for key, path_parts in signal_files.items():
            data = self.read_json(project_id, *path_parts)
            result[key] = data if data else []

        return result

    def write_edit_plan(self, project_id: str, edit_plan: list[dict], version: int = 1) -> str:
        """Write an edit plan to GCS with versioning for reprompts."""
        filename = f"edit_plan_v{version}.json"
        return self.write_json(project_id, edit_plan, "signals", filename)

    def write_intent_graph(self, project_id: str, intent_graph: list[dict]) -> str:
        """Write intent graph to GCS."""
        return self.write_json(project_id, intent_graph, "signals", "intent_graph.json")

    def write_narrative_plan(self, project_id: str, narrative_plan: list[dict]) -> str:
        """Write narrative plan to GCS."""
        return self.write_json(project_id, narrative_plan, "signals", "narrative_plan.json")


# Singleton — lazily initialized
_gcs: Optional[GCSClient] = None


def get_gcs() -> GCSClient:
    """Get or create the GCS client singleton."""
    global _gcs
    if _gcs is None:
        _gcs = GCSClient()
    return _gcs
