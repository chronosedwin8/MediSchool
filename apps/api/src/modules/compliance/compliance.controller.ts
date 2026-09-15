import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { consentOtpRequestSchema, consentRevokeSchema, consentSignSchema, consentTemplateSchema, dsrCreateSchema, dsrResolveSchema, legalHoldSchema, mandatoryReportSchema } from '@sgee/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { ComplianceService } from './compliance.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('compliance')
@Controller()
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('compliance/profiles')
  @Perms('compliance:manage')
  profiles(@CurrentUser() u: AuthUser) {
    return this.svc.profiles(u);
  }

  @Post('compliance/profiles/:country/activate')
  @Perms('compliance:manage')
  @HttpCode(200)
  activate(@CurrentUser() u: AuthUser, @Param('country') country: string, @Meta() m: RequestMeta) {
    return this.svc.activateProfile(u, country.toUpperCase(), m);
  }

  @Put('compliance/profiles/:country')
  @Perms('compliance:manage')
  updateRules(@CurrentUser() u: AuthUser, @Param('country') country: string, @Body(zp(z.record(z.string(), z.unknown()))) b: Record<string, unknown>, @Meta() m: RequestMeta) {
    return this.svc.updateProfileRules(u, country.toUpperCase(), b, m);
  }

  @Get('compliance/checklist')
  @Perms('compliance:manage', 'audit:read')
  checklist(@CurrentUser() u: AuthUser) {
    return this.svc.checklist(u);
  }

  @Get('consent-templates')
  templates(@CurrentUser() u: AuthUser, @Query('all') all?: string) {
    return this.svc.templates(u, all === 'true');
  }

  @Post('consent-templates')
  @Perms('compliance:manage')
  createTemplate(@CurrentUser() u: AuthUser, @Body(zp(consentTemplateSchema)) b: z.infer<typeof consentTemplateSchema>, @Meta() m: RequestMeta) {
    return this.svc.createTemplate(u, b, m);
  }

  @Get('students/:id/consents')
  studentConsents(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.svc.studentConsents(u, id);
  }

  @Post('consents/otp')
  @Perms('consents:sign')
  @HttpCode(200)
  otp(@CurrentUser() u: AuthUser, @Body(zp(consentOtpRequestSchema)) b: z.infer<typeof consentOtpRequestSchema>) {
    return this.svc.requestOtp(u, b.templateId, b.studentId);
  }

  @Post('consents')
  @Perms('consents:sign')
  sign(@CurrentUser() u: AuthUser, @Body(zp(consentSignSchema)) b: z.infer<typeof consentSignSchema>, @Meta() m: RequestMeta) {
    return this.svc.sign(u, b, m);
  }

  @Post('consents/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(consentRevokeSchema)) b: { reason: string }, @Meta() m: RequestMeta) {
    return this.svc.revoke(u, id, b.reason, m);
  }

  @Post('dsr')
  createDsr(@CurrentUser() u: AuthUser, @Body(zp(dsrCreateSchema)) b: z.infer<typeof dsrCreateSchema>, @Meta() m: RequestMeta) {
    return this.svc.createDsr(u, b, m);
  }

  @Get('dsr')
  listDsr(@CurrentUser() u: AuthUser) {
    return this.svc.listDsr(u);
  }

  @Post('dsr/:id/resolve')
  @Perms('compliance:manage')
  @HttpCode(200)
  resolveDsr(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(dsrResolveSchema)) b: z.infer<typeof dsrResolveSchema>, @Meta() m: RequestMeta) {
    return this.svc.resolveDsr(u, id, b, m);
  }

  @Post('persons/:id/export')
  @Perms('compliance:manage')
  @HttpCode(200)
  exportPerson(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Query('dsrId') dsrId: string | undefined, @Meta() m: RequestMeta) {
    return this.svc.exportSubject(u, id, dsrId ?? null, m);
  }

  @Get('legal-holds')
  @Perms('compliance:manage')
  holds(@CurrentUser() u: AuthUser) {
    return this.svc.legalHolds(u);
  }

  @Post('legal-holds')
  @Perms('compliance:manage')
  createHold(@CurrentUser() u: AuthUser, @Body(zp(legalHoldSchema)) b: z.infer<typeof legalHoldSchema>, @Meta() m: RequestMeta) {
    return this.svc.createHold(u, b, m);
  }

  @Post('legal-holds/:id/release')
  @Perms('compliance:manage')
  @HttpCode(200)
  release(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.svc.releaseHold(u, id, m);
  }

  @Get('retention/policies')
  @Perms('compliance:manage')
  policies(@CurrentUser() u: AuthUser) {
    return this.svc.retentionPolicies(u);
  }

  @Put('retention/policies/:entity')
  @Perms('compliance:manage')
  setPolicy(@CurrentUser() u: AuthUser, @Param('entity') entity: string, @Body(zp(z.object({ retentionYears: z.number().int().min(1).max(100), action: z.enum(['REVIEW', 'ANONYMIZE', 'ARCHIVE']), active: z.boolean().default(true) }))) b: { retentionYears: number; action: string; active: boolean }, @Meta() m: RequestMeta) {
    return this.svc.setRetentionPolicy(u, entity, b, m);
  }

  @Get('retention/flags')
  @Perms('compliance:manage')
  flags(@CurrentUser() u: AuthUser) {
    return this.svc.retentionFlags(u);
  }

  @Post('retention/flags/:id')
  @Perms('compliance:manage')
  @HttpCode(200)
  flag(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ status: z.enum(['ACTIONED', 'HELD']) }))) b: { status: 'ACTIONED' | 'HELD' }, @Meta() m: RequestMeta) {
    return this.svc.setRetentionFlag(u, id, b.status, m);
  }

  @Get('mandatory-reports')
  @Perms('compliance:manage', 'clinical:write')
  reports(@CurrentUser() u: AuthUser) {
    return this.svc.mandatoryReports(u);
  }

  @Post('mandatory-reports')
  @Perms('compliance:manage', 'clinical:write')
  createReport(@CurrentUser() u: AuthUser, @Body(zp(mandatoryReportSchema)) b: z.infer<typeof mandatoryReportSchema>, @Meta() m: RequestMeta) {
    return this.svc.createMandatoryReport(u, b, m);
  }

  @Patch('mandatory-reports/:id')
  @Perms('compliance:manage', 'clinical:write')
  updateReport(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @Body(zp(z.object({ details: z.string().min(5).max(8000).optional(), filedReference: z.string().max(100).optional().nullable(), status: z.enum(['DRAFT', 'FILED']).optional() }))) b: { details?: string; filedReference?: string | null; status?: 'DRAFT' | 'FILED' },
    @Meta() m: RequestMeta,
  ) {
    return this.svc.updateMandatoryReport(u, id, b, m);
  }

  @Get('clinical-access-log')
  @Perms('audit:read', 'compliance:manage')
  accessLog(@CurrentUser() u: AuthUser, @Query('userId') userId?: string, @Query('personId') personId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('outOfRole') outOfRole?: string) {
    return this.svc.accessLog(u, { userId, personId, from, to, outOfRole: outOfRole === 'true' });
  }
}
