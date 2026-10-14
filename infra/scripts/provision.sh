#!/usr/bin/env bash
# Provisiona toda a infraestrutura de uma cloud: state remoto (bootstrap) + stack principal.
#
# Uso: infra/scripts/provision.sh <aws|azure> [--auto-approve]
#   ENVIRONMENT=staging (padrão) seleciona infra/<cloud>/environments/<ENVIRONMENT>.tfvars

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

parse_cloud "${1:-}"
AUTO_APPROVE="${2:-}"

require_cmd terraform
require_cloud_cli

if [[ ! -f "${STACK_DIR}/backend.hcl" ]]; then
  log "Criando o state remoto (bootstrap) para ${CLOUD}"
  terraform -chdir="${STACK_DIR}/bootstrap" init -input=false
  terraform -chdir="${STACK_DIR}/bootstrap" apply -input=false -auto-approve \
    -var="environment=${ENVIRONMENT}"
fi

log "Inicializando a stack ${CLOUD}/${ENVIRONMENT}"
tf_init

log "Planejando alterações"
tf plan -input=false -var-file="$(tf_var_file)" -out=tfplan

if [[ "${AUTO_APPROVE}" != "--auto-approve" ]]; then
  read -r -p "Aplicar o plano acima? Digite 'sim' para continuar: " answer
  [[ "${answer}" == "sim" ]] || fail "Operação cancelada."
fi

log "Aplicando (EKS/AKS e banco gerenciado levam ~15-20 minutos)"
tf apply -input=false tfplan
rm -f "${STACK_DIR}/tfplan"

log "Infraestrutura pronta. Próximo passo: infra/scripts/deploy-app.sh ${CLOUD}"
tf output
