# Service account for Cloud Run workers
resource "google_service_account" "worker" {
  account_id   = "${var.project_prefix}-worker"
  display_name = "FlowStudio Worker"
}

# Grant worker access to GCS
resource "google_storage_bucket_iam_member" "worker_gcs" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.worker.email}"
}

# Cloud Run service for the Next.js client
resource "google_cloud_run_v2_service" "client" {
  name     = "${var.project_prefix}-client"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.project_prefix}/client:latest"
      ports {
        container_port = 3000
      }
      env {
        name  = "NEXT_PUBLIC_STDB_HOST"
        value = "wss://${var.stdb_domain}"
      }
      env {
        name  = "NEXT_PUBLIC_STDB_MODULE"
        value = var.project_prefix
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
  }
}

# Allow unauthenticated access to client
resource "google_cloud_run_v2_service_iam_member" "client_public" {
  name     = google_cloud_run_v2_service.client.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Worker Cloud Run services (one per worker type)
locals {
  workers = [
    "audio-extract",
    "video-sample",
    "cursor-processor",
    "typing-detector",
    "speech-transcription",
    "video-understanding",
    "ui-change-detector",
    "interaction-pattern",
    "intent-graph",
    "narrative-planner",
    "edit-planner",
    "timeline-builder",
    "render",
  ]

  # Workers that need FFmpeg
  ffmpeg_workers = toset(["audio-extract", "video-sample", "render"])

  # Workers with higher resource needs
  heavy_workers = toset(["render", "video-understanding", "intent-graph"])
}

resource "google_cloud_run_v2_service" "workers" {
  for_each = toset(local.workers)

  name     = "${var.project_prefix}-${each.key}"
  location = var.region

  template {
    service_account = google_service_account.worker.email

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.project_prefix}/${each.key}:latest"

      env {
        name  = "WORKER_NAME"
        value = each.key
      }
      env {
        name  = "STDB_INTERNAL_HOST"
        value = google_compute_instance.stdb.network_interface[0].network_ip
      }
      env {
        name  = "STDB_MODULE"
        value = var.project_prefix
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.assets.name
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      resources {
        limits = {
          cpu    = contains(local.heavy_workers, each.key) ? "2" : "1"
          memory = contains(local.heavy_workers, each.key) ? "2Gi" : "1Gi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
  }
}
