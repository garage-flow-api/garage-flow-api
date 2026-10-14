locals {
  name = "${var.project_name}-${var.environment}"

  # Recursos com nome globalmente único recebem um sufixo aleatório.
  unique_suffix   = random_string.suffix.result
  compact_project = replace(var.project_name, "-", "")

  image_repositories = {
    api       = var.project_name
    migration = "${var.project_name}-migration"
  }
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# ---------------------------------------------------------------------------
# Segredos gerados (nunca versionados no Git)
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

resource "random_password" "bootstrap_admin" {
  length      = 20
  special     = false
  min_lower   = 2
  min_upper   = 2
  min_numeric = 2
}

# ---------------------------------------------------------------------------
# Infraestrutura Azure
# ---------------------------------------------------------------------------
resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "network" {
  source = "./modules/network"

  name                = local.name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  vnet_cidr           = var.vnet_cidr
}

module "registry" {
  source = "./modules/registry"

  name                = "${local.compact_project}${var.environment}${local.unique_suffix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
}

module "cluster" {
  source = "./modules/cluster"

  name                  = local.name
  location              = azurerm_resource_group.this.location
  resource_group_name   = azurerm_resource_group.this.name
  kubernetes_version    = var.kubernetes_version
  subnet_id             = module.network.aks_subnet_id
  container_registry_id = module.registry.id
  node_vm_size          = var.node_vm_size
  node_count            = var.node_count
}

module "database" {
  source = "./modules/database"

  name                     = "psql-${local.name}-${local.unique_suffix}"
  location                 = azurerm_resource_group.this.location
  resource_group_name      = azurerm_resource_group.this.name
  subnet_id                = module.network.postgres_subnet_id
  private_dns_zone_id      = module.network.postgres_private_dns_zone_id
  private_dns_zone_link_id = module.network.postgres_private_dns_zone_link_id
  engine_version           = var.db_engine_version
  sku_name                 = var.db_sku_name
  storage_mb               = var.db_storage_mb
  database_name            = var.db_name
  username                 = var.db_username
  password                 = random_password.db.result
}

module "secrets" {
  source = "./modules/secrets"

  name                = "kv-gf-${var.environment}-${local.unique_suffix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name

  values = {
    database-url          = module.kubernetes_platform.database_url
    postgres-password     = random_password.db.result
    jwt-secret            = random_password.jwt_secret.result
    tracking-token-secret = random_password.tracking_token_secret.result
    admin-email           = var.bootstrap_admin_email
    admin-password        = random_password.bootstrap_admin.result
  }
}

# ---------------------------------------------------------------------------
# Recursos dentro do cluster (compartilhado com infra/aws)
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
    # Health probe TCP no Azure Load Balancer: evita probes HTTP em "/" que o controller
    # responde com 404, o que marcaria os backends como indisponíveis.
    "service.beta.kubernetes.io/port_80_health-probe_protocol"  = "tcp"
    "service.beta.kubernetes.io/port_443_health-probe_protocol" = "tcp"
  }

  depends_on = [module.cluster]
}
