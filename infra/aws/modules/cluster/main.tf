# Cluster EKS com um managed node group de tamanho fixo.
#
# O HPA escala os pods da API dentro da capacidade dos nodes. O escalonamento de nodes
# (Cluster Autoscaler / Karpenter) exige IRSA/Pod Identity — IAM Roles dedicadas que o
# Learner Lab não permite criar — e por isso não faz parte desta stack.

resource "aws_eks_cluster" "this" {
  name     = var.name
  version  = var.kubernetes_version
  role_arn = var.cluster_role_arn

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_public_access  = true
    endpoint_private_access = true
    public_access_cidrs     = var.endpoint_public_access_cidrs
  }

  access_config {
    # Concede admin do cluster à identidade que executa o Terraform (no Learner Lab, a voclabs).
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  # Evita que o cluster entre em "extended support", cobrado à parte por hora.
  upgrade_policy {
    support_type = "STANDARD"
  }
}

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.name}-default"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.node_subnet_ids

  ami_type       = "AL2023_x86_64_STANDARD"
  capacity_type  = "ON_DEMAND"
  instance_types = var.node_instance_types
  disk_size      = 20

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  update_config {
    max_unavailable = 1
  }

  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# Coleta CPU/memória dos pods — pré-requisito do HPA definido em k8s/hpa.yaml.
resource "aws_eks_addon" "metrics_server" {
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = "metrics-server"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [aws_eks_node_group.default]
}
