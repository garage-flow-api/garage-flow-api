variable "name" {
  description = "Nome globalmente único do Key Vault (3-24 caracteres, letras, números e hífens)."
  type        = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "values" {
  description = "Secrets a armazenar (nomes: letras, números e hífens)."
  type        = map(string)
  sensitive   = true
}
