output "stdb_external_ip" {
  value = google_compute_address.stdb.address
}

output "stdb_internal_ip" {
  value = google_compute_instance.stdb.network_interface[0].network_ip
}

output "gcs_bucket" {
  value = google_storage_bucket.assets.name
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${var.project_prefix}"
}

output "client_url" {
  value = google_cloud_run_v2_service.client.uri
}

output "vpc_connector" {
  value = google_vpc_access_connector.main.name
}
