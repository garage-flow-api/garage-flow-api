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

variable "secrets_officer_object_ids" {
  description = <<-EOT
    Object IDs (Entra ID) com acesso de leitura/escrita aos secrets do Key Vault (RBAC
    "Key Vault Secrets Officer"): membros do grupo e o service principal do CI/CD.
    Quem executa o Terraform é incluído automaticamente.
    Obtenha o seu com: az ad signed-in-user show --query id --output tsv
  EOT
  type        = list(string)
  default     = []
}

variable "bootstrap_admin_email" {
  type    = string
  default = "admin@garage-flow.local"
}

# Credenciais do servidor SMTP externo (não é criado pelo Terraform). Vazias, a API conecta
# sem autenticação. Informe por TF_VAR_smtp_user / TF_VAR_smtp_pass, nunca no tfvars versionado.
variable "smtp_user" {
  description = "Usuário do servidor SMTP usado nos e-mails ao cliente."
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_pass" {
  description = "Senha do servidor SMTP usado nos e-mails ao cliente."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ingress_chart_version" {
  description = "Versão do chart nginx-ingress (F5 NGINX). Fixada para recriar o ambiente com a mesma versão."
  type        = string
  default     = "2.8.0" # NGINX Ingress Controller 5.7.0
}
