import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { ExpiryService } from './expiry.service';
import { GradingService } from './grading.service';
import { IntegrityService } from './integrity.service';

/** Domain services shared by the API and the worker process. */
@Global()
@Module({
  providers: [AuditService, GradingService, ExpiryService, IntegrityService],
  exports: [AuditService, GradingService, ExpiryService, IntegrityService],
})
export class CoreModule {}
