import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import {
  MenuRequestSchema,
  type DraftCreated,
  type MenuDraftJob,
  type MenuRequest,
} from '@bocado/shared';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MenuDraftQueue } from './menu-draft.queue.js';

// Un id que no es UUID no puede existir: 404 igual que uno desconocido
function draftId(id: string): string {
  if (!z.uuid().safeParse(id).success) {
    throw new NotFoundException('No existe ese menú');
  }
  return id;
}

@Controller('menu/drafts')
export class MenuDraftsController {
  constructor(private readonly drafts: MenuDraftQueue) {}

  // Valida antes de encolar (400) y responde de inmediato con el id: el
  // menú se genera en el worker
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body(new ZodValidationPipe(MenuRequestSchema)) request: MenuRequest,
  ): Promise<DraftCreated> {
    return this.drafts.enqueue(request);
  }

  @Get(':id')
  async find(@Param('id') id: string): Promise<MenuDraftJob> {
    const job = await this.drafts.find(draftId(id));
    if (!job) throw new NotFoundException('No existe ese menú');
    return job;
  }

  // El 404 se decide antes de abrir el stream, así llega como respuesta
  // HTTP normal y no como evento
  @Sse(':id/events')
  async events(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    if (!(await this.drafts.find(draftId(id)))) {
      throw new NotFoundException('No existe ese menú');
    }
    return this.drafts.stream(id);
  }
}
