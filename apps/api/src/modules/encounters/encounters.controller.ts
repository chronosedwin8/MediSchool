import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { addendumSchema, annulSchema, encounterCloseSchema, encounterCreateSchema, encounterQuerySchema, encounterUpdateSchema, observationStartSchema, vitalSignsSchema } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Idempotent, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { EncountersService } from './encounters.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('encounters')
@Controller('encounters')
export class EncountersController {
  constructor(private readonly svc: EncountersService) {}

  @Post()
  @Perms('encounters:write')
  @Idempotent()
  create(@CurrentUser() u: AuthUser, @Body(zp(encounterCreateSchema)) b: z.infer<typeof encounterCreateSchema>, @Meta() m: RequestMeta) {
    return this.svc.create(u, b, m);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(zp(encounterQuerySchema)) q: z.infer<typeof encounterQuerySchema>) {
    return this.svc.list(u, q);
  }

  @Get('verify-chain')
  @Perms('audit:read', 'encounters:annul')
  verify(@CurrentUser() u: AuthUser) {
    return this.svc.verifyChain(u);
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.svc.detail(u, id, m);
  }

  @Get(':id/pdf')
  async pdf(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta, @Res() res: Response) {
    const buf = await this.svc.pdf(u, id, m);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="atencion-${id.slice(0, 8)}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  }

  @Patch(':id')
  @Perms('encounters:write')
  update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(encounterUpdateSchema)) b: z.infer<typeof encounterUpdateSchema>, @Meta() m: RequestMeta) {
    return this.svc.update(u, id, b, m);
  }

  @Post(':id/vitals')
  @Perms('encounters:write')
  vitals(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(vitalSignsSchema)) b: z.infer<typeof vitalSignsSchema>, @Meta() m: RequestMeta) {
    return this.svc.addVitals(u, id, b, m);
  }

  @Post(':id/observation')
  @Perms('encounters:write')
  observe(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(observationStartSchema)) b: z.infer<typeof observationStartSchema>, @Meta() m: RequestMeta) {
    return this.svc.startObservation(u, id, b, m);
  }

  @Post(':id/observation/end')
  @Perms('encounters:write')
  @HttpCode(200)
  endObserve(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ outcome: z.string().trim().min(3).max(1000) }))) b: { outcome: string }, @Meta() m: RequestMeta) {
    return this.svc.endObservation(u, id, b.outcome, m);
  }

  @Post(':id/notes')
  @Perms('encounters:write')
  note(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(addendumSchema)) b: { note: string }, @Meta() m: RequestMeta) {
    return this.svc.addNote(u, id, b.note, m);
  }

  @Post(':id/close')
  @Perms('encounters:write')
  @Idempotent()
  @HttpCode(200)
  close(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(encounterCloseSchema)) b: z.infer<typeof encounterCloseSchema>, @Meta() m: RequestMeta) {
    return this.svc.close(u, id, b, m);
  }

  @Post(':id/annul')
  @Perms('encounters:annul')
  @HttpCode(200)
  annul(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(annulSchema)) b: { reason: string }, @Meta() m: RequestMeta) {
    return this.svc.annul(u, id, b.reason, m);
  }
}
