output "ingress_namespace" {
  description = "Namespace do Ingress Controller (o Service LoadBalancer expõe a API)."
  value       = helm_release.ingress.namespace
}

output "app_secret_name" {
  description = "Secret Kubernetes com as variáveis sensíveis da API."
  value       = kubernetes_secret_v1.app.metadata[0].name
}

output "database_url" {
  description = "Connection string completa usada pela API e pelos Jobs."
  value       = local.database_url
  sensitive   = true
}
