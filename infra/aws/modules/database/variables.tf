variable "name" {
  description = "Identificador da instância RDS e prefixo dos recursos."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Subnets privadas (mínimo 2 AZs)."
  type        = list(string)
}

variable "allowed_security_group_ids" {
  description = "Security groups autorizados a conectar na porta 5432."
  type        = list(string)
}

variable "engine_version" {
  type = string
}

variable "instance_class" {
  type = string
}

variable "allocated_storage" {
  description = "Armazenamento em GiB."
  type        = number
}

variable "multi_az" {
  type = bool
}

variable "backup_retention_period" {
  description = "Dias de retenção dos backups automáticos (0 desativa)."
  type        = number
}

variable "database_name" {
  description = "Nome do database (RDS aceita apenas letras e números)."
  type        = string
}

variable "username" {
  type = string
}

variable "password" {
  type      = string
  sensitive = true
}
