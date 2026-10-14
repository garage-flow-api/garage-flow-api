variable "name" {
  description = "Prefixo das roles criadas (somente quando existing_role_name = null)."
  type        = string
}

variable "existing_role_name" {
  description = "Role pré-existente a reutilizar (\"LabRole\" no Learner Lab). null = criar roles dedicadas."
  type        = string
  default     = null
}
