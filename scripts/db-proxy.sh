#!/usr/bin/env bash
# Legacy name kept for muscle memory. Azure Flexible Server does not need a
# Cloud SQL-style proxy — allow your public IP, then connect with sslmode=require.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${ROOT}/scripts/azure/db-allow-my-ip.sh"
