#!/usr/bin/env bash
# Publica as imagens no ACR e aplica os manifestos de k8s/ no AKS.
# Referência para o pipeline de CI/CD: cada etapa abaixo corresponde a um step do deploy.
#
# Uso: infra/scripts/deploy-app.sh [tag]
#   tag: padrão = SHA curto do commit atual (sufixo -dirty se houver alterações locais)

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_cmd terraform kubectl docker git
require_azure_cli
tf_init

IMAGE_TAG="${1:-$(git -C "${REPO_ROOT}" rev-parse --short HEAD)}"
if [[ -z "${1:-}" ]] && [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
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
  # O F5 NGINX Ingress Controller rejeita Ingress sem host (spec.rules[0].host: Required value).
  if [[ "${overlay}" == "cloud" ]]; then
    cat >>"${target}/kustomization.yaml" <<YAML
patches:
  - target:
      kind: Ingress
      name: garage-flow-ingress
    patch: |-
      - op: add
        path: /spec/rules/0/host
        value: "${INGRESS_HOST}"
YAML
  fi
  echo "${target}"
}

BOOTSTRAP_ADMIN_SECRET="garage-flow-bootstrap-admin"

# Remove os arquivos renderizados e, se o deploy for interrompido, o Secret temporário do admin.
cleanup() {
  rm -rf "${RENDER_DIR}"
  kubectl delete secret "${BOOTSTRAP_ADMIN_SECRET}" --ignore-not-found >/dev/null 2>&1 || true
}
trap cleanup EXIT

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

# O Secret do primeiro admin só existe enquanto o Job de bootstrap roda: não fica no cluster
# nem é recriado pelo Terraform. A senha permanece no Key Vault/Secrets Manager.
# O manifesto vai pelo stdin para a senha não aparecer na linha de comando.
create_bootstrap_admin_secret() {
  kubectl apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: ${BOOTSTRAP_ADMIN_SECRET}
type: Opaque
stringData:
  ADMIN_NAME: "$(tf_output bootstrap_admin_name)"
  ADMIN_EMAIL: "$(tf_output bootstrap_admin_email)"
  ADMIN_PASSWORD: "$(tf_output bootstrap_admin_password)"
YAML
}

configure_kubectl

# ---------------------------------------------------------------------------
# 3. Banco: migrations e primeiro administrador (idempotente)
# ---------------------------------------------------------------------------
run_job cloud-migration garage-flow-migration

create_bootstrap_admin_secret
run_job cloud-bootstrap-admin garage-flow-bootstrap-admin
kubectl delete secret "${BOOTSTRAP_ADMIN_SECRET}" --ignore-not-found >/dev/null

# ---------------------------------------------------------------------------
# 4. API: ConfigMap, Deployment, Service, Ingress e HPA
# ---------------------------------------------------------------------------
ADDRESS="$(kubectl get service -n "${INGRESS_NAMESPACE}" \
  -o jsonpath='{range .items[?(@.spec.type=="LoadBalancer")]}{.status.loadBalancer.ingress[0].hostname}{.status.loadBalancer.ingress[0].ip}{end}')"
[[ -n "${ADDRESS}" ]] || fail "Load Balancer do Ingress Controller ainda sem endereço público."

# Host do Ingress: o Load Balancer da Azure só tem IP, então usa o DNS curinga nip.io
# (<ip>.nip.io resolve para <ip>), sem precisar de domínio próprio.
INGRESS_HOST="${ADDRESS}.nip.io"

log "Aplicando manifestos da API (host ${INGRESS_HOST})"
kubectl apply -k "$(render_overlay cloud)"
kubectl rollout status deployment/garage-flow-deployment --timeout=300s

log "Deploy concluído (imagem ${IMAGE_TAG})"
echo "  API:     http://${INGRESS_HOST}"
echo "  Swagger: http://${INGRESS_HOST}/docs"
echo "  Health:  http://${INGRESS_HOST}/health"
echo "  Senha do admin: $(tf_output secrets_read_command)"
exit 0
