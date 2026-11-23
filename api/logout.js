const L = require('./_lib');

module.exports = L.route(['POST'], null, async (req, res) => {
  const sid = L.parseCookies(req).session;
  if (sid) await L.getRedis().del('session:' + sid);
  res.setHeader('Set-Cookie', L.cookieHeader('', 0));
  res.json({ ok: true });
});
