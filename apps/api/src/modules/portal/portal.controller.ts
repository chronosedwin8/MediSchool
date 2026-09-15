import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Perms } from '../../common/auth';
import { PortalService } from './portal.service';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('home')
  @Perms('guardian:portal')
  home(@CurrentUser() u: AuthUser) {
    return this.portal.home(u);
  }

  @Get('student')
  @Perms('student:portal')
  student(@CurrentUser() u: AuthUser) {
    return this.portal.student(u);
  }
}
