// Utilidades compartidas por todas las rutas de /api (el guion bajo evita que Vercel lo exponga como ruta).
const crypto = require('crypto');

const DEFAULT_CONFIG = {
  // Tipos de carga: lo que el vendedor elige de un toque. "desc" son ejemplos de qué entra (los edita el administrador).
  types: [
    { id: 'c1', name: '🚗 Baúl de auto', desc: 'Pedido chico: 1 o 2 plantas chicas o medianas, 1 bolsa de tierra, macetas chicas o productos chicos.', kmRate: 150 },
    { id: 'c2', name: '🚐 Utilitario', desc: 'Pedido mediano: varias plantas medianas, macetas grandes o 2 a 4 bolsas de tierra.', kmRate: 220 },
    { id: 'c3', name: '🛻 Camioneta', desc: 'Pedido grande: muchas plantas o macetas grandes, 5 o más bolsas, o un árbol.', kmRate: 320 },
    { id: 'c4', name: '🚚 Camión', desc: 'Carga muy grande o árboles de gran porte. Consultar disponibilidad.', kmRate: 450 },
  ],
  subidaMonto: 1500,
  subidaPct: 0,
};

const SESSION_SECONDS = 12 * 60 * 60;

function memoryRedis() { // solo para pruebas locales (USE_MEMORY_DB=1). NO usar en producción.
  const m = new Map(), exp = new Map();
  const alive = (k) => { if (exp.has(k) && exp.get(k) < Date.now()) { m.delete(k); exp.delete(k); } return m.has(k); };
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  return {
    async get(k) { return alive(k) ? clone(m.get(k)) : null; },
    async set(k, v, o) { m.set(k, clone(v)); if (o && o.ex) exp.set(k, Date.now() + o.ex * 1000); else exp.delete(k); return 'OK'; },
    async del(k) { m.delete(k); exp.delete(k); return 1; },
    async lpush(k, ...vs) { const a = alive(k) ? m.get(k) : []; vs.forEach((v) => a.unshift(clone(v))); m.set(k, a); return a.length; },
    async ltrim(k, s, e) { if (alive(k)) m.set(k, m.get(k).slice(s, e + 1)); return 'OK'; },
    async lrange(k, s, e) { return alive(k) ? clone(m.get(k).slice(s, e + 1)) : []; },
  };
}

let redis;
function getRedis() {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url, token });
  } else if (process.env.USE_MEMORY_DB === '1') {
    redis = memoryRedis();
  } else {
    throw new Error('Base de datos no conectada: faltan las variables de Upstash Redis (ver README).');
  }
  return redis;
}

function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const str = (v, max = 80) => String(v == null ? '' : v).slice(0, max);

// PINs: nunca se guardan en claro, solo hash (scrypt + sal).
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString('hex') };
}
function checkPin(pin, u) {
  const h = crypto.scryptSync(String(pin), u.salt, 32);
  const b = Buffer.from(u.hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}

async function getUsers() {
  const r = getRedis();
  let users = await r.get('users');
  if (!users) {
    users = [
      { legajo: '0001', name: 'Encargado', role: 'admin', ...hashPin('1234') },
      { legajo: '0002', name: 'Vendedor', role: 'vendedor', ...hashPin('1111') },
    ];
    await r.set('users', users);
  }
  return users;
}
async function getConfig() {
  const r = getRedis();
  let c = await r.get('config');
  if (!c || !Array.isArray(c.types)) { c = DEFAULT_CONFIG; await r.set('config', c); }
  return c;
}
function cleanConfig(b) {
  b = b || {};
  const types = (Array.isArray(b.types) ? b.types : []).slice(0, 20).map((t, i) => ({
    id: str(t.id, 40) || 'c_' + Date.now() + '_' + i, name: str(t.name, 60), desc: str(t.desc, 220), kmRate: num(t.kmRate),
  }));
  if (!types.length) fail(400, 'Tiene que haber al menos un tipo de carga.');
  if (types.some((t) => !t.name.trim())) fail(400, 'Cada tipo de carga necesita un nombre.');
  return { types, subidaMonto: num(b.subidaMonto), subidaPct: num(b.subidaPct) };
}

function parseCookies(req) {
  const o = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}
function cookieHeader(value, maxAge) {
  const secure = process.env.INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `session=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
// La sesión se revalida contra la lista de usuarios: si se borra o cambia de rol a alguien, rige de inmediato.
async function getSession(req) {
  const sid = parseCookies(req).session;
  if (!sid) return null;
  const s = await getRedis().get('session:' + sid);
  if (!s) return null;
  const u = (await getUsers()).find((x) => x.legajo === s.legajo);
  return u ? { legajo: u.legajo, name: u.name, role: u.role } : null;
}
// Envoltorio común: método, JSON obligatorio en escrituras (anti-CSRF junto con SameSite=Lax), permisos y errores.
function route(methods, auth, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) return res.status(405).json({ ok: false, error: 'Método no permitido' });
      if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
        return res.status(415).json({ ok: false, error: 'Content-Type inválido' });
      }
      let session = null;
      if (auth) {
        session = await getSession(req);
        if (!session) return res.status(401).json({ ok: false, error: 'No autorizado' });
      }
      await fn(req, res, session);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ ok: false, error: e.message });
      console.error(e);
      res.status(500).json({ ok: false, error: String(e.message).startsWith('Base de datos') ? e.message : 'Error interno' });
    }
  };
}
function requireAdmin(session) { if (session.role !== 'admin') fail(403, 'Solo administradores.'); }

module.exports = { DEFAULT_CONFIG, SESSION_SECONDS, getRedis, fail, num, str, hashPin, checkPin, getUsers, getConfig, cleanConfig,
  parseCookies, cookieHeader, getSession, route, requireAdmin };
