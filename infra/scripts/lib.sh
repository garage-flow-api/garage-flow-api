#!/usr/bin/env bash
# Funções compartilhadas pelos scripts de infraestrutura. Não execute diretamente.

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPTS_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"
STACK_DIR="${INFRA_DIR}/azure"
ENVIRONMENT="${ENVIRONMENT:-staging}"

# Mesmo modo de login do setup-azure.sh: navegador em vez do WAM do Windows.
export AZURE_CORE_ENABLE_BROKER_ON_WINDOWS=false

# Git Bash: remove o \r (CRLF) da saída do az, como em setup-azure.sh.
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  az() { command az "$@" | tr -d '\r'; }
fi

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

# Carrega infra/azure/.env.azure (ignorado pelo Git), gerado por setup-azure.sh.
# Ex.: ARM_SUBSCRIPTION_ID da assinatura Azure escolhida no wizard.
load_azure_env() {
  local env_file="${STACK_DIR}/.env.azure"
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

# Valida o az CLI e a sessão, e define a assinatura usada pelo Terraform e pelo az CLI.
require_azure_cli() {
  load_azure_env
  require_cmd az
  az account show >/dev/null 2>&1 ||
    fail "Sessão Azure inexistente. Execute 'az login' ou infra/scripts/setup-azure.sh."

  # O provider azurerm 4.x exige a assinatura explícita (ARM_SUBSCRIPTION_ID).
  # Prioridade: subscription_id do tfvars (assinatura fixada do grupo) > .env.azure > az CLI.
  # Com valor, alinha o az CLI a ela, para que az acr/aks/keyvault usem a mesma assinatura.
  local pinned_subscription
  pinned_subscription="$(tfvars_value subscription_id)"
  if [[ -n "${pinned_subscription}" ]]; then
    if [[ -n "${ARM_SUBSCRIPTION_ID:-}" && "${ARM_SUBSCRIPTION_ID}" != "${pinned_subscription}" ]]; then
      warn "Usando a assinatura fixada em $(tf_var_file) (${pinned_subscription}), não ${ARM_SUBSCRIPTION_ID}."
    fi
    ARM_SUBSCRIPTION_ID="${pinned_subscription}"
  fi
  if [[ -n "${ARM_SUBSCRIPTION_ID:-}" ]]; then
    az account set --subscription "${ARM_SUBSCRIPTION_ID}" >/dev/null 2>&1 ||
      fail "Assinatura ${ARM_SUBSCRIPTION_ID} inacessível para o usuário logado no az CLI."
  else
    ARM_SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
  fi
  export ARM_SUBSCRIPTION_ID
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
    fail "Arquivo ${STACK_DIR}/backend.hcl ausente. Execute infra/scripts/provision.sh (cria o state remoto)."
  tf init -input=false -reconfigure -backend-config=backend.hcl >/dev/null
}

# Aponta o kubectl local para o cluster provisionado.
configure_kubectl() {
  log "Configurando kubectl para o cluster $(tf_output cluster_name)"
  eval "$(tf_output kubeconfig_command)" >/dev/null
}
