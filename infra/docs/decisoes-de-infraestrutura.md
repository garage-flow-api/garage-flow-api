# Decisões de Infraestrutura — Garage Flow API

| | |
| --- | --- |
| **Escopo** | Provisionamento em cloud (Terraform) e integração com os manifestos Kubernetes de `k8s/` |
| **Ambiente** | `staging` |
| **Clouds** | AWS Academy Learner Lab (principal) · Azure for Students (alternativa) |
| **Status** | Aceito |
| **Guia de uso** | [infra/README.md](../README.md) |

## Contexto geral

A Fase 2 do Tech Challenge exige scripts Terraform (em `/infra`) que provisionem um cluster Kubernetes e o banco de dados, além de manifestos Kubernetes com Deployments, Services, ConfigMaps/Secrets e HPA (em `/k8s`) e um pipeline de CI/CD.

O ambiente-alvo impõe restrições que orientam quase todas as decisões abaixo:

| Restrição | Origem | Impacto |
| --- | --- | --- |
| Não é possível criar IAM Roles/Policies | AWS Academy Learner Lab | Sem IRSA/Pod Identity, AWS Load Balancer Controller, Cluster Autoscaler ou External Secrets com role dedicada |
| Credenciais temporárias (~4 h) | AWS Academy Learner Lab | Automação não pode depender de credenciais de longa duração |
| Orçamento limitado (créditos) | AWS Academy / Azure for Students | Recursos de custo fixo (NAT Gateway, Multi-AZ) precisam de justificativa |
| Regiões restritas | `us-east-1`/`us-west-2` (AWS); policy de regiões (Azure for Students) | Região parametrizada |
| Manifestos em revisão de PR | Branch `kubernetes-config` | A infraestrutura não pode exigir reescrita de `k8s/` |
| CI/CD sob responsabilidade de outro membro | Divisão do grupo | A infraestrutura precisa expor um contrato estável para o pipeline |

## Resumo das decisões

| ID | Decisão | Escolha |
| --- | --- | --- |
| [ADR-01](#adr-01--estratégia-multi-cloud) | Estratégia multi-cloud | Root modules independentes por cloud + módulo Kubernetes compartilhado |
| [ADR-02](#adr-02--orquestrador-kubernetes) | Orquestrador | EKS (AWS) · AKS Free (Azure) |
| [ADR-03](#adr-03--banco-de-dados) | Banco de dados | RDS PostgreSQL 16 · Azure Database for PostgreSQL Flexible Server 16 |
| [ADR-04](#adr-04--identidade-e-permissões-iam) | Identidade e permissões | `LabRole` parametrizada, com roles dedicadas mapeadas para AWS real |
| [ADR-05](#adr-05--topologia-de-rede-na-aws) | Rede AWS | Subnets públicas para nodes, privadas para o banco, sem NAT Gateway |
| [ADR-06](#adr-06--exposição-http) | Exposição HTTP | F5 NGINX Ingress Controller + Load Balancer nativo do Kubernetes |
| [ADR-07](#adr-07--gestão-de-segredos) | Segredos | Gerados pelo Terraform, replicados em Secrets Manager/Key Vault e Secret Kubernetes |
| [ADR-08](#adr-08--tls-na-conexão-com-o-banco) | TLS do banco | `sslmode=require` com `uselibpqcompat=true` |
| [ADR-09](#adr-09--integração-com-os-manifestos-kubernetes) | Integração com `k8s/` | Kustomize overlays em `infra/kubernetes` + Service `ExternalName` |
| [ADR-10](#adr-10--registry-e-versionamento-de-imagens) | Registry e imagens | ECR/ACR, duas imagens, tag = SHA do commit |
| [ADR-11](#adr-11--state-remoto-do-terraform) | State do Terraform | S3 com lock nativo · Azure Storage, criados por stacks de bootstrap |
| [ADR-12](#adr-12--capacidade-e-escalabilidade) | Capacidade | Node pool fixo (2 nodes) + HPA de pods |
| [ADR-13](#adr-13--ambientes-e-ciclo-de-vida) | Ambientes e ciclo de vida | Ambiente único `staging`, infraestrutura efêmera |
| [ADR-14](#adr-14--fronteira-entre-terraform-e-cicd) | Fronteira Terraform × CI/CD | Terraform provisiona infra e plataforma; deploy da aplicação por scripts/pipeline |
| [ADR-15](#adr-15--acesso-compartilhado-à-assinatura-azure) | Acesso compartilhado (Azure) | Contas individuais com RBAC na assinatura, Key Vault em modo RBAC, service principal com OIDC para o pipeline |

---

## ADR-01 — Estratégia multi-cloud

**Contexto.** O grupo usará a AWS Academy, mas a Azure for Students oferece créditos e regras mais permissivas e pode se tornar o ambiente principal. A troca de cloud não pode exigir reescrever a infraestrutura nem o deploy.

**Decisão.** Dois root modules independentes (`infra/aws`, `infra/azure`), cada um com submódulos próprios (`network`, `cluster`, `database`, `registry`, `secrets`). Os dois consomem um módulo compartilhado (`infra/modules/kubernetes-platform`) para os recursos dentro do cluster e expõem o **mesmo contrato de outputs** (`registry_url`, `api_image_repository`, `kubeconfig_command`, `db_host`...).

**Motivo principal.** Os serviços gerenciados das duas clouds não são equivalentes 1:1 (IAM × Managed Identity, Security Group × delegação de subnet, ECR com repositórios explícitos × ACR implícito). Abstrair essas diferenças num único módulo produz uma interface com muitos parâmetros condicionais. A portabilidade real está em outro lugar: na camada Kubernetes e no contrato de outputs.

**Prós**
- Cada stack usa os recursos idiomáticos da sua cloud, sem condicionais por provider.
- O deploy da aplicação (`deploy-app.sh`, Kustomize, pipeline) é o mesmo nas duas clouds.
- Uma cloud pode evoluir ou ser removida sem afetar a outra.

**Contras**
- Duplicação estrutural (variáveis e outputs repetidos nas duas stacks).
- Mudanças transversais, como uma nova variável da aplicação, exigem edição em dois lugares, mitigado pelo módulo compartilhado.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Módulo único com `var.cloud` e `count` condicional por recurso | Interface inchada, plano difícil de ler e providers das duas clouds sempre inicializados |
| Pulumi / Crossplane como camada de abstração | Fora do requisito (o enunciado exige Terraform) e curva de aprendizado adicional |
| Somente AWS, com Azure no futuro | Requisito explícito do grupo de deixar a Azure pronta |

---

## ADR-02 — Orquestrador Kubernetes

**Contexto.** O enunciado exige deploy via manifestos Kubernetes com HPA. Os manifestos já existem e foram validados no Kubernetes do Docker Desktop.

**Decisão.** **Amazon EKS** com managed node group (2× `t3.medium`, AL2023) na AWS e **AKS tier Free** (2× `Standard_B2als_v2`) na Azure. A versão do Kubernetes é parametrizada, e o EKS usa `upgrade_policy = STANDARD` para não entrar em extended support.

**Motivo principal.** Kubernetes gerenciado elimina a operação do control plane (etcd, upgrades, alta disponibilidade) e é suportado nos dois ambientes acadêmicos. O EKS aceita a `LabRole` como role do cluster e dos nodes.

**Prós**
- Os manifestos de `k8s/` rodam sem alteração de semântica.
- Control plane com alta disponibilidade gerenciada pelo provedor.
- O managed node group cuida do provisionamento e da substituição dos nodes.

**Contras**
- O EKS cobra US$ 0,10/h pelo control plane, inclusive com o laboratório encerrado (o AKS Free não cobra).
- O provisionamento do EKS leva cerca de 10 a 15 minutos.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| k3s/kubeadm em EC2 | Mais barato, mas exige operar o control plane e gerenciar certificados e upgrades; não representa uma arquitetura de produção |
| ECS/Fargate · Azure Container Apps | Abandonaria os manifestos Kubernetes, que são requisito do enunciado |
| `t3.small` nos nodes | 2 GiB de RAM não comportam ingress, metrics-server, CoreDNS e várias réplicas da API (requests de 256 Mi cada) |
| EKS Auto Mode | Requer IAM Roles próprias, indisponíveis no Learner Lab |

---

## ADR-03 — Banco de dados

**Contexto.** Os manifestos executam o PostgreSQL 16 dentro do cluster (Deployment + PVC). O enunciado pede "Terraform para Banco de Dados", e Postgres em Kubernetes não é requisito.

**Decisão.** PostgreSQL gerenciado: **RDS PostgreSQL 16** (`db.t3.micro`, 20 GiB gp3 criptografado, single-AZ, em subnets privadas) e **Azure Database for PostgreSQL Flexible Server 16** (`B_Standard_B1ms`, acesso privado por VNet integration). O PostgreSQL in-cluster continua disponível para o ambiente local.

**Motivo principal.** Estado persistente é o componente mais difícil de operar em Kubernetes: backup, restore, upgrade de versão, failover e IOPS do volume. Um serviço gerenciado resolve isso nativamente, e o Terraform passa a provisionar o banco como pede o enunciado.

**Prós**
- Backups automáticos, patching e criptografia em repouso gerenciados.
- O banco sobrevive à recriação do cluster, com ciclo de vida independente dos pods.
- Sem acesso público: alcançável somente a partir da rede do cluster.
- Elimina o EBS CSI Driver na AWS, que exigiria IRSA.

**Contras**
- Custo fixo adicional, pequeno nas classes burstable.
- Exige TLS na conexão (ver ADR-08).
- Divergência entre o ambiente local (Postgres in-cluster) e a cloud (gerenciado), mitigada pelo uso da mesma versão major.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| PostgreSQL in-cluster com PVC em EBS/Azure Disk | Na AWS exige EBS CSI Driver com IRSA (indisponível no Learner Lab); backup e failover manuais |
| Multi-AZ / alta disponibilidade | Dobra o custo do banco; desnecessário para staging (disponível via `db_multi_az`) |
| Aurora Serverless v2 | Custo mínimo maior e cold start; recursos que a aplicação não usa |

---

## ADR-04 — Identidade e permissões (IAM)

**Contexto.** O EKS precisa de uma role para o control plane e outra para os nodes. O Learner Lab bloqueia `iam:CreateRole` e oferece a `LabRole`, uma role pré-provisionada e ampla.

**Decisão.** O módulo `infra/aws/modules/iam` recebe `existing_role_name`:

| Cenário | Valor | Comportamento |
| --- | --- | --- |
| Learner Lab (staging) | `"LabRole"` | Referencia a role existente para o control plane e os nodes; nenhum recurso IAM é criado |
| Conta AWS real | `null` | Cria roles dedicadas com políticas gerenciadas mínimas |

Mapeamento das roles para uma conta AWS real:

| Role | Confiança (`assume role`) | Políticas | Uso |
| --- | --- | --- | --- |
| `<nome>-eks-cluster` | `eks.amazonaws.com` | `AmazonEKSClusterPolicy` | Control plane: ENIs, Load Balancers, security groups |
| `<nome>-eks-node` | `ec2.amazonaws.com` | `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly` | Nodes: registro no cluster, rede dos pods, pull de imagens |
| GitHub Actions *(documentada, não implementada)* | OIDC `token.actions.githubusercontent.com`, restrita ao repositório | ECR push, `eks:DescribeCluster` + access entry no cluster | Pipeline sem access keys de longa duração |

Na Azure, o equivalente é a **Managed Identity** do AKS (criada pelo próprio serviço), com `Network Contributor` na subnet e `AcrPull` no registry. O acesso de pessoas e do pipeline à assinatura está no ADR-15.

**Motivo principal.** Um único código serve ao laboratório e a uma conta real, e a limitação fica explícita em vez de embutida.

**Prós**
- Caminho de evolução para produção sem reescrita: basta trocar uma variável.
- A limitação de segurança do laboratório fica documentada no código, no tfvars e neste documento.

**Contras**
- No Learner Lab, control plane e nodes compartilham uma role com privilégios além do necessário. O risco é aceito apenas pelo caráter acadêmico.
- A ausência de IRSA/Pod Identity impede add-ons que precisam de identidade própria (ver ADR-06 e ADR-12).

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Hardcode do ARN da `LabRole` | Impede o reuso em conta real; o ID da conta muda a cada laboratório |
| Criar as roles sempre | Falha no Learner Lab (`AccessDenied`) |
| Data source `aws_iam_role` para descobrir a role | Depende de `iam:GetRole`, nem sempre liberado; o ARN é montado a partir da conta corrente |

---

## ADR-05 — Topologia de rede na AWS

**Contexto.** Nodes em subnets privadas precisam de um NAT Gateway para baixar imagens do ECR e falar com o endpoint do EKS. O NAT tem custo fixo de aproximadamente US$ 0,045/h mais tráfego (≈ US$ 33/mês), uma fração relevante dos créditos do laboratório.

**Decisão.** VPC em 2 AZs com:
- **subnets públicas** para os nodes do EKS e o Load Balancer, com IP público e entrada controlada pelo security group do cluster;
- **subnets privadas** para o RDS, sem rota para a internet;
- **NAT Gateway desligado** por padrão (`enable_nat_gateway = false`). Com `true`, os nodes passam para as subnets privadas.

A AZ `use1-az3` é excluída por não suportar o control plane do EKS.

**Motivo principal.** Custo. O banco, único componente com dados, continua isolado em subnet privada.

**Prós**
- Economia de aproximadamente US$ 33/mês.
- Menos componentes, menos pontos de falha.
- Mudança para a topologia de produção por uma variável.

**Contras**
- Os nodes têm IP público e uma superfície de ataque maior. Mitigação: o security group do EKS aceita apenas tráfego do cluster e do Load Balancer.
- Diverge da recomendação da AWS para produção (nodes privados).

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| NAT Gateway por AZ | Custo multiplicado pelo número de AZs; justificável apenas em produção |
| NAT único | Melhor postura de segurança, custo fixo incompatível com o orçamento do laboratório (disponível via variável) |
| VPC Endpoints (ECR, S3, STS, EKS) em vez de NAT | Cada interface endpoint custa por AZ/hora; o total supera o NAT único |

Na Azure, a saída dos nodes é feita pelo Load Balancer padrão do AKS, sem custo equivalente ao NAT.

---

## ADR-06 — Exposição HTTP

**Contexto.** `k8s/ingress.yaml` usa `ingressClassName: nginx`. O Ingress Controller precisa de um Load Balancer da cloud com endereço público. O projeto comunitário `kubernetes/ingress-nginx` teve a manutenção encerrada em março de 2026.

**Decisão.** **F5 NGINX Ingress Controller** (chart `nginx-ingress`, mantido pela F5/NGINX Inc.), instalado pelo Terraform via Helm com a classe `nginx` e um Service `LoadBalancer`:
- **AWS:** Network Load Balancer provisionado pelo cloud provider nativo do Kubernetes (anotação `aws-load-balancer-type: nlb`);
- **Azure:** Azure Standard Load Balancer, com health probe TCP.

A versão do chart é fixada (`ingress_chart_version`, hoje `2.8.0`, controller 5.7.0) para que um ambiente recriado receba a mesma versão; a atualização é uma mudança explícita no código.

O metrics-server é instalado como add-on do EKS; no AKS ele já vem nativo. Não há domínio nem TLS: o acesso é feito pelo hostname/IP do Load Balancer.

**Motivo principal.** É um controller mantido, compatível com o manifesto existente sem alterações, e que funciona sem IAM Role dedicada.

**Prós**
- `k8s/ingress.yaml` permanece inalterado.
- Mesmo controller e mesma configuração nas duas clouds.
- Recebe correções de segurança, diferente do ingress-nginx comunitário.

**Contras**
- As anotações específicas do ingress-nginx comunitário (`nginx.ingress.kubernetes.io/*`) não são compatíveis. Hoje não há nenhuma em uso.
- O Load Balancer é criado pelo Kubernetes, fora do state do Terraform, e exige remoção ordenada (tratada em `destroy.sh`).
- Sem HTTPS.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| AWS Load Balancer Controller (ALB) | Exige IRSA/Pod Identity (IAM Role dedicada), indisponível no Learner Lab |
| ingress-nginx comunitário | Sem manutenção nem correções de segurança desde março de 2026 |
| Traefik / Gateway API | Exigiria alterar `ingressClassName` ou migrar `k8s/ingress.yaml` para `HTTPRoute`, mexendo nos manifestos em revisão |
| Service `LoadBalancer` direto na API, sem Ingress | Um Load Balancer por serviço e o manifesto de Ingress (já produzido) ficaria sem uso |
| Domínio + TLS (Route 53/ACM, cert-manager) | Custo de domínio e dependência de DNS; fora do escopo do enunciado |

---

## ADR-07 — Gestão de segredos

**Contexto.** `k8s/secret.yaml` e `k8s/admin-secret.yaml` contêm credenciais versionadas, aceitáveis apenas para demonstração local. A aplicação lê os segredos de variáveis de ambiente vindas de Secrets Kubernetes.

**Decisão.**
1. O Terraform gera os valores com `random_password`: senha do banco, `JWT_SECRET`, `TRACKING_TOKEN_SECRET` e senha do primeiro administrador. São apenas alfanuméricos, para dispensar URL-encoding na `DATABASE_URL`.
2. Os valores são replicados no **AWS Secrets Manager** (`garage-flow/staging/app`) ou no **Azure Key Vault**, que servem como fonte de consulta para pessoas e integrações. Na Azure, o acesso ao Key Vault é controlado por Azure RBAC (ver ADR-15).
3. O Terraform cria o Secret Kubernetes `garage-flow-secrets` com as mesmas chaves do manifesto.
4. O Secret `garage-flow-bootstrap-admin` é temporário: o `deploy-app.sh` o cria a partir dos outputs do Terraform logo antes do Job de bootstrap e o remove assim que o Job termina.
5. Os overlays de cloud removem os Secrets versionados.

**Motivo principal.** Nenhum segredo passa pelo Git nem pelo pipeline de CI, e a aplicação não precisa mudar.

**Prós**
- Segredos fortes e únicos por ambiente.
- O pipeline de CI/CD só manipula a senha do admin, e apenas durante o Job de bootstrap.
- A credencial do admin não fica no cluster depois do bootstrap.
- A senha do admin pode ser recuperada pelo cofre (`secrets_read_command`).

**Contras**
- Os valores ficam no **state do Terraform**. Mitigação: o state fica em bucket/storage privado, criptografado e versionado.
- A rotação exige `terraform apply` e o restart dos pods; não há sincronização automática cofre → cluster.
- O deploy precisa ler o output sensível `bootstrap_admin_password`, o que exige acesso ao state do Terraform.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Secrets versionados (como em `k8s/secret.yaml`) | Exposição de credenciais no repositório |
| External Secrets Operator / Secrets Store CSI Driver | Na AWS exige IRSA para ler o Secrets Manager; adiciona um componente sem ganho no cenário atual |
| Pipeline criando os Secrets a partir de GitHub Secrets | Espalha os valores entre GitHub e cloud e os expõe ao pipeline |
| Sealed Secrets / SOPS | Exige gestão de chaves de criptografia; sem ganho com o Terraform já gerando os valores |

---

## ADR-08 — TLS na conexão com o banco

**Contexto.** O RDS PostgreSQL 16 (`rds.force_ssl = 1`) e o Flexible Server exigem TLS por padrão. A aplicação usa `@prisma/adapter-pg`, ou seja, o driver `pg`. A partir do `pg-connection-string` 2.x, `sslmode=require` passou a ser tratado como `verify-full`, que valida a cadeia de certificados. A CA do RDS não está no trust store do Node.js, então a conexão falharia com `self-signed certificate in certificate chain`.

**Decisão.** `DATABASE_URL` com `sslmode=require&uselibpqcompat=true`. Com `uselibpqcompat=true`, o driver segue a semântica do libpq: a conexão é **criptografada sem validar a CA**. O Prisma CLI, usado nas migrations, interpreta `sslmode=require` da mesma forma e ignora o parâmetro extra.

**Motivo principal.** Garante criptografia em trânsito sem alterar o Dockerfile nem o código da aplicação.

**Prós**
- Tráfego entre a aplicação e o banco criptografado.
- Funciona igual na AWS e na Azure.
- Nenhuma mudança na imagem ou no código.

**Contras**
- Sem validação da identidade do servidor: risco teórico de man-in-the-middle dentro da VPC/VNet, considerado baixo, porque o banco só é alcançável pela rede privada do cluster.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| `sslmode=verify-full` com o bundle de CA do RDS na imagem | Melhor postura; exige alterar o Dockerfile e distribuir o certificado. Recomendado como evolução |
| Desabilitar TLS (`rds.force_ssl = 0`) | Tráfego em texto puro |
| `sslmode=no-verify` | Específico do `pg`; o Prisma CLI das migrations não reconhece o valor |

---

## ADR-09 — Integração com os manifestos Kubernetes

**Contexto.** Os manifestos de `k8s/` estão em revisão de PR e ainda vão mudar. Em cloud, é preciso: remover o PostgreSQL in-cluster e os Secrets versionados, trocar as imagens locais pelas do registry e executar os Jobs na ordem migration → bootstrap → API. O Job de migration aguarda o host `garage-flow-postgres` com `pg_isready`.

**Decisão.**
- `k8s/Kustomization` é a base e lista os manifestos existentes. O nome sem extensão é intencional: não interfere em `kubectl apply -f k8s/`.
- Em `infra/kubernetes/components/`:
  - `managed-database` remove o Postgres in-cluster e os Secrets versionados;
  - `without-app` mantém apenas os Jobs.
- Em `infra/kubernetes/overlays/`, três pontos de entrada: `cloud-migration`, `cloud-bootstrap-admin` e `cloud`.
- O Terraform cria o Service `garage-flow-postgres` do tipo **`ExternalName`**, apontando para o endpoint do banco gerenciado.
- As imagens são definidas no deploy por um overlay temporário (`images:`), sem alterar arquivos versionados.

**Motivo principal.** Zero alteração nos manifestos em revisão: as mudanças do PR são herdadas automaticamente pelos overlays.

**Prós**
- Uma única fonte de verdade para os manifestos da aplicação.
- Os Jobs mantêm o host `garage-flow-postgres` e o mesmo `pg_isready`.
- Execução ordenada e repetível dos Jobs, que são imutáveis e recriados a cada deploy.
- `kubectl` já embute o Kustomize, sem ferramenta adicional.

**Contras**
- Os overlays ficam fora de `k8s/`: o Kustomize proíbe que um overlay esteja dentro do diretório da sua base (detecção de ciclo).
- Patches `$patch: delete` dependem dos nomes dos recursos. Renomear um recurso em `k8s/` exige ajustar os componentes.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Editar os manifestos para a cloud | Conflitos com o PR em revisão; perderia o fluxo local |
| Reorganizar `k8s/` em `base/` + `overlays/` | Move arquivos em revisão; conflito garantido |
| Helm chart próprio da aplicação | Reescreve os manifestos como templates; complexidade desproporcional |
| Terraform aplicando os manifestos (`kubernetes_manifest`) | Acopla o release da aplicação ao `terraform apply`; o CI/CD perde a responsabilidade pelo deploy |
| Trocar o host do Job para o endpoint do banco | Exigiria editar `migration-job.yaml`; o `ExternalName` resolve sem edição |

---

## ADR-10 — Registry e versionamento de imagens

**Contexto.** Os manifestos usam imagens locais (`garage-flow-api:local`, `garage-flow-api-migration:latest`/`:local`), inacessíveis a um cluster em cloud. O Dockerfile tem dois estágios relevantes: `production` (API) e `build` (contém o Prisma CLI, usado pelos Jobs).

**Decisão.** Um registry privado por cloud (**ECR** / **ACR Basic**) com dois repositórios: `garage-flow-api` e `garage-flow-api-migration`. A tag é o **SHA curto do commit**. O ECR tem scan on push e retém as 10 imagens mais recentes. O build força `linux/amd64`.

**Motivo principal.** Rastreabilidade: cada pod aponta para o commit exato que o originou. Também resolve a inconsistência de tags dos manifestos.

**Prós**
- Rollback simples, reaplicando uma tag anterior.
- Pull autenticado pela role/identidade dos nodes, sem `imagePullSecrets`.
- Builds em Macs Apple Silicon geram imagens compatíveis com os nodes x86_64.

**Contras**
- Duas imagens por deploy (tempo de build e armazenamento).
- O ACR Basic não tem política de retenção; a limpeza é manual.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Docker Hub / GHCR | Exigiria `imagePullSecrets` no cluster e credenciais adicionais |
| Tag `latest` | Não rastreável; com `IfNotPresent`, os nodes não buscam a versão nova |
| Imagem única para API e Jobs | A imagem `production` não contém o Prisma CLI; incluí-lo aumentaria a superfície da imagem da API |

---

## ADR-11 — State remoto do Terraform

**Contexto.** Várias pessoas (e o pipeline) operam a mesma infraestrutura. O state contém segredos (ADR-07).

**Decisão.**
- **AWS:** bucket S3 `garage-flow-tfstate-<account-id>`, versionado, criptografado e privado, com **lock nativo do S3** (`use_lockfile = true`, Terraform ≥ 1.10).
- **Azure:** Storage Account + container `tfstate`, versionado, com lock por blob lease.
- O bucket/storage é criado por uma stack `bootstrap/` com state local. Ela gera o `backend.hcl` consumido por `terraform init -backend-config=backend.hcl`.

**Motivo principal.** Resolver o problema "ovo e galinha" (o state remoto precisa existir antes da stack que o usa) sem passos manuais no console.

**Prós**
- Lock contra applies concorrentes.
- Histórico de versões do state, que permite recuperação.
- Nenhum nome de bucket hardcoded no código.

**Contras**
- O state da stack de bootstrap é local, mas só contém o bucket e é recriável.
- Uma etapa extra na primeira execução, automatizada em `provision.sh`.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| State local | Sem compartilhamento nem lock; segredos na máquina de quem executou |
| S3 + tabela DynamoDB para lock | Mecanismo legado, substituído pelo lock nativo do S3 |
| HCP Terraform (Terraform Cloud) | Conta e credenciais adicionais; integração com as credenciais temporárias do Learner Lab é trabalhosa |

---

## ADR-12 — Capacidade e escalabilidade

**Contexto.** O HPA de `k8s/hpa.yaml` escala a API de 1 a 10 réplicas (CPU 60% / memória 70%). Cada réplica solicita 250m de CPU e 256 Mi de memória.

**Decisão.** Node pool de **tamanho fixo**: 2 nodes de 2 vCPU / 4 GiB. O HPA escala os pods dentro dessa capacidade, sem autoscaling de nodes.

**Motivo principal.** Os 2 nodes comportam as 10 réplicas máximas do HPA (2,5 vCPU / 2,5 GiB de requests) mais os componentes de sistema. O Cluster Autoscaler e o Karpenter exigem IAM Role dedicada.

**Prós**
- Custo previsível.
- Demonstra o requisito do enunciado (escalabilidade por CPU/memória) sem dependências de IAM.
- 2 nodes mantêm a API disponível durante a substituição de um node.

**Contras**
- Picos acima da capacidade deixam pods em `Pending`.
- Capacidade ociosa fora dos picos.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Cluster Autoscaler / Karpenter (EKS) | Exigem IRSA/Pod Identity |
| Cluster autoscaler nativo do AKS | Disponível, mas mantido desligado para paridade com a AWS e custo previsível. Habilitável com `auto_scaling_enabled` no node pool |
| Node único | Sem tolerância a falhas e capacidade insuficiente para o HPA máximo |

---

## ADR-13 — Ambientes e ciclo de vida

**Contexto.** O orçamento dos créditos não comporta múltiplos ambientes permanentes. Na AWS, encerrar a sessão do Learner Lab **não** interrompe a cobrança do EKS, do RDS nem do NLB.

**Decisão.** Ambiente único **`staging`**, tratado como **efêmero**: provisionado para desenvolvimento ou demonstração e destruído em seguida (`destroy.sh`). O código é parametrizado por ambiente (`environments/<nome>.tfvars`, key de state por ambiente).

**Motivo principal.** Custo: aproximadamente US$ 6/dia na AWS se mantido ligado.

**Prós**
- Consumo de créditos proporcional ao uso.
- Recriar o ambiente com frequência valida continuamente o próprio IaC.

**Contras**
- Os dados do banco não sobrevivem ao destroy (`skip_final_snapshot = true`).
- 15 a 20 minutos para recriar o ambiente.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| `dev` + `staging` + `prod` | Multiplica o custo sem benefício no contexto acadêmico |
| Terraform workspaces | Separação implícita, mais propensa a erro; tfvars + key de state são explícitos |
| Ambiente permanente | Consome os créditos rapidamente |

---

## ADR-14 — Fronteira entre Terraform e CI/CD

**Contexto.** O pipeline de CI/CD é responsabilidade de outro membro do grupo. O enunciado pede que o pipeline faça o build, os testes, o build da imagem, o deploy no cluster, o deploy do banco e a aplicação dos manifestos.

**Decisão.**
- **Terraform:** infraestrutura e plataforma (cluster, banco, registry, Ingress Controller, Secrets, alias do banco).
- **Scripts de referência:** `provision.sh`, `deploy-app.sh` e `destroy.sh`. Cada bloco do `deploy-app.sh` corresponde a um step do pipeline.
- **Contrato de outputs** estável e idêntico nas duas clouds, documentado no README.

**Motivo principal.** Desacoplar o ciclo de vida da infraestrutura (raro, lento, caro) do ciclo de release da aplicação (frequente), e permitir que o pipeline seja construído em paralelo.

**Prós**
- O pipeline pode reutilizar os scripts diretamente ou reproduzir seus passos.
- A infraestrutura é testável de ponta a ponta sem pipeline.
- O "deploy do banco" do enunciado fica coberto em duas partes: provisionamento (Terraform) e schema (Job de migration).

**Contras**
- No Learner Lab, o pipeline depende de credenciais temporárias renovadas manualmente.
- Os scripts e o pipeline podem divergir se evoluírem separadamente.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Terraform também aplicando a aplicação | Todo release vira um `terraform apply`, lento e com risco de alterações de infraestrutura indesejadas |
| Implementar o pipeline nesta entrega | Responsabilidade de outro membro do grupo |

---

## ADR-15 — Acesso compartilhado à assinatura Azure

**Contexto.** A stack Azure roda em uma única assinatura Azure for Students, de um membro do grupo, no tenant da FIAP. Os demais membros e o pipeline de CI/CD (ADR-14) precisam provisionar e fazer deploy nessa assinatura. Na primeira versão, o Key Vault usava *access policies*: o bloco `access_policy` concedia acesso apenas ao `object_id` de quem executava o Terraform e era tratado como lista completa, então cada `apply` removia o acesso de quem aplicou antes.

**Decisão.**
1. **Pessoas:** cada membro usa a própria conta da FIAP (já presente no tenant, sem convite) com `Owner` na assinatura, ou `Contributor` + `Role Based Access Control Administrator`. A role de RBAC é necessária porque a stack cria e remove role assignments (`AcrPull`, `Network Contributor`, `Key Vault Secrets Officer`).
2. **Key Vault em modo RBAC** (`rbac_authorization_enabled = true`). Cada identidade da lista `secrets_officer_object_ids` (`environments/<ambiente>.tfvars`) recebe `Key Vault Secrets Officer` no cofre, além de quem executa o Terraform. Um `time_sleep` de 60 s aguarda a propagação do RBAC antes de gravar os secrets.
3. **Pipeline:** service principal `sp-garage-flow-github-actions` com credencial federada (OIDC) restrita a `repo:garage-flow-api/garage-flow-api:ref:refs/heads/main`, com `Contributor` + `Role Based Access Control Administrator` na assinatura. O pipeline autentica com `ARM_USE_OIDC=true`, `ARM_CLIENT_ID`, `ARM_TENANT_ID` e `ARM_SUBSCRIPTION_ID`, sem segredo armazenado no GitHub.
4. **State compartilhado:** `infra/azure/backend.hcl` é versionado (contém apenas nomes), para que todos usem o mesmo state remoto. Na AWS o arquivo continua local, porque cada membro usa o próprio Learner Lab.
5. **Assinatura fixada:** `subscription_id` é versionado no `staging.tfvars` e no `backend.hcl`. Recursos e state ficam sempre na assinatura do grupo, mesmo que outra esteja ativa no az CLI. A troca é documentada no README da infra ("Trocar a assinatura Azure").

**Motivo principal.** Nenhuma credencial pessoal é compartilhada, e qualquer membro ou o pipeline pode aplicar a stack sem tirar o acesso dos demais.

**Prós**
- Atribuições de RBAC são aditivas: com todos na lista, o conjunto de role assignments é o mesmo para qualquer executor, sem alteração a cada `apply`.
- Auditoria por pessoa no Activity Log, em vez de uma conta compartilhada.
- O pipeline não guarda client secret com validade a renovar.

**Contras**
- No modo RBAC, `Owner` da assinatura não lê secrets: quem precisar consultar o cofre deve estar em `secrets_officer_object_ids` (ou receber a role manualmente).
- Quem executa o Terraform sem estar na lista ganha acesso, mas perde no próximo `apply` de outra pessoa.
- `Role Based Access Control Administrator` sem condição permite conceder qualquer role na assinatura. Risco aceito pelo caráter acadêmico; em produção, a role deve ser restrita por condição às roles usadas pela stack.
- Os créditos consumidos são do dono da assinatura.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Compartilhar a conta pessoal (usuário e senha) | Viola as políticas da FIAP e da Microsoft, impede MFA individual e auditoria |
| Access policies com lista de `object_id` | Funciona, mas é um modelo legado no Key Vault; RBAC é o padrão recomendado e unifica as permissões no IAM |
| Service principal com client secret | Segredo de longa duração armazenado no GitHub, que precisa de rotação |
| Uma assinatura por membro | Créditos e recursos duplicados; o pipeline teria de escolher a assinatura |

---

## Evolução recomendada para produção

| Tema | Estado atual (staging) | Produção |
| --- | --- | --- |
| IAM | `LabRole` compartilhada | Roles dedicadas (`existing_iam_role_name = null`) + IRSA/Pod Identity + OIDC no pipeline |
| Rede | Nodes em subnets públicas | `enable_nat_gateway = true`, nodes privados, endpoint do EKS restrito |
| Banco | Single-AZ, sem snapshot final | Multi-AZ, `deletion_protection`, snapshot final, retenção de backup ≥ 7 dias |
| TLS do banco | Criptografado sem validação de CA | `sslmode=verify-full` com o bundle de CA na imagem |
| Exposição | HTTP pelo hostname do LB | Domínio, TLS (ACM ou cert-manager), WAF |
| Escalabilidade | Nodes fixos | Cluster Autoscaler/Karpenter |
| Segredos | Sincronização via `terraform apply` | External Secrets Operator com rotação |
| Observabilidade | metrics-server | Logs e métricas centralizados (CloudWatch Container Insights / Azure Monitor) |
