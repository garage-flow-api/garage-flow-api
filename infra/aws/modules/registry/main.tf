# Repositórios de imagens Docker (ECR), um por estágio do Dockerfile consumido pelo cluster:
#   - garage-flow-api           -> estágio `production` (Deployment da API)
#   - garage-flow-api-migration -> estágio `build`, com Prisma CLI (Jobs de migration/bootstrap)

resource "aws_ecr_repository" "this" {
  for_each = toset(var.repositories)

  name                 = each.value
  image_tag_mutability = "MUTABLE"

  # Permite `terraform destroy` mesmo com imagens publicadas (ambiente efêmero).
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantem apenas as ${var.max_image_count} imagens mais recentes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.max_image_count
      }
      action = { type = "expire" }
    }]
  })
}
