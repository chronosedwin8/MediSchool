import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { emergencyContactSchema, guardianLinkSchema, invitationCreateSchema, studentSearchSchema } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { notFound } from '../../common/errors';
import { zp } from '../../common/zod.pipe';
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

  @Get('students/:id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query('refresh') refresh: string, @Res() res: Response) {
    const url = await this.people.photoUrl(user, id, refresh === '1');
    if (!url) throw notFound('Foto');
    res.setHeader('Cache-Control', 'private, max-age=3000');
    res.redirect(302, url);
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
  structure(@CurrentUser() user: AuthUser) {
    return this.people.structure(user);
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
