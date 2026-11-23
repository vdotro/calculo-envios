const L = require('./_lib');

module.exports = L.route(['GET'], null, async (req, res) => {
  const s = await L.getSession(req);
  res.json(s ? { ok: true, ...s } : { ok: false });
});
