// modes/shakal.js — режим «Шакализатор».
// Юзер кидает фото, выбирает силу 1..10, получает максимально шакальное PNG.
//
// Как «шакалим»:
//  1) Даунскейлим картинку (с увеличением силы — сильнее).
//  2) Многократно перекодируем как JPEG с низким quality (артефакты копятся).
//  3) Рисуем результат на видимый canvas без интерполяции — пиксели крупные.

import { saveBlob } from '../shared.js';

export function initShakal() {
  const fileInput = document.getElementById('shakalFileInput');
  const stage = document.getElementById('shakalStage');
  const placeholder = stage.querySelector('.placeholder');
  const canvas = document.getElementById('shakalCanvas');
  const ctx = canvas.getContext('2d');
  const levelInput = document.getElementById('shakalLevel');
  const levelVal = document.getElementById('shakalLevelVal');
  const downloadBtn = document.getElementById('shakalDownloadBtn');
  const resetBtn = document.getElementById('shakalResetBtn');

  let img = null;
  let renderTimer = null;
  let renderToken = 0;

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
        scheduleRender();
      };
      newImg.onerror = () => alert('Не удалось загрузить изображение.');
      newImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function loadImageFromUrl(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  // level: 1..10 → параметры шакализации
  function paramsForLevel(level) {
    const t = (Math.max(1, Math.min(10, level)) - 1) / 9; // 0..1
    return {
      scale:   0.95 - t * 0.85,  // 0.95 → 0.10
      quality: 0.7  - t * 0.65,  // 0.70 → 0.05
      passes:  Math.round(1 + t * 3), // 1..4
    };
  }

  async function shakalize(level) {
    const { scale, quality, passes } = paramsForLevel(level);

    const w = Math.max(48, Math.round(img.width * scale));
    const h = Math.max(48, Math.round(img.height * scale));

    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tmpCtx = tmp.getContext('2d');
    tmpCtx.drawImage(img, 0, 0, w, h);

    for (let i = 0; i < passes; i++) {
      const blob = await new Promise((r) => tmp.toBlob(r, 'image/jpeg', quality));
      if (!blob) break;
      const url = URL.createObjectURL(blob);
      try {
        const reloaded = await loadImageFromUrl(url);
        tmpCtx.clearRect(0, 0, w, h);
        tmpCtx.drawImage(reloaded, 0, 0, w, h);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return tmp;
  }

  async function render() {
    if (!img) return;
    const my = ++renderToken;
    const shakal = await shakalize(+levelInput.value);
    if (my !== renderToken) return; // юзер уже двинул слайдер дальше
    // апскейл без интерполяции — крупные пиксели становятся видны
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(shakal, 0, 0, canvas.width, canvas.height);
  }

  // Дебаунсим — при тяганье слайдера не пересчитываем 60 раз/сек.
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { render(); }, 120);
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

  levelInput.addEventListener('input', () => {
    levelVal.textContent = levelInput.value;
    scheduleRender();
  });

  downloadBtn.addEventListener('click', async () => {
    if (!img) return;
    try {
      await render(); // убедимся, что в видимом canvas — актуальный шакал
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.6));
      if (!blob) throw new Error('toBlob failed');
      await saveBlob(blob, `shakal-${Date.now()}.jpg`, downloadBtn);
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
    downloadBtn.disabled = true;
    resetBtn.disabled = true;
    levelInput.value = 5;
    levelVal.textContent = '5';
  });
}
