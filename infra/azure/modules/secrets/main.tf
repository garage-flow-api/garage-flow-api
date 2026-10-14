# Cópia dos segredos gerados pelo Terraform no Azure Key Vault (equivalente ao AWS Secrets
# Manager). O cluster consome os mesmos valores via Secret Kubernetes criado pelo módulo
# kubernetes-platform.

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  # Ambiente efêmero: retenção mínima e sem purge protection, para permitir destroy/recreate.
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  # Identidade que executa o Terraform pode gerenciar os secrets.
  access_policy {
    tenant_id          = data.azurerm_client_config.current.tenant_id
    object_id          = data.azurerm_client_config.current.object_id
    secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]
  }
}

resource "azurerm_key_vault_secret" "this" {
  # nonsensitive apenas nas chaves (nomes dos secrets); os valores permanecem sensíveis.
  for_each = nonsensitive(toset(keys(var.values)))

  name         = each.value
  value        = var.values[each.value]
  key_vault_id = azurerm_key_vault.this.id
}
