#!/usr/bin/env bash
# Provisiona toda a infraestrutura na Azure: state remoto (bootstrap) + stack principal.
#
# Uso: infra/scripts/provision.sh [--auto-approve]
#   ENVIRONMENT=staging (padrão) seleciona infra/azure/environments/<ENVIRONMENT>.tfvars

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

AUTO_APPROVE="${1:-}"

require_cmd terraform
require_azure_cli

if [[ ! -f "${STACK_DIR}/backend.hcl" ]]; then
  log "Criando o state remoto (bootstrap)"
  # Mesma região do ambiente: assinaturas de estudante restringem regiões por policy.
  terraform -chdir="${STACK_DIR}/bootstrap" init -input=false
  terraform -chdir="${STACK_DIR}/bootstrap" apply -input=false -auto-approve \
    -var="environment=${ENVIRONMENT}" -var="location=$(tfvars_value location)"
fi

log "Inicializando a stack azure/${ENVIRONMENT}"
tf_init

log "Planejando alterações"
tf plan -input=false -var-file="$(tf_var_file)" -out=tfplan

if [[ "${AUTO_APPROVE}" != "--auto-approve" ]]; then
  read -r -p "Aplicar o plano acima? Digite 'sim' para continuar: " answer
  [[ "${answer}" == "sim" ]] || fail "Operação cancelada."
fi

log "Aplicando (AKS e banco gerenciado levam ~15-20 minutos)"
tf apply -input=false tfplan
rm -f "${STACK_DIR}/tfplan"

log "Infraestrutura pronta. Próximo passo: infra/scripts/deploy-app.sh"
tf output
