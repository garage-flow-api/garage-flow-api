variable "name" {
  description = "Prefixo dos recursos."
  type        = string
}

variable "cluster_name" {
  description = "Nome do cluster EKS (usado nas tags de descoberta de subnets)."
  type        = string
}

variable "vpc_cidr" {
  description = "Bloco CIDR da VPC."
  type        = string
}

variable "az_count" {
  description = "Quantidade de zonas de disponibilidade (EKS e RDS exigem ao menos 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "EKS e o DB subnet group do RDS exigem ao menos 2 zonas de disponibilidade."
  }
}

variable "excluded_availability_zone_ids" {
  description = "IDs de AZ a ignorar. use1-az3 (us-east-1) não suporta o control plane do EKS."
  type        = list(string)
  default     = ["use1-az3"]
}

variable "enable_nat_gateway" {
  description = "Cria um NAT Gateway para dar saída à internet às subnets privadas."
  type        = bool
  default     = false
}
