#!/usr/bin/env bash
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
POD_NAME="kanario-qwen-image-edit"
GPU_TYPE="${RUNPOD_GPU_TYPE:-NVIDIA A100 80GB PCIe}"
VOLUME_GB=75           # persistent storage for HuggingFace model cache (~65GB)
CONTAINER_DISK_GB=20   # container overlay filesystem

# ── Helpers ─────────────────────────────────────────────────────────────────
info()  { printf '\033[1;34m=> %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m=> %s\033[0m\n' "$*"; }
error() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

require_env() {
    [[ -n "${!1:-}" ]] || error "$1 is not set. $2"
}

require_cmd() {
    command -v "$1" &>/dev/null || error "'$1' is required but not installed."
}

# ── RunPod GraphQL API ──────────────────────────────────────────────────────
runpod_gql() {
    local query="$1"
    local body
    body=$(jq -n --arg q "$query" '{query: $q}')
    curl -s "https://api.runpod.io/graphql?api_key=${RUNPOD_API_KEY}" \
        -H 'Content-Type: application/json' \
        -d "$body"
}

find_pod() {
    local result
    result=$(runpod_gql '
        query {
            myself {
                pods {
                    id name desiredStatus
                    runtime {
                        uptimeInSeconds
                        ports { ip isIpPublic privatePort publicPort type }
                        gpus { id gpuUtilPercent memoryUtilPercent }
                    }
                }
            }
        }
    ')
    echo "$result" | jq -e ".data.myself.pods[] | select(.name == \"${POD_NAME}\")" 2>/dev/null || true
}

get_pod_id() {
    local pod
    pod=$(find_pod)
    [[ -n "$pod" ]] || error "No pod named '${POD_NAME}' found. Run 'deploy' first."
    echo "$pod" | jq -r '.id'
}

# ── Commands ────────────────────────────────────────────────────────────────

cmd_push() {
    require_env RUNPOD_DOCKER_IMAGE "Set to your Docker Hub image (e.g. myuser/kanario-qwen:latest)"
    require_cmd docker

    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

    info "Building Docker image ..."
    docker build -t "${RUNPOD_DOCKER_IMAGE}" "${SCRIPT_DIR}"

    info "Pushing to Docker Hub ..."
    docker push "${RUNPOD_DOCKER_IMAGE}"

    info "Done: ${RUNPOD_DOCKER_IMAGE}"
}

cmd_deploy() {
    require_env RUNPOD_API_KEY  "Get one at https://www.runpod.io/console/user/settings"
    require_env RUNPOD_DOCKER_IMAGE "Set to your Docker Hub image (e.g. myuser/kanario-qwen:latest)"
    require_cmd jq

    # Check for existing pod
    local existing
    existing=$(find_pod)
    if [[ -n "$existing" ]]; then
        local id status
        id=$(echo "$existing" | jq -r '.id')
        status=$(echo "$existing" | jq -r '.desiredStatus')
        warn "Pod '${POD_NAME}' already exists (id: ${id}, status: ${status})"
        echo "  Use 'destroy' first to recreate, or 'start' to resume a stopped pod."
        exit 0
    fi

    info "Creating pod '${POD_NAME}' with ${GPU_TYPE} ..."

    local query
    query=$(cat <<EOF
mutation {
    podFindAndDeployOnDemand(input: {
        name: "${POD_NAME}"
        imageName: "${RUNPOD_DOCKER_IMAGE}"
        gpuTypeId: "${GPU_TYPE}"
        cloudType: ALL
        volumeInGb: ${VOLUME_GB}
        containerDiskInGb: ${CONTAINER_DISK_GB}
        minVcpuCount: 4
        minMemoryInGb: 32
        ports: "8000/http"
        env: [
            { key: "HF_HOME", value: "/runpod-volume/hf-cache" }
        ]
    }) {
        id desiredStatus imageName
        machine { podHostId }
    }
}
EOF
    )

    local result pod_id
    result=$(runpod_gql "$query")
    pod_id=$(echo "$result" | jq -r '.data.podFindAndDeployOnDemand.id // empty')

    if [[ -z "$pod_id" ]]; then
        echo "$result" | jq . 2>/dev/null || echo "$result"
        error "Failed to create pod. See response above."
    fi

    echo ""
    info "Pod created! ID: ${pod_id}"
    echo ""
    info "Server URL:"
    echo "  https://${pod_id}-8000.proxy.runpod.net/health"
    echo ""
    info "First boot downloads the model (~65GB) — takes ~15-20 min."
    info "Check progress:  $(basename "$0") status"
    echo ""
    info "Cost control:"
    echo "  Stop:    $(basename "$0") stop      # no GPU charge, volume preserved"
    echo "  Start:   $(basename "$0") start     # resume pod"
    echo "  Destroy: $(basename "$0") destroy   # delete everything"
}

cmd_status() {
    require_env RUNPOD_API_KEY "Get one at https://www.runpod.io/console/user/settings"
    require_cmd jq

    local pod
    pod=$(find_pod)
    if [[ -z "$pod" ]]; then
        info "No pod named '${POD_NAME}' found."
        exit 0
    fi

    local pod_id status uptime
    pod_id=$(echo "$pod" | jq -r '.id')
    status=$(echo "$pod" | jq -r '.desiredStatus')
    uptime=$(echo "$pod" | jq -r '.runtime.uptimeInSeconds // 0')

    echo "Pod:    ${POD_NAME}"
    echo "ID:     ${pod_id}"
    echo "Status: ${status}"
    echo "Uptime: ${uptime}s"

    if [[ "$status" == "RUNNING" ]]; then
        local gpu_util mem_util
        gpu_util=$(echo "$pod" | jq -r '.runtime.gpus[0].gpuUtilPercent // "N/A"')
        mem_util=$(echo "$pod" | jq -r '.runtime.gpus[0].memoryUtilPercent // "N/A"')
        echo ""
        echo "GPU:    ${gpu_util}%"
        echo "VRAM:   ${mem_util}%"
        echo ""
        echo "Server: https://${pod_id}-8000.proxy.runpod.net"
        echo "Health: https://${pod_id}-8000.proxy.runpod.net/health"
    fi

    echo ""
    echo "Logs:   https://www.runpod.io/console/pods/${pod_id}/logs"
}

cmd_stop() {
    require_env RUNPOD_API_KEY "Get one at https://www.runpod.io/console/user/settings"
    require_cmd jq

    local pod_id
    pod_id=$(get_pod_id)

    info "Stopping pod ${pod_id} ..."
    runpod_gql "mutation { podStop(input: { podId: \"${pod_id}\" }) { id desiredStatus } }" >/dev/null

    info "Pod stopped. Volume preserved — no GPU charges."
    info "Resume with: $(basename "$0") start"
}

cmd_start() {
    require_env RUNPOD_API_KEY "Get one at https://www.runpod.io/console/user/settings"
    require_cmd jq

    local pod_id
    pod_id=$(get_pod_id)

    info "Resuming pod ${pod_id} ..."
    runpod_gql "mutation { podResume(input: { podId: \"${pod_id}\", gpuCount: 1 }) { id desiredStatus } }" >/dev/null

    info "Pod resuming."
    echo "  Server: https://${pod_id}-8000.proxy.runpod.net"
}

cmd_destroy() {
    require_env RUNPOD_API_KEY "Get one at https://www.runpod.io/console/user/settings"
    require_cmd jq

    local pod_id
    pod_id=$(get_pod_id)

    warn "This will delete the pod AND its volume (model cache)."
    info "Terminating pod ${pod_id} ..."
    runpod_gql "mutation { podTerminate(input: { podId: \"${pod_id}\" }) }" >/dev/null

    info "Pod terminated."
}

# ── Main ────────────────────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
Usage: deploy-runpod.sh <command>

Commands:
  push      Build and push Docker image to Docker Hub
  deploy    Create a RunPod pod with GPU
  status    Show pod status and server URL
  stop      Stop pod (no GPU charge, volume preserved)
  start     Resume a stopped pod
  destroy   Terminate pod and delete volume

Environment variables:
  RUNPOD_API_KEY        (required)  API key from https://www.runpod.io/console/user/settings
  RUNPOD_DOCKER_IMAGE   (required)  Docker Hub image, e.g. myuser/kanario-qwen:latest
  RUNPOD_GPU_TYPE       (optional)  default: NVIDIA A100 80GB PCIe

Quickstart:
  export RUNPOD_API_KEY="your-key"
  export RUNPOD_DOCKER_IMAGE="myuser/kanario-qwen:latest"
  ./deploy-runpod.sh push      # build + push image
  ./deploy-runpod.sh deploy    # create pod (~$1.64/hr for A100 80GB)
  ./deploy-runpod.sh status    # get server URL
  ./deploy-runpod.sh stop      # pause when not in use
EOF
    exit 0
}

[[ $# -ge 1 ]] || usage

case "$1" in
    push)    cmd_push ;;
    deploy)  cmd_deploy ;;
    status)  cmd_status ;;
    stop)    cmd_stop ;;
    start)   cmd_start ;;
    destroy) cmd_destroy ;;
    -h|--help) usage ;;
    *) error "Unknown command: $1. Run --help for usage." ;;
esac
