variable "name" {
  description = "Nome do servidor (globalmente único: <name>.postgres.database.azure.com)."
  type        = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "private_dns_zone_id" {
  type = string
}

variable "private_dns_zone_link_id" {
  description = "Garante a ordem de criação: zona DNS vinculada à VNet antes do servidor."
  type        = string
}

variable "engine_version" {
  type = string
}

variable "sku_name" {
  type = string
}

variable "storage_mb" {
  type = number
}

variable "database_name" {
  type = string
}

variable "username" {
  type = string
}

variable "password" {
  type      = string
  sensitive = true
}
