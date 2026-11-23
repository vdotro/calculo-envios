const L = require('./_lib');

// Solo administradores. Nunca devuelve PINs ni hashes.
module.exports = L.route(['GET', 'PUT'], 'user', async (req, res, session) => {
  L.requireAdmin(session);
  const r = L.getRedis();
  const existing = await L.getUsers();
  if (req.method === 'GET') {
    return res.json({ ok: true, users: existing.map((u) => ({ legajo: u.legajo, name: u.name, role: u.role })) });
  }
  const incoming = (req.body || {}).users;
  if (!Array.isArray(incoming) || incoming.length > 100) L.fail(400, 'Datos inválidos.');
  const out = [], seen = new Set();
  for (const u of incoming) {
    const legajo = L.str(u.legajo, 20).trim(), name = L.str(u.name, 60).trim();
    const role = u.role === 'admin' ? 'admin' : 'vendedor';
    const pin = u.pin ? String(u.pin) : '';
    if (!legajo || !name) L.fail(400, 'Cada usuario necesita nombre y legajo.');
    if (seen.has(legajo)) L.fail(400, 'Legajo repetido: ' + legajo);
    seen.add(legajo);
    if (pin && !/^\d{4,8}$/.test(pin)) L.fail(400, 'El PIN debe tener entre 4 y 8 números.');
    const prev = existing.find((x) => x.legajo === legajo);
    if (!prev && !pin) L.fail(400, 'Falta el PIN del legajo ' + legajo + '.');
    out.push({ legajo, name, role, ...(pin ? L.hashPin(pin) : { salt: prev.salt, hash: prev.hash }) });
  }
  if (!out.some((u) => u.role === 'admin')) L.fail(400, 'Tiene que quedar al menos un administrador.');
  await r.set('users', out);
  res.json({ ok: true });
});
