# Cluster AKS no tier Free (control plane sem custo) com node pool de tamanho fixo.
# O metrics-server, pré-requisito do HPA, já vem instalado por padrão no AKS.

resource "azurerm_kubernetes_cluster" "this" {
  name                = "aks-${var.name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  dns_prefix          = var.name
  kubernetes_version  = var.kubernetes_version
  sku_tier            = "Free"

  default_node_pool {
    name                        = "default"
    vm_size                     = var.node_vm_size
    node_count                  = var.node_count
    vnet_subnet_id              = var.subnet_id
    os_disk_size_gb             = 30
    temporary_name_for_rotation = "tmpdefault"

    upgrade_settings {
      max_surge = "10%"
    }
  }

  # Managed Identity: o equivalente Azure às IAM Roles, criada e gerenciada pelo próprio AKS.
  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    pod_cidr            = "192.168.0.0/16"
    service_cidr        = "10.250.0.0/16"
    dns_service_ip      = "10.250.0.10"
    load_balancer_sku   = "standard"
  }
}

# Permite ao AKS criar o Load Balancer e IPs na subnet fornecida (BYO subnet).
resource "azurerm_role_assignment" "network_contributor" {
  scope                = var.subnet_id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.identity[0].principal_id
}

# Permite aos nodes baixar imagens do ACR sem credenciais no cluster.
resource "azurerm_role_assignment" "acr_pull" {
  scope                            = var.container_registry_id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id
  skip_service_principal_aad_check = true
}
