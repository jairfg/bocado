import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Bocado · Menús diarios con IA',
    template: '%s · Bocado',
  },
  description:
    'Genera un menú diario con tus metas de calorías y macros: la IA elige alimentos reales y el código calcula las porciones exactas.',
};

// Componente de servidor: no tiene estado ni eventos, así que no envía
// JavaScript al navegador
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
        >
          Saltar al contenido
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold tracking-tight"
            >
              <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
                <rect width="32" height="32" rx="8" className="fill-primary" />
                <path
                  d="M7 15h18a9 9 0 0 1-18 0Z"
                  className="fill-primary-foreground"
                />
                <path
                  d="M12 12c0-2 2-2 2-4m4 4c0-2 2-2 2-4"
                  className="stroke-primary-foreground"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <span className="text-lg">Bocado</span>
            </Link>
            <p className="hidden text-sm text-muted sm:block">
              Menús diarios con IA · datos de USDA
            </p>
          </div>
        </header>
        <main
          id="contenido"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10"
        >
          {children}
        </main>
        <footer className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
            Bocado · prototipo: la IA elige los alimentos y el código calcula y
            valida las porciones.
          </p>
        </footer>
      </body>
    </html>
  );
}
