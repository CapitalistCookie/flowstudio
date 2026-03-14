# GCS bucket for project assets
resource "google_storage_bucket" "assets" {
  name     = "${var.project_prefix}-assets"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy               = false

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  cors {
    origin          = ["https://app.flowstudio.ai", "http://localhost:3000"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# Terraform state bucket
resource "google_storage_bucket" "terraform_state" {
  name     = "${var.project_prefix}-terraform-state"
  location = var.region

  uniform_bucket_level_access = true
  versioning {
    enabled = true
  }
}

# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = var.project_prefix
  format        = "DOCKER"
}
