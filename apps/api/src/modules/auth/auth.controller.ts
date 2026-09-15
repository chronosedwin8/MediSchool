import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { changePasswordSchema, kioskLoginSchema, loginSchema, mfaEnableSchema, mfaVerifySchema, parentRegisterSchema } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AllowWhenPasswordChangeRequired, type AppRequest, type AuthUser, CurrentUser, Meta, Public, type RequestMeta } from '../../common/auth';
import { notFound } from '../../common/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/guards';
import { zp } from '../../common/zod.pipe';
import { config } from '../../config';
import { AuthService, type SessionTokens } from './auth.service';

function setCookies(res: Response, s: SessionTokens) {
  const secure = config().COOKIE_SECURE;
  res.cookie(ACCESS_COOKIE, s.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 15 * 60_000 });
  res.cookie(REFRESH_COOKIE, s.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1/auth', maxAge: s.refreshMaxAgeMs });
}

function sessionBody(s: SessionTokens) {
  return { accessToken: s.accessToken, user: s.user };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(zp(loginSchema)) body: z.infer<typeof loginSchema>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.email, body.password, body.tenantSlug, meta);
    if ('mfaRequired' in r) return r;
    setCookies(res, r);
    return sessionBody(r);
  }

  @Public()
  @Post('mfa/setup-challenge')
  @HttpCode(200)
  mfaSetupChallenge(@Body(zp(z.object({ challengeToken: z.string() }))) body: { challengeToken: string }) {
    return this.auth.mfaSetupWithChallenge(body.challengeToken);
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async mfaVerify(@Body(zp(mfaVerifySchema)) body: z.infer<typeof mfaVerifySchema>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.verifyMfa(body.challengeToken, body.code, meta);
    setCookies(res, s);
    return sessionBody(s);
  }

  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@CurrentUser() user: AuthUser, @Body(zp(mfaEnableSchema)) body: { code: string }, @Meta() meta: RequestMeta) {
    return this.auth.mfaEnable(user, body.code, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Body() body: { refreshToken?: string }, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const token = (req as unknown as { cookies: Record<string, string> }).cookies?.[REFRESH_COOKIE] ?? body?.refreshToken;
    const s = await this.auth.refresh(token ?? '', meta);
    setCookies(res, s);
    return { ...sessionBody(s), refreshToken: req.headers['x-client'] === 'mobile' ? s.refreshToken : undefined };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.user, (req as unknown as { cookies: Record<string, string> }).cookies?.[REFRESH_COOKIE], meta);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public()
  @Post('kiosk')
  @HttpCode(200)
  async kiosk(@Body(zp(kioskLoginSchema)) body: z.infer<typeof kioskLoginSchema>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.kioskLogin(body.tenantSlug, body.deviceCode, body.pin, meta);
    setCookies(res, s);
    return sessionBody(s);
  }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @AllowWhenPasswordChangeRequired()
  @Post('password')
  @HttpCode(200)
  async password(@CurrentUser() user: AuthUser, @Body(zp(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.changePassword(user, body.currentPassword, body.newPassword, meta);
    setCookies(res, s);
    return sessionBody(s);
  }

  @Public()
  @Post('register-parent')
  async registerParent(@Body(zp(parentRegisterSchema)) body: z.infer<typeof parentRegisterSchema>, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.registerParent(body, meta);
    setCookies(res, s);
    return sessionBody(s);
  }

  @Get('ws-token')
  wsToken(@CurrentUser() user: AuthUser) {
    return this.auth.wsToken(user);
  }

  @Public()
  @Get('tenant/:slug')
  async tenant(@Param('slug') slug: string) {
    const t = await this.auth.tenantInfo(slug);
    if (!t) throw notFound('Colegio');
    return t;
  }
}
