# VPC Network
resource "google_compute_network" "main" {
  name                    = "${var.project_prefix}-vpc"
  auto_create_subnetworks = false
}

# Subnet
resource "google_compute_subnetwork" "main" {
  name          = "${var.project_prefix}-subnet"
  ip_cidr_range = "10.128.0.0/20"
  region        = var.region
  network       = google_compute_network.main.id
}

# VPC Connector for Cloud Run -> GCE
resource "google_vpc_access_connector" "main" {
  name          = "${var.project_prefix}-vpc"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.main.name
}

# Firewall: allow internal traffic
resource "google_compute_firewall" "internal" {
  name    = "${var.project_prefix}-allow-internal"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  source_ranges = ["10.128.0.0/20", "10.8.0.0/28"]
  target_tags   = ["stdb"]
}

# Firewall: allow HTTP/HTTPS
resource "google_compute_firewall" "web" {
  name    = "${var.project_prefix}-allow-web"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["stdb"]
}

# Firewall: allow SSH
resource "google_compute_firewall" "ssh" {
  name    = "${var.project_prefix}-allow-ssh"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["stdb"]
}

# Static IP for SpacetimeDB VM
resource "google_compute_address" "stdb" {
  name   = "${var.project_prefix}-stdb-ip"
  region = var.region
}
