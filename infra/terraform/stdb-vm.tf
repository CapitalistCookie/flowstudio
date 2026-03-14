# SpacetimeDB GCE VM
resource "google_compute_instance" "stdb" {
  name         = "${var.project_prefix}-stdb"
  machine_type = var.stdb_vm_machine_type
  zone         = var.zone
  tags         = ["stdb"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-balanced"
    }
  }

  # Persistent SSD for SpacetimeDB data
  attached_disk {
    source      = google_compute_disk.stdb_data.self_link
    device_name = "stdb-data"
  }

  network_interface {
    network    = google_compute_network.main.name
    subnetwork = google_compute_subnetwork.main.name

    access_config {
      nat_ip = google_compute_address.stdb.address
    }
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Mount data disk
    if ! mountpoint -q /stdb; then
      mkdir -p /stdb
      DEVICE="/dev/disk/by-id/google-stdb-data"
      if ! blkid $$DEVICE; then
        mkfs.ext4 -F $$DEVICE
      fi
      mount $$DEVICE /stdb
      echo "$$DEVICE /stdb ext4 defaults,nofail 0 2" >> /etc/fstab
    fi

    mkdir -p /stdb/data /stdb/nginx

    # Install Docker
    if ! command -v docker &> /dev/null; then
      apt-get update
      apt-get install -y apt-transport-https ca-certificates curl gnupg
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $$(. /etc/os-release && echo $$VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list
      apt-get update
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    fi

    # Install Nginx + Certbot
    apt-get install -y nginx certbot python3-certbot-nginx

    # Start SpacetimeDB container
    docker pull clockworklabs/spacetime:v2.0.1
    docker run -d --name spacetimedb \
      --restart unless-stopped \
      -p 3000:3000 \
      -v /stdb/data:/stdb/data \
      clockworklabs/spacetime:v2.0.1

    # Configure Nginx
    cat > /etc/nginx/sites-available/stdb <<'NGINX'
    server {
        listen 80;
        server_name ${var.stdb_domain};

        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $$host;
            proxy_set_header X-Real-IP $$remote_addr;
            proxy_read_timeout 86400s;
        }

        # Block external publish
        location /v1/publish {
            allow 127.0.0.1;
            deny all;
            proxy_pass http://127.0.0.1:3000;
        }
    }
    NGINX

    ln -sf /etc/nginx/sites-available/stdb /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx

    # TLS via Certbot (will fail if DNS not pointed yet)
    certbot --nginx -d ${var.stdb_domain} --email ${var.certbot_email} --agree-tos --non-interactive || true
  EOF

  service_account {
    email  = google_service_account.stdb.email
    scopes = ["cloud-platform"]
  }

  allow_stopping_for_update = true
}

# Persistent SSD for SpacetimeDB WAL + snapshots
resource "google_compute_disk" "stdb_data" {
  name = "${var.project_prefix}-stdb-data"
  type = "pd-ssd"
  size = 50
  zone = var.zone
}

# Service account for SpacetimeDB VM
resource "google_service_account" "stdb" {
  account_id   = "${var.project_prefix}-stdb"
  display_name = "FlowStudio SpacetimeDB VM"
}
