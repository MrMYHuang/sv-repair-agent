#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/input.sv" >&2
  exit 2
fi

INPUT_FILE="$1"

if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "Input file does not exist: ${INPUT_FILE}" >&2
  exit 2
fi

IMAGE_NAME="${IMAGE_NAME:-sv-repair-agent:latest}"
DOCKER_CONFIG="${DOCKER_CONFIG:-$(pwd)/.docker}"
INPUT_ABS="$(cd "$(dirname "${INPUT_FILE}")" && pwd)/$(basename "${INPUT_FILE}")"
ENV_ARGS=()
DOCKER_ARGS=(--rm)

mkdir -p "${DOCKER_CONFIG}"
export DOCKER_CONFIG

if [[ ! -f .env ]]; then
  echo "Missing .env file. Create one from .env.example before running the container." >&2
  exit 2
fi

ENV_ARGS+=(--env-file "$(pwd)/.env")

if [[ -t 0 && -t 1 ]]; then
  DOCKER_ARGS+=(-it)
fi

docker run \
  "${DOCKER_ARGS[@]}" \
  "${ENV_ARGS[@]}" \
  -v "${INPUT_ABS}:/input.sv" \
  "${IMAGE_NAME}" \
  --file /input.sv
