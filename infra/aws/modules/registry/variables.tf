variable "repositories" {
  description = "Nomes dos repositórios de imagem."
  type        = list(string)
}

variable "max_image_count" {
  description = "Quantidade de imagens mantidas por repositório."
  type        = number
  default     = 10
}
