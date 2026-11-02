# Decisões de Infraestrutura — Garage Flow API

| | |
| --- | --- |
| **Escopo** | Provisionamento em cloud (Terraform) e integração com os manifestos Kubernetes de `k8s/` |
| **Ambiente** | `staging` |
| **Cloud** | Azure (assinatura Azure for Students do grupo) |
| **Status** | Aceito |
| **Guia de uso** | [infra/README.md](../README.md) |

## Contexto geral

A Fase 2 do Tech Challenge exige scripts Terraform (em `/infra`) que provisionem um cluster Kubernetes e o banco de dados, além de manifestos Kubernetes com Deployments, Services, ConfigMaps/Secrets e HPA (em `/k8s`) e um pipeline de CI/CD.

O ambiente-alvo impõe restrições que orientam quase todas as decisões abaixo:

| Restrição | Origem | Impacto |
| --- | --- | --- |
| Orçamento limitado (créditos) | Azure for Students | Recursos de custo fixo (NAT Gateway, alta disponibilidade) precisam de justificativa |
| Regiões restritas por policy | Azure for Students | Região parametrizada e validada pelo `setup-azure.sh` |
| Quota baixa de vCPUs por região | Azure for Students | Node pool pequeno e de tamanho fixo |
| Assinatura de um único membro | Azure for Students | Os demais membros e o pipeline acessam por RBAC (ADR-15) |
| Manifestos em revisão de PR | Branch `kubernetes-config` | A infraestrutura não pode exigir reescrita de `k8s/` |
| CI/CD sob responsabilidade de outro membro | Divisão do grupo | A infraestrutura precisa expor um contrato estável para o pipeline |

## Resumo das decisões

| ID | Decisão | Escolha |
| --- | --- | --- |
| [ADR-01](#adr-01--escolha-da-cloud-azure) | Cloud | Azure for Students, em vez do AWS Academy Learner Lab |
| [ADR-02](#adr-02--orquestrador-kubernetes) | Orquestrador | AKS tier Free |
| [ADR-03](#adr-03--banco-de-dados) | Banco de dados | Azure Database for PostgreSQL Flexible Server 16 |
| [ADR-04](#adr-04--identidade-dos-workloads) | Identidade dos workloads | Managed Identity do AKS com `Network Contributor` e `AcrPull` |
| [ADR-05](#adr-05--topologia-de-rede) | Rede | VNet com subnet do AKS e subnet delegada ao banco, sem NAT Gateway |
| [ADR-06](#adr-06--exposição-http) | Exposição HTTP | F5 NGINX Ingress Controller + Load Balancer nativo do Kubernetes |
| [ADR-07](#adr-07--gestão-de-segredos) | Segredos | Gerados pelo Terraform, replicados no Key Vault e em Secret Kubernetes |
| [ADR-08](#adr-08--tls-na-conexão-com-o-banco) | TLS do banco | `sslmode=require` com `uselibpqcompat=true` |
| [ADR-09](#adr-09--integração-com-os-manifestos-kubernetes) | Integração com `k8s/` | Kustomize overlays em `infra/kubernetes` + Service `ExternalName` |
| [ADR-10](#adr-10--registry-e-versionamento-de-imagens) | Registry e imagens | ACR, duas imagens, tag = SHA do commit |
| [ADR-11](#adr-11--state-remoto-do-terraform) | State do Terraform | Azure Storage com lock por blob lease, criado por uma stack de bootstrap |
| [ADR-12](#adr-12--capacidade-e-escalabilidade) | Capacidade | Node pool fixo (2 nodes) + HPA de pods |
| [ADR-13](#adr-13--ambientes-e-ciclo-de-vida) | Ambientes e ciclo de vida | Ambiente único `staging`, infraestrutura efêmera |
| [ADR-14](#adr-14--fronteira-entre-terraform-e-cicd) | Fronteira Terraform × CI/CD | Terraform provisiona infra e plataforma; deploy da aplicação por scripts/pipeline |
| [ADR-15](#adr-15--acesso-compartilhado-à-assinatura-azure) | Acesso compartilhado (Azure) | Contas individuais com RBAC na assinatura, Key Vault em modo RBAC, service principal com OIDC para o pipeline |

---

## ADR-01 — Escolha da cloud: Azure

**Contexto.** O grupo tinha duas opções acadêmicas: o **AWS Academy Learner Lab** e a **Azure for Students**. A primeira versão da infraestrutura suportava as duas, com a AWS como principal. Ao provisionar de verdade, as limitações de identidade e de recursos do Learner Lab pesaram mais que a familiaridade com a AWS. O código da AWS foi preservado na branch `feature/aws-terraform-config`.

**Decisão.** Usar **somente a Azure**, em uma assinatura Azure for Students de um membro do grupo, no tenant da FIAP. Toda a infraestrutura fica em um único root module (`infra/azure`), com os recursos dentro do cluster em `infra/modules/kubernetes-platform`.

**Motivo principal.** Na Azure o grupo controla as identidades e as permissões. No Learner Lab, a impossibilidade de criar IAM Roles e as credenciais temporárias impedem tanto componentes essenciais do cluster quanto o acesso compartilhado e o pipeline.

**Comparação por critério**

| Critério | AWS Academy Learner Lab | Azure for Students |
| --- | --- | --- |
| Criação de roles | Bloqueada (`iam:CreateRole`). Só existe a `LabRole`, ampla e compartilhada por control plane e nodes | Livre: Managed Identity do AKS e role assignments mínimos (`AcrPull`, `Network Contributor`) criados pelo Terraform |
| Identidade de workloads no cluster | Sem IRSA/Pod Identity: inviabiliza AWS Load Balancer Controller, Cluster Autoscaler, EBS CSI Driver e External Secrets | Managed Identity nativa; o autoscaler do AKS é uma opção do node pool, sem identidade extra |
| Credenciais | Temporárias (~4 h), renovadas manualmente a cada sessão do laboratório | Contas FIAP individuais, sem expiração por sessão |
| Acesso do grupo | Cada membro tem o próprio laboratório: não há conta, ambiente nem state compartilhados | Membros recebem roles na mesma assinatura (RBAC), com auditoria por pessoa (ADR-15) |
| Pipeline de CI/CD | Depende de access keys temporárias copiadas a cada sessão; sem OIDC | Service principal com credencial federada (OIDC), sem segredo no GitHub |
| Custo do control plane | EKS cobra US$ 0,10/h, inclusive com o laboratório encerrado | AKS tier Free não cobra pelo control plane |
| Custo estimado do ambiente | ~US$ 0,25/h (~US$ 6/dia) | ~US$ 0,13/h (~US$ 3/dia) |
| Limitações de recursos | Regiões `us-east-1`/`us-west-2`; serviços e tipos de instância limitados pelo laboratório | Regiões restritas por policy e quota baixa de vCPUs; resource providers registrados manualmente |

**Prós**
- Permissões mínimas por componente, em vez de uma role ampla compartilhada.
- Um único ambiente e um único state para todo o grupo e para o pipeline.
- Pipeline autenticado por OIDC, sem credenciais que expiram a cada sessão.
- Metade do custo por hora, o que estica os créditos.
- Menos código: uma stack, sem duplicar variáveis e outputs por cloud.

**Contras**
- Os créditos consumidos são do dono da assinatura, e a assinatura é desativada quando eles acabam.
- A policy de regiões e a quota de vCPUs limitam o tamanho e o local do cluster (validados pelo `setup-azure.sh`).
- O grupo depende de uma única assinatura. Trocar de assinatura exige um novo bootstrap do state (ver README, "Trocar a assinatura Azure").

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| AWS Academy Learner Lab | Sem criação de roles nem IRSA, credenciais temporárias e laboratórios individuais, como detalhado acima |
| Manter AWS e Azure em paralelo | Duas stacks para manter e testar sem ganho no projeto; o código da AWS fica disponível na branch `feature/aws-terraform-config` |
| Conta AWS real (fora do Learner Lab) | Exige cartão de crédito e gera cobrança real para um membro do grupo |

---

## ADR-02 — Orquestrador Kubernetes

**Contexto.** O enunciado exige deploy via manifestos Kubernetes com HPA. Os manifestos já existem e foram validados no Kubernetes do Docker Desktop.

**Decisão.** **AKS tier Free** com um node pool de 2× `Standard_B2als_v2` (2 vCPU / 4 GiB), Azure CNI Overlay e Managed Identity. A versão do Kubernetes é parametrizada.

**Motivo principal.** Kubernetes gerenciado elimina a operação do control plane (etcd, upgrades, alta disponibilidade), e o tier Free não cobra pelo control plane.

**Prós**
- Os manifestos de `k8s/` rodam sem alteração de semântica.
- Control plane gerenciado pelo provedor, sem custo no tier Free.
- O metrics-server, pré-requisito do HPA, já vem instalado.

**Contras**
- O tier Free não tem SLA de disponibilidade do control plane.
- O provisionamento do AKS leva cerca de 10 minutos.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| k3s/kubeadm em VMs | Exige operar o control plane, certificados e upgrades; não representa uma arquitetura de produção |
| Azure Container Apps | Abandonaria os manifestos Kubernetes, que são requisito do enunciado |
| AKS tier Standard | Cobra pelo control plane; o SLA não é necessário em staging |
| VMs menores nos nodes | Memória insuficiente para ingress, CoreDNS e várias réplicas da API (requests de 256 Mi cada) |

---

## ADR-03 — Banco de dados

**Contexto.** Os manifestos executam o PostgreSQL 16 dentro do cluster (Deployment + PVC). O enunciado pede "Terraform para Banco de Dados", e Postgres em Kubernetes não é requisito.

**Decisão.** PostgreSQL gerenciado: **Azure Database for PostgreSQL Flexible Server 16** (`B_Standard_B1ms`, 32 GiB, backup de 7 dias, acesso privado por VNet integration em subnet delegada). O PostgreSQL in-cluster continua disponível para o ambiente local.

**Motivo principal.** Estado persistente é o componente mais difícil de operar em Kubernetes: backup, restore, upgrade de versão, failover e IOPS do volume. Um serviço gerenciado resolve isso nativamente, e o Terraform passa a provisionar o banco como pede o enunciado.

**Prós**
- Backups automáticos, patching e criptografia em repouso gerenciados.
- O banco sobrevive à recriação do cluster, com ciclo de vida independente dos pods.
- Sem acesso público: alcançável somente a partir da rede do cluster.

**Contras**
- Custo fixo adicional, pequeno nas classes burstable.
- Exige TLS na conexão (ver ADR-08).
- Divergência entre o ambiente local (Postgres in-cluster) e a cloud (gerenciado), mitigada pelo uso da mesma versão major.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| PostgreSQL in-cluster com PVC em Azure Disk | Backup, restore e failover manuais |
| Alta disponibilidade (zone-redundant) | Indisponível no tier Burstable e dobra o custo do banco; desnecessário para staging |

---

## ADR-04 — Identidade dos workloads

**Contexto.** O AKS precisa criar Load Balancers e IPs na subnet da VNet e baixar imagens do ACR, sem credenciais armazenadas no cluster.

**Decisão.** **Managed Identity** (`SystemAssigned`) do AKS, criada pelo próprio serviço, com role assignments mínimos criados pelo Terraform:

| Identidade | Role | Escopo | Uso |
| --- | --- | --- | --- |
| Identidade do cluster | `Network Contributor` | Subnet `snet-aks` | Criar Load Balancer e IPs na subnet fornecida (BYO subnet) |
| Identidade do kubelet | `AcrPull` | ACR | Pull de imagens pelos nodes, sem `imagePullSecrets` |

O acesso de pessoas e do pipeline à assinatura está no ADR-15.

**Motivo principal.** Princípio do menor privilégio, sem segredo para rotacionar.

**Prós**
- Cada permissão tem escopo restrito ao recurso que a usa.
- Nenhuma credencial de longa duração no cluster ou no código.

**Contras**
- Criar role assignments exige `Owner` ou `Role Based Access Control Administrator` de quem executa o Terraform (ver ADR-15).
- A propagação de role assignments pode levar alguns minutos no primeiro apply.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Service principal com client secret para o cluster | Modelo legado do AKS; segredo com validade a renovar |
| Usuário admin do ACR + `imagePullSecrets` | Credencial compartilhada armazenada no cluster |

---

## ADR-05 — Topologia de rede

**Contexto.** O cluster precisa de saída para a internet e de acesso ao banco, que não pode ter endpoint público.

**Decisão.** VNet `10.20.0.0/16` com:
- subnet `snet-aks` para os nodes (os pods usam Azure CNI Overlay, fora do espaço da VNet);
- subnet `snet-postgres`, delegada ao Flexible Server, com Private DNS Zone vinculada à VNet;
- saída dos nodes pelo Load Balancer padrão do AKS, **sem NAT Gateway**.

**Motivo principal.** Custo e isolamento: o banco, único componente com dados, só é alcançável pela VNet.

**Prós**
- Sem o custo fixo de um NAT Gateway.
- Banco sem acesso público e com resolução DNS privada.
- O CNI Overlay economiza endereços da VNet.

**Contras**
- O IP de saída dos nodes é o do Load Balancer, compartilhado com a entrada.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| NAT Gateway | Custo fixo sem ganho em staging |
| Banco com endpoint público e firewall | Expõe o banco à internet |
| Azure CNI sem overlay | Consome um IP da VNet por pod |

---

## ADR-06 — Exposição HTTP

**Contexto.** `k8s/ingress.yaml` usa `ingressClassName: nginx`. O Ingress Controller precisa de um Load Balancer da cloud com endereço público. O projeto comunitário `kubernetes/ingress-nginx` teve a manutenção encerrada em março de 2026.

**Decisão.** **F5 NGINX Ingress Controller** (chart `nginx-ingress`, mantido pela F5/NGINX Inc.), instalado pelo Terraform via Helm com a classe `nginx` e um Service `LoadBalancer`, exposto por um Azure Standard Load Balancer com health probe TCP. Sem domínio próprio, o host do Ingress é `<ip>.nip.io`.

A versão do chart é fixada (`ingress_chart_version`, hoje `2.8.0`, controller 5.7.0) para que um ambiente recriado receba a mesma versão; a atualização é uma mudança explícita no código.

Não há domínio nem TLS: o acesso é feito pelo IP do Load Balancer.

**Motivo principal.** É um controller mantido e compatível com o manifesto existente sem alterações.

**Prós**
- `k8s/ingress.yaml` permanece inalterado.
- Recebe correções de segurança, diferente do ingress-nginx comunitário.

**Contras**
- As anotações específicas do ingress-nginx comunitário (`nginx.ingress.kubernetes.io/*`) não são compatíveis. Hoje não há nenhuma em uso.
- O Load Balancer é criado pelo Kubernetes, fora do state do Terraform, e exige remoção ordenada (tratada em `destroy.sh`).
- Sem HTTPS.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Application Gateway Ingress Controller (AGIC) | Custo fixo do Application Gateway, bem acima do Load Balancer padrão |
| ingress-nginx comunitário | Sem manutenção nem correções de segurança desde março de 2026 |
| Traefik / Gateway API | Exigiria alterar `ingressClassName` ou migrar `k8s/ingress.yaml` para `HTTPRoute`, mexendo nos manifestos em revisão |
| Service `LoadBalancer` direto na API, sem Ingress | Um Load Balancer por serviço e o manifesto de Ingress (já produzido) ficaria sem uso |
| Domínio + TLS (Azure DNS, cert-manager) | Custo de domínio e dependência de DNS; fora do escopo do enunciado |

---

## ADR-07 — Gestão de segredos

**Contexto.** `k8s/secret.yaml` e `k8s/admin-secret.yaml` contêm credenciais versionadas, aceitáveis apenas para demonstração local. A aplicação lê os segredos de variáveis de ambiente vindas de Secrets Kubernetes.

**Decisão.**
1. O Terraform gera os valores com `random_password`: senha do banco, `JWT_SECRET`, `TRACKING_TOKEN_SECRET`, `BUDGET_WEBHOOK_SECRET` e senha do primeiro administrador. São apenas alfanuméricos, para dispensar URL-encoding na `DATABASE_URL`.
2. Os valores são replicados no **Azure Key Vault**, que serve como fonte de consulta para pessoas e integrações. O acesso é controlado por Azure RBAC (ver ADR-15).
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
- Os valores ficam no **state do Terraform**. Mitigação: o state fica em Storage Account privado, criptografado e versionado.
- A rotação exige `terraform apply` e o restart dos pods; não há sincronização automática cofre → cluster.
- O deploy precisa ler o output sensível `bootstrap_admin_password`, o que exige acesso ao state do Terraform.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Secrets versionados (como em `k8s/secret.yaml`) | Exposição de credenciais no repositório |
| External Secrets Operator / Secrets Store CSI Driver | Adiciona um componente e uma identidade de workload sem ganho no cenário atual |
| Pipeline criando os Secrets a partir de GitHub Secrets | Espalha os valores entre GitHub e cloud e os expõe ao pipeline |
| Sealed Secrets / SOPS | Exige gestão de chaves de criptografia; sem ganho com o Terraform já gerando os valores |

---

## ADR-08 — TLS na conexão com o banco

**Contexto.** O Flexible Server exige TLS por padrão (`require_secure_transport = on`). A aplicação usa `@prisma/adapter-pg`, ou seja, o driver `pg`. A partir do `pg-connection-string` 2.x, `sslmode=require` passou a ser tratado como `verify-full`, que valida a cadeia de certificados. A cadeia de certificados do servidor não está completa no trust store do Node.js, então a conexão falharia com `self-signed certificate in certificate chain`.

**Decisão.** `DATABASE_URL` com `sslmode=require&uselibpqcompat=true`. Com `uselibpqcompat=true`, o driver segue a semântica do libpq: a conexão é **criptografada sem validar a CA**. O Prisma CLI, usado nas migrations, interpreta `sslmode=require` da mesma forma e ignora o parâmetro extra.

**Motivo principal.** Garante criptografia em trânsito sem alterar o Dockerfile nem o código da aplicação.

**Prós**
- Tráfego entre a aplicação e o banco criptografado.
- Nenhuma mudança na imagem ou no código.

**Contras**
- Sem validação da identidade do servidor: risco teórico de man-in-the-middle dentro da VNet, considerado baixo, porque o banco só é alcançável pela rede privada do cluster.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| `sslmode=verify-full` com o bundle de CA da Azure na imagem | Melhor postura; exige alterar o Dockerfile e distribuir o certificado. Recomendado como evolução |
| Desabilitar TLS (`require_secure_transport = off`) | Tráfego em texto puro |
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

**Decisão.** Registry privado **ACR Basic**, sem usuário admin, com dois repositórios: `garage-flow-api` e `garage-flow-api-migration`. A tag é o **SHA curto do commit**. O build força `linux/amd64`.

**Motivo principal.** Rastreabilidade: cada pod aponta para o commit exato que o originou. Também resolve a inconsistência de tags dos manifestos.

**Prós**
- Rollback simples, reaplicando uma tag anterior.
- Pull autenticado pela identidade do kubelet (`AcrPull`), sem `imagePullSecrets`.
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
- Storage Account `gftfstate<sufixo>` + container `tfstate`, versionado e privado, com lock por blob lease.
- O Storage Account é criado por uma stack `bootstrap/` com state local. Ela gera o `backend.hcl` consumido por `terraform init -backend-config=backend.hcl`, versionado para que o grupo compartilhe o mesmo state (ADR-15).

**Motivo principal.** Resolver o problema "ovo e galinha" (o state remoto precisa existir antes da stack que o usa) sem passos manuais no console.

**Prós**
- Lock contra applies concorrentes.
- Histórico de versões do state, que permite recuperação.
- Nenhum nome de Storage Account hardcoded no código da stack principal.

**Contras**
- O state da stack de bootstrap é local, mas só contém o Storage Account e é recriável.
- Uma etapa extra na primeira execução, automatizada em `provision.sh`.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| State local | Sem compartilhamento nem lock; segredos na máquina de quem executou |
| HCP Terraform (Terraform Cloud) | Conta e credenciais adicionais fora da Azure |

---

## ADR-12 — Capacidade e escalabilidade

**Contexto.** O HPA de `k8s/hpa.yaml` escala a API de 1 a 10 réplicas (CPU 60% / memória 70%). Cada réplica solicita 250m de CPU e 256 Mi de memória.

**Decisão.** Node pool de **tamanho fixo**: 2 nodes de 2 vCPU / 4 GiB. O HPA escala os pods dentro dessa capacidade, sem autoscaling de nodes.

**Motivo principal.** Os 2 nodes comportam as 10 réplicas máximas do HPA (2,5 vCPU / 2,5 GiB de requests) mais os componentes de sistema, dentro da quota de vCPUs da assinatura.

**Prós**
- Custo previsível.
- Demonstra o requisito do enunciado (escalabilidade por CPU/memória) sem estourar a quota de vCPUs.
- 2 nodes mantêm a API disponível durante a substituição de um node.

**Contras**
- Picos acima da capacidade deixam pods em `Pending`.
- Capacidade ociosa fora dos picos.

**Alternativas descartadas**

| Alternativa | Motivo do descarte |
| --- | --- |
| Cluster autoscaler nativo do AKS | Disponível, mas mantido desligado por custo previsível e pela quota de vCPUs. Habilitável com `auto_scaling_enabled` no node pool |
| Node único | Sem tolerância a falhas e capacidade insuficiente para o HPA máximo |

---

## ADR-13 — Ambientes e ciclo de vida

**Contexto.** O orçamento dos créditos não comporta múltiplos ambientes permanentes. Nodes, banco e Load Balancer consomem créditos enquanto existirem.

**Decisão.** Ambiente único **`staging`**, tratado como **efêmero**: provisionado para desenvolvimento ou demonstração e destruído em seguida (`destroy.sh`). O código é parametrizado por ambiente (`environments/<nome>.tfvars`, key de state por ambiente).

**Motivo principal.** Custo: aproximadamente US$ 3/dia se mantido ligado.

**Prós**
- Consumo de créditos proporcional ao uso.
- Recriar o ambiente com frequência valida continuamente o próprio IaC.

**Contras**
- Os dados do banco não sobrevivem ao destroy (os backups são removidos com o servidor).
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
- **Contrato de outputs** estável, documentado no README.

**Motivo principal.** Desacoplar o ciclo de vida da infraestrutura (raro, lento, caro) do ciclo de release da aplicação (frequente), e permitir que o pipeline seja construído em paralelo.

**Prós**
- O pipeline pode reutilizar os scripts diretamente ou reproduzir seus passos.
- A infraestrutura é testável de ponta a ponta sem pipeline.
- O "deploy do banco" do enunciado fica coberto em duas partes: provisionamento (Terraform) e schema (Job de migration).

**Contras**
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
4. **State compartilhado:** `infra/azure/backend.hcl` é versionado (contém apenas nomes), para que todos usem o mesmo state remoto.
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
| Identidade | `Role Based Access Control Administrator` sem condição | Role restrita por condição às roles usadas pela stack; Workload Identity para pods que acessem a Azure |
| Rede | Endpoint público do API server, saída pelo Load Balancer | Cluster privado ou IPs autorizados, NAT Gateway |
| Banco | Burstable, sem alta disponibilidade | General Purpose, zone-redundant HA, lock de exclusão no recurso |
| TLS do banco | Criptografado sem validação de CA | `sslmode=verify-full` com o bundle de CA na imagem |
| Exposição | HTTP por `<ip>.nip.io` | Domínio, TLS (cert-manager), WAF |
| Escalabilidade | Nodes fixos | Cluster autoscaler do AKS |
| Segredos | Sincronização via `terraform apply` | External Secrets Operator com rotação |
| Observabilidade | metrics-server | Logs e métricas centralizados (Azure Monitor / Container Insights) |
