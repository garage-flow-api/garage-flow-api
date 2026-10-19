output "name" {
  value = aws_eks_cluster.this.name
}

output "endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "certificate_authority_data" {
  value = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "Security group criado pelo EKS e associado aos nodes gerenciados."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "node_group_id" {
  value = aws_eks_node_group.default.id
}
