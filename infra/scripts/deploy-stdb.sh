#!/bin/bash
set -euo pipefail

# Deploy/update SpacetimeDB on the GCE VM
# Usage: ./deploy-stdb.sh [module-path]

ZONE=${STDB_VM_ZONE:-us-east4-c}
VM_NAME=${STDB_VM_NAME:-flowstudio-stdb}
MODULE_PATH=${1:-packages/stdb-module}

echo "Uploading module to VM..."
gcloud compute scp --zone="$ZONE" --recurse \
  "$MODULE_PATH" "${VM_NAME}:/tmp/stdb-module"

echo "Publishing module on VM..."
gcloud compute ssh --zone="$ZONE" "$VM_NAME" --command='
  cd /tmp/stdb-module
  spacetime publish flowstudio --host http://localhost:3000
'

echo "SpacetimeDB module published."
