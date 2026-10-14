provider "azurerm" {
  features {
    key_vault {
      # Remove definitivamente o Key Vault no destroy, liberando o nome para recriação.
      purge_soft_delete_on_destroy = true
    }
  }

  # null = usa ARM_SUBSCRIPTION_ID ou a assinatura ativa no `az login`.
  subscription_id = var.subscription_id
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
