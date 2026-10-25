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

variable "ingress_namespace" {
  description = "Namespace do Ingress Controller."
  type        = string
  default     = "ingress-nginx"
}

variable "ingress_chart_version" {
  description = "Versão do chart nginx-ingress (F5 NGINX), fixada pelas stacks de cada cloud."
  type        = string
}

variable "ingress_service_annotations" {
  description = "Anotações específicas da cloud para o Service LoadBalancer do Ingress Controller."
  type        = map(string)
  default     = {}
}
