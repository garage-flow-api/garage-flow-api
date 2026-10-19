output "address" {
  value = azurerm_postgresql_flexible_server.this.fqdn
}

output "port" {
  value = 5432
}

output "database_name" {
  value = azurerm_postgresql_flexible_server_database.this.name
}

output "username" {
  value = azurerm_postgresql_flexible_server.this.administrator_login
}
