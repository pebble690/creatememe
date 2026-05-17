// app.js — bootstrap.
// Делает: detect Telegram → gate browser-входы, init Telegram API,
// разводит экраны меню ↔ редактор, диспетчит выбор режима из меню.
// Логика конкретных режимов — в modes/*.

import { tg, showToast } from './shared.js';
import { initTextMeme } from './modes/text-meme.js';
// Stub-импорты, чтобы файлы существовали в сборке и были видны как точки расширения.
import './modes/demotivator.js';
import './modes/shakal.js';

// Backend для проверки подписки (см. /Users/artemshabalin/Desktop/tg-sub-bot)
const SUB_API = 'http://204.168.207.71:3001';
const SUB_CHANNEL = '@zteptech';
const SUB_TIMEOUT_MS = 5000;

const isInTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');

if (isInTelegram) {
  document.body.classList.add('in-tg');
  initTelegram();
  initScreens();
  initTextMeme();
  initTelegramLinks();
  initSubscriptionGate();
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

  // Стартовый экран ставит initSubscriptionGate (loading → menu/subscription).
}

// --- Гейт подписки на канал ---
// При входе: показываем loading-screen, дёргаем /check бэкенда tg-sub-bot,
// дальше — одно из:
//   * подписан → меню (обычный путь)
//   * не подписан → subscription-screen с кнопками «Подписаться» / «Проверить»
//   * сервер/бот недоступны → пускаем в меню, в футере шильдик «Сервер неактивен»
function initSubscriptionGate() {
  const loadingScreen = document.getElementById('loadingScreen');
  const subscriptionScreen = document.getElementById('subscriptionScreen');
  const menuScreen = document.getElementById('menuScreen');
  const editorScreen = document.getElementById('editorScreen');
  const recheckBtn = document.getElementById('recheckBtn');
  const footerStatus = document.getElementById('footerStatus');

  function setFooterStatus(text) {
    if (!footerStatus) return;
    if (text) {
      footerStatus.textContent = text;
      footerStatus.hidden = false;
    } else {
      footerStatus.textContent = '';
      footerStatus.hidden = true;
    }
  }

  function showOnly(target) {
    [loadingScreen, subscriptionScreen, menuScreen, editorScreen].forEach((s) => {
      if (s) s.hidden = s !== target;
    });
  }

  async function fetchCheck(userId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SUB_TIMEOUT_MS);
    try {
      const url = `${SUB_API}/check?user_id=${encodeURIComponent(userId)}` +
                  `&channel=${encodeURIComponent(SUB_CHANNEL)}`;
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      const d = await r.json();
      return { ok: true, data: d };
    } catch (e) {
      // network / mixed-content / timeout / non-JSON — единый «нет связи» исход
      return { ok: false, error: e };
    } finally {
      clearTimeout(timer);
    }
  }

  async function check() {
    showOnly(loadingScreen);

    const userId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
    if (!userId) {
      // initData нет (предпросмотр / битый launch) — пускаем в меню, помечаем
      setFooterStatus('Сервер неактивен');
      showOnly(menuScreen);
      return;
    }

    const res = await fetchCheck(userId);

    if (!res.ok) {
      // Сервер/бот недоступны → graceful fallback
      setFooterStatus('Сервер неактивен');
      showOnly(menuScreen);
      return;
    }

    const d = res.data;
    // PARTICIPANT_ID_INVALID == юзер ни разу не заходил в канал, трактуем как not-subscribed
    const isParticipantInvalid = !d.ok && typeof d.description === 'string' &&
                                 d.description.includes('PARTICIPANT_ID_INVALID');
    const subscribed = d.ok && d.subscribed === true;
    const notSubscribed = (d.ok && d.subscribed === false) || isParticipantInvalid;

    if (subscribed) {
      setFooterStatus('');
      showOnly(menuScreen);
      return;
    }
    if (notSubscribed) {
      setFooterStatus('');
      showOnly(subscriptionScreen);
      return;
    }

    // Прочие server-side ошибки (channel_not_allowed, bad_user_id…) → fallback
    console.warn('subscription check unexpected response', d);
    setFooterStatus('Сервер неактивен');
    showOnly(menuScreen);
  }

  if (recheckBtn) {
    recheckBtn.addEventListener('click', async () => {
      const wasOnSub = !subscriptionScreen.hidden;
      const original = recheckBtn.textContent;
      recheckBtn.disabled = true;
      recheckBtn.textContent = 'Проверяем…';
      await check();
      // Если после проверки всё ещё на subscription-экране — значит, не подписался
      if (wasOnSub && !subscriptionScreen.hidden) {
        showToast('Подписка не найдена. Подпишитесь и попробуйте снова.', 4000);
      }
      recheckBtn.disabled = false;
      recheckBtn.textContent = original;
    });
  }

  check();
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
