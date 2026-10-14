# Azure Database for PostgreSQL Flexible Server com acesso privado (VNet integration):
# sem endpoint público, alcançável apenas a partir da VNet do cluster.

# Âncora de dependência: o servidor só pode ser criado com a zona DNS já vinculada à VNet.
resource "terraform_data" "private_dns_ready" {
  input = var.private_dns_zone_link_id
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  version             = var.engine_version
  sku_name            = var.sku_name
  storage_mb          = var.storage_mb

  delegated_subnet_id           = var.subnet_id
  private_dns_zone_id           = var.private_dns_zone_id
  public_network_access_enabled = false

  administrator_login    = var.username
  administrator_password = var.password

  backup_retention_days = 7

  lifecycle {
    # A Azure escolhe a zona quando não informada; evita diffs perpétuos.
    ignore_changes = [zone]
  }

  depends_on = [terraform_data.private_dns_ready]
}

resource "azurerm_postgresql_flexible_server_database" "this" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}
