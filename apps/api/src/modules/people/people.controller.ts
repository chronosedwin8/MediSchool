import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import {
  emergencyContactSchema,
  gradeUpsertSchema,
  groupUpsertSchema,
  guardianLinkSchema,
  invitationCreateSchema,
  sectionUpsertSchema,
  studentCreateSchema,
  studentSearchSchema,
  studentUpdateSchema,
} from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { notFound } from '../../common/errors';
import { zp } from '../../common/zod.pipe';
import { MAX_PHOTO_BYTES } from '../files/storage.service';
import { PeopleService } from './people.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('people')
@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('students')
  search(@CurrentUser() user: AuthUser, @Query(zp(studentSearchSchema)) q: z.infer<typeof studentSearchSchema>) {
    return this.people.search(user, q);
  }

  @Get('students/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.people.detail(user, id, meta);
  }

  @Post('students')
  @Perms('people:write')
  createStudent(@CurrentUser() user: AuthUser, @Body(zp(studentCreateSchema)) body: z.infer<typeof studentCreateSchema>, @Meta() meta: RequestMeta) {
    return this.people.createStudent(user, body, meta);
  }

  @Patch('students/:id')
  @Perms('people:write')
  updateStudent(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(studentUpdateSchema)) body: z.infer<typeof studentUpdateSchema>, @Meta() meta: RequestMeta) {
    return this.people.updateStudent(user, id, body, meta);
  }

  @Get('students/:id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query('refresh') refresh: string, @Res() res: Response) {
    const r = await this.people.photo(user, id, refresh === '1');
    if (!r) throw notFound('Foto');
    if ('redirect' in r) {
      res.setHeader('Cache-Control', 'private, max-age=3000');
      return res.redirect(302, r.redirect);
    }
    res.setHeader('Content-Type', r.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(r.data);
  }

  @Post('students/:id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  uploadPhoto(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @UploadedFile() file: Express.Multer.File, @Meta() meta: RequestMeta) {
    return this.people.uploadPhoto(user, id, file, meta);
  }

  @Delete('students/:id/photo')
  removePhoto(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.people.removePhoto(user, id, meta);
  }

  @Get('students/:id/timeline')
  timeline(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.people.timeline(user, id, meta);
  }

  @Get('students/:id/emergency-card')
  @Perms('clinical:read')
  emergency(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    return this.people.emergencyCard(user, id, meta);
  }

  @Post('students/:id/guardians')
  linkGuardian(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(guardianLinkSchema)) body: z.infer<typeof guardianLinkSchema>, @Meta() meta: RequestMeta) {
    return this.people.linkGuardian(user, id, body, meta);
  }

  @Patch('students/:id/guardians/:linkId')
  updateGuardian(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('linkId', uuid) linkId: string,
    @Body(zp(guardianLinkSchema.partial().extend({ judicialRestriction: z.boolean().optional(), active: z.boolean().optional() }))) body: Record<string, unknown>,
    @Meta() meta: RequestMeta,
  ) {
    return this.people.updateGuardianLink(user, id, linkId, body, meta);
  }

  @Post('students/:id/emergency-contacts')
  addContact(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(emergencyContactSchema)) body: z.infer<typeof emergencyContactSchema>, @Meta() meta: RequestMeta) {
    return this.people.addEmergencyContact(user, id, body, meta);
  }

  @Patch('students/:id/emergency-contacts/:contactId')
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('contactId', uuid) contactId: string,
    @Body(zp(emergencyContactSchema.partial().extend({ active: z.boolean().optional(), verified: z.boolean().optional() }))) body: Record<string, unknown>,
    @Meta() meta: RequestMeta,
  ) {
    return this.people.updateEmergencyContact(user, id, contactId, body, meta);
  }

  @Post('invitations')
  invitation(@CurrentUser() user: AuthUser, @Body(zp(invitationCreateSchema)) body: z.infer<typeof invitationCreateSchema>, @Meta() meta: RequestMeta) {
    return this.people.createInvitation(user, body, meta);
  }

  @Get('structure')
  structure(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.people.structure(user, all === '1' || all === 'true');
  }

  @Post('structure/sections')
  @Perms('people:write', 'admin:settings')
  createSection(@CurrentUser() user: AuthUser, @Body(zp(sectionUpsertSchema)) body: z.infer<typeof sectionUpsertSchema>, @Meta() meta: RequestMeta) {
    return this.people.createSection(user, body, meta);
  }

  @Patch('structure/sections/:id')
  @Perms('people:write', 'admin:settings')
  updateSection(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(sectionUpsertSchema.partial())) body: Partial<z.infer<typeof sectionUpsertSchema>>, @Meta() meta: RequestMeta) {
    return this.people.updateSection(user, id, body, meta);
  }

  @Post('structure/grades')
  @Perms('people:write', 'admin:settings')
  createGrade(@CurrentUser() user: AuthUser, @Body(zp(gradeUpsertSchema)) body: z.infer<typeof gradeUpsertSchema>, @Meta() meta: RequestMeta) {
    return this.people.createGrade(user, body, meta);
  }

  @Patch('structure/grades/:id')
  @Perms('people:write', 'admin:settings')
  updateGrade(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(gradeUpsertSchema.partial())) body: Partial<z.infer<typeof gradeUpsertSchema>>, @Meta() meta: RequestMeta) {
    return this.people.updateGrade(user, id, body, meta);
  }

  @Post('structure/groups')
  @Perms('people:write', 'admin:settings')
  createGroup(@CurrentUser() user: AuthUser, @Body(zp(groupUpsertSchema)) body: z.infer<typeof groupUpsertSchema>, @Meta() meta: RequestMeta) {
    return this.people.createGroup(user, body, meta);
  }

  @Patch('structure/groups/:id')
  @Perms('people:write', 'admin:settings')
  updateGroup(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(zp(groupUpsertSchema.partial())) body: Partial<z.infer<typeof groupUpsertSchema>>, @Meta() meta: RequestMeta) {
    return this.people.updateGroup(user, id, body, meta);
  }

  @Get('teacher/class')
  @Perms('passes:create')
  teacherClass(@CurrentUser() user: AuthUser) {
    return this.people.teacherClass(user);
  }

  @Get('clinical-staff')
  @Perms('clinical:read')
  clinicalStaff(@CurrentUser() user: AuthUser) {
    return this.people.clinicalStaff(user);
  }

  @Get('staff')
  @Perms('clinical:read', 'people:write')
  staff(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.people.staff(user, q);
  }

  @Post('staff')
  createStaff(
    @CurrentUser() user: AuthUser,
    @Body(zp(z.object({ firstName: z.string().min(1).max(100), lastName: z.string().min(1).max(100), documentNumber: z.string().min(3).max(30), position: z.string().max(100).optional().nullable(), isFirstResponder: z.boolean().optional() })))
    body: { firstName: string; lastName: string; documentNumber: string; position?: string | null; isFirstResponder?: boolean },
    @Meta() meta: RequestMeta,
  ) {
    return this.people.createStaff(user, body, meta);
  }
}
