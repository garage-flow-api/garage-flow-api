variable "namespace" {
  description = "Namespace onde os manifestos da aplicação (k8s/) são aplicados."
  type        = string
  default     = "default"
}

variable "database" {
  description = "Dados de conexão do PostgreSQL gerenciado."
  type = object({
    host     = string
    port     = number
    name     = string
    username = string
    password = string
  })
  sensitive = true
}

variable "jwt_secret" {
  description = "Segredo de assinatura dos tokens JWT."
  type        = string
  sensitive   = true
}

variable "tracking_token_secret" {
  description = "Segredo de assinatura dos links públicos de rastreamento da OS."
  type        = string
  sensitive   = true
}

variable "budget_webhook_secret" {
  description = "Chave do HMAC que autentica o webhook de decisão do orçamento."
  type        = string
  sensitive   = true
}

variable "smtp_user" {
  description = "Usuário do servidor SMTP (vazio: sem autenticação)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_pass" {
  description = "Senha do servidor SMTP (vazio: sem autenticação)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "ingress_namespace" {
  description = "Namespace do Ingress Controller."
  type        = string
  default     = "ingress-nginx"
}

variable "ingress_chart_version" {
  description = "Versão do chart nginx-ingress (F5 NGINX), fixada pela stack infra/azure."
  type        = string
}

variable "ingress_service_annotations" {
  description = "Anotações específicas da Azure para o Service LoadBalancer do Ingress Controller."
  type        = map(string)
  default     = {}
}
