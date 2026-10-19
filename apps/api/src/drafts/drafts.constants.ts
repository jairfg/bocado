export const MENU_DRAFT_QUEUE = 'menu-draft';

// Un menú tarda de 20 a 60 s; con esperas por cuota puede alargarse
export const JOB_TIMEOUT_MS = 120_000;

// Los resultados (y las fallas) se guardan 24 h y luego se eliminan
export const RESULT_TTL_S = 24 * 60 * 60;

// Más jobs esperando que esto y se rechaza el nuevo con 429: con la cuota
// gratuita (5 llamadas por minuto) la cola tardaría demasiado en vaciarse
export const MAX_PENDING_JOBS = 10;

// Comentario SSE para que proxies y navegadores no corten la conexión
export const KEEP_ALIVE_MS = 15_000;
