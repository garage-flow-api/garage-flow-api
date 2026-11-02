# Garage Flow API

Backend de um sistema de gerenciamento para oficina mecânica, desenvolvido como um monólito utilizando **NestJS, TypeScript, PostgreSQL e Prisma**, conteinerizado com Docker e executado em produção com Kubernetes.

## Fase 1 do Tech Challenge

Na Fase 1, o desafio foi desenvolver a primeira versão (MVP) do backend de um sistema integrado para uma oficina mecânica. A solução teve como objetivo substituir processos manuais e planilhas, melhorando o controle dos atendimentos, do estoque e do histórico de clientes e veículos.

O escopo dessa etapa contemplou:

- cadastro e gerenciamento de clientes, veículos, serviços, peças e insumos;
- criação de ordens de serviço com cálculo de orçamento;
- aprovação do orçamento e acompanhamento dos diferentes status da OS;
- controle de estoque e monitoramento do tempo de execução dos serviços;
- autenticação JWT para as funcionalidades administrativas;
- validação de dados como CPF, CNPJ e placa do veículo;
- API REST documentada com Swagger;
- aplicação de DDD e arquitetura em camadas em um backend monolítico;
- execução da aplicação e do banco de dados com Docker e Docker Compose;
- testes automatizados dos principais fluxos da aplicação.

Essa primeira versão estabeleceu a base funcional e arquitetural que é evoluída na Fase 2.

## Fase 2 do Tech Challenge

Na Fase 2, a aplicação desenvolvida na etapa anterior passa a ser preparada para suportar o crescimento da oficina, a expansão para novas unidades e os picos de utilização. O objetivo é aumentar a qualidade, a resiliência e a escalabilidade da solução por meio de:

- evolução da organização do código e dos testes automatizados;
- conteinerização da aplicação com Docker;
- orquestração da API e do PostgreSQL com Kubernetes;
- escalabilidade automática conforme o consumo de CPU;
- provisionamento de infraestrutura como código com Terraform;
- automação do processo de build e deploy com CI/CD;
- validação do comportamento da aplicação sob carga.

Neste repositório, o ambiente de desenvolvimento é executado com Docker Compose, enquanto o ambiente de produção utiliza os manifestos Kubernetes, incluindo migrations e a criação segura do primeiro administrador.

## Tecnologias

- **NestJS + TypeScript**
- **PostgreSQL**
- **Prisma ORM**
- **Docker / Docker Compose**
- **Kubernetes**
- **Horizontal Pod Autoscaler (HPA)**
- **Terraform** (infraestrutura como código)
- **GitHub Actions** (pipeline de CI/CD)
- **Trivy** (scan de vulnerabilidades da imagem)
- **k6**
- **Swagger**
- **class-validator**
- **Jest + Supertest**
- **ESLint + Prettier**
- **Husky**
- **SonarQube** (análise estática de código, apenas em desenvolvimento)

## Desenho da arquitetura

Os diagramas abaixo mostram os componentes da API, a infraestrutura na Azure e o fluxo de deploy.

### Componentes da aplicação

Monólito NestJS dividido em contextos de negócio (`auth`, `client`, `vehicle`, `service`, `inventory`, `service-orders` e `notification`), organizados nas camadas presentation, application, domain e infrastructure. Os casos de uso dependem de interfaces (repositórios e `NotificationGateway`), implementadas na camada de infraestrutura com Prisma e SMTP.

Quando o status de uma OS muda, o cliente recebe um e-mail com o link de acompanhamento. No orçamento, o e-mail traz também os links para aprovar ou recusar. Em desenvolvimento, os e-mails ficam no Mailpit.

```mermaid
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    staff(["Equipe da oficina"])
    customer(["Cliente"])
    external(["Sistema de aprovação<br/>de orçamento"])

    subgraph api["API NestJS"]
        direction LR
        subgraph common["Transversal"]
            filter["Filtro global<br/>de exceções"]
            monitoring["/health e /ready"]
        end
        subgraph presentation["Presentation"]
            guards["Guards<br/>JWT, papéis e HMAC"]
            ctrl["Controllers e DTOs"]
        end
        subgraph application["Application"]
            uc["Casos de uso"]
            gateway["NotificationGateway"]
        end
        subgraph domain["Domain"]
            model["Entidades e<br/>value objects"]
            ports["Interfaces dos<br/>repositórios"]
        end
        subgraph infrastructure["Infrastructure"]
            repos["Repositórios Prisma"]
            smtp["Adapter SMTP<br/>(Nodemailer)"]
        end
    end

    db[("PostgreSQL 16")]
    mail["Servidor SMTP<br/>(Mailpit em desenvolvimento)"]

    staff -- "HTTP com JWT" --> guards
    external -- "webhook assinado" --> guards
    customer -- "links do e-mail,<br/>sem login" --> ctrl
    guards --> ctrl
    ctrl --> uc
    uc --> model
    uc --> ports
    uc -- "mudança de status" --> gateway
    ports -. "implementada por" .-> repos
    gateway -. "implementada por" .-> smtp
    repos --> db
    smtp -- "e-mail ao cliente" --> mail
    uc -. "erro de domínio" .-> filter
```

### Infraestrutura provisionada

Criada pelo Terraform em [`infra/azure`](infra/README.md), no ambiente `staging` (região `northcentralus`, AKS com 2 nodes `Standard_B2als_v2`). O banco não tem endpoint público e só é acessível de dentro da VNet do cluster. Os segredos são gerados pelo Terraform e guardados no Key Vault.

O servidor SMTP fica fora da Azure e não é criado pelo Terraform. A API usa o servidor configurado nas variáveis `SMTP_*`.

```mermaid
%%{init: {'theme': 'neutral'}}%%
flowchart TB
    user(["Cliente HTTP"])
    gha(["GitHub Actions<br/>login OIDC"])
    mail(["Servidor SMTP externo"])

    subgraph azure["Azure, ambiente staging"]
        direction TB
        acr[("ACR<br/>imagens da API e dos Jobs")]
        kv[("Key Vault")]

        subgraph vnet["VNet"]
            lb["Load Balancer<br/>IP público, host IP.nip.io"]
            subgraph aks["AKS"]
                ingress["NGINX Ingress Controller"]
                api["Pods da API<br/>HPA de 1 a 5 réplicas"]
                jobs["Jobs de migration<br/>e do primeiro admin"]
                config["Secret e ConfigMap"]
                alias["Service ExternalName<br/>garage-flow-postgres"]
            end
            subgraph snetpg["Subnet privada"]
                pg[("PostgreSQL<br/>Flexible Server 16")]
            end
        end
    end

    user -- "HTTP" --> lb
    lb --> ingress
    ingress --> api
    api --> alias
    jobs --> alias
    alias -. "DNS privado, TLS" .-> pg
    config -.-> api
    config -.-> jobs
    aks -. "AcrPull" .-> acr
    gha -- "push das imagens" --> acr
    gha -- "kubectl apply" --> aks
    kv -. "mesmos segredos" .- config
    api -- "SMTP" --> mail
```

O ambiente local (Docker Desktop, com o PostgreSQL dentro do cluster) está descrito em [Ambiente de produção — Kubernetes](#ambiente-de-produção--kubernetes).

### Fluxo de deploy

Cada push na `main` passa pelos testes, gera as imagens, aplica as migrations e atualiza a API no AKS. A infraestrutura é criada e destruída só manualmente. O desenho com os jobs e os gatilhos está em [Pipeline de CI/CD](#pipeline-de-cicd).

## Arquitetura

O projeto utiliza **Domain-Driven Design (DDD)** combinado com **arquitetura em camadas**, dentro de um monólito. Todos os contextos de negócio ficam agrupados em `src/modules/`.

```text
garage-flow-api/
├── src/
│   ├── common/                  # Recursos compartilhados
│   │   ├── decorators/
│   │   ├── dtos/
│   │   ├── entities/
│   │   ├── errors/
│   │   ├── filters/
│   │   └── pipes/
│   ├── infra/                   # Infraestrutura global da aplicação
│   │   ├── database/prisma/
│   │   └── monitoring/
│   ├── modules/                 # Contextos de negócio
│   │   ├── auth/
│   │   ├── client/
│   │   ├── inventory/
│   │   ├── notification/
│   │   ├── service/
│   │   ├── service-orders/
│   │   └── vehicle/
│   ├── shared/
│   ├── app.module.ts
│   └── main.ts
├── prisma/                      # Schema, migrations, seed e bootstrap do admin
├── test/                        # Testes unitários e de integração
├── docs/                        # OpenAPI e collection do Postman
├── scripts/                     # Geração do OpenAPI e da collection
├── k8s/                         # Manifestos Kubernetes
├── k6/                          # Teste de carga
├── Dockerfile
├── docker-compose.development.yaml
└── package.json
```

### Bounded Contexts

- **Auth:** autenticação, usuários, credenciais e papéis de acesso (JWT).
- **Client:** cadastro e gerenciamento dos clientes da oficina.
- **Vehicle:** veículos associados aos clientes.
- **Service:** serviços padronizados da oficina, como troca de óleo, alinhamento etc., com preço/tabela de mão de obra.
- **Inventory:** peças e insumos utilizados nas ordens de serviço, com controle de estoque físico e lógico. O estoque lógico desconta do físico tudo que já está comprometido com ordens de serviço em aberto, evitando que a mesma peça seja reservada duas vezes. Peças com estoque lógico abaixo do mínimo configurado são sinalizadas automaticamente.
- **Service Orders:** ciclo de vida da ordem de serviço, incluindo recebimento, diagnóstico, adição de serviços/peças, orçamento, aprovação, execução, finalização e entrega. Ao finalizar uma OS, as peças utilizadas são baixadas definitivamente do estoque. Cada OS gera um link público de rastreamento, que permite ao cliente consultar o status sem autenticação.
- **Notification:** envio de e-mails ao cliente por meio de uma porta (`NotificationGateway`) com adaptador SMTP (Nodemailer). Avisa as mudanças de status da OS e envia o orçamento com links para aprovar ou recusar. Em desenvolvimento, os e-mails são capturados pelo Mailpit.

Além dos contextos de negócio, `common` contém elementos compartilhados pela aplicação (guards, filtros de exceção, pipes, decorators e erros de domínio) e `infra` contém recursos de infraestrutura que não pertencem a um contexto específico (conexão com o banco, health check).

## Ambientes de execução

| Ambiente        | Forma de execução | Configuração                               |
| --------------- | ----------------- | ------------------------------------------ |
| Desenvolvimento | Docker Compose    | `docker-compose.development.yaml` e `.env` |
| Produção        | Kubernetes        | Manifestos da pasta `k8s/`                 |

Não existe um Docker Compose de produção. O estágio `production` do `Dockerfile` gera a imagem enxuta utilizada pelo Deployment da API no Kubernetes.

## Ambiente de desenvolvimento

### Pré-requisitos

- Docker
- Node.js 24
- npm

### 1. Configuração

Crie o arquivo `.env` a partir do `.env.example` e utilize `NODE_ENV=development`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/garage-flow?schema=public

# Autenticação (JWT)
JWT_SECRET=troque-por-um-segredo-forte
JWT_EXPIRES_IN=1d

# Assinatura dos links públicos
TRACKING_TOKEN_SECRET=troque-por-outro-segredo-forte

# Webhook de decisão do orçamento: chave do HMAC que assina o corpo da requisição
BUDGET_WEBHOOK_SECRET=troque-por-um-segredo-do-webhook

# URL pública da API, usada nos links enviados por e-mail (acompanhamento e orçamento)
PUBLIC_BASE_URL=http://localhost:3000

# E-mail (SMTP). Em desenvolvimento, o Mailpit recebe tudo, sem enviar de verdade
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Garage Flow <no-reply@garageflow.local>"
```

> No Docker Compose, a API usa `SMTP_HOST=mailpit` (nome do serviço), definido no próprio `docker-compose.development.yaml`. `PUBLIC_BASE_URL` deve apontar para o endereço pelo qual o cliente alcança a API, pois é dele que saem os links dos e-mails.

O arquivo `.env` é utilizado pelo Docker Compose e pelos comandos executados localmente. No ambiente de produção, as configurações são fornecidas pelos recursos `ConfigMap` e `Secret` do Kubernetes.

As variáveis lidas pela API são:

| Variável | Origem no Kubernetes | Uso |
| --- | --- | --- |
| `NODE_ENV`, `PORT` | `garage-flow-config` | Ambiente e porta HTTP (padrão `3000`) |
| `DATABASE_URL` | `garage-flow-secrets` | Conexão do Prisma com o PostgreSQL |
| `JWT_SECRET` | `garage-flow-secrets` | Assinatura dos tokens de autenticação |
| `JWT_EXPIRES_IN` | `garage-flow-config` | Validade do JWT (padrão da aplicação: `1h`) |
| `TRACKING_TOKEN_SECRET` | `garage-flow-secrets` | Assinatura dos links públicos de acompanhamento e decisão |
| `BUDGET_WEBHOOK_SECRET` | `garage-flow-secrets` | HMAC-SHA256 do webhook de decisão do orçamento |
| `PUBLIC_BASE_URL` | `garage-flow-config` | Base dos links enviados por e-mail; no deploy cloud recebe o host do Ingress |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` | `garage-flow-config` | Endereço e remetente do servidor de e-mail |
| `SMTP_USER`, `SMTP_PASS` | `garage-flow-secrets` | Autenticação SMTP; podem ficar vazias para um servidor sem autenticação |

`ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` não são variáveis do processo normal da API: são consumidas somente pelo Job temporário de bootstrap do primeiro administrador.

### 2. Subir a aplicação

```bash
docker compose -f docker-compose.development.yaml up --build
```

O `docker-compose.development.yaml` utiliza o estágio `development` do `Dockerfile`, instala as dependências de desenvolvimento e monta o código como volume para permitir **hot reload** com `start:debug`.

O Docker Compose inicia:

- PostgreSQL (dados da aplicação);
- PostgreSQL do SonarQube (`sonar-db`) e o próprio SonarQube (análise de código);
- API NestJS;
- Mailpit (servidor SMTP de testes, captura os e-mails enviados pela API);
- aplicação das migrations e do seed do Prisma.

A API aguarda o PostgreSQL ficar saudável, gera o Prisma Client, executa as migrations e popula o banco com os dados de demonstração antes de iniciar. Os usuários criados pelo seed usam a senha padrão `Password123!`.

### 3. Acessos

- **API:** `http://localhost:3000`
- **Swagger:** `http://localhost:3000/docs` (JSON OpenAPI em `http://localhost:3000/docs-json`)
- **SonarQube:** `http://localhost:9000` (usuário/senha padrão `admin`/`admin` no primeiro acesso) - disponível apenas ao subir com `docker-compose.development.yaml`.
- **Mailpit (caixa de entrada de teste):** `http://localhost:8025`. Todos os e-mails enviados pela API em desenvolvimento aparecem aqui.

### Prisma Studio

Com o PostgreSQL em execução e estando em ambiente de DESENVOLVIMENTO, o Prisma Studio pode ser aberto localmente:

```bash
npx prisma studio
```

Acesse:

`http://localhost:5555`

O Prisma Studio é utilizado para visualizar e manipular os dados do banco durante o desenvolvimento.

## Ambiente de produção — Kubernetes

O ambiente de produção é executado com Kubernetes. Para a avaliação local, os manifestos da pasta `k8s/` permitem implantar a API e o PostgreSQL no cluster do Docker Desktop, incluindo configuração, persistência, migrations, criação do primeiro administrador, monitoramento e escalabilidade automática.

### Arquitetura do ambiente Kubernetes

```text
                         Cliente
                            |
                            v
                    Ingress Controller
                            |
                            v
                  garage-flow-ingress
                            |
                            v
                  garage-flow-service
                      (ClusterIP)
                            |
                            v
                garage-flow-deployment
                     Pods da API
                            |
                            v
                 garage-flow-postgres
                      (ClusterIP)
                            |
                            v
                PostgreSQL Deployment
                            |
                            v
                           PVC


Migration Job -----------------> PostgreSQL
Bootstrap Admin Job -----------> PostgreSQL

Metrics Server
      |
      v
     HPA
      |
      v
garage-flow-deployment
```

### Recursos provisionados

| Manifesto                      | Recurso criado                                              |
| ------------------------------ | ----------------------------------------------------------- |
| `k8s/configmap.yaml`           | Variáveis não sensíveis da API                              |
| `k8s/secret.yaml`              | Credenciais do banco e segredos da aplicação                |
| `k8s/postgres-pvc.yaml`        | Volume persistente de 1 GiB para o PostgreSQL               |
| `k8s/postgres-deployment.yaml` | Deployment do PostgreSQL 16                                 |
| `k8s/postgres-service.yaml`    | Service interno do PostgreSQL                               |
| `k8s/migration-job.yaml`       | Job responsável por executar `prisma migrate deploy`        |
| `k8s/admin-secret.yaml`        | Credenciais temporárias do primeiro administrador           |
| `k8s/bootstrap-admin-job.yaml` | Job que cria o primeiro usuário `ADMIN`                     |
| `k8s/deployment.yaml`          | Deployment da API com recursos, liveness e readiness probes |
| `k8s/service.yaml`             | Service interno da API                                      |
| `k8s/hpa.yaml`                 | Escalabilidade automática por CPU                 |
| `k8s/ingress.yaml`             | Roteamento HTTP por meio de NGINX Ingress                   |

> Os valores presentes em `k8s/secret.yaml` e `k8s/admin-secret.yaml` são destinados somente ao ambiente local de demonstração. Em uma produção real, utilize um gerenciador de segredos da cloud e não versione credenciais reais no repositório.

### Pré-requisitos

- Docker Desktop com Kubernetes habilitado;
- `kubectl` configurado para o cluster `docker-desktop`;
- Metrics Server para coletar as métricas utilizadas pelo HPA;
- NGINX Ingress Controller caso o manifesto de Ingress seja utilizado;
- k6 instalado para executar o teste de carga.

### 1. Selecionar o cluster

No Docker Desktop, habilite o Kubernetes e aguarde o cluster ficar disponível. Em seguida:

```bash
kubectl config get-contexts
kubectl config use-context <contexto-do-cluster>
kubectl cluster-info
kubectl get nodes
```

O nó deve aparecer com o status `Ready`.

### 2. Buildar as imagens locais

O Deployment da API utiliza a imagem `garage-flow-api:local`:

```bash
docker build \
  --target production \
  -t garage-flow-api:local \
  .
```

Os Jobs de migration e bootstrap do administrador utilizam uma imagem baseada no estágio `build`, que contém a CLI do Prisma e as ferramentas necessárias para executar os scripts:

```bash
docker build \
  --target build \
  -t garage-flow-api-migration:local \
  .
```

Confirme que as imagens foram criadas:

```bash
docker image inspect garage-flow-api:local
docker image inspect garage-flow-api-migration:local
```

Os manifestos utilizam `imagePullPolicy: IfNotPresent`, permitindo que o cluster use as imagens disponíveis localmente no Docker Desktop.

### 3. Aplicar configurações e banco de dados

```bash
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/postgres-service.yaml
kubectl apply -f k8s/postgres-deployment.yaml
```

Aguarde o PostgreSQL ficar disponível:

```bash
kubectl rollout status \
  deployment/garage-flow-postgres \
  --timeout=180s
```

### 4. Executar as migrations

```bash
kubectl delete job garage-flow-migration --ignore-not-found
kubectl apply -f k8s/migration-job.yaml

kubectl wait \
  --for=condition=complete \
  job/garage-flow-migration \
  --timeout=180s

kubectl logs job/garage-flow-migration
```

Antes de executar o Prisma, o Job utiliza um init container para aguardar o PostgreSQL aceitar conexões.

### 5. Criar o primeiro administrador

Antes de aplicar o Secret, altere os valores de `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` em `k8s/admin-secret.yaml`. A senha deve ter entre 8 e 128 caracteres e conter pelo menos uma letra e um número.

Em seguida, execute o bootstrap:

```bash
kubectl apply -f k8s/admin-secret.yaml
kubectl delete job garage-flow-bootstrap-admin --ignore-not-found
kubectl apply -f k8s/bootstrap-admin-job.yaml

kubectl wait \
  --for=condition=complete \
  job/garage-flow-bootstrap-admin \
  --timeout=180s

kubectl logs job/garage-flow-bootstrap-admin
```

O Job executa `npm run db:bootstrap-admin` e cria somente um usuário com a role `ADMIN`. Ele é idempotente: se já existir um administrador ativo, encerra sem criar outro usuário e sem alterar a senha existente.

Depois da conclusão, remova do cluster o Secret usado no bootstrap:

```bash
kubectl delete secret garage-flow-bootstrap-admin
```

O seed de demonstração não é executado no Kubernetes.

### 6. Subir a API

```bash
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml

kubectl rollout status \
  deployment/garage-flow-deployment \
  --timeout=180s
```

Verifique os recursos e os logs:

```bash
kubectl get pods,services,pvc
kubectl logs -f deployment/garage-flow-deployment
```

### 7. Aplicar o Ingress

Com o NGINX Ingress Controller instalado:

```bash
kubectl apply -f k8s/ingress.yaml
kubectl get ingress
```

### 8. Acessar a API

Como o Service da API é do tipo `ClusterIP`, utilize port-forward para o acesso local:

```bash
kubectl port-forward \
  service/garage-flow-service \
  3000:80
```

Acessos:

- **API:** `http://localhost:3000`
- **Swagger:** `http://localhost:3000/docs`
- **Liveness:** `http://localhost:3000/health`
- **Readiness:** `http://localhost:3000/ready`

### 9. Aplicar o HPA

O HPA mantém entre 1 e 5 réplicas da API. Uma nova réplica pode ser criada quando a utilização média alcançar `60%` de CPU.

Quando a demanda diminui, o HPA aguarda uma janela de estabilização de 60 segundos e reduz, no máximo, 50% das réplicas a cada 30 segundos.

Com o Metrics Server disponível:

```bash
kubectl apply -f k8s/hpa.yaml
kubectl get hpa
kubectl top pods
```

Se as métricas aparecerem como `<unknown>`, verifique se o Metrics Server está instalado e funcionando no cluster.

### 10. Executar o teste de carga com k6

O arquivo `k6/load-test.js` aumenta gradualmente a carga para 50 e depois 500 usuários virtuais, antes de reduzi-la a zero, enviando requisições para o endpoint `GET /health`. Por padrão, o teste utiliza a URL `http://localhost:3000`, disponibilizada pelo port-forward da etapa 8.

O teste falha se a taxa de requisições com erro atingir 1% ou se 95% das requisições não forem concluídas em menos de 500 ms.

No terminal, acompanhe o HPA e os Pods:

```bash
kubectl get hpa -w
```

Execute o teste:

```bash
k6 run k6/load-test.js
```

Para executar contra outro endereço, informe a variável de ambiente `BASE_URL`:

```bash
BASE_URL=http://localhost:3000 k6 run k6/load-test.js
```

Ao final, o k6 apresenta métricas como quantidade de requisições, latência, throughput e taxa de falhas. Durante a execução, o HPA pode ser acompanhado para verificar o aumento e a redução do número de réplicas da API.

### 11. Remover o ambiente

```bash
kubectl delete -f k8s/ --ignore-not-found
```

Esse comando também remove o PVC e, consequentemente, os dados locais armazenados pelo PostgreSQL.

## Infraestrutura em cloud — Terraform

O provisionamento em cloud fica em [`infra/`](infra/README.md): AKS + PostgreSQL Flexible Server na Azure (Azure for Students). Os manifestos desta pasta `k8s/` são reaproveitados via Kustomize.

- Guia de provisionamento, deploy e remoção: [infra/README.md](infra/README.md)
- Decisões de arquitetura e trade-offs: [infra/docs/decisoes-de-infraestrutura.md](infra/docs/decisoes-de-infraestrutura.md)

```bash
infra/scripts/setup-azure.sh   # login, assinatura, providers e região (primeira vez)
infra/scripts/provision.sh     # rede, cluster, banco, registry e segredos
infra/scripts/deploy-app.sh    # imagens, migrations, primeiro admin e API
infra/scripts/destroy.sh       # remove tudo ao final da sessão
```

## Pipeline de CI/CD

A pipeline usa GitHub Actions e a stack **Azure** de `infra/`, em dois workflows: [`ci-cd.yml`](.github/workflows/ci-cd.yml) (CI e deploy) e [`infra.yml`](.github/workflows/infra.yml) (criar e destruir a infra, só manualmente). Ela cobre build da aplicação, testes automatizados, build da imagem Docker, deploy do banco (Terraform + Job de migration), deploy no cluster e aplicação dos manifestos. É a versão automatizada de `infra/scripts/provision.sh`, `deploy-app.sh` e `destroy.sh`.

### Fluxo

```mermaid
%%{init: {'theme': 'neutral'}}%%
flowchart LR
    subgraph sgManual["Workflow infra, manual"]
        direction LR
        RUNINFRA(["Run workflow"]) -- "provision + sim" --> PROV["provision<br/>terraform apply"]
        RUNINFRA -- "destroy + destruir" --> DEST["destroy<br/>terraform destroy"]
    end

    subgraph sgMain["Workflow ci-cd na main"]
        direction LR
        PUSH(["Push na main"]) --> CI2["ci<br/>lint, build e testes"]
        PUSH --> VAL2["validate-infra<br/>Terraform e Kustomize"]
        CI2 --> IMG2["image<br/>build, Trivy e push no ACR"]
        IMG2 -- "infra no ar" --> DEP["deploy<br/>migration, admin, manifestos<br/>e health check"]
        VAL2 --> DEP
        IMG2 -. "infra destruída" .-> SKIP["deploy pulado"]
    end

    subgraph sgPr["Workflow ci-cd em PR"]
        direction LR
        PR(["Pull request"]) --> CI1["ci<br/>lint, build e testes"]
        PR --> VAL1["validate-infra<br/>Terraform e Kustomize"]
        CI1 --> IMG1["image<br/>build e Trivy"]
    end
```

### Jobs

| Job | Quando roda | O que faz |
| --- | --- | --- |
| `ci` | PR, push na `main` e "Run workflow" do `ci-cd` | `npm ci`, Prisma generate, lint, Prettier, build e testes com cobertura (artefato `coverage`) |
| `validate-infra` | PR, push na `main` e "Run workflow" do `ci-cd`, em paralelo ao `ci` | `terraform fmt` e `validate` em `infra/azure` (sem acessar a Azure) e `kubectl kustomize` na base `k8s/` e nos overlays. Se falhar, o deploy não roda |
| `image` | Depois do `ci` | Builda a imagem da API e a dos Jobs e roda o Trivy (`CRITICAL`/`HIGH`) nas duas: bloqueante na da API e informativo na dos Jobs. Na `main` (push ou disparo manual), publica as duas no ACR, com o SHA curto do commit como tag |
| `deploy` | Depois do `image` e do `validate-infra`, só na `main` e se as imagens foram publicadas | Jobs de migration e de criação do primeiro admin, overlay `cloud` (API, Service, Ingress, HPA), rollout e checagem de `/health` e `/ready`. As URLs aparecem no resumo da execução |
| `provision` | Só pelo "Run workflow" do `infra` | `terraform plan` + `apply` em `infra/azure`: AKS, ACR, PostgreSQL, Key Vault e Ingress (~15-20 min) |
| `destroy` | Só pelo "Run workflow" do `infra` | Remove a aplicação do cluster, o Ingress e o restante da infra com `terraform destroy` (~10-15 min) |

Nada cria ou destrói infraestrutura automaticamente. Em push na `main`, a pipeline só **lê** o state do Terraform: se a infra não existir, as imagens não são publicadas e o deploy é pulado, sem falhar. As mesmas verificações do Husky (Prettier, ESLint e testes) são repetidas no job `ci`.

### Provisionar, fazer deploy e destruir

Em **Actions → Run workflow**, na branch `main`:

1. **Provision:** workflow `infra`, `action` = `provision` e `confirmacao` = `sim`. Aguarde terminar.
2. **Deploy:** faça um push na `main` ou rode o workflow `ci-cd`. Ao final, o resumo da execução mostra as URLs da API, do Swagger e do health check (`http://<ip>.nip.io`).
3. **Destroy:** workflow `infra`, `action` = `destroy` e `confirmacao` = `destruir`.

Fora da `main` ou sem a confirmação exata, o job falha antes de qualquer acesso à Azure. A senha do primeiro administrador fica no Key Vault; o comando para lê-la aparece no resumo do deploy.

### Credenciais

- Login na Azure por **OIDC** (credencial federada do service principal `sp-garage-flow-github-actions`, aceita só para a `main`). O login na Azure não utiliza client secret. Os únicos GitHub Secrets são `SMTP_USER` e `SMTP_PASS`.
- Três **repository variables** (Settings → Secrets and variables → Actions → Variables): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`. Não são valores sensíveis.
- Os segredos gerados da aplicação (senha do banco, `JWT_SECRET`, `TRACKING_TOKEN_SECRET`, `BUDGET_WEBHOOK_SECRET` e senha do admin) ficam no Key Vault; os segredos usados pela API viram o Secret `garage-flow-secrets` no cluster. `SMTP_USER` e `SMTP_PASS`, quando necessários, são recebidos por `TF_VAR_smtp_user` e `TF_VAR_smtp_pass`, nunca por um `.tfvars` versionado. As credenciais do primeiro admin só existem no cluster durante o Job de bootstrap: o deploy cria o Secret a partir dos outputs do Terraform, com a senha mascarada no log, e o apaga em seguida.

### Avisos

- **Rode sempre o `destroy` ao terminar.** O AKS e o banco consomem crédito enquanto estiverem no ar.
- **Não faça push na `main` enquanto `provision` ou `destroy` estiver rodando.** O deploy desse push falharia (sem custo, mas vermelho).
- **O Trivy bloqueia a publicação:** com vulnerabilidade `CRITICAL` ou `HIGH` corrigível na imagem da API, nada vai para o ACR e não há deploy. Na imagem dos Jobs o scan só reporta, porque ela leva as dependências de desenvolvimento.
- Em pushes seguidos, só o commit mais recente da `main` é implantado; execuções de commits anteriores pulam o deploy.

Tempo da pipeline com deploy: cerca de **8 minutos** de ponta a ponta (`ci` cerca de 1,5 min, `image` cerca de 4 min e `deploy` cerca de 2,5 min, com o `validate-infra` em paralelo), medido na primeira execução real.

## Como usar e testar a API

### 1. Login

#### Produção com Kubernetes

O Kubernetes não executa o seed de demonstração. O Job `garage-flow-migration` aplica as migrations, e o Job `garage-flow-bootstrap-admin` cria somente o primeiro administrador. No ambiente Kubernetes local, as credenciais são configuradas em `k8s/admin-secret.yaml`. Na Azure, elas são geradas pelo Terraform e armazenadas no Key Vault; durante o deploy, um Secret temporário é criado no cluster apenas para executar o Job e removido em seguida.

Depois de executar o bootstrap, autentique esse administrador por meio de `POST /auth/login`. Com o token recebido, ele poderá cadastrar os demais usuários pela rota protegida `POST /auth/users`.

#### Desenvolvimento com Docker Compose

Ao iniciar o ambiente com `docker-compose.development.yaml`, o seed é executado automaticamente e popula o banco com clientes, veículos, serviços, peças e ordens de serviço em diferentes estágios do fluxo. As credenciais apresentadas abaixo existem somente nesse ambiente de desenvolvimento.

Para autenticar durante o desenvolvimento, use `POST /auth/login` com um dos usuários abaixo (senha padrão `Password123!` para todos):

| E-mail                 | Role            |
| ---------------------- | --------------- |
| `admin@example.com`    | ADMIN           |
| `advisor@example.com`  | SERVICE_ADVISOR |
| `mechanic@example.com` | MECHANIC        |
| `stock@example.com`    | STOCK_CLERK     |

Exemplo de login:

```bash
POST /auth/login
{ "email": "mechanic@example.com", "password": "Password123!" }
```

A resposta traz um `access_token` (JWT), que deve ser enviado no header `Authorization: Bearer <token>` nas chamadas seguintes (ou colado no botão **Authorize** do Swagger).

#### O que cada role pode fazer

| Role                | Pode fazer                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **ADMIN**           | Acesso completo: CRUD de clientes, veículos e peças; todas as ações sobre ordens de serviço             |
| **SERVICE_ADVISOR** | Cadastrar/editar clientes e veículos; abrir OS, gerar e aprovar orçamento, cancelar e confirmar entrega |
| **MECHANIC**        | Iniciar diagnóstico, adicionar serviços/peças à OS, iniciar e finalizar a execução do serviço           |
| **STOCK_CLERK**     | Cadastrar, reabastecer e dar baixa manual em peças; consultar peças com estoque abaixo do mínimo        |

> Consultas de leitura (`GET`) na maioria dos recursos estão disponíveis para qualquer usuário autenticado, independente da role. Entre as exceções, `GET /inventory/low-stock` exige a role `ADMIN` ou `STOCK_CLERK`. As rotas que não usam JWT são `POST /auth/login`, `GET /service-orders/track/:token`, `GET|POST /budget-decisions/:token`, `POST /webhooks/budget-decision`, `GET /health` e `GET /ready`. Os links de acompanhamento e decisão são protegidos por tokens assinados, e o webhook exige uma assinatura HMAC válida.

### 2. Clientes

- `POST /clients` (`ADMIN`, `SERVICE_ADVISOR`): cadastra um cliente com CPF/CNPJ, nome e dados de contato.
- `GET /clients` e `GET /clients/:id`: listam e consultam clientes.
- `PATCH /clients/:id` (`ADMIN`, `SERVICE_ADVISOR`): atualiza os dados de contato; o CPF/CNPJ não é alterado.
- `DELETE /clients/:id` (`ADMIN`): remove o cliente por soft delete.

### 3. Veículos

- `POST /vehicles` (`ADMIN`, `SERVICE_ADVISOR`): cadastra marca, modelo, placa, ano e associa o veículo a um cliente pelo `clientId`.
- `GET /vehicles` e `GET /vehicles/:id`: listam e consultam veículos.
- `PATCH /vehicles/:id` (`ADMIN`, `SERVICE_ADVISOR`): atualiza marca, modelo ou ano.
- `DELETE /vehicles/:id` (`ADMIN`): remove o veículo por soft delete.

### 4. Catálogo de serviços

- `POST /services` (`ADMIN`): cadastra um serviço e seu preço.
- `GET /services` e `GET /services/:id`: listam e consultam o catálogo usado no diagnóstico da OS.
- `PATCH /services/:id` e `DELETE /services/:id` (`ADMIN`): atualizam ou removem um serviço.

### 5. Estoque

- `POST /inventory` (`ADMIN`, `STOCK_CLERK`): cadastra uma peça com nome, unidade (`ML`, `G`, `KG` ou `UNIT`), preço, quantidade física e estoque mínimo.
- `GET /inventory`: lista as peças e suas quantidades físicas.
- `PATCH /inventory/:id` (`ADMIN`, `STOCK_CLERK`): atualiza nome, preço e estoque mínimo.
- `PATCH /inventory/:id/restock` (`ADMIN`, `STOCK_CLERK`): adiciona quantidade ao estoque físico.
- `PATCH /inventory/:id/consume` (`ADMIN`, `STOCK_CLERK`): realiza uma baixa manual. A baixa das peças usadas em uma OS ocorre automaticamente ao finalizar o serviço.
- `DELETE /inventory/:id` (`ADMIN`): remove a peça por soft delete.

`GET /inventory/low-stock` (`ADMIN`, `STOCK_CLERK`) lista as peças cujo estoque lógico está abaixo do mínimo configurado. O cálculo considera:

```text
estoque lógico = quantidade física - quantidade reservada em OS abertas
```

São consideradas abertas as OS entre `RECEIVED` e `IN_EXECUTION`. Ordens `FINISHED`, `DELIVERED` ou `CANCELED` não permanecem como reserva. A resposta informa `physicalQuantity`, `reservedQuantity`, `availableQuantity` e `minQuantity`. Por exemplo, uma peça com 10 unidades físicas, 7 reservadas e mínimo 5 aparece no resultado porque possui apenas 3 unidades disponíveis.

### 6. Ciclo de vida da OS

Esta seção descreve, passo a passo, como percorrer o ciclo de vida completo de uma Ordem de Serviço via API. Cada passo indica qual role pode executá-lo - autentique-se com o usuário correspondente antes de cada chamada.

#### 6.1 Abertura da OS (`SERVICE_ADVISOR` ou `ADMIN`)

```bash
POST /service-orders
{
  "client": {
    "cpfCnpj": "529.982.247-25",
    "name": "João da Silva",
    "phone": "11999998888",
    "address": "Rua das Flores, 123 - São Paulo/SP",
    "email": "joao@example.com"
  },
  "vehicle": { "licensePlate": "ABC1D23", "brand": "Fiat", "model": "Uno", "year": 2020 },
  "description": "Ruído no motor",
  "services": [],
  "parts": []
}
```

O cliente (por CPF/CNPJ) e o veículo (por placa) são reaproveitados quando já existem; caso contrário, são criados na mesma requisição. `services` e `parts` são opcionais.

A OS nasce com status `RECEIVED`. A resposta inclui um `trackingLink` - um link público que o cliente pode usar para acompanhar o status sem autenticação (`GET /service-orders/track/:token`) - e o `totalAmount`, que começa zerado quando a OS é aberta sem serviços nem peças.

#### 6.2 Diagnóstico (`MECHANIC`)

```bash
PATCH /service-orders/:id/start-diagnosis
```

Transiciona a OS para `IN_DIAGNOSIS`. Não é informado o mecânico no corpo da requisição, ele é identificado automaticamente pelo token de autenticação de quem faz a chamada.

#### 6.3 Adição de serviços e peças (`MECHANIC`)

```bash
PATCH /service-orders/:id/add-services-and-parts
{
  "services": [{ "serviceId": "<id-do-servico>" }],
  "parts": [{ "inventoryId": "<id-da-peca>", "quantity": 2 }]
}
```

Só é permitido enquanto a OS está em `IN_DIAGNOSIS`. Verifica a disponibilidade de estoque lógico antes de aceitar a peça. A resposta pode incluir `stockAlerts` quando a peça adicionada ficar com estoque lógico abaixo do mínimo configurado. Ao concluir, a OS avança para `FINISHED_DIAGNOSIS`.

#### 6.4 Geração do orçamento (`SERVICE_ADVISOR` ou `ADMIN`)

```bash
PATCH /service-orders/:id/budget
```

Gera o orçamento com base nos serviços e peças adicionados (cliente, veículo, itens e valor total). Só disponível quando a OS possui ao menos um serviço ou peça. Ao concluir, a OS avança para `AWAITING_APPROVAL`.

#### 6.5 Aprovação ou cancelamento (`SERVICE_ADVISOR` ou `ADMIN`)

```bash
PATCH /service-orders/:id/approve-budget
```

Registra a aprovação do cliente e transiciona a OS para `AWAITING_EXECUTION`.

> Alternativamente, `PATCH /service-orders/:id/cancel-service` cancela a OS neste ponto (ex.: cliente não aprova o orçamento), transicionando-a para `CANCELED`.

#### 6.6 Execução do serviço (`MECHANIC`)

```bash
PATCH /service-orders/:id/start-service
```

Transiciona a OS para `IN_EXECUTION`.
Marca no banco de dados o timestamp do início da execução do serviço.

#### 6.7 Finalização (`MECHANIC`)

```bash
PATCH /service-orders/:id/finish-service
```

Transiciona a OS para `FINISHED` e dispara a baixa definitiva das peças utilizadas no estoque.
Marca no banco de dados o timestampo do fim da execução do serviço.

#### 6.8 Entrega (`SERVICE_ADVISOR` ou `ADMIN`)

```bash
PATCH /service-orders/:id/deliver
```

Transiciona a OS para `DELIVERED`, encerrando o ciclo.

### 7. Consultas e métricas da OS

```bash
GET /service-orders                                 # lista as OS abertas, por prioridade
GET /service-orders/:id                              # detalhes de uma OS
GET /service-orders/:id/tracking-link                # reobtém o link público de rastreamento
GET /service-orders/metrics/average-execution-time   # tempo médio de execução das OS finalizadas
DELETE /service-orders/:id                           # soft delete da OS
```

- **`GET /service-orders`**: sem filtro, devolve só as OS abertas (`FINISHED`, `DELIVERED` e `CANCELED` ficam de fora), ordenadas por prioridade de status (em execução, aguardando aprovação, em diagnóstico, recebida) e, dentro do mesmo status, da mais antiga para a mais nova. Com `?status=`, devolve as OS desse status (inclusive as encerradas), da mais antiga para a mais nova. `?mechanicId=` filtra pelo mecânico responsável.
- **`GET /service-orders/track/:token`**: consulta pública de status via o token do link de rastreamento, sem necessidade de autenticação.
- **`GET /service-orders/metrics/average-execution-time`** (qualquer usuário autenticado): calcula o tempo médio de execução das ordens de serviço com status `FINISHED` ou `DELIVERED`. Aceita filtro opcional por período via query params `from` e `to` (formato `AAAA-MM-DD`); sem os filtros, considera todas as OS concluídas. Retorna:

  ```json
  {
    "averageExecutionTimeMinutes": 127.3,
    "averageExecutionTimeFormatted": "2h 7min",
    "completedServiceOrders": 35
  }
  ```

  Exemplo com filtro por período:

  ```bash
  GET /service-orders/metrics/average-execution-time?from=2026-08-01&to=2026-08-31
  ```

### 8. Avisos por e-mail

Quando o status de uma OS muda, o cliente recebe um e-mail com o status atual (no mesmo vocabulário da consulta pública) e o link de acompanhamento. O envio acontece depois que a OS é gravada e **nunca** impede a operação: se o envio falhar, o erro é registrado no log e a OS segue normalmente. Clientes sem e-mail cadastrado são ignorados.

| Evento                                                                            | E-mail enviado                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Abertura da OS                                                                    | Status "Recebida" + link de acompanhamento                    |
| Início do diagnóstico, aprovação, cancelamento, início e fim da execução, entrega | Status atualizado + link de acompanhamento                    |
| Geração do orçamento (`AWAITING_APPROVAL`)                                        | Orçamento com itens, total e botões **Aprovar** e **Recusar** |

O e-mail de orçamento traz dois links assinados (HMAC-SHA256, validade de 7 dias, derivados do `TRACKING_TOKEN_SECRET` com um rótulo próprio, de modo que o token do link de acompanhamento não serve para decidir). O fluxo é:

1. `GET /budget-decisions/:token` mostra uma página de confirmação. Ele **não** registra nada, para que antivírus e leitores de e-mail que abrem links automaticamente não decidam pelo cliente.
2. O botão da página envia `POST /budget-decisions/:token`, que registra a decisão pelo mesmo caso de uso do webhook de orçamento: aprovar leva a OS para `AWAITING_EXECUTION`, recusar a cancela.
3. A primeira decisão vale. Repetir o link, ou usar o outro, mostra "Decisão já registrada".

Essas rotas retornam HTML e estão documentadas no Swagger (grupo **Budget decisions**).

#### Testando localmente

1. Suba o ambiente (`docker compose -f docker-compose.development.yaml up --build`).
2. Abra uma OS informando `client.email` e confira o e-mail "Recebida" em `http://localhost:8025`.
3. Percorra o ciclo (6.2 a 6.4). Ao gerar o orçamento, chega o e-mail com os botões.
4. Clique em **Aprovar**, confirme na página e veja a OS em `AWAITING_EXECUTION` (e um novo e-mail de status).

Em produção, aponte `SMTP_*` para um provedor real e `PUBLIC_BASE_URL` para o domínio público da API.

### 9. Swagger, collection e webhook

#### Swagger

Com a API no ar, a documentação interativa fica em `http://localhost:3000/docs` e o JSON OpenAPI em `http://localhost:3000/docs-json`. Uma cópia do OpenAPI está em [`docs/openapi.json`](docs/openapi.json).

#### Collection do Postman

A collection com **todos os endpoints** está em [`docs/Garage-Flow-API.postman_collection.json`](docs/Garage-Flow-API.postman_collection.json). Ela foi gerada a partir do OpenAPI.

Como usar:

1. No Postman, use `Import` e selecione o arquivo da collection.
2. Suba a API (`docker compose -f docker-compose.development.yaml up --build`).
3. Rode a pasta **00 - Autenticação**. Ela faz login com os quatro perfis do seed (senha `Password123!`) e guarda um token por perfil.
4. Rode a pasta **01 - Fluxo da OS** em ordem (no Collection Runner funciona direto). Ela percorre o caminho feliz completo: cadastro de serviço e peça, abertura da OS, diagnóstico, orçamento, aprovação, execução, finalização e entrega. Os ids são capturados automaticamente, e os passos do mecânico (5, 6, 9 e 10) já usam o token do mecânico.
5. A pasta **01b - Caminhos alternativos** tem um caminho por subpasta, e cada um abre a sua própria OS: aprovar pelo webhook (B1), recusar pelo webhook (B2), cancelar a OS (B3) e os links do e-mail (B4, que pede para copiar o token do Mailpit para `decisionToken`).
6. As pastas **02 - …** trazem todos os endpoints, agrupados por contexto.

Variáveis da collection:

| Variável        | Para que serve                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `baseUrl`       | URL da API (padrão `http://localhost:3000`)                                                                                    |
| `role`          | Perfil usado no `Authorization`: `admin`, `advisor`, `mechanic` ou `stock` (padrão `admin`). Troque para testar cada permissão |
| `webhookSecret` | Mesmo valor de `BUDGET_WEBHOOK_SECRET` da API                                                                                  |
| `decisionToken` | Token do link de aprovar/recusar recebido por e-mail (Mailpit em `http://localhost:8025`)                                      |

Os endpoints exclusivos do mecânico (iniciar diagnóstico, adicionar serviços e peças, iniciar e finalizar a execução) já vêm configurados com o token do mecânico; os demais usam o perfil da variável `role` (padrão `admin`). Veja a tabela de permissões na seção 1.

Para atualizar os arquivos de `docs/` depois de mudar endpoints ou DTOs, com a API no ar:

```bash
npm run docs:openapi       # baixa o OpenAPI de /docs-json para docs/openapi.json
npm run docs:collection    # gera a collection do Postman a partir do docs/openapi.json
```

#### Webhook de decisão do orçamento

`POST /webhooks/budget-decision` recebe a aprovação ou a recusa de um orçamento por um sistema externo. Ele não usa JWT: a chamada é autenticada por uma assinatura HMAC do corpo.

- **Header:** `X-Signature: sha256=<hex>`
- **Cálculo:** HMAC-SHA256 do **corpo bruto** da requisição, com a chave `BUDGET_WEBHOOK_SECRET`.
- **Corpo:**

```json
{
  "serviceOrderId": "3f6c1c0e-8c2e-4a8e-9b53-2f1f6a0d1c11",
  "decision": "APPROVED"
}
```

`decision` aceita `APPROVED` ou `REJECTED`. Aprovar leva a OS para `AWAITING_EXECUTION`; recusar cancela a OS e libera as peças reservadas.

Exemplo de assinatura em Node.js:

```js
const { createHmac } = require('crypto');

const body = JSON.stringify({ serviceOrderId: '...', decision: 'APPROVED' });
const signature =
  'sha256=' + createHmac('sha256', process.env.BUDGET_WEBHOOK_SECRET).update(body).digest('hex');
```

Exemplo com `openssl` (a saída já sai no formato do header, `sha256=<hex>`):

```bash
BODY='{"serviceOrderId":"...","decision":"APPROVED"}'
SIGNATURE=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$BUDGET_WEBHOOK_SECRET" | sed 's/^.*= /sha256=/')

curl -X POST http://localhost:3000/webhooks/budget-decision \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

Respostas:

| Status                       | Quando                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `200` `{"processed": true}`  | Decisão aplicada                                                                    |
| `200` `{"processed": false}` | Decisão ignorada: a OS não está mais aguardando aprovação (a primeira decisão vale) |
| `400`                        | Corpo inválido                                                                      |
| `401`                        | Assinatura ausente ou inválida (ou `BUDGET_WEBHOOK_SECRET` não configurado)         |
| `404`                        | OS não encontrada                                                                   |

Na collection, o pré-request do webhook calcula o `X-Signature` sozinho a partir da variável `webhookSecret`.

## Validações

A aplicação utiliza diferentes níveis de validação:

- **class-validator:** validação dos dados recebidos pelos DTOs;
- **regras de domínio:** validações específicas do negócio, lançadas como `DomainError` e convertidas para respostas HTTP padronizadas pelo filtro de exceção global;
- **Prisma/PostgreSQL:** integridade, relacionamentos, campos únicos e restrições do banco.

Antes de cada `git push`, o Husky executa automaticamente:

- Prettier;
- ESLint;
- testes Jest.

O push é interrompido caso alguma dessas verificações falhe.

## Testes

O projeto utiliza **Jest** para testes unitários e **Jest + Supertest** para testes de integração. Todos os testes ficam na pasta `test/`, separados por tipo e organizados de acordo com os contextos e fluxos da aplicação.

```text
test/
├── unit/
│   ├── auth/
│   ├── client/
│   ├── common/
│   ├── inventory/
│   ├── monitoring/
│   ├── notification/
│   ├── prisma/
│   ├── service/
│   ├── service-orders/
│   └── vehicle/
└── integration/
    ├── auth/
    ├── client/
    ├── inventory/
    ├── monitoring/
    ├── service/
    ├── service-orders/
    └── vehicle/
```

### Testes unitários

Validam componentes de forma isolada, sem depender de outros componentes externos.

### Testes de integração

Validam a interação entre diferentes componentes da aplicação, incluindo a integração com **Prisma e PostgreSQL**. Alguns testes podem abranger mais de um contexto quando o fluxo exigir a interação entre eles (por exemplo, `service-orders` consumindo `client`, `vehicle`, `service` e `inventory`).

Os testes de integração rodam de forma sequencial (`--runInBand`), já que compartilham o mesmo banco de dados - rodar em paralelo pode causar falhas intermitentes por concorrência entre suítes.

A organização por contexto facilita a localização e manutenção dos testes, sem limitar um teste de integração a apenas um contexto.

O ciclo de vida da OS (abertura, aprovação e recusa, listagem priorizada, transições de status, baixa de estoque, e-mails e links de decisão) é coberto de ponta a ponta em `test/integration/service-orders/presentation/service-orders.lifecycle.spec.ts`.

Para rodar todos os testes (é necessário o docker rodando para os testes de integração):

```bash
npm run test
```

Para gerar o relatório de cobertura:

```bash
npm run test:cov
```
