// modes/demotivator.js — режим «Демотиватор».
// Классический формат: чёрный фон, фото с тонкой белой рамкой, под фото —
// две строки Times New Roman Bold (крупная подпись и помельче).

import { saveBlob } from '../shared.js';

export function initDemotivator() {
  const fileInput = document.getElementById('demotivatorFileInput');
  const stage = document.getElementById('demotivatorStage');
  const placeholder = stage.querySelector('.placeholder');
  const canvas = document.getElementById('demotivatorCanvas');
  const ctx = canvas.getContext('2d');
  const bigText = document.getElementById('demotivatorBigText');
  const smallText = document.getElementById('demotivatorSmallText');
  const downloadBtn = document.getElementById('demotivatorDownloadBtn');
  const resetBtn = document.getElementById('demotivatorResetBtn');

  let img = null;

  const FONT = '"Times New Roman", Times, serif';

  function wrapLinesWith(c, text, maxWidth) {
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      if (c.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        if (c.measureText(w).width > maxWidth) {
          // слово длиннее строки — режем по символам
          let chunk = '';
          for (const ch of w) {
            if (c.measureText(chunk + ch).width <= maxWidth) {
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

  function render() {
    if (!img) return;

    // Ограничиваем размер исходного изображения (1200 по большей стороне)
    const IMG_MAX = 800;
    let iw = img.width, ih = img.height;
    const k = Math.min(IMG_MAX / iw, IMG_MAX / ih, 1);
    iw = Math.round(iw * k);
    ih = Math.round(ih * k);

    // Раскладка
    const SIDE_PAD = 60;             // чёрные поля слева/справа от фото
    const TOP_PAD  = 60;             // чёрное поле сверху
    const GAP_AFTER_IMG = 36;        // зазор между фото и крупной подписью
    const GAP_BETWEEN_TEXTS = 14;    // зазор между двумя подписями
    const BOTTOM_PAD = 40;           // чёрное поле снизу
    const BORDER = 2;                // белая рамка

    const BIG_SIZE = 48;
    const SMALL_SIZE = 22;
    const LINE_HEIGHT = 1.2;

    // Сначала меряем тексты на временном контексте — иначе пришлось бы дважды
    // выставлять canvas.width (это сбрасывает ctx-стейт).
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');

    mctx.font = `bold ${BIG_SIZE}px ${FONT}`;
    const bigLines = wrapLinesWith(mctx, bigText.value, iw);

    mctx.font = `bold ${SMALL_SIZE}px ${FONT}`;
    const smallLines = wrapLinesWith(mctx, smallText.value, iw);

    const bigBlock = bigLines.length * BIG_SIZE * LINE_HEIGHT;
    const smallBlock = smallLines.length * SMALL_SIZE * LINE_HEIGHT;

    const canvasW = iw + SIDE_PAD * 2;
    let canvasH = TOP_PAD + ih + GAP_AFTER_IMG + bigBlock;
    if (smallLines.length) canvasH += GAP_BETWEEN_TEXTS + smallBlock;
    canvasH += BOTTOM_PAD;

    canvas.width = canvasW;
    canvas.height = Math.round(canvasH);

    // Чёрный фон
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasW, canvas.height);

    // Белая рамка вокруг фото с чёрным зазором между фото и рамкой,
    // равным толщине рамки (классический демотиваторный вид).
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = BORDER;
    const GAP = BORDER;
    ctx.strokeRect(
      SIDE_PAD - GAP - BORDER / 2,
      TOP_PAD - GAP - BORDER / 2,
      iw + GAP * 2 + BORDER,
      ih + GAP * 2 + BORDER,
    );

    // Само фото
    ctx.drawImage(img, SIDE_PAD, TOP_PAD, iw, ih);

    // Текст
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const cx = canvasW / 2;
    let ty = TOP_PAD + ih + GAP_AFTER_IMG;

    ctx.font = `bold ${BIG_SIZE}px ${FONT}`;
    bigLines.forEach((line) => {
      ctx.fillText(line, cx, ty);
      ty += BIG_SIZE * LINE_HEIGHT;
    });

    if (smallLines.length) {
      ty += GAP_BETWEEN_TEXTS;
      ctx.font = `bold ${SMALL_SIZE}px ${FONT}`;
      smallLines.forEach((line) => {
        ctx.fillText(line, cx, ty);
        ty += SMALL_SIZE * LINE_HEIGHT;
      });
    }
  }

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
        canvas.style.display = 'block';
        placeholder.style.display = 'none';
        stage.classList.remove('empty');
        downloadBtn.disabled = false;
        resetBtn.disabled = false;
        render();
      };
      newImg.onerror = () => alert('Не удалось загрузить изображение.');
      newImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadFile(e.target.files[0]);
  });

  stage.addEventListener('click', () => fileInput.click());
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('drag');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  [bigText, smallText].forEach((el) => el.addEventListener('input', render));

  // Перерендер после загрузки шрифта (Times New Roman доступен системно, но на
  // всякий случай — чтобы canvas обновился, если первый рендер прошёл с serif-фолбэком)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (img) render(); });
  }

  downloadBtn.addEventListener('click', async () => {
    if (!img) return;
    try {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('toBlob failed');
      await saveBlob(blob, `demotivator-${Date.now()}.jpg`, downloadBtn);
    } catch (e) {
      console.error(e);
    }
  });

  resetBtn.addEventListener('click', () => {
    img = null;
    canvas.style.display = 'none';
    placeholder.style.display = 'block';
    stage.classList.add('empty');
    fileInput.value = '';
    bigText.value = '';
    smallText.value = '';
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
  });
}
