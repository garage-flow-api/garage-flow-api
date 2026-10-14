#!/usr/bin/env bash
# Publica as imagens no registry da cloud e aplica os manifestos de k8s/ no cluster.
# Referência para o pipeline de CI/CD: cada etapa abaixo corresponde a um step do deploy.
#
# Uso: infra/scripts/deploy-app.sh <aws|azure> [tag]
#   tag: padrão = SHA curto do commit atual (sufixo -dirty se houver alterações locais)

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

parse_cloud "${1:-}"
require_cmd terraform kubectl docker git
require_cloud_cli
tf_init

IMAGE_TAG="${2:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD)}"
if [[ -z "${2:-}" ]] && [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  IMAGE_TAG="${IMAGE_TAG}-dirty"
fi

API_REPOSITORY="$(tf_output api_image_repository)"
MIGRATION_REPOSITORY="$(tf_output migration_image_repository)"
INGRESS_NAMESPACE="$(tf_output ingress_namespace)"
OVERLAYS_DIR="${INFRA_DIR}/kubernetes/overlays"
RENDER_DIR="${INFRA_DIR}/kubernetes/.deploy"

# ---------------------------------------------------------------------------
# 1. Build e push das imagens
# Os nodes são x86_64: o build força linux/amd64 (necessário em Macs Apple Silicon).
# ---------------------------------------------------------------------------
log "Autenticando no registry $(tf_output registry_url)"
eval "$(tf_output registry_login_command)"

log "Build da imagem da API (${API_REPOSITORY}:${IMAGE_TAG})"
docker build --platform linux/amd64 --target production \
  -t "${API_REPOSITORY}:${IMAGE_TAG}" "${REPO_ROOT}"

log "Build da imagem dos Jobs (${MIGRATION_REPOSITORY}:${IMAGE_TAG})"
docker build --platform linux/amd64 --target build \
  -t "${MIGRATION_REPOSITORY}:${IMAGE_TAG}" "${REPO_ROOT}"

docker push "${API_REPOSITORY}:${IMAGE_TAG}"
docker push "${MIGRATION_REPOSITORY}:${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# 2. Renderização: overlay temporário que troca as imagens locais pelas do registry
# (equivalente a `kustomize edit set image`, sem alterar arquivos versionados).
# ---------------------------------------------------------------------------
render_overlay() {
  local overlay="$1"
  local target="${RENDER_DIR}/${overlay}"
  mkdir -p "${target}"
  cat >"${target}/kustomization.yaml" <<YAML
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../overlays/${overlay}
images:
  - name: garage-flow-api
    newName: ${API_REPOSITORY}
    newTag: "${IMAGE_TAG}"
  - name: garage-flow-api-migration
    newName: ${MIGRATION_REPOSITORY}
    newTag: "${IMAGE_TAG}"
YAML
  echo "${target}"
}

trap 'rm -rf "${RENDER_DIR}"' EXIT

# Jobs são imutáveis: cada execução remove o anterior, aplica o novo e aguarda a conclusão.
run_job() {
  local overlay="$1" job="$2"
  log "Executando Job ${job}"
  kubectl delete job "${job}" --ignore-not-found --wait=true >/dev/null
  kubectl apply -k "$(render_overlay "${overlay}")"
  if ! kubectl wait --for=condition=complete "job/${job}" --timeout=300s; then
    kubectl logs "job/${job}" --all-containers --tail=100 || true
    fail "Job ${job} não concluiu."
  fi
  kubectl logs "job/${job}" --tail=20 || true
}

configure_kubectl

# ---------------------------------------------------------------------------
# 3. Banco: migrations e primeiro administrador (idempotente)
# ---------------------------------------------------------------------------
run_job cloud-migration garage-flow-migration
run_job cloud-bootstrap-admin garage-flow-bootstrap-admin

# ---------------------------------------------------------------------------
# 4. API: ConfigMap, Deployment, Service, Ingress e HPA
# ---------------------------------------------------------------------------
log "Aplicando manifestos da API"
kubectl apply -k "$(render_overlay cloud)"
kubectl rollout status deployment/garage-flow-deployment --timeout=300s

ADDRESS="$(kubectl get service -n "${INGRESS_NAMESPACE}" \
  -o jsonpath='{range .items[?(@.spec.type=="LoadBalancer")]}{.status.loadBalancer.ingress[0].hostname}{.status.loadBalancer.ingress[0].ip}{end}')"

log "Deploy concluído (imagem ${IMAGE_TAG})"
echo "  API:     http://${ADDRESS}"
echo "  Swagger: http://${ADDRESS}/docs"
echo "  Health:  http://${ADDRESS}/health"
echo "  Senha do admin: $(tf_output secrets_read_command)"
[[ "${CLOUD}" == "aws" ]] && warn "O DNS do Load Balancer da AWS pode levar alguns minutos para propagar."
exit 0
