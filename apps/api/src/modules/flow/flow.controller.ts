import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  exitAuthorizationCreateSchema,
  gateCheckoutSchema,
  guardianExitConfirmSchema,
  passCreateSchema,
  passQuerySchema,
  passTransitionSchema,
  standingExitPermissionSchema,
} from '@sgee/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Idempotent, Meta, Perms, Public, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { FlowService } from './flow.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('flow')
@Controller()
export class FlowController {
  constructor(private readonly flow: FlowService) {}

  @Post('passes')
  @Perms('passes:create')
  @Idempotent()
  create(@CurrentUser() u: AuthUser, @Body(zp(passCreateSchema)) b: z.infer<typeof passCreateSchema>, @Meta() m: RequestMeta) {
    return this.flow.create(u, b, m);
  }

  @Get('passes')
  list(@CurrentUser() u: AuthUser, @Query(zp(passQuerySchema)) q: z.infer<typeof passQuerySchema>) {
    return this.flow.list(u, q);
  }

  @Get('passes/board')
  @Perms('passes:nursing')
  board(@CurrentUser() u: AuthUser) {
    return this.flow.board(u);
  }

  @Get('passes/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.flow.detail(u, id);
  }

  @Post('passes/:id/transition')
  @HttpCode(200)
  transition(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(passTransitionSchema)) b: z.infer<typeof passTransitionSchema>, @Meta() m: RequestMeta) {
    return this.flow.transition(u, id, b.to, b.note, m);
  }

  @Post('passes/receive')
  @Perms('passes:nursing')
  @HttpCode(200)
  receive(@CurrentUser() u: AuthUser, @Body(zp(z.object({ code: z.string().min(4).max(80) }))) b: { code: string }, @Meta() m: RequestMeta) {
    return this.flow.receiveByCode(u, b.code, m);
  }

  @Post('exit-authorizations')
  @Perms('exits:authorize')
  @Idempotent()
  createExit(@CurrentUser() u: AuthUser, @Body(zp(exitAuthorizationCreateSchema)) b: z.infer<typeof exitAuthorizationCreateSchema>, @Meta() m: RequestMeta) {
    return this.flow.createExit(u, b, m);
  }

  @Post('exit-authorizations/:id/cancel')
  @Perms('exits:authorize')
  @HttpCode(200)
  cancelExit(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ reason: z.string().min(3).max(500) }))) b: { reason: string }, @Meta() m: RequestMeta) {
    return this.flow.cancelExit(u, id, b.reason, m);
  }

  @Post('exit-authorizations/:id/confirm')
  @Perms('exits:confirm')
  @HttpCode(200)
  confirmAsParent(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(guardianExitConfirmSchema)) b: z.infer<typeof guardianExitConfirmSchema>, @Meta() m: RequestMeta) {
    return this.flow.confirmExitAsParent(u, id, b, m);
  }

  @Public()
  @Get('public/exit-confirmations/:token')
  exitByToken(@Param('token') token: string) {
    return this.flow.exitByToken(token);
  }

  @Public()
  @Post('public/exit-confirmations/:token')
  @HttpCode(200)
  confirmByToken(@Param('token') token: string, @Body(zp(guardianExitConfirmSchema)) b: z.infer<typeof guardianExitConfirmSchema>, @Meta() m: RequestMeta) {
    return this.flow.confirmExitByToken(token, b, m);
  }

  @Get('gate/queue')
  @Perms('gate:checkout')
  gateQueue(@CurrentUser() u: AuthUser) {
    return this.flow.gateQueue(u);
  }

  @Get('gate/lookup')
  @Perms('gate:checkout')
  gateLookup(@CurrentUser() u: AuthUser, @Query('code') code: string) {
    return this.flow.gateLookup(u, code ?? '');
  }

  @Post('gate-checkouts')
  @Perms('gate:checkout')
  @Idempotent()
  checkout(@CurrentUser() u: AuthUser, @Body(zp(gateCheckoutSchema)) b: z.infer<typeof gateCheckoutSchema>, @Meta() m: RequestMeta) {
    return this.flow.checkout(u, b, m);
  }

  @Post('standing-exit-permissions')
  standing(@CurrentUser() u: AuthUser, @Body(zp(standingExitPermissionSchema)) b: z.infer<typeof standingExitPermissionSchema>, @Meta() m: RequestMeta) {
    return this.flow.createStanding(u, b, m);
  }

  @Get('students/:id/standing-exit-permissions')
  listStanding(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.flow.listStanding(u, id);
  }

  @Post('standing-exit-permissions/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.flow.revokeStanding(u, id, m);
  }
}
