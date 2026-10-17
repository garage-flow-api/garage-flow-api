# IAM Roles do EKS.
#
# ⚠️ AWS Academy Learner Lab: a conta NÃO permite criar IAM Roles nem Policies.
# Nesse ambiente, `existing_role_name = "LabRole"` faz o módulo apenas referenciar a role
# pré-provisionada pelo laboratório, usada tanto pelo control plane quanto pelos nodes.
# A LabRole é ampla (não segue menor privilégio) — limitação aceita somente por conta da
# infraestrutura acadêmica.
#
# Em uma conta AWS real, deixe `existing_role_name = null`: o módulo cria uma role para cada
# finalidade, apenas com as policies gerenciadas exigidas pelo EKS.

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  create_roles      = var.existing_role_name == null
  existing_role_arn = local.create_roles ? null : "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:role/${var.existing_role_name}"
  policy_arn_prefix = "arn:${data.aws_partition.current.partition}:iam::aws:policy"
}

# ---------------------------------------------------------------------------
# Control plane: permite ao EKS gerenciar ENIs, Load Balancers e security groups.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "cluster" {
  count = local.create_roles ? 1 : 0

  name = "${var.name}-eks-cluster"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster" {
  for_each = local.create_roles ? toset(["AmazonEKSClusterPolicy"]) : toset([])

  role       = aws_iam_role.cluster[0].name
  policy_arn = "${local.policy_arn_prefix}/${each.value}"
}

# ---------------------------------------------------------------------------
# Nodes: registro no cluster, rede dos pods (VPC CNI) e pull de imagens no ECR.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "node" {
  count = local.create_roles ? 1 : 0

  name = "${var.name}-eks-node"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = local.create_roles ? toset([
    "AmazonEKSWorkerNodePolicy",
    "AmazonEKS_CNI_Policy",
    "AmazonEC2ContainerRegistryReadOnly",
  ]) : toset([])

  role       = aws_iam_role.node[0].name
  policy_arn = "${local.policy_arn_prefix}/${each.value}"
}
