output "storage_account_name" {
  value = azurerm_storage_account.state.name
}

output "backend_config_file" {
  value = abspath(local_file.backend_config.filename)
}
