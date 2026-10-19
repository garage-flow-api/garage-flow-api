# ---------------------------------------------------------------------------
# Geral
# ---------------------------------------------------------------------------
variable "aws_region" {
  description = "Região AWS. O Learner Lab permite apenas us-east-1 e us-west-2."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "garage-flow"
}

variable "environment" {
  description = "Nome do ambiente."
  type        = string
  default     = "staging"
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------
variable "existing_iam_role_name" {
  description = <<-EOT
    Role IAM pré-existente usada pelo control plane e pelos nodes do EKS.
    Learner Lab: "LabRole" (a conta não permite criar IAM Roles).
    Conta AWS real: null, para que o Terraform crie roles dedicadas de menor privilégio.
  EOT
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "Bloco CIDR da VPC."
  type        = string
  default     = "10.10.0.0/16"
}

variable "enable_nat_gateway" {
  description = <<-EOT
    true: nodes em subnets privadas com saída via NAT Gateway (recomendado em produção, ~US$ 33/mês).
    false: nodes em subnets públicas protegidas por security group (economia no Learner Lab).
  EOT
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# Cluster
# ---------------------------------------------------------------------------
variable "kubernetes_version" {
  description = "Versão do Kubernetes no EKS. Use uma versão em standard support."
  type        = string
  default     = "1.35"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "CIDRs autorizados no endpoint público da API do Kubernetes (kubectl/Terraform)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "node_instance_types" {
  description = "Tipos de instância dos nodes."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 3
}

# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------
variable "db_engine_version" {
  description = "Versão major do PostgreSQL (mesma do docker-compose de desenvolvimento)."
  type        = string
  default     = "16"
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Armazenamento em GiB."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  description = "Réplica standby em outra AZ (dobra o custo do banco)."
  type        = bool
  default     = false
}

variable "db_backup_retention_period" {
  description = "Dias de retenção dos backups automáticos."
  type        = number
  default     = 1
}

variable "db_name" {
  description = "Nome do database da aplicação (apenas letras e números)."
  type        = string
  default     = "garageflow"
}

variable "db_username" {
  description = "Usuário master do PostgreSQL."
  type        = string
  default     = "garageflow_admin"
}

# ---------------------------------------------------------------------------
# Aplicação
# ---------------------------------------------------------------------------
variable "bootstrap_admin_name" {
  description = "Nome do primeiro administrador criado pelo Job de bootstrap."
  type        = string
  default     = "Garage Flow Admin"
}

variable "bootstrap_admin_email" {
  description = "E-mail do primeiro administrador."
  type        = string
  default     = "admin@garage-flow.local"
}

variable "ingress_chart_version" {
  description = "Versão do chart nginx-ingress. null = última versão estável."
  type        = string
  default     = null
}
