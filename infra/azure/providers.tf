provider "azurerm" {
  features {
    key_vault {
      # Remove definitivamente o Key Vault no destroy, liberando o nome para recriação.
      purge_soft_delete_on_destroy = true
    }
  }

  # null = usa ARM_SUBSCRIPTION_ID (exportada por infra/scripts/lib.sh).
  subscription_id = var.subscription_id

  # O modo padrão ("legacy") tenta registrar dezenas de resource providers e costuma falhar em
  # assinaturas Azure for Students. Registra apenas o conjunto básico + o que esta stack usa.
  resource_provider_registrations = "core"
  resource_providers_to_register = [
    "Microsoft.ContainerService",
    "Microsoft.ContainerRegistry",
    "Microsoft.DBforPostgreSQL",
    "Microsoft.KeyVault",
  ]
}

# Kubernetes e Helm autenticam com o certificado de cliente emitido pelo AKS.
provider "kubernetes" {
  host                   = module.cluster.host
  client_certificate     = base64decode(module.cluster.client_certificate)
  client_key             = base64decode(module.cluster.client_key)
  cluster_ca_certificate = base64decode(module.cluster.cluster_ca_certificate)
}

provider "helm" {
  kubernetes = {
    host                   = module.cluster.host
    client_certificate     = base64decode(module.cluster.client_certificate)
    client_key             = base64decode(module.cluster.client_key)
    cluster_ca_certificate = base64decode(module.cluster.cluster_ca_certificate)
  }
}
