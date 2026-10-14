output "vnet_id" {
  value = azurerm_virtual_network.this.id
}

output "aks_subnet_id" {
  value = azurerm_subnet.aks.id
}

output "postgres_subnet_id" {
  value = azurerm_subnet.postgres.id
}

output "postgres_private_dns_zone_id" {
  value = azurerm_private_dns_zone.postgres.id
}

# Expõe o link para que o servidor PostgreSQL só seja criado após a zona estar vinculada à VNet.
output "postgres_private_dns_zone_link_id" {
  value = azurerm_private_dns_zone_virtual_network_link.postgres.id
}
