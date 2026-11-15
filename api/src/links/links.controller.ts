import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Principal } from '../auth/auth.types.js';
import { RateLimit } from '../auth/rate-limit.decorator.js';
import { RateLimitGuard } from '../auth/rate-limit.guard.js';
import { CreateLinkDto } from './dto/create-link.dto.js';
import { UpdateLinkDto } from './dto/update-link.dto.js';
import { ListLinksQueryDto } from './dto/list-links-query.dto.js';
import { SearchLinksQueryDto } from './dto/search-links-query.dto.js';
import { LinksService } from './links.service.js';

@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(30)
  create(@Body() dto: CreateLinkDto, @CurrentPrincipal() principal: Principal) {
    return this.linksService.create(dto, principal.principalId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@Query() query: ListLinksQueryDto, @CurrentPrincipal() principal: Principal) {
    return this.linksService.list(query, principal.principalId);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  search(
    @Query() query: SearchLinksQueryDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.linksService.search(query, principal.principalId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.linksService.getById(id, principal.principalId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLinkDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.linksService.update(id, dto, principal.principalId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.linksService.delete(id, principal.principalId);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @RateLimit(60)
  getAnalytics(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: Principal,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.linksService.getAnalytics(id, principal.principalId, from, to);
  }
}
