# ---------------------------------------------------------------------------
# Geral
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Rede e cluster
# ---------------------------------------------------------------------------
variable "vnet_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "kubernetes_version" {
  description = "Versão do Kubernetes no AKS. null = versão padrão da região."
  type        = string
  default     = null
}

variable "node_vm_size" {
  description = "Tamanho das VMs do node pool (B2als_v2: 2 vCPU AMD / 4 GiB, equivalente ao t3.medium)."
  type        = string
  default     = "Standard_B2als_v2"
}

variable "node_count" {
  type    = number
  default = 2
}

# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------
variable "db_engine_version" {
  type    = string
  default = "16"
}

variable "db_sku_name" {
  description = "SKU do Flexible Server (B_Standard_B1ms: 1 vCPU burstable / 2 GiB)."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  type    = number
  default = 32768
}

variable "db_name" {
  type    = string
  default = "garageflow"
}

variable "db_username" {
  description = "Usuário administrador (a Azure reserva nomes como postgres, admin e azure_superuser)."
  type        = string
  default     = "garageflow_admin"
}

# ---------------------------------------------------------------------------
# Aplicação
# ---------------------------------------------------------------------------
variable "bootstrap_admin_name" {
  type    = string
  default = "Garage Flow Admin"
}

variable "bootstrap_admin_email" {
  type    = string
  default = "admin@garage-flow.local"
}

variable "ingress_chart_version" {
  description = "Versão do chart nginx-ingress. null = última versão estável."
  type        = string
  default     = null
}
