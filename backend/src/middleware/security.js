const helmet = require('helmet');
const cors = require('cors');
const env = require('../config/env');

const corsOptions = {
  origin: env.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
};

const helmetOptions = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
});

module.exports = { cors: cors(corsOptions), helmet: helmetOptions };
