variable "name" {
  description = "Nome globalmente único, apenas letras e números (5-50 caracteres)."
  type        = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}
