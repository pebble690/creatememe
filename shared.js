// shared.js — общие утилиты, используются из app.js и всех modes/*.

export const tg = window.Telegram && window.Telegram.WebApp;

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
export function isMobile() {
  return isIOS() || isAndroid();
}

// --- Toast ---
let toastEl = null;
let toastTimer = null;
export function showToast(text, ms = 4000) {
  if (!toastEl) toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// --- Загрузка blob на временный публичный хост ---
// Нужно для Android-WebView Telegram, который блокирует download через blob.
// Получив HTTPS-URL, можно дёрнуть tg.downloadFile (Bot API 8.0+, нативный
// диалог сохранения) или tg.openLink — система откроет картинку в Chrome.
// Используем tmpfiles.org с TTL 1 час → картинка автоматически удаляется.
async function uploadToTempHost(blob, fileName) {
  try {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    const r = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: fd,
    });
    if (!r.ok) throw new Error('tmpfiles ' + r.status);
    const j = await r.json();
    const u = j && j.data && j.data.url;
    if (!u) throw new Error('no url');
    // tmpfiles отдаёт viewer-URL вида https://tmpfiles.org/12345/name.png,
    // direct-download URL — через /dl/.
    return u.replace('://tmpfiles.org/', '://tmpfiles.org/dl/');
  } catch (e) {
    console.warn('tmpfiles upload failed', e);
    return null;
  }
}

// --- Overlay-фолбэк (когда хост недоступен) ---
function showSaveOverlay(downloadUrl, fileName, previewUrl) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.94);
    z-index: 200; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px;
    padding:
      max(20px, env(safe-area-inset-top), var(--tg-top, 0px))
      max(20px, env(safe-area-inset-right), var(--tg-right, 0px))
      max(20px, env(safe-area-inset-bottom), var(--tg-bottom, 0px))
      max(20px, env(safe-area-inset-left), var(--tg-left, 0px));
  `;

  const im = document.createElement('img');
  im.src = previewUrl || downloadUrl;
  im.style.cssText = 'max-width: 100%; max-height: 55vh; border-radius: 8px; object-fit: contain;';
  overlay.appendChild(im);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 360px;';

  const dl = document.createElement('a');
  dl.href = downloadUrl;
  dl.download = fileName;
  dl.textContent = 'Скачать в галерею';
  dl.style.cssText = `
    display: block; padding: 16px;
    background: #ffffff; color: #1a1a20;
    text-decoration: none; text-align: center;
    border-radius: 12px; font-weight: 700; font-size: 16px;
    -webkit-tap-highlight-color: rgba(0,0,0,0.1);
  `;
  actions.appendChild(dl);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Закрыть';
  close.style.cssText = `
    padding: 12px; background: transparent; color: #fff;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 12px; font-size: 14px; cursor: pointer;
    font-family: inherit;
  `;
  close.addEventListener('click', () => {
    if (previewUrl && previewUrl !== downloadUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (e) {}
    }
    if (downloadUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(downloadUrl); } catch (e) {}
    }
    overlay.remove();
  });
  actions.appendChild(close);

  overlay.appendChild(actions);

  const hint = document.createElement('div');
  hint.textContent = 'Если ничего не происходит — удерживайте картинку → «Сохранить».';
  hint.style.cssText = 'color: rgba(255,255,255,0.65); font-size: 12px; text-align: center; padding: 0 16px; max-width: 360px;';
  overlay.appendChild(hint);

  document.body.appendChild(overlay);
}

/**
 * Универсальный сейвер blob-картинки (мем, демотиватор, шакал — что угодно).
 *
 * Стратегия по убыванию приоритета:
 *   1) navigator.share({files}) — нативная шторка iOS/Android → "Сохранить в Фото".
 *   2) Mobile: upload на tmpfiles → tg.downloadFile / tg.openLink / window.open.
 *   3) Mobile (если upload упал): overlay с тап-кнопкой <a download>.
 *   4) Desktop: обычное <a download> с blob.
 *
 * btn (optional) — кнопка, которую дисэйблим и в которой показываем "Готовим…"/
 * "Загружаем…" на время работы. Лейбл восстанавливается в finally.
 */
export async function saveBlob(blob, fileName, btn) {
  const originalLabel = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Готовим…';
  }
  try {
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });

    // 1) Web Share API. НЕ гейтим через canShare — Android-WebView Telegram
    // часто врёт, что canShare=false, хотя сам share() работает.
    if (navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'Мем' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    // 2) Mobile: tmpfiles + Telegram-методы
    if (isMobile()) {
      if (btn) btn.textContent = 'Загружаем…';
      const hostedUrl = await uploadToTempHost(blob, fileName);

      if (hostedUrl) {
        if (tg && typeof tg.downloadFile === 'function') {
          try {
            tg.downloadFile({ url: hostedUrl, file_name: fileName });
            showToast('Подтвердите сохранение в Telegram.', 4000);
            return;
          } catch (e) { /* fall through */ }
        }
        if (tg && typeof tg.openLink === 'function') {
          try {
            tg.openLink(hostedUrl);
            showToast('Сохраните картинку в открывшемся браузере.', 6000);
            return;
          } catch (e) { /* fall through */ }
        }
        window.open(hostedUrl, '_blank');
        showToast('Сохраните картинку в открывшейся вкладке.', 6000);
        return;
      }

      // 3) Хост лёг — оверлей с blob.
      const blobUrl = URL.createObjectURL(blob);
      showSaveOverlay(blobUrl, fileName, blobUrl);
      showToast('Хост загрузки недоступен — попробуйте долгим тапом.', 6000);
      return;
    }

    // 4) Desktop — прямое скачивание.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Мем сохранён.', 2000);
  } catch (err) {
    console.error(err);
    showToast('Не удалось сохранить. Попробуйте ещё раз.', 4000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
}
