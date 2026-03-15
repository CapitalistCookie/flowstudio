variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "lyrical-epigram-484715-v6"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-east4"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-east4-c"
}

variable "stdb_domain" {
  description = "Domain for SpacetimeDB (Nginx HTTPS terminator on GCE VM)"
  type        = string
  default     = "flowstudio-stdb-proxy-s2vq7emwcq-uk.a.run.app"
}

variable "project_prefix" {
  description = "Prefix for resource naming"
  type        = string
  default     = "flowstudio"
}

variable "stdb_vm_machine_type" {
  description = "Machine type for SpacetimeDB VM"
  type        = string
  default     = "e2-standard-4"
}

variable "certbot_email" {
  description = "Email for Let's Encrypt certificates"
  type        = string
  default     = "admin@flowstudio.ai"
}

variable "upload_function_url" {
  description = "URL of the Cloud Run service for generating signed upload URLs"
  type        = string
  default     = "https://flowstudio-generate-upload-url-s2vq7emwcq-uk.a.run.app"
}

variable "firebase_api_key" {
  description = "Firebase API key for client-side auth"
  type        = string
  sensitive   = true
}

variable "firebase_auth_domain" {
  description = "Firebase auth domain (PROJECT_ID.firebaseapp.com)"
  type        = string
  default     = "lyrical-epigram-484715-v6.firebaseapp.com"
}

variable "firebase_project_id" {
  description = "Firebase project ID"
  type        = string
  default     = "lyrical-epigram-484715-v6"
}
