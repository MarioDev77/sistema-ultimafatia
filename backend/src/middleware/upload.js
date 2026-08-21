const multer = require('multer');

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB — o frontend já comprime a foto antes de enviar (normalmente < 1MB); isso aqui é só uma margem de segurança

// Guarda o arquivo em memória (não em disco), já que vamos converter
// direto para base64 e salvar no banco. Aceita apenas imagens.
const storage = multer.memoryStorage();

// Allowlist explícita (nunca "startsWith('image/')"): isso incluiria
// "image/svg+xml", que pode conter <script> e é executado pelo navegador
// se a imagem for aberta direto (ex.: link em nova aba). Este header
// também é só uma pré-filtragem — o conteúdo real do arquivo é
// conferido de novo depois do upload em utils/imageSniff.js.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function fileFilter(req, file, cb) {
  if (!file.mimetype || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error('Envie apenas arquivos de imagem (JPG, PNG, WEBP ou GIF).'));
  }
  cb(null, true);
}

const multerInstance = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// Converte erros do multer (arquivo grande demais, tipo inválido) em
// respostas 400 com mensagem clara, em vez de cair no 500 genérico.
function uploadProofSingle(req, res, next) {
  multerInstance.single('comprovante')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Imagem muito grande. Envie um arquivo de até 6MB.' });
    }
    return res.status(400).json({ error: err.message || 'Não foi possível processar a imagem enviada.' });
  });
}

module.exports = { uploadProofSingle };
