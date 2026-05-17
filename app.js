// app.js — bootstrap.
// Делает: detect Telegram → gate browser-входы, init Telegram API,
// разводит экраны меню ↔ редактор, диспетчит выбор режима из меню.
// Логика конкретных режимов — в modes/*.

import { tg } from './shared.js';
import { initTextMeme } from './modes/text-meme.js';
// Stub-импорты, чтобы файлы существовали в сборке и были видны как точки расширения.
import './modes/demotivator.js';
import './modes/shakal.js';

const isInTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');

if (isInTelegram) {
  document.body.classList.add('in-tg');
  initTelegram();
  initScreens();
  initTextMeme();
  initTelegramLinks();
}
// Если не в Telegram — ничего не делаем, CSS показывает .browser-gate.

function initTelegram() {
  // Маркируем <html>, чтобы CSS зарезервировал отступ под плавающие
  // кнопки Telegram (close, меню) которые наезжают поверх WebView.
  document.documentElement.classList.add('in-telegram');
  if (tg.platform) {
    document.documentElement.classList.add('tg-' + tg.platform);
  }

  try { tg.ready(); } catch (e) {}
  // expand() — занять всю доступную высоту (Bot API 6.1+).
  try { tg.expand(); } catch (e) {}

  // disableVerticalSwipes() — Bot API 7.7+: блокирует свайп вниз для свёртки Mini App.
  if (typeof tg.disableVerticalSwipes === 'function') {
    try { tg.disableVerticalSwipes(); } catch (e) {}
  }

  // requestFullscreen() — Bot API 8.0+. На iOS из чата бота Mini App открывается
  // полу-листом, expand() не лечит. На Android фуллскрин ломал бы chat-launch
  // layout — поэтому только iOS.
  if (typeof tg.requestFullscreen === 'function' && tg.platform === 'ios') {
    try { tg.requestFullscreen(); } catch (e) {}
  }

  try { tg.setHeaderColor && tg.setHeaderColor('#ffffff'); } catch (e) {}
  try { tg.setBackgroundColor && tg.setBackgroundColor('#ffffff'); } catch (e) {}

  // Если вьюпорт «схлопнется» — принудительно разворачиваем обратно.
  try {
    tg.onEvent && tg.onEvent('viewportChanged', (e) => {
      if (e && e.isStateStable && tg.isExpanded === false) {
        try { tg.expand(); } catch (err) {}
      }
    });
  } catch (e) {}

  // Telegram safe-area (Bot API 8.0+) — навешиваем .tg-knows-safe-area и
  // выставляем --tg-top/bottom/left/right в актуальные значения для режима
  // (overlay close-кнопка vs нативный title-bar над WebView).
  function applyTgSafeArea() {
    const csa = tg.contentSafeAreaInset;
    const sa  = tg.safeAreaInset;
    const hasApi = (csa && typeof csa.top === 'number') ||
                   (sa  && typeof sa.top  === 'number');
    const root = document.documentElement;
    if (!hasApi) {
      root.classList.remove('tg-knows-safe-area');
      return;
    }
    root.classList.add('tg-knows-safe-area');
    const num = (v) => (typeof v === 'number' && !isNaN(v) ? v : 0);
    const top    = Math.max(num(csa && csa.top),    num(sa && sa.top));
    const bottom = Math.max(num(csa && csa.bottom), num(sa && sa.bottom));
    const left   = Math.max(num(csa && csa.left),   num(sa && sa.left));
    const right  = Math.max(num(csa && csa.right),  num(sa && sa.right));
    const r = root.style;
    r.setProperty('--tg-top',    top    + 'px');
    r.setProperty('--tg-bottom', bottom + 'px');
    r.setProperty('--tg-left',   left   + 'px');
    r.setProperty('--tg-right',  right  + 'px');
  }
  applyTgSafeArea();
  ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','viewportChanged'].forEach((ev) => {
    try { tg.onEvent && tg.onEvent(ev, applyTgSafeArea); } catch (e) {}
  });
}

function initScreens() {
  const menuScreen = document.getElementById('menuScreen');
  const editorScreen = document.getElementById('editorScreen');
  const backBtn = document.getElementById('backBtn');

  function showMenu() {
    menuScreen.hidden = false;
    editorScreen.hidden = true;
    if (tg && tg.BackButton) {
      try { tg.BackButton.hide(); } catch (e) {}
    }
    window.scrollTo(0, 0);
  }
  function showEditor() {
    menuScreen.hidden = true;
    editorScreen.hidden = false;
    if (tg && tg.BackButton) {
      try { tg.BackButton.show(); } catch (e) {}
    }
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.menu-item[data-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.classList.contains('locked')) return;
      const mode = el.dataset.mode;
      if (mode === 'text') showEditor();
      // место для будущих режимов: 'demotivator', 'shakal'
    });
  });

  backBtn.addEventListener('click', showMenu);

  // Нативная back-кнопка Telegram (стрелка в хедере iOS, системная Back на Android)
  if (tg && tg.BackButton && typeof tg.BackButton.onClick === 'function') {
    try { tg.BackButton.onClick(showMenu); } catch (e) {}
  }

  // Стартуем с меню
  showMenu();
}

// Перехватываем t.me-ссылки и открываем через нативный API Telegram, иначе
// в WebView они отрабатывают непредсказуемо (особенно invite-ссылки на каналы).
function initTelegramLinks() {
  if (!tg || typeof tg.openTelegramLink !== 'function') return;
  document.querySelectorAll('a[href^="https://t.me/"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      try { tg.openTelegramLink(a.href); } catch (err) {}
    });
  });
}
