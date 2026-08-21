// Valida o CONTEÚDO real do arquivo (assinatura binária / "magic bytes"),
// nunca confiando no `mimetype` que o navegador manda (esse header é
// escolhido pelo cliente e pode ser forjado facilmente com curl/Postman).
//
// Isso fecha uma brecha de XSS armazenado: sem essa checagem, era possível
// enviar um arquivo .svg (que pode conter <script>) fingindo ser
// "image/png"/"image/svg+xml" no multer, ele era salvo, e depois servido de
// volta pela rota /payment-proof/image com Content-Type image/svg+xml —
// SVGs abertos diretamente pelo navegador (ex.: link em nova aba) executam
// o JavaScript embutido no contexto autenticado do admin.
//
// Por isso: só aceitamos formatos raster (JPEG/PNG/WEBP/GIF), nunca SVG.

const SIGNATURES = [
  { mime: 'image/jpeg', check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    check: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/webp',
    check: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: 'image/gif',
    check: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
];

// Retorna o mime real detectado pela assinatura, ou null se não for
// nenhum dos formatos raster permitidos (inclui SVG, HTML, PDF, etc.).
function detectRealImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const found = SIGNATURES.find((sig) => sig.check(buffer));
  return found ? found.mime : null;
}

module.exports = { detectRealImageMime };
