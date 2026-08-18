// Evita repetir try/catch em toda rota async.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
