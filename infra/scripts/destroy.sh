#!/usr/bin/env bash
# Remove toda a infraestrutura da Azure para encerrar o consumo de créditos.
# O state remoto (Storage Account do bootstrap) é preservado.
#
# Uso: infra/scripts/destroy.sh [--auto-approve]

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

AUTO_APPROVE="${1:-}"

require_cmd terraform
require_azure_cli
tf_init

if [[ "${AUTO_APPROVE}" != "--auto-approve" ]]; then
  warn "Isso destrói cluster, banco de dados (com todos os dados), registry e segredos de azure/${ENVIRONMENT}."
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
# Removê-lo primeiro evita que IPs públicos e regras órfãs bloqueiem a exclusão da VNet.
# ---------------------------------------------------------------------------
log "Removendo Ingress Controller e Load Balancer"
tf destroy -input=false -auto-approve -var-file="$(tf_var_file)" \
  -target=module.kubernetes_platform.helm_release.ingress || true

# ---------------------------------------------------------------------------
# 3. Demais recursos
# ---------------------------------------------------------------------------
log "Destruindo a infraestrutura (~10-15 minutos)"
tf destroy -input=false -auto-approve -var-file="$(tf_var_file)"

log "Infraestrutura de azure/${ENVIRONMENT} removida. O state remoto do bootstrap foi preservado."
