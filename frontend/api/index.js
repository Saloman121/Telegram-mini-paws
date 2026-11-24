export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server/app.js');
    return app(req, res);
  } catch (e) {
    return res.status(500).json({
      error: String(e && e.message),
      where: String(e && e.stack).split('\n').slice(0, 4),
    });
  }
}
