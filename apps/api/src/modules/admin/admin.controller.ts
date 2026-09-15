import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { auditQuerySchema, hhmm, userCreateSchema, userUpdateSchema } from '@sgee/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { AdminService } from './admin.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @Perms('admin:users')
  users(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('role') role?: string, @Query('active') active?: string) {
    return this.admin.users(u, { q, role, active });
  }

  @Post('users')
  @Perms('admin:users')
  createUser(@CurrentUser() u: AuthUser, @Body(zp(userCreateSchema)) b: z.infer<typeof userCreateSchema>, @Meta() m: RequestMeta) {
    return this.admin.createUser(u, b, m);
  }

  @Patch('users/:id')
  @Perms('admin:users')
  updateUser(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @Body(zp(userUpdateSchema.extend({ resetPassword: z.boolean().optional(), unlock: z.boolean().optional(), resetMfa: z.boolean().optional() }))) b: z.infer<typeof userUpdateSchema> & { resetPassword?: boolean; unlock?: boolean; resetMfa?: boolean },
    @Meta() m: RequestMeta,
  ) {
    return this.admin.updateUser(u, id, b, m);
  }

  @Get('roles')
  @Perms('admin:users')
  roles(@CurrentUser() u: AuthUser) {
    return this.admin.roleMatrix(u);
  }

  @Put('roles/:role')
  @Perms('admin:users')
  setRole(@CurrentUser() u: AuthUser, @Param('role') role: string, @Body(zp(z.object({ permissions: z.array(z.string()) }))) b: { permissions: string[] }, @Meta() m: RequestMeta) {
    return this.admin.setRolePermissions(u, role, b.permissions, m);
  }

  @Get('settings')
  @Perms('admin:settings')
  settings(@CurrentUser() u: AuthUser) {
    return this.admin.getSettings(u);
  }

  @Put('settings')
  @Perms('admin:settings')
  updateSettings(
    @CurrentUser() u: AuthUser,
    @Body(zp(z.object({ name: z.string().min(3).max(150).optional(), timezone: z.string().max(60).optional(), logoUrl: z.string().url().optional().nullable(), settings: z.record(z.string(), z.unknown()).optional() }))) b: { name?: string; timezone?: string; logoUrl?: string | null; settings?: Record<string, unknown> },
    @Meta() m: RequestMeta,
  ) {
    return this.admin.updateSettings(u, b, m);
  }

  @Get('audit')
  @Perms('audit:read')
  audit(@CurrentUser() u: AuthUser, @Query(zp(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>) {
    return this.admin.auditLog(u, q);
  }

  @Get('audit/verify')
  @Perms('audit:read')
  verifyAudit(@CurrentUser() u: AuthUser) {
    return this.admin.verifyAudit(u);
  }

  @Get('system')
  @Perms('admin:settings', 'admin:integrations')
  system(@CurrentUser() u: AuthUser) {
    return this.admin.system(u);
  }

  @Get('jobs')
  @Perms('admin:integrations')
  jobs(@CurrentUser() u: AuthUser) {
    return this.admin.recentJobs(u);
  }

  @Post('jobs/:name/run')
  @Perms('admin:integrations')
  @HttpCode(200)
  runJob(@CurrentUser() u: AuthUser, @Param('name') name: string, @Meta() m: RequestMeta) {
    return this.admin.runJob(u, name, m);
  }

  @Get('backups/verify')
  @Perms('admin:integrations')
  verifyBackup(@CurrentUser() u: AuthUser) {
    return this.admin.verifyBackup(u);
  }

  @Get('schedule-blocks')
  @Perms('admin:settings', 'people:write')
  blocks(@CurrentUser() u: AuthUser, @Query('groupId') groupId?: string) {
    return this.admin.scheduleBlocks(u, groupId);
  }

  @Post('schedule-blocks')
  @Perms('admin:settings', 'people:write')
  createBlock(
    @CurrentUser() u: AuthUser,
    @Body(zp(z.object({ groupId: z.string().uuid(), dayOfWeek: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm, subject: z.string().min(2).max(80), teacherUserId: z.string().uuid().optional().nullable() }))) b: { groupId: string; dayOfWeek: number; startTime: string; endTime: string; subject: string; teacherUserId?: string | null },
    @Meta() m: RequestMeta,
  ) {
    return this.admin.createScheduleBlock(u, b, m);
  }

  @Post('import/students')
  @Perms('people:write')
  importStudents(@CurrentUser() u: AuthUser, @Body(zp(z.object({ csv: z.string().min(10).max(5_000_000) }))) b: { csv: string }, @Meta() m: RequestMeta) {
    return this.admin.importStudentsCsv(u, b.csv, m);
  }

  @Get('tenants')
  @Perms('tenants:manage')
  tenants(@CurrentUser() u: AuthUser) {
    return this.admin.tenants(u);
  }

  @Post('tenants')
  @Perms('tenants:manage')
  createTenant(
    @CurrentUser() u: AuthUser,
    @Body(zp(z.object({ slug: z.string().regex(/^[a-z0-9-]{3,40}$/), name: z.string().min(3).max(150), country: z.string().length(2), adminEmail: z.string().email() }))) b: { slug: string; name: string; country: string; adminEmail: string },
    @Meta() m: RequestMeta,
  ) {
    return this.admin.createTenant(u, b, m);
  }
}
