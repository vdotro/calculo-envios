const crypto = require('crypto');
const L = require('./_lib');

module.exports = L.route(['POST'], null, async (req, res) => {
  const r = L.getRedis();
  const legajo = L.str((req.body || {}).legajo, 20).trim();
  const pin = L.str((req.body || {}).pin, 20).trim();
  const failKey = 'fail:' + legajo;
  const fails = Number(await r.get(failKey)) || 0;
  if (fails >= 5) L.fail(429, 'Demasiados intentos fallidos. Probá de nuevo en 10 minutos.');

  const u = (await L.getUsers()).find((x) => x.legajo === legajo);
  if (!u || !pin || !L.checkPin(pin, u)) {
    await r.set(failKey, fails + 1, { ex: 600 });
    return res.status(401).json({ ok: false, error: 'Legajo o PIN incorrecto.' });
  }
  await r.del(failKey);
  const sid = crypto.randomBytes(24).toString('hex');
  await r.set('session:' + sid, { legajo: u.legajo }, { ex: L.SESSION_SECONDS });
  res.setHeader('Set-Cookie', L.cookieHeader(sid, L.SESSION_SECONDS));
  res.json({ ok: true, legajo: u.legajo, name: u.name, role: u.role });
});
