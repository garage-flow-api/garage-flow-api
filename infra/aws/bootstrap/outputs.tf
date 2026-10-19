output "state_bucket" {
  description = "Bucket S3 do state remoto."
  value       = aws_s3_bucket.state.bucket
}

output "backend_config_file" {
  description = "Arquivo de configuração do backend gerado para a stack principal."
  value       = abspath(local_file.backend_config.filename)
}
