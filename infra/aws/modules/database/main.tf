# PostgreSQL gerenciado (RDS) em subnets privadas, acessível somente a partir dos nodes do EKS.

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.subnet_ids

  tags = { Name = "${var.name}-db" }
}

resource "aws_security_group" "this" {
  name        = "${var.name}-db"
  description = "PostgreSQL acessivel apenas pelos nodes do cluster"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-db" }
}

# `count` em vez de `for_each`: os IDs só são conhecidos após a criação do cluster,
# mas a quantidade de elementos é conhecida no plan.
resource "aws_vpc_security_group_ingress_rule" "postgres" {
  count = length(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.allowed_security_group_ids[count.index]
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "PostgreSQL a partir do cluster"
}

resource "aws_db_instance" "this" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.database_name
  username = var.username
  password = var.password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.this.id]
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period    = var.backup_retention_period
  auto_minor_version_upgrade = true
  apply_immediately          = true

  # Ambiente de staging efêmero: permite `terraform destroy` sem snapshot nem proteção.
  # Em produção: deletion_protection = true e skip_final_snapshot = false.
  deletion_protection = false
  skip_final_snapshot = true
}
