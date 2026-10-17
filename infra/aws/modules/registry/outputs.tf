output "repository_urls" {
  description = "URL de cada repositório, indexada pelo nome."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "registry_url" {
  description = "Host do registry (usado no docker login)."
  value       = split("/", values(aws_ecr_repository.this)[0].repository_url)[0]
}
