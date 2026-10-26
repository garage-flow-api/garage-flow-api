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
- escalabilidade automática conforme o consumo de CPU e memória;
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
│   │   ├── service/
│   │   ├── service-orders/
│   │   └── vehicle/
│   ├── shared/
│   ├── app.module.ts
│   └── main.ts
├── prisma/                      # Schema, migrations, seed e bootstrap do admin
├── test/                        # Testes unitários e de integração
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

Além dos contextos de negócio, `common` contém elementos compartilhados pela aplicação (guards, filtros de exceção, pipes, decorators e erros de domínio) e `infra` contém recursos de infraestrutura que não pertencem a um contexto específico (conexão com o banco, health check).

## Ambientes de execução

| Ambiente | Forma de execução | Configuração |
| --- | --- | --- |
| Desenvolvimento | Docker Compose | `docker-compose.development.yaml` e `.env` |
| Produção | Kubernetes | Manifestos da pasta `k8s/` |

Não existe um Docker Compose de produção. O estágio `production` do `Dockerfile` gera a imagem enxuta utilizada pelo Deployment da API no Kubernetes.

## Ambiente de desenvolvimento

### Pré-requisitos

- Docker
- Node.js 20+
- npm

### 1. Configuração

Crie o arquivo `.env` a partir do `.env.example` e utilize `NODE_ENV=development`:

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/garage-flow?schema=public

# Autenticação (JWT)
JWT_SECRET=troque-por-um-segredo-forte
JWT_EXPIRES_IN=1d

# Link público de rastreamento da OS
TRACKING_TOKEN_SECRET=troque-por-outro-segredo-forte
```

O arquivo `.env` é utilizado pelo Docker Compose e pelos comandos executados localmente. No ambiente de produção, as configurações são fornecidas pelos recursos `ConfigMap` e `Secret` do Kubernetes.

### 2. Subir a aplicação

```bash
docker compose -f docker-compose.development.yaml up --build
```

O `docker-compose.development.yaml` utiliza o estágio `development` do `Dockerfile`, instala as dependências de desenvolvimento e monta o código como volume para permitir **hot reload** com `start:debug`.

O Docker Compose inicia:

- PostgreSQL (dados da aplicação);
- PostgreSQL do SonarQube (`sonar-db`) e o próprio SonarQube (análise de código);
- API NestJS;
- aplicação das migrations e do seed do Prisma.

A API aguarda o PostgreSQL ficar saudável, gera o Prisma Client, executa as migrations e popula o banco com os dados de demonstração antes de iniciar. Os usuários criados pelo seed usam a senha padrão `Password123!`.

### 3. Acessos

- **API:** `http://localhost:3000`
- **Swagger:** `http://localhost:3000/docs`
- **SonarQube:** `http://localhost:9000` (usuário/senha padrão `admin`/`admin` no primeiro acesso) - disponível apenas ao subir com `docker-compose.development.yaml`.

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

| Manifesto | Recurso criado |
| --- | --- |
| `k8s/configmap.yaml` | Variáveis não sensíveis da API |
| `k8s/secret.yaml` | Credenciais do banco e segredos da aplicação |
| `k8s/postgres-pvc.yaml` | Volume persistente de 1 GiB para o PostgreSQL |
| `k8s/postgres-deployment.yaml` | Deployment do PostgreSQL 16 |
| `k8s/postgres-service.yaml` | Service interno do PostgreSQL |
| `k8s/migration-job.yaml` | Job responsável por executar `prisma migrate deploy` |
| `k8s/admin-secret.yaml` | Credenciais temporárias do primeiro administrador |
| `k8s/bootstrap-admin-job.yaml` | Job que cria o primeiro usuário `ADMIN` |
| `k8s/deployment.yaml` | Deployment da API com recursos, liveness e readiness probes |
| `k8s/service.yaml` | Service interno da API |
| `k8s/hpa.yaml` | Escalabilidade automática por CPU e memória |
| `k8s/ingress.yaml` | Roteamento HTTP por meio de NGINX Ingress |

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
docker image inspect garage-flow-api-migration:latest
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

O HPA mantém entre 1 e 10 réplicas da API. Uma nova réplica pode ser criada quando a utilização média alcançar:

- `60%` de CPU;
- `70%` de memória.

Com o Metrics Server disponível:

```bash
kubectl apply -f k8s/hpa.yaml
kubectl get hpa
kubectl top pods
```

Se as métricas aparecerem como `<unknown>`, verifique se o Metrics Server está instalado e funcionando no cluster.

### 10. Executar o teste de carga com k6

O arquivo `k6/load-test.js` executa 500 usuários virtuais simultâneos durante 1 minuto, enviando requisições para o endpoint `GET /health`.

No terminal, acompanhe o HPA e os Pods:

```bash
kubectl get hpa -w
```

Execute o teste:

```bash
k6 run k6/load-test.js
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
flowchart LR
    PR["Pull request"] --> CI1["ci"] --> IMG1["image<br/>build + Trivy"]

    PUSH["Push na main"] --> CI2["ci"] --> IMG2["image<br/>build + Trivy + push no ACR"]
    IMG2 -->|"infra no ar"| DEP["deploy<br/>migration, admin, manifestos,<br/>rollout e health check"]
    IMG2 -.->|"infra destruída"| SKIP["deploy pulado"]

    RUNCD["Run workflow (ci-cd)"] --> CI2

    RUNINFRA["Run workflow (infra)"] -->|"action = provision"| PROV["provision<br/>terraform apply"]
    RUNINFRA -->|"action = destroy"| DEST["destroy<br/>terraform destroy"]
```

### Jobs

| Job | Quando roda | O que faz |
| --- | --- | --- |
| `ci` | PR, push na `main` e "Run workflow" do `ci-cd` | `npm ci`, Prisma generate, lint, Prettier, build e testes com cobertura (artefato `coverage`) |
| `image` | Depois do `ci` | Builda a imagem de produção e roda o Trivy (`CRITICAL`/`HIGH`). Fora de PR, publica no ACR a imagem da API e a dos Jobs, com o SHA curto do commit como tag |
| `deploy` | Depois do `image`, só se as imagens foram publicadas | Jobs de migration e de criação do primeiro admin, overlay `cloud` (API, Service, Ingress, HPA), rollout e checagem de `/health` e `/ready`. As URLs aparecem no resumo da execução |
| `provision` | Só pelo "Run workflow" do `infra` | `terraform plan` + `apply` em `infra/azure`: AKS, ACR, PostgreSQL, Key Vault e Ingress (~15-20 min) |
| `destroy` | Só pelo "Run workflow" do `infra` | Remove a aplicação do cluster, o Ingress e o restante da infra com `terraform destroy` (~10-15 min) |

Nada cria ou destrói infraestrutura automaticamente. Em push na `main`, a pipeline só **lê** o state do Terraform: se a infra não existir, as imagens não são publicadas e o deploy é pulado, sem falhar. As mesmas verificações do Husky (Prettier, ESLint e testes) são repetidas no job `ci`.

### Provisionar, fazer deploy e destruir

Em **Actions → Run workflow**, na branch `main`:

1. **Provision:** workflow `infra`, `action` = `provision` e `confirmacao` = `sim`. Aguarde terminar.
2. **Deploy:** faça um push na `main` ou rode o workflow `ci-cd`. Ao final, o resumo da execução mostra as URLs da API, do Swagger e do health check (`http://<ip>.nip.io`).
3. **Destroy:** workflow `infra`, `action` = `destroy` e `confirmacao` = `destruir`.

Sem a confirmação exata, o job falha antes de qualquer acesso à Azure. A senha do primeiro administrador fica no Key Vault; o comando para lê-la aparece no resumo do deploy.

### Credenciais

- Login na Azure por **OIDC** (credencial federada do service principal `sp-garage-flow-github-actions`, aceita só para a `main`). **Nenhum secret é armazenado no GitHub.**
- Três **repository variables** (Settings → Secrets and variables → Actions → Variables): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`. Não são valores sensíveis.
- Os segredos da aplicação (senha do banco, `JWT_SECRET`, `TRACKING_TOKEN_SECRET`, senha do admin) são gerados pelo Terraform, guardados no Key Vault e criados como Secrets no cluster. A pipeline não os manipula.

### Avisos

- **Rode sempre o `destroy` ao terminar.** O AKS e o banco consomem crédito enquanto estiverem no ar.
- **Não faça push na `main` enquanto `provision` ou `destroy` estiver rodando.** O deploy desse push falharia (sem custo, mas vermelho).
- **O Trivy bloqueia a publicação:** com vulnerabilidade `CRITICAL` ou `HIGH` corrigível, a imagem não vai para o ACR e não há deploy.
- Em pushes seguidos, só o commit mais recente da `main` é implantado; execuções de commits anteriores pulam o deploy.

Tempo médio da pipeline: _TODO — preencher após a execução real_.

## Como usar e testar a API

### 1. Login

#### Produção com Kubernetes

O Kubernetes não executa o seed de demonstração. O Job `garage-flow-migration` aplica as migrations, e o Job `garage-flow-bootstrap-admin` cria somente o primeiro administrador com as credenciais configuradas em `k8s/admin-secret.yaml`.

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

> Consultas de leitura (`GET`) na maioria dos recursos estão disponíveis para qualquer usuário autenticado, independente da role. As exceções (ex.: `GET /inventory/low-stock`) exigem a role MECHANIC. `GET /service-orders/track/:token` e `POST /auth/login` são as únicas rotas públicas, sem necessidade de autenticação.

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
{ "clientCpfCnpj": "529.982.247-25", "licensePlate": "ABC1D23", "description": "Ruído no motor" }
```

A OS nasce com status `RECEIVED`. A resposta inclui um `trackingLink` - um link público que o cliente pode usar para acompanhar o status sem autenticação (`GET /service-orders/track/:token`) e o `totalAmount` começa zerado.

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
GET /service-orders                                 # lista todas as OS
GET /service-orders/:id                              # detalhes de uma OS
GET /service-orders/:id/tracking-link                # reobtém o link público de rastreamento
GET /service-orders/metrics/average-execution-time   # tempo médio de execução das OS finalizadas
DELETE /service-orders/:id                           # soft delete da OS
```



- **`GET /track/:token`**: consulta pública de status via o token do link de rastreamento, sem necessidade de autenticação.
- **`GET /metrics/average-execution-time`** (qualquer usuário autenticado): calcula o tempo médio de execução das ordens de serviço com status `FINISHED` ou `DELIVERED`. Aceita filtro opcional por período via query params `from` e `to` (formato `AAAA-MM-DD`); sem os filtros, considera todas as OS concluídas. Retorna:

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
│   ├── health/
│   ├── auth/
│   ├── client/
│   ├── vehicle/
│   ├── service/
│   ├── inventory/
│   └── service-orders/
│
└── integration/
    ├── client/
    ├── vehicle/
    ├── service/
    ├── inventory/
    └── service-orders/
```

### Testes unitários

Validam componentes de forma isolada, sem depender de outros componentes externos.

### Testes de integração

Validam a interação entre diferentes componentes da aplicação, incluindo a integração com **Prisma e PostgreSQL**. Alguns testes podem abranger mais de um contexto quando o fluxo exigir a interação entre eles (por exemplo, `service-orders` consumindo `client`, `vehicle`, `service` e `inventory`).

Os testes de integração rodam de forma sequencial (`--runInBand`), já que compartilham o mesmo banco de dados - rodar em paralelo pode causar falhas intermitentes por concorrência entre suítes.

A organização por contexto facilita a localização e manutenção dos testes, sem limitar um teste de integração a apenas um contexto.

Para rodar todos os testes (é necessário o docker rodando para os testes de integração):

```bash
npm run test
```
