# Contrato de outputs — mesmos nomes em infra/azure.
# Consumido por infra/scripts/*.sh e pelo pipeline de CI/CD.

output "cloud" {
  value = "aws"
}

output "environment" {
  value = var.environment
}

output "cluster_name" {
  value = module.cluster.name
}

output "kubeconfig_command" {
  description = "Configura o kubectl local para o cluster."
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.cluster.name}"
}

output "registry_url" {
  description = "Host do registry de imagens."
  value       = module.registry.registry_url
}

output "registry_login_command" {
  description = "Autentica o Docker no registry."
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${module.registry.registry_url}"
}

output "api_image_repository" {
  description = "Repositório da imagem da API (estágio production)."
  value       = module.registry.repository_urls[local.image_repositories.api]
}

output "migration_image_repository" {
  description = "Repositório da imagem dos Jobs (estágio build)."
  value       = module.registry.repository_urls[local.image_repositories.migration]
}

output "db_host" {
  description = "Endpoint privado do PostgreSQL."
  value       = module.database.address
}

output "ingress_namespace" {
  description = "Namespace do Ingress Controller."
  value       = module.kubernetes_platform.ingress_namespace
}

output "secrets_store_ref" {
  description = "Secret do AWS Secrets Manager com os valores gerados."
  value       = module.secrets.name
}

output "secrets_read_command" {
  description = "Exibe os segredos gerados (inclui a senha do primeiro admin)."
  value       = "aws secretsmanager get-secret-value --region ${var.aws_region} --secret-id ${module.secrets.name} --query SecretString --output text"
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

output "iam_roles_managed_by_terraform" {
  description = "false quando a stack reutiliza a LabRole do Learner Lab."
  value       = module.iam.managed_by_terraform
}

# Específicos da AWS
output "aws_region" {
  value = var.aws_region
}

output "vpc_id" {
  value = module.network.vpc_id
}
