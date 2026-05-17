#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-sv-repair-agent:latest}"
DOCKER_CONFIG="${DOCKER_CONFIG:-$(pwd)/.docker}"

mkdir -p "${DOCKER_CONFIG}"
export DOCKER_CONFIG

docker build -t "${IMAGE_NAME}" .

echo "Built ${IMAGE_NAME}"
