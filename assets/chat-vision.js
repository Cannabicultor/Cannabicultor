(function (global) {
  'use strict';

  var MAX_DIM = 1400;
  var JPEG_QUALITY = 0.82;
  var ALLOWED = { 'image/jpeg': true, 'image/png': true, 'image/webp': true, 'image/gif': true };

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function canvasToJpeg(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }

  async function compressFile(file) {
    if (!file || !ALLOWED[file.type]) {
      throw new Error('Formato no válido. Usa JPG, PNG o WebP.');
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new Error('La imagen es demasiado grande (máx. 12 MB).');
    }

    var dataUrl = await readFile(file);
    var img = await loadImage(dataUrl);
    var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * scale));
    var h = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    return {
      media_type: 'image/jpeg',
      data: canvasToJpeg(canvas, JPEG_QUALITY),
      previewUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    };
  }

  function buildUserContent(text, image) {
    var parts = [];
    if (image && image.data) {
      parts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: image.media_type || 'image/jpeg',
          data: image.data
        }
      });
    }
    parts.push({
      type: 'text',
      text: (text && text.trim()) || 'Analiza esta foto de mi cultivo. Describe lo que ves (hojas, síntomas, plagas, estrés) y posibles causas.'
    });
    return parts;
  }

  function buildApiMessages(history, userContent) {
    var out = [];
    var slice = history.slice(-8);
    for (var i = 0; i < slice.length; i++) {
      var m = slice[i];
      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content });
      } else {
        var note = m._hadImage ? ' [consulta con foto adjunta]' : '';
        out.push({ role: 'user', content: (m.content || '') + note });
      }
    }
    out.push({ role: 'user', content: userContent });
    return out;
  }

  global.ChatVision = {
    compressFile: compressFile,
    buildUserContent: buildUserContent,
    buildApiMessages: buildApiMessages,
    ALLOWED: ALLOWED
  };
})(window);