# Recursos Kubernetes que dependem da cloud e, por isso, não ficam versionados em k8s/:
# Ingress Controller, Secrets com valores gerados e o alias DNS do banco gerenciado.
# Os demais manifestos (Deployment, Service, HPA, Jobs...) são aplicados via Kustomize
# a partir de infra/kubernetes/overlays.

locals {
  # `uselibpqcompat=true` faz o driver `pg` (usado pelo PrismaPg) seguir a semântica do libpq:
  # `sslmode=require` criptografa a conexão sem validar a cadeia de certificados. Sem isso, o `pg`
  # trata `require` como `verify-full` e rejeita a CA do RDS, que não está no trust store do Node.
  database_url = format(
    "postgresql://%s:%s@%s:%d/%s?schema=public&sslmode=require&uselibpqcompat=true",
    var.database.username,
    var.database.password,
    var.database.host,
    var.database.port,
    var.database.name,
  )
}

# Ingress Controller mantido pela F5/NGINX Inc. O projeto comunitário `kubernetes/ingress-nginx`
# teve a manutenção encerrada em março/2026 (retirement anunciado pela SIG Network). Este
# controller atende o mesmo `ingressClassName: nginx` usado em k8s/ingress.yaml, sem exigir
# alteração nos manifestos.
resource "helm_release" "ingress" {
  name             = "nginx-ingress"
  namespace        = var.ingress_namespace
  create_namespace = true
  repository       = "https://helm.nginx.com/stable"
  chart            = "nginx-ingress"
  version          = var.ingress_chart_version

  # Aguarda o Load Balancer da cloud receber um endereço público.
  wait    = true
  timeout = 900

  values = [yamlencode({
    controller = {
      replicaCount = 1
      ingressClass = {
        name                = "nginx"
        create              = true
        setAsDefaultIngress = false
      }
      service = {
        type        = "LoadBalancer"
        annotations = var.ingress_service_annotations
      }
    }
  })]
}

resource "kubernetes_secret_v1" "app" {
  metadata {
    name      = "garage-flow-secrets"
    namespace = var.namespace
  }

  type = "Opaque"

  # Mesmas chaves de k8s/secret.yaml, consumidas pelo Deployment e pelos Jobs.
  data = {
    POSTGRES_USER         = var.database.username
    POSTGRES_PASSWORD     = var.database.password
    POSTGRES_DB           = var.database.name
    DATABASE_URL          = local.database_url
    JWT_SECRET            = var.jwt_secret
    TRACKING_TOKEN_SECRET = var.tracking_token_secret
  }
}

resource "kubernetes_secret_v1" "bootstrap_admin" {
  metadata {
    name      = "garage-flow-bootstrap-admin"
    namespace = var.namespace
  }

  type = "Opaque"

  # Mesmas chaves de k8s/admin-secret.yaml.
  data = {
    ADMIN_NAME     = var.bootstrap_admin.name
    ADMIN_EMAIL    = var.bootstrap_admin.email
    ADMIN_PASSWORD = var.bootstrap_admin.password
  }
}

# Substitui o Service do PostgreSQL in-cluster por um alias DNS para o banco gerenciado,
# mantendo o host `garage-flow-postgres` esperado pelo init container do Job de migration.
resource "kubernetes_service_v1" "database_alias" {
  metadata {
    name      = "garage-flow-postgres"
    namespace = var.namespace
  }

  spec {
    type          = "ExternalName"
    external_name = var.database.host

    port {
      name        = "postgres"
      port        = var.database.port
      target_port = var.database.port
    }
  }
}
