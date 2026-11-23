const L = require('./_lib');

// GET: cualquier usuario con sesión. PUT: solo administradores.
module.exports = L.route(['GET', 'PUT'], 'user', async (req, res, session) => {
  const r = L.getRedis();
  if (req.method === 'PUT') {
    L.requireAdmin(session);
    const body = req.body || {};
    const config = body.reset ? L.DEFAULT_CONFIG : L.cleanConfig(body);
    await r.set('config', config);
    return res.json({ ok: true, config });
  }
  const config = await L.getConfig();
  const lng = parseFloat(process.env.VIVERO_LNG), lat = parseFloat(process.env.VIVERO_LAT);
  res.json({
    ...config,
    map: {
      token: process.env.MAPBOX_TOKEN || '',      // token PÚBLICO de Mapbox (pk.…)
      address: process.env.VIVERO_ADDRESS || '',
      coords: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null,
    },
  });
});
