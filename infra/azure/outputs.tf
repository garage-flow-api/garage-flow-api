# Contrato de outputs — mesmos nomes em infra/aws.
# Consumido por infra/scripts/*.sh e pelo pipeline de CI/CD.

output "cloud" {
  value = "azure"
}

output "environment" {
  value = var.environment
}

output "cluster_name" {
  value = module.cluster.name
}

output "kubeconfig_command" {
  description = "Configura o kubectl local para o cluster."
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.this.name} --name ${module.cluster.name} --overwrite-existing"
}

output "registry_url" {
  description = "Host do registry de imagens."
  value       = module.registry.login_server
}

output "registry_login_command" {
  description = "Autentica o Docker no registry."
  value       = "az acr login --name ${module.registry.name}"
}

output "api_image_repository" {
  description = "Repositório da imagem da API (estágio production)."
  value       = "${module.registry.login_server}/${local.image_repositories.api}"
}

output "migration_image_repository" {
  description = "Repositório da imagem dos Jobs (estágio build)."
  value       = "${module.registry.login_server}/${local.image_repositories.migration}"
}

output "db_host" {
  description = "FQDN privado do PostgreSQL."
  value       = module.database.address
}

output "ingress_namespace" {
  description = "Namespace do Ingress Controller."
  value       = module.kubernetes_platform.ingress_namespace
}

output "secrets_store_ref" {
  description = "Key Vault com os valores gerados."
  value       = module.secrets.name
}

output "secrets_read_command" {
  description = "Exibe a senha do primeiro admin."
  value       = "az keyvault secret show --vault-name ${module.secrets.name} --name admin-password --query value --output tsv"
}

# Credenciais do primeiro admin, lidas pelo deploy-app.sh para criar o Secret temporário do
# Job de bootstrap. A senha também fica no cofre da cloud (ver secrets_read_command).
output "bootstrap_admin_name" {
  value = var.bootstrap_admin_name
}

output "bootstrap_admin_email" {
  value = var.bootstrap_admin_email
}

output "bootstrap_admin_password" {
  value     = random_password.bootstrap_admin.result
  sensitive = true
}

# Específicos da Azure
output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "location" {
  value = azurerm_resource_group.this.location
}
