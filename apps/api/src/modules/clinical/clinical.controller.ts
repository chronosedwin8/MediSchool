import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  allergySchema,
  anthropometricSchema,
  annulSchema,
  carePlanSchema,
  chronicConditionSchema,
  deviceSchema,
  disabilitySupportSchema,
  EMERGENCY_PROTOCOLS,
  ENCOUNTER_TEMPLATES,
  healthProfileSchema,
  homeMedicationSchema,
  immunizationSchema,
  isoDate,
  mentalHealthNoteSchema,
  PASS_REASON_CHIPS,
  SCHOOL_ZONES,
  screeningSchema,
  searchIcd10,
  surgicalHistorySchema,
  VACCINES_PAI_CO,
  COMMON_CONDITIONS,
} from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';
import { zp } from '../../common/zod.pipe';
import { FILE_KINDS, MAX_UPLOAD_BYTES } from '../files/storage.service';
import { ClinicalService } from './clinical.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('clinical')
@Controller()
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get('students/:id/health-profile')
  profile(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.clinical.profile(u, id, m);
  }

  @Put('students/:id/health-profile')
  update(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(healthProfileSchema)) b: z.infer<typeof healthProfileSchema>, @Meta() m: RequestMeta) {
    return this.clinical.updateProfile(u, id, b, m);
  }

  @Post('students/:id/allergies')
  allergy(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(allergySchema)) b: z.infer<typeof allergySchema>, @Meta() m: RequestMeta) {
    return this.clinical.addAllergy(u, id, b, m);
  }

  @Post('allergies/:id/annul')
  annulAllergy(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(annulSchema)) b: { reason: string }, @Meta() m: RequestMeta) {
    return this.clinical.annul(u, 'allergy', id, b.reason, m);
  }

  @Post('allergies/:id/verify')
  verifyAllergy(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.clinical.verifyAllergy(u, id, m);
  }

  @Post('students/:id/conditions')
  condition(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(chronicConditionSchema)) b: z.infer<typeof chronicConditionSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addCondition(u, id, b, m);
  }

  @Post('conditions/:id/annul')
  annulCondition(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(annulSchema)) b: { reason: string }, @Meta() m: RequestMeta) {
    return this.clinical.annul(u, 'condition', id, b.reason, m);
  }

  @Post('students/:id/care-plans')
  carePlan(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @Body(zp(carePlanSchema.extend({ title: z.string().min(3).max(150), conditionId: z.string().uuid().optional().nullable() }))) b: z.infer<typeof carePlanSchema> & { title: string; conditionId?: string | null },
    @Meta() m: RequestMeta,
  ) {
    return this.clinical.addCarePlan(u, id, b, m);
  }

  @Post('care-plans/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.clinical.approveCarePlan(u, id, m);
  }

  @Patch('care-plans/:id')
  carePlanActive(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ active: z.boolean() }))) b: { active: boolean }, @Meta() m: RequestMeta) {
    return this.clinical.setActive(u, 'care_plan', id, b.active, m);
  }

  @Post('students/:id/immunizations')
  immunization(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(immunizationSchema)) b: z.infer<typeof immunizationSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addImmunization(u, id, b, m);
  }

  @Post('students/:id/home-medications')
  homeMed(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(homeMedicationSchema)) b: z.infer<typeof homeMedicationSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addHomeMedication(u, id, b, m);
  }

  @Patch('home-medications/:id')
  homeMedActive(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ active: z.boolean() }))) b: { active: boolean }, @Meta() m: RequestMeta) {
    return this.clinical.setActive(u, 'home_medication', id, b.active, m);
  }

  @Post('students/:id/devices')
  device(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(deviceSchema)) b: z.infer<typeof deviceSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addDevice(u, id, b, m);
  }

  @Patch('devices/:id')
  deviceActive(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ active: z.boolean() }))) b: { active: boolean }, @Meta() m: RequestMeta) {
    return this.clinical.setActive(u, 'device', id, b.active, m);
  }

  @Post('students/:id/surgical-history')
  surgical(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(surgicalHistorySchema)) b: z.infer<typeof surgicalHistorySchema>, @Meta() m: RequestMeta) {
    return this.clinical.addSurgical(u, id, b, m);
  }

  @Post('students/:id/disabilities')
  disability(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(disabilitySupportSchema)) b: z.infer<typeof disabilitySupportSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addDisability(u, id, b, m);
  }

  @Post('students/:id/activity-restrictions')
  restriction(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @Body(zp(z.object({ description: z.string().min(3).max(500), validFrom: isoDate, validTo: isoDate.optional().nullable(), certificateFileId: z.string().uuid().optional().nullable() }))) b: { description: string; validFrom: string; validTo?: string | null },
    @Meta() m: RequestMeta,
  ) {
    return this.clinical.addRestriction(u, id, b, m);
  }

  @Post('students/:id/anthropometrics')
  anthropometric(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(anthropometricSchema)) b: z.infer<typeof anthropometricSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addAnthropometric(u, id, b, m);
  }

  @Post('students/:id/screenings')
  screening(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(screeningSchema)) b: z.infer<typeof screeningSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addScreening(u, id, b, m);
  }

  @Post('students/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  document(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body(zp(z.object({ kind: z.enum(FILE_KINDS), title: z.string().min(2).max(150), expiresOn: isoDate.optional() }))) b: { kind: string; title: string; expiresOn?: string },
    @Meta() m: RequestMeta,
  ) {
    return this.clinical.addDocument(u, id, file, b, m);
  }

  @Post('mental-health-notes')
  @Perms('mental_health:write')
  mhNote(@CurrentUser() u: AuthUser, @Body(zp(mentalHealthNoteSchema)) b: z.infer<typeof mentalHealthNoteSchema>, @Meta() m: RequestMeta) {
    return this.clinical.addMentalHealthNote(u, b, m);
  }

  @Get('students/:id/mental-health-notes')
  @Perms('mental_health:read')
  mhNotes(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta) {
    return this.clinical.mentalHealthNotes(u, id, m);
  }

  @Get('files/:id')
  async download(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Meta() m: RequestMeta, @Res() res: Response) {
    const { file, data } = await this.clinical.fileForDownload(u, id, m);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(data);
  }
}

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('icd10')
  icd10(@Query('q') q = '') {
    return searchIcd10(q, 25);
  }

  @Get('templates')
  templates() {
    return ENCOUNTER_TEMPLATES;
  }

  @Get('protocols')
  protocols() {
    return EMERGENCY_PROTOCOLS;
  }

  @Get('zones')
  zones() {
    return SCHOOL_ZONES;
  }

  @Get('pass-reasons')
  reasons() {
    return PASS_REASON_CHIPS;
  }

  @Get('vaccines')
  vaccines() {
    return VACCINES_PAI_CO;
  }

  @Get('conditions')
  conditions() {
    return COMMON_CONDITIONS;
  }

  @Get('medications')
  medications(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    return this.prisma.forUser(u, (tx) =>
      tx.medicationCatalog.findMany({
        where: { active: true, ...(q ? { OR: [{ genericName: { contains: q, mode: 'insensitive' } }, { brandNames: { hasSome: [q] } }] } : {}) },
        orderBy: [{ genericName: 'asc' }, { form: 'asc' }],
        take: 50,
      }),
    );
  }
}
