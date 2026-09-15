import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { circularSchema, messageCreateSchema, notificationPreferencesSchema, templateUpdateSchema } from '@sgee/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, Public, type RequestMeta } from '../../common/auth';
import { forbidden } from '../../common/errors';
import { zp } from '../../common/zod.pipe';
import { CommsService } from './comms.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('comms')
@Controller()
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Get('notifications')
  inbox(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.comms.inbox(u, unread === 'true', Number(limit) || 50);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentUser() u: AuthUser) {
    return this.comms.markRead(u, 'all');
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.comms.markRead(u, id);
  }

  @Get('notifications/outbound')
  @Perms('comms:send', 'audit:read')
  outbound(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('channel') channel?: string, @Query('event') event?: string) {
    return this.comms.outbound(u, { status, channel, event });
  }

  @Get('me/notification-preferences')
  prefs(@CurrentUser() u: AuthUser) {
    return this.comms.preferences(u);
  }

  @Put('me/notification-preferences')
  updatePrefs(@CurrentUser() u: AuthUser, @Body(zp(notificationPreferencesSchema)) b: z.infer<typeof notificationPreferencesSchema>, @Meta() m: RequestMeta) {
    return this.comms.updatePreferences(u, b, m);
  }

  @Post('push-subscriptions')
  push(@CurrentUser() u: AuthUser, @Body(zp(z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }))) b: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.comms.subscribePush(u, b);
  }

  @Get('threads')
  threads(@CurrentUser() u: AuthUser) {
    return this.comms.threads(u);
  }

  @Get('threads/:id')
  thread(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.comms.thread(u, id);
  }

  @Post('messages')
  message(@CurrentUser() u: AuthUser, @Body(zp(messageCreateSchema)) b: z.infer<typeof messageCreateSchema>, @Meta() m: RequestMeta) {
    return this.comms.postMessage(u, b, m);
  }

  @Get('circulars')
  circulars(@CurrentUser() u: AuthUser) {
    return this.comms.circulars(u);
  }

  @Post('circulars')
  @Perms('comms:circulars')
  createCircular(@CurrentUser() u: AuthUser, @Body(zp(circularSchema)) b: z.infer<typeof circularSchema>, @Meta() m: RequestMeta) {
    return this.comms.createCircular(u, b, m);
  }

  @Get('circulars/:id')
  circular(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.comms.readCircular(u, id);
  }

  @Get('notification-templates')
  @Perms('admin:settings')
  templates(@CurrentUser() u: AuthUser) {
    return this.comms.templates(u);
  }

  @Put('notification-templates/:event/:channel')
  @Perms('admin:settings')
  updateTemplate(@CurrentUser() u: AuthUser, @Param('event') event: string, @Param('channel') channel: string, @Body(zp(templateUpdateSchema)) b: z.infer<typeof templateUpdateSchema>, @Meta() m: RequestMeta) {
    return this.comms.updateTemplate(u, event, channel, b, m);
  }

  @Public()
  @Get('webhooks/whatsapp')
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) return challenge;
    throw forbidden();
  }

  @Public()
  @Post('webhooks/whatsapp')
  @HttpCode(200)
  webhook(@Body() payload: Record<string, unknown>) {
    return this.comms.whatsappWebhook(payload as never);
  }
}
