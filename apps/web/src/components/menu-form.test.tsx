import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { DEFAULT_VALUES } from '@/lib/menu-form';
import { MenuForm } from './menu-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const createDraft = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  createDraft: (...args: unknown[]) => createDraft(...args),
}));

const ID = '0d6b8a8e-9a0a-4a8e-9c69-2f0d3a6c1e11';

function setup() {
  render(<MenuForm initialValues={DEFAULT_VALUES} />);
  return {
    submit: () =>
      fireEvent.click(screen.getByRole('button', { name: 'Generar menú' })),
  };
}

describe('MenuForm', () => {
  beforeEach(() => {
    push.mockReset();
    createDraft.mockReset();
  });

  it('muestra la suma de macros y no envía si no da 100', async () => {
    const { submit } = setup();
    expect(screen.getByText(/Suma: 100 %/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Proteína'), {
      target: { value: '35' },
    });
    expect(screen.getByText(/Suma: 105 % · debe dar 100 %/)).toBeTruthy();

    submit();

    expect(
      await screen.findByText(
        'Los porcentajes suman 105 %: deben sumar 100 %.',
      ),
    ).toBeTruthy();
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('rechaza restricciones de más de 500 caracteres', async () => {
    const { submit } = setup();
    const textarea = screen.getByLabelText(/Restricciones y preferencias/);

    fireEvent.change(textarea, { target: { value: 'a'.repeat(501) } });
    expect(screen.getByText('501/500')).toBeTruthy();
    submit();

    expect(
      await screen.findByText('Usa como máximo 500 caracteres.'),
    ).toBeTruthy();
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('envía una solicitud válida y navega a su progreso', async () => {
    createDraft.mockResolvedValue({ id: ID, status: 'queued' });
    const { submit } = setup();

    // Ejemplo insertado con un clic y una comida más
    fireEvent.click(screen.getByRole('button', { name: 'vegetariano' }));
    fireEvent.click(screen.getByLabelText('Merienda'));
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/drafts/${ID}`));
    expect(createDraft).toHaveBeenCalledWith({
      kcal: 2000,
      macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
      meals: ['desayuno', 'almuerzo', 'merienda', 'cena'],
      restrictions: 'vegetariano',
    });
  });

  it('con la cola llena muestra un aviso para reintentar más tarde', async () => {
    createDraft.mockRejectedValue(
      new ApiError(
        'rate_limited',
        'Hay 10 menús esperando en la cola. Intenta de nuevo en unos minutos.',
      ),
    );
    const { submit } = setup();

    submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Intenta de nuevo en unos minutos',
    );
    expect(push).not.toHaveBeenCalled();
  });
});
