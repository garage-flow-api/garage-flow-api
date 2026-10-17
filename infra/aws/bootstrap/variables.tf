variable "aws_region" {
  description = "Região AWS. O Learner Lab permite apenas us-east-1 e us-west-2."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefixo dos recursos."
  type        = string
  default     = "garage-flow"
}

variable "environment" {
  description = "Ambiente cujo state será armazenado (compõe a key do objeto no bucket)."
  type        = string
  default     = "staging"
}

variable "force_destroy" {
  description = "Permite destruir o bucket mesmo com versões de state armazenadas."
  type        = bool
  default     = false
}
