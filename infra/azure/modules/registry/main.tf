# Azure Container Registry. Diferente do ECR, os repositórios de imagem (garage-flow-api e
# garage-flow-api-migration) são criados implicitamente no primeiro `docker push`.
# O tier Basic não oferece políticas de retenção; a limpeza de imagens antigas é manual.

resource "azurerm_container_registry" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Basic"

  # Autenticação via Entra ID (az acr login) e Managed Identity do AKS, sem usuário admin.
  admin_enabled = false
}
