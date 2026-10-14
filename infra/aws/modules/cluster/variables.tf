variable "name" {
  description = "Nome do cluster EKS."
  type        = string
}

variable "kubernetes_version" {
  description = "Versão do Kubernetes (deve estar em standard support no EKS)."
  type        = string
}

variable "cluster_role_arn" {
  description = "Role do control plane."
  type        = string
}

variable "node_role_arn" {
  description = "Role dos nodes."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets onde o EKS cria as ENIs do control plane."
  type        = list(string)
}

variable "node_subnet_ids" {
  description = "Subnets dos nodes."
  type        = list(string)
}

variable "endpoint_public_access_cidrs" {
  description = "CIDRs autorizados a acessar o endpoint público da API do Kubernetes."
  type        = list(string)
}

variable "node_instance_types" {
  description = "Tipos de instância do node group."
  type        = list(string)
}

variable "node_desired_size" {
  type = number
}

variable "node_min_size" {
  type = number
}

variable "node_max_size" {
  type = number
}
