import { Calculator, Database, ListChecks } from 'lucide-react';
import { MenuForm } from '@/components/menu-form';
import { ApiError, getDraft } from '@/lib/api';
import {
  DEFAULT_VALUES,
  valuesFromRequest,
  type FormValues,
} from '@/lib/menu-form';

// Componente de servidor: arma la página y, si viene de "Generar otro menú"
// (?from=<id>), lee en el servidor lo que se pidió para precargar el
// formulario. Solo el formulario es de cliente.

async function initialValues(from: string | undefined): Promise<FormValues> {
  if (!from) return DEFAULT_VALUES;
  try {
    return valuesFromRequest((await getDraft(from)).request);
  } catch (error) {
    // Expirado o API caída: se empieza con los valores por defecto
    if (error instanceof ApiError) return DEFAULT_VALUES;
    throw error;
  }
}

const STEPS = [
  {
    icon: ListChecks,
    title: 'La IA elige los alimentos',
    text: 'Interpreta tus restricciones y arma cada comida con alimentos reales de la base.',
  },
  {
    icon: Calculator,
    title: 'El código calcula las porciones',
    text: 'Un optimizador ajusta los gramos a tus metas de calorías y macros.',
  },
  {
    icon: Database,
    title: 'Solo datos verificables',
    text: 'Cada número sale de USDA FoodData Central, nunca del modelo.',
  },
];

export default async function Home(props: PageProps<'/'>) {
  const { from } = await props.searchParams;
  const values = await initialValues(
    typeof from === 'string' ? from : undefined,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <section className="lg:pt-4">
        <p className="text-sm font-semibold text-primary">Menú diario con IA</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Un día de comidas que cumple tus metas
        </h1>
        <p className="mt-3 text-muted text-pretty">
          Define tus calorías, macros y comidas. Bocado arma el menú y te
          muestra cada paso mientras lo prepara.
        </p>
        <ol className="mt-8 hidden space-y-5 sm:block">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Pedir un menú">
        <MenuForm initialValues={values} />
      </section>
    </div>
  );
}
