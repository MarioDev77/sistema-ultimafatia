const multer = require('multer');

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB — o frontend já comprime a foto antes de enviar (normalmente < 1MB); isso aqui é só uma margem de segurança

// Guarda o arquivo em memória (não em disco), já que vamos converter
// direto para base64 e salvar no banco. Aceita apenas imagens.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return cb(new Error('Envie apenas arquivos de imagem (JPG, PNG, WEBP, etc).'));
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
      return res.status(400).json({ error: 'Imagem muito grande. Envie um arquivo de até 4MB.' });
    }
    return res.status(400).json({ error: err.message || 'Não foi possível processar a imagem enviada.' });
  });
}

module.exports = { uploadProofSingle };
