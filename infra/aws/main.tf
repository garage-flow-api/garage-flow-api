locals {
  name = "${var.project_name}-${var.environment}"

  image_repositories = {
    api       = var.project_name
    migration = "${var.project_name}-migration"
  }

  # Sem NAT Gateway, os nodes precisam de IP público para alcançar ECR e o endpoint do EKS.
  node_subnet_ids = var.enable_nat_gateway ? module.network.private_subnet_ids : module.network.public_subnet_ids
}

# ---------------------------------------------------------------------------
# Segredos gerados (nunca versionados no Git)
# Apenas letras e números: os valores compõem a DATABASE_URL e não exigem URL-encoding.
# ---------------------------------------------------------------------------
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "tracking_token_secret" {
  length  = 64
  special = false
}

# prisma/bootstrap-admin.ts exige 8-128 caracteres com ao menos uma letra e um número.
resource "random_password" "bootstrap_admin" {
  length      = 20
  special     = false
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
}

# ---------------------------------------------------------------------------
# Infraestrutura AWS
# ---------------------------------------------------------------------------
module "network" {
  source = "./modules/network"

  name               = local.name
  cluster_name       = local.name
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = var.enable_nat_gateway
}

module "iam" {
  source = "./modules/iam"

  name               = local.name
  existing_role_name = var.existing_iam_role_name
}

module "cluster" {
  source = "./modules/cluster"

  name                         = local.name
  kubernetes_version           = var.kubernetes_version
  cluster_role_arn             = module.iam.cluster_role_arn
  node_role_arn                = module.iam.node_role_arn
  subnet_ids                   = module.network.public_subnet_ids
  node_subnet_ids              = local.node_subnet_ids
  endpoint_public_access_cidrs = var.cluster_endpoint_public_access_cidrs
  node_instance_types          = var.node_instance_types
  node_desired_size            = var.node_desired_size
  node_min_size                = var.node_min_size
  node_max_size                = var.node_max_size
}

module "database" {
  source = "./modules/database"

  name                       = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.cluster.cluster_security_group_id]
  engine_version             = var.db_engine_version
  instance_class             = var.db_instance_class
  allocated_storage          = var.db_allocated_storage
  multi_az                   = var.db_multi_az
  backup_retention_period    = var.db_backup_retention_period
  database_name              = var.db_name
  username                   = var.db_username
  password                   = random_password.db.result
}

module "registry" {
  source = "./modules/registry"

  repositories = values(local.image_repositories)
}

module "secrets" {
  source = "./modules/secrets"

  name = "${var.project_name}/${var.environment}/app"
  values = {
    DATABASE_URL          = module.kubernetes_platform.database_url
    POSTGRES_PASSWORD     = random_password.db.result
    JWT_SECRET            = random_password.jwt_secret.result
    TRACKING_TOKEN_SECRET = random_password.tracking_token_secret.result
    ADMIN_EMAIL           = var.bootstrap_admin_email
    ADMIN_PASSWORD        = random_password.bootstrap_admin.result
  }
}

# ---------------------------------------------------------------------------
# Recursos dentro do cluster (compartilhado com infra/azure)
# ---------------------------------------------------------------------------
module "kubernetes_platform" {
  source = "../modules/kubernetes-platform"

  database = {
    host     = module.database.address
    port     = module.database.port
    name     = module.database.database_name
    username = module.database.username
    password = random_password.db.result
  }

  jwt_secret            = random_password.jwt_secret.result
  tracking_token_secret = random_password.tracking_token_secret.result

  bootstrap_admin = {
    name     = var.bootstrap_admin_name
    email    = var.bootstrap_admin_email
    password = random_password.bootstrap_admin.result
  }

  ingress_chart_version = var.ingress_chart_version
  ingress_service_annotations = {
    # Network Load Balancer criado pelo cloud provider nativo do Kubernetes.
    # O AWS Load Balancer Controller exigiria IRSA (IAM Role dedicada), indisponível no Learner Lab.
    "service.beta.kubernetes.io/aws-load-balancer-type" = "nlb"
  }

  # Os recursos Kubernetes só podem ser criados com nodes e metrics-server disponíveis.
  depends_on = [module.cluster]
}
