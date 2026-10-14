# Ambiente de staging na assinatura Azure for Students.
# subscription_id = "00000000-0000-0000-0000-000000000000"  # ou exporte ARM_SUBSCRIPTION_ID
location    = "northcentralus"
environment = "staging"

node_vm_size = "Standard_B2als_v2"
node_count   = 2

db_sku_name   = "B_Standard_B1ms"
db_storage_mb = 32768
