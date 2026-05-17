// modes/text-meme.js — режим «Мем с текстом».
// Загрузка фото → текст сверху/снизу шрифтом Impact → сохранение.

import { saveBlob } from '../shared.js';

export function initTextMeme() {
  const fileInput = document.getElementById('fileInput');
  const stage = document.getElementById('stage');
  const placeholder = document.getElementById('placeholder');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const topText = document.getElementById('topText');
  const bottomText = document.getElementById('bottomText');
  const fontSize = document.getElementById('fontSize');
  const fontSizeVal = document.getElementById('fontSizeVal');
  const strokeWidth = document.getElementById('strokeWidth');
  const strokeWidthVal = document.getElementById('strokeWidthVal');
  const uppercase = document.getElementById('uppercase');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');

  let img = null;

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите файл изображения.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const newImg = new Image();
      newImg.onload = () => {
        img = newImg;
        const maxDim = 1200;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const k = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * k);
          h = Math.round(h * k);
        }
        canvas.width = w;
        canvas.height = h;
        canvas.style.display = 'block';
        placeholder.style.display = 'none';
        stage.classList.remove('empty');
        downloadBtn.disabled = false;
        resetBtn.disabled = false;
        render();
      };
      newImg.onerror = () => alert('Не удалось загрузить изображение. Возможно, формат не поддерживается браузером (например, AVIF в старых браузерах).');
      newImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function wrapLines(text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        if (ctx.measureText(w).width > maxWidth) {
          let chunk = '';
          for (const ch of w) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = w;
        }
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawText(text, position) {
    if (!text) return;
    const value = uppercase.checked ? text.toUpperCase() : text;
    const size = parseInt(fontSize.value, 10);
    const stroke = parseInt(strokeWidth.value, 10);
    const sidePadding = Math.round(size * 0.3);
    const edgePadding = Math.round(size * 0.55);
    const maxWidth = canvas.width - sidePadding * 2;

    // bold нужен явно: на Android Impact не установлен системно, fallback Anton —
    // single-weight (400), без явного веса браузер не утолщает → текст выходит
    // тонким. С 'bold' либо находим bold-face, либо браузер faux-bold'нёт fallback.
    ctx.font = `bold ${size}px Impact, "Anton", "Arial Black", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = position === 'top' ? 'top' : 'bottom';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = stroke;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const lines = [];
    for (const line of value.split('\n')) {
      lines.push(...wrapLines(line, maxWidth));
    }

    const lineHeight = size * 1.05;
    const x = canvas.width / 2;
    if (position === 'top') {
      lines.forEach((line, i) => {
        const y = edgePadding + i * lineHeight;
        ctx.strokeText(line, x, y);
        ctx.fillText(line, x, y);
      });
    } else {
      const total = lines.length;
      lines.forEach((line, i) => {
        const y = canvas.height - edgePadding - (total - 1 - i) * lineHeight;
        ctx.strokeText(line, x, y);
        ctx.fillText(line, x, y);
      });
    }
  }

  function render() {
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawText(topText.value, 'top');
    drawText(bottomText.value, 'bottom');
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });

  stage.addEventListener('click', () => fileInput.click());
  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    stage.classList.add('drag');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  [topText, bottomText].forEach(el => el.addEventListener('input', render));
  [fontSize, strokeWidth].forEach(el => el.addEventListener('input', () => {
    fontSizeVal.textContent = fontSize.value;
    strokeWidthVal.textContent = strokeWidth.value;
    render();
  }));
  uppercase.addEventListener('change', render);

  // Перерисовываем после загрузки веб-шрифта Anton, чтобы canvas обновился,
  // если первый рендер прошёл с системным фолбэком.
  if (document.fonts && document.fonts.ready) {
    if (typeof document.fonts.load === 'function') {
      document.fonts.load('bold 16px Anton').catch(() => {});
    }
    document.fonts.ready.then(() => { if (img) render(); });
  }

  function canvasToBlob() {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
  }

  downloadBtn.addEventListener('click', async () => {
    if (!img) return;
    try {
      const blob = await canvasToBlob();
      await saveBlob(blob, `meme-${Date.now()}.png`, downloadBtn);
    } catch (e) {
      console.error(e);
    }
  });

  resetBtn.addEventListener('click', () => {
    img = null;
    canvas.style.display = 'none';
    placeholder.style.display = 'block';
    stage.classList.add('empty');
    topText.value = '';
    bottomText.value = '';
    fileInput.value = '';
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
  });
}
