output "cluster_role_arn" {
  description = "Role assumida pelo control plane do EKS."
  value       = local.create_roles ? aws_iam_role.cluster[0].arn : local.existing_role_arn
}

output "node_role_arn" {
  description = "Role assumida pelas instâncias EC2 do node group."
  value       = local.create_roles ? aws_iam_role.node[0].arn : local.existing_role_arn
}

output "managed_by_terraform" {
  description = "true quando as roles foram criadas por este módulo."
  value       = local.create_roles
}
