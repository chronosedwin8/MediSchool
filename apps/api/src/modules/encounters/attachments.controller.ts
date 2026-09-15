import { Body, Controller, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { badRequest, conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { zp } from '../../common/zod.pipe';
import { ComplianceService } from '../compliance/compliance.service';
import { MAX_UPLOAD_BYTES, StorageService } from '../files/storage.service';

@ApiTags('encounters')
@Controller('encounters')
export class EncounterAttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  /** Injury photos require the PHOTO_INJURY consent of the guardian (ConsentGuard). */
  @Post(':id/attachments')
  @Perms('encounters:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() u: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body(zp(z.object({ kind: z.enum(['INJURY_PHOTO', 'ATTACHMENT', 'MEDICAL_CERTIFICATE']) }))) b: { kind: string },
    @Meta() m: RequestMeta,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Adjunte el archivo.');
    const e = await this.prisma.forUser(u, async (tx) => {
      const enc = await tx.encounter.findUnique({ where: { id } });
      if (!enc) throw notFound('Atención');
      if (enc.status === 'ANNULLED') throw conflict('ENCOUNTER_ANNULLED', 'La atención está anulada.');
      if (b.kind === 'INJURY_PHOTO' && enc.studentId && !(await this.compliance.hasConsent(tx, enc.studentId, 'PHOTO_INJURY'))) {
        throw conflict('CONSENT_REQUIRED', 'El acudiente no ha autorizado fotografías de lesiones.');
      }
      return enc;
    });
    const stored = await this.storage.save(u, { buffer: file.buffer, originalName: file.originalname, kind: b.kind, ownerPersonId: e.personId });
    return this.prisma.forUser(u, async (tx) => {
      const att = await tx.encounterAttachment.create({ data: { tenantId: u.tenantId, encounterId: id, fileId: stored.id, kind: b.kind, consentVerified: b.kind === 'INJURY_PHOTO', createdBy: u.id } });
      await this.audit.log(tx, { tenantId: u.tenantId, actor: u, action: 'clinical.attachment_added', entity: 'encounter_attachment', entityId: att.id, after: { encounterId: id, kind: b.kind, size: stored.size }, meta: m });
      return { ...att, file: { id: stored.id, name: stored.originalName, mimeType: stored.mimeType, size: stored.size } };
    });
  }
}
