# Ambiente de staging na assinatura Azure for Students do grupo.
# Fixada: todos os membros e o pipeline criam recursos nesta assinatura, independente da
# assinatura ativa no az CLI. Para usar outra, veja infra/README.md ("Trocar a assinatura Azure").
subscription_id = "431af8e3-d217-4987-ac21-bee6311184f9"
location        = "northcentralus"
environment     = "staging"

node_vm_size = "Standard_B2als_v2"
node_count   = 2

db_sku_name   = "B_Standard_B1ms"
db_storage_mb = 32768

# Acesso aos secrets do Key Vault (RBAC). Object IDs não são segredos.
# Adicione aqui o object ID de cada membro do grupo que for executar o Terraform.
secrets_officer_object_ids = [
  "5b1754ca-0fbd-4dd2-b8af-ea21e5e87226", # Pedro (RM376180)
  "b917e5e4-957b-4eb9-ad97-719187e3f5be", # Tamyres (RM376206)
  "a3e69246-2937-4425-a6fb-13e3782f5c89", # Matheus (RM376936)
  "fb7b2b9c-457e-477e-8172-1d62a8b537a7", # Guilherme (RM376089)
  "6691c766-e9f8-4b89-b704-7d9e0ee52ef8", # sp-garage-flow-github-actions (CI/CD)
]
