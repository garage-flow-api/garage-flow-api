variable "name" {
  description = "Nome do secret no Secrets Manager."
  type        = string
}

variable "values" {
  description = "Pares chave/valor armazenados como JSON."
  type        = map(string)
  sensitive   = true
}
