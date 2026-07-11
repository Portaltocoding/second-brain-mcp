// Helper de fecha: hoy en ISO local (YYYY-MM-DD). Único punto que toca el reloj.
function pad(n) {
  return String(n).padStart(2, '0');
}

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
