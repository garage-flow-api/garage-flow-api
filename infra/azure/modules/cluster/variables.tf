variable "name" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "kubernetes_version" {
  description = "Versão do Kubernetes. null = versão padrão do AKS na região."
  type        = string
  default     = null
}

variable "subnet_id" {
  type = string
}

variable "container_registry_id" {
  type = string
}

variable "node_vm_size" {
  type = string
}

variable "node_count" {
  type = number
}
