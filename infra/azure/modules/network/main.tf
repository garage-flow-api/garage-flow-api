# VNet com duas subnets:
#   - aks: nodes do cluster (pods usam Azure CNI Overlay, fora do espaço da VNet);
#   - postgres: subnet delegada ao Azure Database for PostgreSQL Flexible Server (acesso privado).
# Diferente da AWS, a saída para a internet dos nodes é provida pelo Load Balancer do AKS,
# sem custo adicional de NAT Gateway.

resource "azurerm_virtual_network" "this" {
  name                = "vnet-${var.name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = [var.vnet_cidr]
}

resource "azurerm_subnet" "aks" {
  name                 = "snet-aks"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 6, 0)]
}

resource "azurerm_subnet" "postgres" {
  name                 = "snet-postgres"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 8)]

  # A Azure adiciona este service endpoint ao criar o PostgreSQL Flexible Server na subnet.
  # Declarado aqui para o Terraform não tentar removê-lo a cada plan.
  service_endpoints = ["Microsoft.Storage"]

  delegation {
    name = "postgres-flexible-server"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# Zona DNS privada que resolve o hostname do PostgreSQL para o IP interno dentro da VNet.
resource "azurerm_private_dns_zone" "postgres" {
  name                = "${var.name}.private.postgres.database.azure.com"
  resource_group_name = var.resource_group_name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "link-${var.name}"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.this.id
}
