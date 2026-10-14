#!/usr/bin/env bash
# Funções compartilhadas pelos scripts de infraestrutura. Não execute diretamente.

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
ENVIRONMENT="${ENVIRONMENT:-staging}"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
fail() {
  printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "${cmd}" >/dev/null 2>&1 || fail "Comando '${cmd}' não encontrado. Veja os pré-requisitos em infra/README.md."
  done
}

# Valida o argumento <aws|azure> e exporta CLOUD e STACK_DIR.
parse_cloud() {
  CLOUD="${1:-}"
  case "${CLOUD}" in
    aws | azure) ;;
    *) fail "Informe a cloud: aws ou azure." ;;
  esac
  STACK_DIR="${INFRA_DIR}/${CLOUD}"
  export CLOUD STACK_DIR
  load_cloud_env
}

# Carrega infra/<cloud>/.env.<cloud> (ignorado pelo Git), gerado por setup-azure.sh.
# Ex.: ARM_SUBSCRIPTION_ID da assinatura Azure escolhida no wizard.
load_cloud_env() {
  local env_file="${STACK_DIR}/.env.${CLOUD}"
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${env_file}"
    set +a
  fi
}

# Lê um valor string de environments/<ENVIRONMENT>.tfvars (ex.: tfvars_value location).
tfvars_value() {
  sed -n "s/^${1}[[:space:]]*=[[:space:]]*\"\(.*\)\".*/\1/p" "${STACK_DIR}/$(tf_var_file)" | head -n 1
}

require_cloud_cli() {
  if [[ "${CLOUD}" == "aws" ]]; then
    require_cmd aws
    aws sts get-caller-identity >/dev/null 2>&1 ||
      fail "Credenciais AWS inválidas ou expiradas. No Learner Lab, copie novamente 'AWS Details' para ~/.aws/credentials."
  else
    require_cmd az
    az account show >/dev/null 2>&1 ||
      fail "Sessão Azure inexistente. Execute 'az login' ou infra/scripts/setup-azure.sh."

    # O provider azurerm 4.x exige a assinatura explícita (ARM_SUBSCRIPTION_ID).
    # Sem valor configurado, usa a assinatura ativa no az CLI; com valor, alinha o az CLI a ela.
    if [[ -n "${ARM_SUBSCRIPTION_ID:-}" ]]; then
      az account set --subscription "${ARM_SUBSCRIPTION_ID}" >/dev/null 2>&1 ||
        fail "Assinatura ${ARM_SUBSCRIPTION_ID} inacessível para o usuário logado no az CLI."
    else
      ARM_SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
    fi
    export ARM_SUBSCRIPTION_ID
  fi
}

tf() {
  terraform -chdir="${STACK_DIR}" "$@"
}

tf_output() {
  tf output -raw "$1"
}

tf_var_file() {
  echo "environments/${ENVIRONMENT}.tfvars"
}

# Inicializa a stack principal com o backend remoto gerado pelo bootstrap.
tf_init() {
  [[ -f "${STACK_DIR}/backend.hcl" ]] ||
    fail "Arquivo ${STACK_DIR}/backend.hcl ausente. Execute infra/scripts/provision.sh ${CLOUD} (cria o state remoto)."
  tf init -input=false -reconfigure -backend-config=backend.hcl >/dev/null
}

# Aponta o kubectl local para o cluster provisionado.
configure_kubectl() {
  log "Configurando kubectl para o cluster $(tf_output cluster_name)"
  eval "$(tf_output kubeconfig_command)" >/dev/null
}
