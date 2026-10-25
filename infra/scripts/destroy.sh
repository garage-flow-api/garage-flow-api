#!/usr/bin/env bash
# Remove toda a infraestrutura de uma cloud para encerrar a cobrança.
# O state remoto (bucket S3 / Storage Account do bootstrap) é preservado.
#
# Uso: infra/scripts/destroy.sh <aws|azure> [--auto-approve]

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

parse_cloud "${1:-}"
AUTO_APPROVE="${2:-}"

require_cmd terraform
require_cloud_cli
tf_init

if [[ "${AUTO_APPROVE}" != "--auto-approve" ]]; then
  warn "Isso destrói cluster, banco de dados (com todos os dados), registry e segredos de ${CLOUD}/${ENVIRONMENT}."
  read -r -p "Digite 'destruir' para confirmar: " answer
  [[ "${answer}" == "destruir" ]] || fail "Operação cancelada."
fi

# ---------------------------------------------------------------------------
# 1. Aplicação: remove os pods da API antes de remover o banco e o cluster.
# ---------------------------------------------------------------------------
# O kubectl só é usado nesta limpeza: sem ele, o terraform destroy remove o cluster mesmo assim.
if ! command -v kubectl >/dev/null 2>&1; then
  warn "kubectl não encontrado; pulando a remoção da aplicação e seguindo para o terraform destroy."
elif configure_kubectl 2>/dev/null; then
  log "Removendo a aplicação do cluster"
  kubectl delete -k "${INFRA_DIR}/kubernetes/overlays/cloud" --ignore-not-found --wait=true || true
  kubectl delete job garage-flow-migration garage-flow-bootstrap-admin --ignore-not-found || true
  kubectl delete secret garage-flow-bootstrap-admin --ignore-not-found || true
else
  warn "Cluster inacessível ou já removido; seguindo para o terraform destroy."
fi

# ---------------------------------------------------------------------------
# 2. Ingress Controller: o Load Balancer é criado pelo Kubernetes, fora do Terraform.
# Removê-lo primeiro evita que interfaces de rede órfãs bloqueiem a exclusão da VPC/VNet.
# ---------------------------------------------------------------------------
log "Removendo Ingress Controller e Load Balancer"
tf destroy -input=false -auto-approve -var-file="$(tf_var_file)" \
  -target=module.kubernetes_platform.helm_release.ingress || true

if [[ "${CLOUD}" == "aws" ]]; then
  VPC_ID="$(tf_output vpc_id 2>/dev/null || true)"
  if [[ -n "${VPC_ID}" ]]; then
    log "Aguardando a AWS remover o Load Balancer da VPC ${VPC_ID}"
    for _ in $(seq 1 30); do
      remaining="$(aws elbv2 describe-load-balancers --region "$(tf_output aws_region)" \
        --query "length(LoadBalancers[?VpcId=='${VPC_ID}'])" --output text 2>/dev/null || echo 0)"
      [[ "${remaining}" == "0" ]] && break
      sleep 10
    done
  fi
fi

# ---------------------------------------------------------------------------
# 3. Demais recursos
# ---------------------------------------------------------------------------
log "Destruindo a infraestrutura (~10-15 minutos)"
tf destroy -input=false -auto-approve -var-file="$(tf_var_file)"

log "Infraestrutura de ${CLOUD}/${ENVIRONMENT} removida. O state remoto do bootstrap foi preservado."
