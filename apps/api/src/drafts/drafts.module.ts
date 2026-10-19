import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MenuModule } from '../menu/menu.module.js';
import { MENU_DRAFT_QUEUE, RESULT_TTL_S } from './drafts.constants.js';
import { MenuDraftEvents } from './menu-draft.events.js';
import { MenuDraftProcessor } from './menu-draft.processor.js';
import { MenuDraftQueue } from './menu-draft.queue.js';
import { MenuDraftsController } from './menu-drafts.controller.js';

// Transporte de los menús con IA: cola, worker y endpoints. La lógica está
// en MenuModule (MenuDraftService), que no sabe de colas.
@Module({
  imports: [
    MenuModule,
    BullModule.registerQueue({
      name: MENU_DRAFT_QUEUE,
      defaultJobOptions: {
        // Un solo intento: cada reintento gastaría cuota del proveedor
        attempts: 1,
        // Se guardan 24 h; BullMQ los borra al terminar otros jobs
        removeOnComplete: { age: RESULT_TTL_S },
        removeOnFail: { age: RESULT_TTL_S },
      },
    }),
  ],
  providers: [MenuDraftQueue, MenuDraftProcessor, MenuDraftEvents],
  controllers: [MenuDraftsController],
})
export class DraftsModule {}
