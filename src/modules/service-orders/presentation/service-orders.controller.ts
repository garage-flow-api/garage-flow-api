import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { type Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreateServiceOrderUseCase } from '@service-orders/application/use-cases/create-service-order.use-case';
import { FindServiceOrderByIdUseCase } from '@service-orders/application/use-cases/find-service-order-by-id.use-case';
import { FindAllServiceOrdersUseCase } from '@service-orders/application/use-cases/find-all-service-orders.use-case';
import { UpdateServiceOrderUseCase } from '@service-orders/application/use-cases/update-service-order.use-case';
import { DeleteServiceOrderUseCase } from '@service-orders/application/use-cases/delete-service-order.use-case';
import { AddServicesAndPartsUseCase } from '@service-orders/application/use-cases/add-services-and-parts.use-case';
import { StartDiagnosisUseCase } from '@service-orders/application/use-cases/start-diagnosis.use-case';
import { FinishServiceUseCase } from '@service-orders/application/use-cases/finish-service.use-case';
import { DeliverServiceOrderUseCase } from '@service-orders/application/use-cases/deliver-service-order.use-case';
import { StartServiceUseCase } from '@service-orders/application/use-cases/start-service.use-case';
import { GenerateServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/generate-service-order-budget.use-case';
import { ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';
import { FindServiceOrderByTrackingTokenUseCase } from '@service-orders/application/use-cases/find-service-order-by-tracking-token.use-case';
import { GetServiceOrderTrackingLinkUseCase } from '@service-orders/application/use-cases/get-service-order-tracking-link.use-case';
import { GetAverageExecutionTimeUseCase } from '@service-orders/application/use-cases/get-average-execution-time.use-case';
import { buildTrackingLink } from '@service-orders/infrastructure/security/tracking-token.util';
import { CreateServiceOrderDto } from '@service-orders/presentation/dtos/create-service-order.dto';
import { UpdateServiceOrderDto } from '@service-orders/presentation/dtos/update-service-order.dto';
import { AddServicesAndPartsDto } from '@service-orders/presentation/dtos/add-services-and-parts.dto';
import { ServiceOrderResponseDto } from '@service-orders/presentation/dtos/service-order-response.dto';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { ServiceOrderBudgetResponseDto } from '@service-orders/presentation/dtos/service-order-budget-response.dto';
import { ServiceOrderCreatedResponseDto } from '@service-orders/presentation/dtos/service-order-created-response.dto';
import { ServiceOrderTrackingResponseDto } from '@service-orders/presentation/dtos/service-order-tracking-response.dto';
import { ServiceOrderTrackingLinkResponseDto } from '@service-orders/presentation/dtos/service-order-tracking-link-response.dto';
import { AverageExecutionTimeResponseDto } from '@service-orders/presentation/dtos/average-execution-time-response.dto';
import { AverageExecutionTimeQueryDto } from '@service-orders/presentation/dtos/average-execution-time-query.dto';
import { AddServicesAndPartsResponseDto } from '@service-orders/presentation/dtos/add-services-and-parts-response.dto';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dtos/error-response.dto';

@ApiTags('Service Orders')
@Controller('service-orders')
export class ServiceOrdersController {
  constructor(
    private readonly createServiceOrder: CreateServiceOrderUseCase,
    private readonly findServiceOrderById: FindServiceOrderByIdUseCase,
    private readonly findAllServiceOrders: FindAllServiceOrdersUseCase,
    private readonly updateServiceOrder: UpdateServiceOrderUseCase,
    private readonly deleteServiceOrder: DeleteServiceOrderUseCase,
    private readonly addServicesAndParts: AddServicesAndPartsUseCase,
    private readonly startDiagnosis: StartDiagnosisUseCase,
    private readonly finishService: FinishServiceUseCase,
    private readonly deliverServiceOrder: DeliverServiceOrderUseCase,
    private readonly startService: StartServiceUseCase,
    private readonly generateServiceOrderBudget: GenerateServiceOrderBudgetUseCase,
    private readonly approveServiceOrderBudget: ApproveServiceOrderBudgetUseCase,
    private readonly cancelServiceOrder: CancelServiceOrderUseCase,
    private readonly findServiceOrderByTrackingToken: FindServiceOrderByTrackingTokenUseCase,
    private readonly getServiceOrderTrackingLink: GetServiceOrderTrackingLinkUseCase,
    private readonly getAverageExecutionTime: GetAverageExecutionTimeUseCase,
  ) {}

  @Get('metrics/average-execution-time')
  @ApiAuth()
  @ApiOperation({
    summary: 'Returns the average execution time of completed service orders',
    description:
      'Returns the average execution time of completed service orders. The FROM and TO date filters are optional; when omitted, all FINISHED and DELIVERED service orders are considered.',
  })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  @ApiOkResponse({ type: AverageExecutionTimeResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'FROM must be earlier than or equal to TO',
  })
  async getAverageExecutionTimeMetric(
    @Query() query: AverageExecutionTimeQueryDto,
  ): Promise<AverageExecutionTimeResponseDto> {
    return this.getAverageExecutionTime.execute(query);
  }

  @Post()
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Creates a new service order',
  })
  @ApiCreatedResponse({ type: ServiceOrderCreatedResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Client or vehicle not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Vehicle does not belong to the informed client',
  })
  async create(
    @Body() dto: CreateServiceOrderDto,
    @Req() request: Request,
  ): Promise<ServiceOrderCreatedResponseDto> {
    const serviceOrder = await this.createServiceOrder.execute(dto);
    const trackingLink = buildTrackingLink(this.getBaseUrl(request), serviceOrder.id);
    return ServiceOrderCreatedResponseDto.fromEntityWithLink(serviceOrder, trackingLink);
  }

  @Get('track/:token')
  @ApiOperation({
    summary: 'Publicly retrieves the current status and last update date of a service order',
  })
  @ApiOkResponse({ type: ServiceOrderTrackingResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async trackByToken(@Param('token') token: string): Promise<ServiceOrderTrackingResponseDto> {
    const serviceOrder = await this.findServiceOrderByTrackingToken.execute(token);
    return ServiceOrderTrackingResponseDto.fromEntity(serviceOrder);
  }

  @Get()
  @ApiAuth()
  @ApiOperation({
    summary: 'Retrieves the service orders in priority order',
    description:
      'Without the status filter, returns only open service orders (FINISHED, DELIVERED and CANCELED are hidden), ordered by status priority (in execution, awaiting approval, in diagnosis, received) and then oldest first. With the status filter, returns the service orders in that status, oldest first.',
  })
  @ApiQuery({
    name: 'status',
    enum: ServiceOrderStatus,
    required: false,
    description:
      'Returns only orders in this status, including FINISHED, DELIVERED and CANCELED. Use RECEIVED to list only orders available for diagnosis.',
  })
  @ApiQuery({
    name: 'mechanicId',
    required: false,
    description: 'Filter service orders assigned to a specific mechanic.',
  })
  @ApiOkResponse({ type: [ServiceOrderResponseDto] })
  async findAll(
    @Query('status', new ParseEnumPipe(ServiceOrderStatus, { optional: true }))
    status?: ServiceOrderStatus,
    @Query('mechanicId') mechanicId?: string,
  ): Promise<ServiceOrderResponseDto[]> {
    const serviceOrders = await this.findAllServiceOrders.execute(status, mechanicId);
    return serviceOrders.map((serviceOrder) => ServiceOrderResponseDto.fromListItem(serviceOrder));
  }

  @Get(':id')
  @ApiAuth()
  @ApiOperation({
    summary: 'Retrieves a service order by ID',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.findServiceOrderById.execute(id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Get(':id/tracking-link')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Retrieves the public tracking link to share with the client',
  })
  @ApiOkResponse({ type: ServiceOrderTrackingLinkResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async getTrackingLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<ServiceOrderTrackingLinkResponseDto> {
    const trackingLink = await this.getServiceOrderTrackingLink.execute(
      this.getBaseUrl(request),
      id,
    );
    return new ServiceOrderTrackingLinkResponseDto(trackingLink);
  }

  @Patch(':id/budget')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Generates or retrieves the service order budget',
    description:
      'Use this PATCH to generate the budget when the service order is in FINISHED_DIAGNOSIS, which changes its status to AWAITING_APPROVAL. For any later status, the endpoint retrieves the budget without changing the status. Service orders in RECEIVED or IN_DIAGNOSIS cannot access a budget because items have not been added yet.',
  })
  @ApiOkResponse({
    type: ServiceOrderBudgetResponseDto,
    description:
      'Returns the service order budget. In FINISHED_DIAGNOSIS, it generates the budget and changes the status to AWAITING_APPROVAL. In any later status, it retrieves the budget without changing the status.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Service order status does not allow accessing a budget, or it has no items',
  })
  async generateBudget(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ServiceOrderBudgetResponseDto> {
    const budget = await this.generateServiceOrderBudget.execute(id);
    return ServiceOrderBudgetResponseDto.fromViewModel(budget);
  }

  @Patch(':id')
  @ApiAuth('ADMIN')
  @ApiOperation({
    summary: 'Updates a service order by ID',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid status transition' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceOrderDto,
  ): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.updateServiceOrder.execute(id, dto);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/start-diagnosis')
  @ApiAuth('MECHANIC')
  @ApiOperation({
    summary: 'Starts the diagnosis for a service order by ID',
    description:
      'The selected service order must have RECEIVED status. The mechanic ID is taken from the authenticated user.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Service order does not have RECEIVED status',
  })
  async startServiceDiagnosis(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.startDiagnosis.execute(id, request.user.id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/add-services-and-parts')
  @ApiAuth('MECHANIC')
  @ApiOperation({
    summary: 'Adds services and parts to a service order and finishes the diagnosis by ID',
    description:
      'The service order must have IN_DIAGNOSIS status and be assigned to the authenticated mechanic.',
  })
  @ApiOkResponse({ type: AddServicesAndPartsResponseDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Service order or a referenced part not found',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Duplicate part in the same request, unavailable quantity, or the service order is not in IN_DIAGNOSIS status',
  })
  async addServicesAndPartsToServiceOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddServicesAndPartsDto,
    @Req() request: { user: { id: string } },
  ): Promise<AddServicesAndPartsResponseDto> {
    const result = await this.addServicesAndParts.execute(id, dto, request.user.id);
    return AddServicesAndPartsResponseDto.fromResult(result);
  }

  @Patch(':id/approve-budget')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({ summary: 'Approves the budget for a service order' })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Service order does not have AWAITING_APPROVAL status',
  })
  async approveBudget(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.approveServiceOrderBudget.execute(id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/cancel-service')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Cancels a service order',
    description: 'The service order can be canceled in any status except FINISHED or DELIVERED.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Service order already has FINISHED or DELIVERED status',
  })
  async cancelService(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.cancelServiceOrder.execute(id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/start-service')
  @ApiAuth('MECHANIC')
  @ApiOperation({
    summary: 'Starts service execution by ID',
    description:
      'The service order must be AWAITING_EXECUTION and assigned to the authenticated mechanic.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Wrong mechanic, or service order does not have AWAITING_EXECUTION status',
  })
  async startServiceExecution(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.startService.execute(id, request.user.id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/finish-service')
  @ApiAuth('MECHANIC')
  @ApiOperation({
    summary: 'Finishes service execution by ID',
    description:
      'The service order must be IN EXECUTION and assigned to the authenticated mechanic.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Wrong mechanic, or service order does not have IN_EXECUTION status',
  })
  async finishServiceExecution(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: { id: string } },
  ): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.finishService.execute(id, request.user.id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Patch(':id/deliver')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Delivers a service order by ID',
    description: 'The service order must have FINISHED status.',
  })
  @ApiOkResponse({ type: ServiceOrderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Service order does not have FINISHED status',
  })
  async deliver(@Param('id', ParseUUIDPipe) id: string): Promise<ServiceOrderResponseDto> {
    const serviceOrder = await this.deliverServiceOrder.execute(id);
    return ServiceOrderResponseDto.fromEntity(serviceOrder);
  }

  @Delete(':id')
  @ApiAuth('ADMIN', 'SERVICE_ADVISOR')
  @ApiOperation({
    summary: 'Soft deletes a service order by ID',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Service order deleted successfully' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteServiceOrder.execute(id);
  }

  private getBaseUrl(request: Request): string {
    return `${request.protocol}://${request.get('host')}`;
  }
}
