# Cópia dos segredos gerados pelo Terraform no AWS Secrets Manager: fonte de consulta para
# pessoas (ex.: senha do primeiro admin) e integrações futuras (ex.: External Secrets Operator).
# O cluster consome os mesmos valores via Secret Kubernetes criado pelo módulo kubernetes-platform.

resource "aws_secretsmanager_secret" "this" {
  name        = var.name
  description = "Segredos da aplicacao Garage Flow"

  # Ambiente efêmero: exclusão imediata permite recriar o secret com o mesmo nome.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode(var.values)
}
