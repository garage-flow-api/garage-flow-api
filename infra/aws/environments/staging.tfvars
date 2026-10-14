# Ambiente de staging no AWS Academy Learner Lab.
aws_region  = "us-east-1"
environment = "staging"

# ⚠️ Learner Lab: a conta não permite criar IAM Roles. A LabRole pré-provisionada pelo
# laboratório é reutilizada pelo control plane e pelos nodes do EKS.
# Em uma conta AWS real, remova esta linha (ou use null) para criar roles dedicadas.
existing_iam_role_name = "LabRole"

# Sem NAT Gateway para preservar o orçamento do laboratório.
enable_nat_gateway = false

node_instance_types = ["t3.medium"]
node_desired_size   = 2
node_min_size       = 2
node_max_size       = 3

db_instance_class = "db.t3.micro"
db_multi_az       = false
