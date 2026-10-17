# Cópia dos segredos gerados pelo Terraform no Azure Key Vault (equivalente ao AWS Secrets
# Manager). O cluster consome os mesmos valores via Secret Kubernetes criado pelo módulo
# kubernetes-platform.

data "azurerm_client_config" "current" {}

locals {
  # Quem administra os secrets: a lista fixa (membros do grupo e service principal do CI/CD)
  # mais a identidade que executa o Terraform, para que um apply nunca fique sem acesso.
  # Com todos na lista, o conjunto é o mesmo para qualquer executor e não há troca a cada apply.
  secrets_officer_object_ids = toset(concat(var.secrets_officer_object_ids, [data.azurerm_client_config.current.object_id]))
}

resource "azurerm_key_vault" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  # Ambiente efêmero: retenção mínima e sem purge protection, para permitir destroy/recreate.
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  # Acesso aos secrets via Azure RBAC (role assignments), não via access policies: cada pessoa
  # tem a própria atribuição, e um apply não sobrescreve o acesso de quem aplicou antes.
  rbac_authorization_enabled = true
}

resource "azurerm_role_assignment" "secrets_officer" {
  for_each = local.secrets_officer_object_ids

  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}

# Atribuições de RBAC levam alguns instantes para valer no plano de dados do Key Vault.
resource "time_sleep" "rbac_propagation" {
  create_duration = "60s"
  triggers        = { principals = join(",", sort(tolist(local.secrets_officer_object_ids))) }

  depends_on = [azurerm_role_assignment.secrets_officer]
}

resource "azurerm_key_vault_secret" "this" {
  # nonsensitive apenas nas chaves (nomes dos secrets); os valores permanecem sensíveis.
  for_each = nonsensitive(toset(keys(var.values)))

  name         = each.value
  value        = var.values[each.value]
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [time_sleep.rbac_propagation]
}
