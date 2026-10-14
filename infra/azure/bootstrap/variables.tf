variable "subscription_id" {
  description = "ID da assinatura Azure. null = ARM_SUBSCRIPTION_ID ou assinatura ativa no az CLI."
  type        = string
  default     = null
}

variable "location" {
  description = "Região Azure (assinaturas Azure for Students podem restringir regiões por policy)."
  type        = string
  default     = "eastus2"
}

variable "project_name" {
  type    = string
  default = "garage-flow"
}

variable "environment" {
  type    = string
  default = "staging"
}
