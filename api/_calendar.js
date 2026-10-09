// KODESH — El calendario bíblico observado en el servidor: ejecuta el mismo
// calendario.js del cliente (vm) con los datos de data/calendario-biblico.json
// y los ajustes del admin (insignias/calendario.json). Así la app, el .ics y
// las notificaciones nunca difieren.
// Requiere includeFiles "{calendario.js,data/calendario-biblico.json}".
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const ADJ_URL = 'https://fvknbqdsgqdmwirrgcvb.supabase.co/storage/v1/object/public/insignias/calendario.json';

export async function loadCalendar(adj) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/calendario-biblico.json'), 'utf8'));
  if (adj === undefined) {
    adj = await fetch(`${ADJ_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  const ctx = {
    window: {}, Date, Promise, JSON, String, Math, Number, Object,
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async u => ({ ok: true, json: async () => (String(u).includes('calendario-biblico') ? data : (adj || { m: {}, n: {} })) }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'calendario.js'), 'utf8'), ctx);
  await ctx.window.KodeshCal.load();
  return ctx.window.KodeshCal;
}
