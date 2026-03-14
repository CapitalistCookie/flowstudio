# Secret Manager secrets
resource "google_secret_manager_secret" "deepgram_api_key" {
  secret_id = "${var.project_prefix}-deepgram-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "google_ai_api_key" {
  secret_id = "${var.project_prefix}-google-ai-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "${var.project_prefix}-anthropic-api-key"
  replication {
    auto {}
  }
}

# Grant worker SA access to secrets
resource "google_secret_manager_secret_iam_member" "worker_deepgram" {
  secret_id = google_secret_manager_secret.deepgram_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_google_ai" {
  secret_id = google_secret_manager_secret.google_ai_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_secret_manager_secret_iam_member" "worker_anthropic" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}
