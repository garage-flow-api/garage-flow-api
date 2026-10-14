# Stack de bootstrap: cria o Storage Account que guarda o state remoto da stack principal
# (infra/azure). Executada uma única vez por assinatura, com state local.

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "azurerm" {
  features {}

  # null = usa ARM_SUBSCRIPTION_ID (exportada por infra/scripts/lib.sh).
  subscription_id = var.subscription_id

  # Registra apenas o conjunto básico (inclui Microsoft.Storage); ver infra/azure/providers.tf.
  resource_provider_registrations = "core"
}

# Storage Accounts exigem nome globalmente único (3-24 caracteres minúsculos/números).
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_resource_group" "state" {
  name     = "rg-${var.project_name}-tfstate"
  location = var.location

  tags = {
    Project   = var.project_name
    ManagedBy = "terraform"
    Stack     = "bootstrap"
  }
}

resource "azurerm_storage_account" "state" {
  name                     = "gftfstate${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.state.name
  location                 = azurerm_resource_group.state.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"

  # O state contém valores sensíveis (senhas geradas): nada de acesso público.
  allow_nested_items_to_be_public = false

  blob_properties {
    versioning_enabled = true
  }

  tags = azurerm_resource_group.state.tags
}

resource "azurerm_storage_container" "state" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
}

# Gera o arquivo consumido por `terraform init -backend-config=backend.hcl` na stack principal.
resource "local_file" "backend_config" {
  filename        = "${path.module}/../backend.hcl"
  file_permission = "0644"
  content         = <<-EOT
    resource_group_name  = "${azurerm_resource_group.state.name}"
    storage_account_name = "${azurerm_storage_account.state.name}"
    container_name       = "${azurerm_storage_container.state.name}"
    key                  = "${var.project_name}/${var.environment}/terraform.tfstate"
  EOT
}
