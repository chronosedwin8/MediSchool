import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { absenceExcuseSchema, campaignSchema, drillSchema, fieldTripSchema, isoDate } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { PublicHealthService } from './public-health.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('public-health')
@Controller()
export class PublicHealthController {
  constructor(private readonly svc: PublicHealthService) {}

  @Get('public-health/outbreaks')
  @Perms('public_health:manage', 'stats:anonymous')
  outbreaks(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.svc.outbreaks(u, status);
  }

  @Post('public-health/outbreaks/run')
  @Perms('public_health:manage')
  @HttpCode(200)
  run(@CurrentUser() u: AuthUser) {
    return this.svc.runOutbreakDetection(u.tenantId);
  }

  @Patch('public-health/outbreaks/:id')
  @Perms('public_health:manage')
  update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ status: z.enum(['OPEN', 'NOTIFIED', 'CLOSED']), notes: z.string().max(2000).optional().nullable() }))) b: { status: string; notes?: string | null }, @Meta() m: RequestMeta) {
    return this.svc.updateOutbreak(u, id, b, m);
  }

  @Get('public-health/frequent-visitors')
  @Perms('stats:clinical', 'stats:anonymous', 'mental_health:read')
  frequent(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    return this.svc.frequentVisitors(u, Number(days) || 30);
  }

  @Get('public-health/surveillance.csv')
  @Perms('public_health:manage')
  async surveillance(@CurrentUser() u: AuthUser, @Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const today = new Date().toISOString().slice(0, 10);
    const csv = await this.svc.surveillanceCsv(u, isoDate.safeParse(from).success ? from : today.slice(0, 8) + '01', isoDate.safeParse(to).success ? to : today);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vigilancia-sindromica.csv"');
    res.send('﻿' + csv);
  }

  @Get('campaigns')
  @Perms('public_health:manage')
  campaigns(@CurrentUser() u: AuthUser) {
    return this.svc.campaigns(u);
  }

  @Post('campaigns')
  @Perms('public_health:manage')
  createCampaign(@CurrentUser() u: AuthUser, @Body(zp(campaignSchema)) b: z.infer<typeof campaignSchema>, @Meta() m: RequestMeta) {
    return this.svc.createCampaign(u, b, m);
  }

  @Get('campaigns/:id')
  @Perms('public_health:manage')
  campaign(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.svc.campaign(u, id);
  }

  @Patch('campaigns/:id/participants/:studentId')
  @Perms('public_health:manage')
  participant(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Param('studentId', uuid) studentId: string, @Body(zp(z.object({ status: z.enum(['PENDING', 'DONE', 'EXEMPT', 'REFUSED']), notes: z.string().max(500).optional().nullable() }))) b: { status: string; notes?: string | null }, @Meta() m: RequestMeta) {
    return this.svc.updateParticipant(u, id, studentId, b, m);
  }

  @Post('absence-excuses')
  excuse(@CurrentUser() u: AuthUser, @Body(zp(absenceExcuseSchema)) b: z.infer<typeof absenceExcuseSchema>, @Meta() m: RequestMeta) {
    return this.svc.createExcuse(u, b, m);
  }

  @Get('absence-excuses')
  excuses(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.svc.excuses(u, status);
  }

  @Post('absence-excuses/:id/validate')
  @Perms('clinical:write')
  @HttpCode(200)
  validate(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ status: z.enum(['VALIDATED', 'REJECTED']) }))) b: { status: 'VALIDATED' | 'REJECTED' }, @Meta() m: RequestMeta) {
    return this.svc.validateExcuse(u, id, b.status, m);
  }

  @Get('field-trips')
  @Perms('clinical:read', 'public_health:manage')
  trips(@CurrentUser() u: AuthUser) {
    return this.svc.fieldTrips(u);
  }

  @Post('field-trips')
  @Perms('public_health:manage')
  createTrip(@CurrentUser() u: AuthUser, @Body(zp(fieldTripSchema)) b: z.infer<typeof fieldTripSchema>, @Meta() m: RequestMeta) {
    return this.svc.createFieldTrip(u, b, m);
  }

  @Get('field-trips/:id/roster')
  @Perms('clinical:read')
  roster(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.svc.roster(u, id);
  }

  @Get('field-trips/:id/roster.pdf')
  @Perms('clinical:read')
  async rosterPdf(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Res() res: Response) {
    const buf = await this.svc.rosterPdf(u, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="salida-pedagogica.pdf"');
    res.send(buf);
  }

  @Get('drills')
  @Perms('clinical:read', 'public_health:manage')
  drills(@CurrentUser() u: AuthUser) {
    return this.svc.drills(u);
  }

  @Post('drills')
  @Perms('public_health:manage')
  createDrill(@CurrentUser() u: AuthUser, @Body(zp(drillSchema)) b: z.infer<typeof drillSchema>, @Meta() m: RequestMeta) {
    return this.svc.createDrill(u, b, m);
  }

  @Get('safety-resources')
  resources(@CurrentUser() u: AuthUser) {
    return this.svc.safetyResources(u);
  }

  @Post('safety-resources')
  @Perms('public_health:manage')
  createResource(@CurrentUser() u: AuthUser, @Body(zp(z.object({ kind: z.enum(['AED', 'BRIGADE_MEMBER', 'EXTINGUISHER', 'MEETING_POINT', 'FIRST_AID_KIT']), name: z.string().min(2).max(120), location: z.string().min(2).max(200), details: z.string().max(500).optional().nullable() }))) b: { kind: string; name: string; location: string; details?: string | null }, @Meta() m: RequestMeta) {
    return this.svc.createSafetyResource(u, b, m);
  }
}
