import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { administrationSchema, custodyReceiveSchema, custodyReturnSchema, medicationRequestSchema, medicationReviewSchema, medicationStatusChangeSchema } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { type AuthUser, can, CurrentUser, hasRole, Idempotent, Meta, Perms, type RequestMeta } from '../../common/auth';
import { badRequest, forbidden } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { zp } from '../../common/zod.pipe';
import { FILE_KINDS, MAX_UPLOAD_BYTES, StorageService } from '../files/storage.service';
import { MedsService } from './meds.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('meds')
@Controller()
export class MedsController {
  constructor(
    private readonly meds: MedsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Post('medication-requests')
  @Perms('meds:request', 'meds:approve')
  create(@CurrentUser() u: AuthUser, @Body(zp(medicationRequestSchema)) b: z.infer<typeof medicationRequestSchema>, @Meta() m: RequestMeta) {
    return this.meds.createRequest(u, b, m);
  }

  @Get('medication-requests')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('studentId') studentId?: string) {
    return this.meds.list(u, { status, studentId });
  }

  @Get('medication-requests/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.meds.detail(u, id);
  }

  @Post('medication-requests/:id/review')
  @Perms('meds:approve')
  @HttpCode(200)
  review(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(medicationReviewSchema)) b: z.infer<typeof medicationReviewSchema>, @Meta() m: RequestMeta) {
    return this.meds.review(u, id, b, m);
  }

  @Post('medication-requests/:id/status')
  @HttpCode(200)
  status(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(medicationStatusChangeSchema)) b: z.infer<typeof medicationStatusChangeSchema>, @Meta() m: RequestMeta) {
    return this.meds.changeStatus(u, id, b, m);
  }

  @Post('medication-custody')
  @Perms('meds:approve')
  custody(@CurrentUser() u: AuthUser, @Body(zp(custodyReceiveSchema)) b: z.infer<typeof custodyReceiveSchema>, @Meta() m: RequestMeta) {
    return this.meds.receiveCustody(u, b, m);
  }

  @Post('medication-custody/:id/close')
  @Perms('meds:approve')
  @HttpCode(200)
  closeCustody(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(custodyReturnSchema)) b: z.infer<typeof custodyReturnSchema>, @Meta() m: RequestMeta) {
    return this.meds.returnCustody(u, id, b, m);
  }

  @Get('medication-schedule/today')
  @Perms('meds:administer')
  today(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.meds.today(u, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  }

  @Post('administrations')
  @Perms('meds:administer')
  @Idempotent()
  administer(@CurrentUser() u: AuthUser, @Body(zp(administrationSchema)) b: z.infer<typeof administrationSchema>, @Meta() m: RequestMeta) {
    return this.meds.administer(u, b, m);
  }

  @Get('students/:id/mar')
  mar(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Query('month') month: string) {
    return this.meds.mar(u, id, /^\d{4}-\d{2}$/.test(month ?? '') ? month : new Date().toISOString().slice(0, 7));
  }

  @Get('students/:id/mar/pdf')
  async marPdf(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Query('month') month: string, @Res() res: Response) {
    const buf = await this.meds.marPdf(u, id, /^\d{4}-\d{2}$/.test(month ?? '') ? month : new Date().toISOString().slice(0, 7));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="mar-${month}.pdf"`);
    res.send(buf);
  }

  /** Generic secure upload (prescriptions from the parent's phone camera, excuses, certificates). */
  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() u: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body(zp(z.object({ kind: z.enum(FILE_KINDS), studentId: z.string().uuid().optional() }))) b: { kind: string; studentId?: string },
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Adjunte el archivo.');
    let ownerPersonId: string | null = null;
    if (b.studentId) {
      const s = await this.prisma.forUser(u, async (tx) => {
        const isParent = hasRole(u, 'PARENT') && (await this.access.childrenIds(tx, u)).includes(b.studentId!);
        if (!isParent && !can(u, 'clinical:write', 'meds:approve')) throw forbidden();
        return tx.student.findUniqueOrThrow({ where: { id: b.studentId } });
      });
      ownerPersonId = s.personId;
    }
    const stored = await this.storage.save(u, { buffer: file.buffer, originalName: file.originalname, kind: b.kind, ownerPersonId });
    return { id: stored.id, name: stored.originalName, mimeType: stored.mimeType, size: stored.size, sha256: stored.sha256 };
  }
}
