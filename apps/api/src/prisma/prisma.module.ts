import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global: cualquier módulo puede inyectar PrismaService sin importar
// PrismaModule.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
