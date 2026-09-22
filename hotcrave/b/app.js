import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';
import { deleteUser, getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

const API_BASE = 'https://hotcrave-api-staging-274560140811.southamerica-east1.run.app';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBG67zAGYRofPjCxu02oRKfPjD_v1HHiOrM',
  authDomain: 'hotcrave-app.firebaseapp.com',
  projectId: 'hotcrave-app',
  appId: '1:274560140811:web:841b72c8b3c8a0fae4e90e',
};
const VAPID_PUBLIC_KEY = 'BDg-XcXynucOK0vVTmk0WorOaga5lcd9ewEtpBh75Z8Hn9_b6iI_LKlkw1ZoU6I5iPm2g26rDfLIPJ3eE9PlQLI';

const state = { businessId: null, business: null, following: false, subscription: null, productNotificationIds: null, productNotificationsConfigured: false };
const firebaseAuth = getAuth(initializeApp(FIREBASE_CONFIG));

async function ensurePushUser() {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser;
  const credential = await signInAnonymously(firebaseAuth);
  return credential.user;
}

const app = document.getElementById('app');
const content = document.createElement('div');
content.className = 'content';
app.replaceChildren(content);

function escapePathSegment(value) {
  return encodeURIComponent(value);
}

async function api(path, options = {}) {
  const token = firebaseAuth.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let message = 'No se pudo completar la solicitud.';
    try { message = (await response.json()).message || message; } catch (_) {}
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

function card(title, body) {
  const element = document.createElement('section');
  element.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = body;
  element.append(heading, paragraph);
  return element;
}

function renderLoading() {
  content.replaceChildren(card('Calentitos', 'Cargando información del negocio…'));
}

function renderError(message) {
  const section = card('No pudimos acceder', message);
  const link = document.createElement('a');
  link.href = '/';
  link.className = 'button secondary';
  link.textContent = 'Ir al inicio';
  section.append(link);
  content.replaceChildren(section);
}

function renderBusiness() {
  const business = state.business;
  content.replaceChildren();

  const hero = document.createElement('section');
  hero.className = 'hero-card';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'CALENTITOS';
  const title = document.createElement('h1');
  title.textContent = business.name;
  const location = document.createElement('p');
  location.textContent = business.location;
  hero.append(eyebrow, title, location);
  content.append(hero);

  const productsSection = document.createElement('section');
  productsSection.className = 'card';
  const productsTitle = document.createElement('h2');
  productsTitle.textContent = 'Productos';
  productsSection.append(productsTitle);
  const products = state.products || [];
  if (!products.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Este negocio todavía no tiene productos publicados.';
    productsSection.append(empty);
  } else {
    const selectionHeader = document.createElement('div');
    selectionHeader.className = 'product-selection-header';
    const selectionTitle = document.createElement('p');
    selectionTitle.className = 'product-selection-title';
    selectionTitle.textContent = calentitosLang === 'en' ? 'Hot Event alerts' : 'Alertas de Hot Events';
    const allButton = document.createElement('button');
    allButton.className = 'product-all-button';
    allButton.type = 'button';
    allButton.textContent = calentitosLang === 'en' ? 'All' : 'Todos';
    allButton.addEventListener('click', () => setAllProductNotifications(products));
    selectionHeader.append(selectionTitle, allButton);
    productsSection.append(selectionHeader);
    const list = document.createElement('ul');
    list.className = 'product-list';
    products.forEach(product => {
      const item = document.createElement('li');
      item.className = 'product-item';
      const name = document.createElement('span');
      name.textContent = product.name;
      const button = document.createElement('button');
      button.className = 'product-notification-button';
      button.type = 'button';
      button.setAttribute('aria-label', (calentitosLang === 'en' ? 'Toggle alerts for ' : 'Alternar alertas para ') + product.name);
      button.setAttribute('aria-pressed', String(isProductNotificationSelected(product.productId)));
      button.title = calentitosLang === 'en' ? 'Hot Event alerts' : 'Alertas de Hot Events';
      button.textContent = isProductNotificationSelected(product.productId) ? '🔔' : '🔕';
      button.addEventListener('click', () => toggleProductNotification(product.productId));
      item.append(name, button);
      list.append(item);
    });
    productsSection.append(list);
    const hint = document.createElement('p');
    hint.className = 'product-selection-hint';
    hint.textContent = calentitosLang === 'en' ? 'Choose which products you want to hear about.' : 'Elegí sobre qué productos querés recibir alertas.';
    productsSection.append(hint);
  }
  content.append(productsSection);

  if (state.hotEvent) {
    const event = state.hotEvent;
    const eventCard = document.createElement('section');
    eventCard.className = 'card hot-card';
    const heading = document.createElement('h2');
    heading.textContent = '🔥 Hot Event';
    const product = document.createElement('p');
    product.textContent = event.product.name;
    const status = document.createElement('strong');
    status.textContent = event.hotEvent.status === 'AVAILABLE_NOW' ? 'Disponible ahora' : event.hotEvent.status === 'SOLD_OUT' ? 'Agotado' : 'Próximamente';
    eventCard.append(heading, product, status);
    content.append(eventCard);
  }

  const notificationCard = document.createElement('section');
  notificationCard.className = 'card notification-card';
  const notificationTitle = document.createElement('h2');
  notificationTitle.textContent = state.following ? 'Alertas activadas' : '¿Querés enterarte cuando haya algo nuevo?';
  const notificationText = document.createElement('p');
  notificationText.textContent = state.following ? 'Recibirás una notificación cuando este negocio publique un Hot Event.' : 'Seguí este negocio desde tu iPhone o navegador compatible para recibir alertas de Hot Events.';
  const button = document.createElement('button');
  button.className = 'button primary';
  button.type = 'button';
  button.textContent = state.following ? 'Dejar de recibir alertas' : 'Activar alertas';
  button.addEventListener('click', () => toggleNotifications(button));
  notificationCard.append(notificationTitle, notificationText, button);
  content.append(notificationCard);

  const note = document.createElement('p');
  note.className = 'privacy-note';
  note.textContent = 'Las notificaciones son opcionales y podés desactivarlas cuando quieras.';
  content.append(note);

  const businessAccessCard = document.createElement('section');
  businessAccessCard.className = 'card';
  const businessAccessTitle = document.createElement('h2');
  businessAccessTitle.textContent = '¿Sos dueño de un negocio?';
  const businessAccessButton = document.createElement('a');
  businessAccessButton.className = 'button secondary';
  businessAccessButton.href = 'https://jsdevmobile.com/hotcrave/business/';
  businessAccessButton.textContent = 'Acceso para negocios →';
  businessAccessCard.append(businessAccessTitle, businessAccessButton);
  content.append(businessAccessCard);
}

async function load() {
  const match = window.location.pathname.match(/^\/hotcrave\/b\/([^/]+)\/?$/i);
  if (!match) {
    renderError('El enlace de este código QR no es válido.');
    return;
  }
  state.businessId = decodeURIComponent(match[1]);
  if (!/^business_[A-Za-z0-9_-]{12,64}$/.test(state.businessId)) {
    renderError('El enlace de este código QR no es válido.');
    return;
  }

  renderLoading();
  try {
    const [business, productsResponse, hotEventsResponse] = await Promise.all([
      api(`/business/${escapePathSegment(state.businessId)}`),
      api(`/business/${escapePathSegment(state.businessId)}/products`),
      api('/hot-events'),
    ]);
    state.business = business;
    state.products = productsResponse.products || [];
    state.hotEvent = (hotEventsResponse.hotEvents || []).find(item => item.business.businessId === state.businessId) || null;
    await restoreProductNotificationSelection();
    await restorePushSubscription();
    document.title = `${business.name} · Calentitos`;
    renderBusiness();
  } catch (error) {
    renderError(error.message);
  }
}

async function openProductNotificationDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('calentitos-notifications', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('businesses', { keyPath: 'businessId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getProductNotificationSelection(businessId) {
  try {
    const db = await openProductNotificationDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction('businesses', 'readonly').objectStore('businesses').get(businessId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('No se pudo leer la selección de productos.', error);
    return null;
  }
}

async function saveProductNotificationSelection(productIds) {
  const db = await openProductNotificationDb();
  await new Promise((resolve, reject) => {
    const request = db.transaction('businesses', 'readwrite').objectStore('businesses').put({ businessId: state.businessId, productIds: [...new Set(productIds)], configured: true, updatedAt: Date.now() });
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  state.productNotificationIds = [...new Set(productIds)];
  state.productNotificationsConfigured = true;
}

async function restoreProductNotificationSelection() {
  const saved = await getProductNotificationSelection(state.businessId);
  if (!saved) {
    state.productNotificationIds = (state.products || []).map(product => product.productId);
    state.productNotificationsConfigured = false;
    return;
  }
  state.productNotificationIds = saved.productIds || [];
  state.productNotificationsConfigured = true;
}

function isProductNotificationSelected(productId) {
  if (!state.productNotificationsConfigured) return true;
  return state.productNotificationIds.includes(productId);
}

async function setAllProductNotifications(products) {
  try {
    await saveProductNotificationSelection(products.map(product => product.productId));
    renderBusiness();
  } catch (error) {
    alert(calentitosLang === 'en' ? 'Could not save product alerts.' : 'No se pudieron guardar las alertas de productos.');
  }
}

async function toggleProductNotification(productId) {
  const selected = new Set(state.productNotificationsConfigured ? state.productNotificationIds : (state.products || []).map(product => product.productId));
  if (selected.has(productId)) selected.delete(productId);
  else selected.add(productId);
  try {
    await saveProductNotificationSelection([...selected]);
    renderBusiness();
  } catch (error) {
    alert(calentitosLang === 'en' ? 'Could not save product alerts.' : 'No se pudieron guardar las alertas de productos.');
  }
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function getCurrentPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  await navigator.serviceWorker.register('/hotcrave/b/sw.js', { scope: '/hotcrave/b/' });
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function restorePushSubscription() {
  try {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) {
      state.subscription = null;
      state.following = false;
      return;
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      state.subscription = null;
      state.following = false;
      return;
    }

    state.subscription = subscription;
    state.following = true;
  } catch (error) {
    console.warn('No se pudo restaurar la suscripción de notificaciones.', error);
    state.subscription = null;
    state.following = false;
  }
}

function showIosInstallInstructions() {
  const overlay = document.createElement('div');
  overlay.className = 'ios-install-overlay';

  const dialog = document.createElement('section');
  dialog.className = 'ios-install-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'ios-install-title');

  const title = document.createElement('h2');
  title.id = 'ios-install-title';
  title.textContent = '🔥 Activá las alertas';

  const intro = document.createElement('p');
  intro.textContent = 'Para recibir notificaciones en iPhone, primero agregá la app Calentitos a tu pantalla de inicio.';

  const steps = document.createElement('ol');
  steps.className = 'ios-install-steps';

  const step1 = document.createElement('li');
  step1.innerHTML = 'Tocá los tres puntitos … de Safari y elegí <strong>Compartir</strong>';

  const step2 = document.createElement('li');
  step2.innerHTML = 'Elegí <strong>“+ Agregar a inicio”</strong>.';

  const step3 = document.createElement('li');
  step3.innerHTML = 'Tocá <strong>“Agregar”</strong>.';

  const step4 = document.createElement('li');
  step4.innerHTML = 'Abrí <strong>Calentitos</strong> desde el nuevo ícono de tu pantalla de inicio y tocá “Activar alertas”';

  steps.append(step1, step2, step3, step4);

  const activateButton = document.createElement('button');
  activateButton.className = 'button primary ios-install-button';
  activateButton.type = 'button';
  activateButton.textContent = 'Ya la agregué → Activar alertas';
  activateButton.addEventListener('click', () => {
    if (!isStandalone()) {
      alert('Abrí Calentitos desde el nuevo ícono de la pantalla de inicio para activar las alertas.');
      return;
    }
    overlay.remove();
    toggleNotifications(activateButton);
  });

  const closeButton = document.createElement('button');
  closeButton.className = 'button secondary ios-install-close';
  closeButton.type = 'button';
  closeButton.textContent = 'Ahora no';
  closeButton.addEventListener('click', () => overlay.remove());

  dialog.append(title, intro, steps, activateButton, closeButton);
  overlay.append(dialog);
  document.body.append(overlay);
}

async function toggleNotifications(button) {
  button.disabled = true;
  try {
    await ensurePushUser();
    if (state.following) {
      if (state.subscription) {
        const json = state.subscription.toJSON();
        await api('/web/push/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({
            businessId: state.businessId,
            endpoint: json.endpoint,
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          }),
        });
        await state.subscription.unsubscribe();
      }
      if (firebaseAuth.currentUser) await deleteUser(firebaseAuth.currentUser).catch(() => {});
      state.following = false;
      state.subscription = null;
      renderBusiness();
      return;
    }

    if (isIos() && !isStandalone()) {
      showIosInstallInstructions();
      button.disabled = false;
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw new Error('Este navegador no admite notificaciones web.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Las notificaciones no fueron habilitadas.');

    const subscription = await getCurrentPushSubscription() || await (async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY) });
    })();
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('No se pudo crear la suscripción de notificaciones.');

    await api('/web/push/subscriptions', {
      method: 'PUT',
      body: JSON.stringify({ businessId: state.businessId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
    });
    state.subscription = subscription;
    state.following = true;
    renderBusiness();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}

load();


const CALENTITOS_LANG_KEY = 'calentitos_lang';
let calentitosLang = localStorage.getItem(CALENTITOS_LANG_KEY) || (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es';
if (!['es', 'en'].includes(calientitosLangSafe())) calentitosLang = 'es';

function calientitosLangSafe() {
  return calentitosLang;
}

const CALENTITOS_I18N = {
  'Calentitos': 'Calentitos',
  'Cargando información del negocio…': 'Loading business information…',
  'No pudimos acceder': 'We could not access this business',
  'Ir al inicio': 'Go to home',
  'El enlace de este código QR no es válido.': 'This QR code link is not valid.',
  'Productos': 'Products',
  'Este negocio todavía no tiene productos publicados.': 'This business has no published products yet.',
  'Disponible ahora': 'Available now',
  'Agotado': 'Sold out',
  'Próximamente': 'Coming soon',
  'Alertas activadas': 'Alerts enabled',
  '¿Querés enterarte cuando haya algo nuevo?': 'Want to know when something new is available?',
  'Recibirás una notificación cuando este negocio publique un Hot Event.': 'You will receive a notification when this business publishes a Hot Event.',
  'Seguí este negocio desde tu iPhone o navegador compatible para recibir alertas de Hot Events.': 'Follow this business from your iPhone or compatible browser to receive Hot Event alerts.',
  'Dejar de recibir alertas': 'Stop receiving alerts',
  'Activar alertas': 'Enable alerts',
  'Las notificaciones son opcionales y podés desactivarlas cuando quieras.': 'Notifications are optional and can be disabled at any time.',
  '¿Sos dueño de un negocio?': 'Do you own a business?',
  'Acceso para negocios →': 'Business access →',
  '🔥 Activá las alertas': '🔥 Enable alerts',
  'Para recibir notificaciones en iPhone, primero agregá la app Calentitos a tu pantalla de inicio.': 'To receive notifications on iPhone, first add the Calentitos app to your Home Screen.',
  'Tocá los tres puntitos … de Safari y elegí Compartir': 'Tap Safari’s three-dot menu … and choose Share',
  'Elegí “+ Agregar a inicio”.': 'Choose “+ Add to Home Screen”.',
  'Tocá “Agregar”.': 'Tap “Add”.',
  'Abrí Calentitos desde el nuevo ícono de tu pantalla de inicio y tocá “Activar alertas”': 'Open Calentitos from the new Home Screen icon and tap “Enable alerts”',
  'Ya la agregué → Activar alertas': 'I added it → Enable alerts',
  'Ahora no': 'Not now',
  'Abrí Calentitos desde el nuevo ícono de la pantalla de inicio para activar las alertas.': 'Open Calentitos from the new Home Screen icon to enable alerts.',
  'Este navegador no admite notificaciones web.': 'This browser does not support web notifications.',
  'Las notificaciones no fueron habilitadas.': 'Notifications were not enabled.',
  'No se pudo crear la suscripción de notificaciones.': 'Could not create the notification subscription.',
  'Alertas de Hot Events': 'Hot Event alerts',
  'Elegí sobre qué productos querés recibir alertas.': 'Choose which products you want to hear about.',
  'Todos': 'All',
  'No se pudieron guardar las alertas de productos.': 'Could not save product alerts.',
  'Enlace copiado.': 'Link copied.',
  'No se pudo copiar automáticamente. Seleccioná el enlace para copiarlo.': 'Could not copy automatically. Select the link to copy it.',
  'No se pudo generar el QR.': 'Could not generate the QR code.',
  'No se pudo cargar el generador de QR. Recargá la página.': 'Could not load the QR generator. Reload the page.',
  'es': 'es',
  'en': 'en'
};

const CALENTITOS_REVERSE_I18N = Object.fromEntries(Object.entries(CALENTITOS_I18N).map(([es, en]) => [en, es]));

function calentitosTranslateText(text) {
  if (calentitosLang === 'es') return CALENTITOS_REVERSE_I18N[text] || text;
  return CALENTITOS_I18N[text] || text;
}

function calentitosApplyLanguage() {
  document.documentElement.lang = calentitosLang;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (node.parentElement?.closest('.calentitos-web-footer')) return;
    const translated = calentitosTranslateText(node.nodeValue.trim());
    if (translated !== node.nodeValue.trim() && node.nodeValue.trim()) {
      node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translated);
    }
  });
  const title = document.querySelector('title');
  if (title) title.textContent = calentitosLang === 'en' ? 'Business · Calentitos' : 'Negocio · Calentitos';
}

function calentitosLegalFooter() {
  const footer = document.createElement('footer');
  footer.className = 'calentitos-web-footer';
  footer.innerHTML = `
    <div class="language-switcher" aria-label="Language">
      <button type="button" data-calentitos-lang="es">ES</button>
      <button type="button" data-calentitos-lang="en">EN</button>
    </div>
    <div class="legal-links">
      <a href="${calentitosLang === "en" ? "/calentitos/privacy" : "/calentitos/privacidad"}">${calentitosLang === "en" ? "Privacy Policy" : "Política de privacidad"}</a>
      <span>·</span>
      <a href="${calentitosLang === "en" ? "/calentitos/terms" : "/calentitos/terminos"}">${calentitosLang === "en" ? "Terms and Conditions" : "Términos y condiciones"}</a>
    </div>
  `;
  footer.querySelectorAll('[data-calentitos-lang]').forEach(button => {
    button.addEventListener('click', () => {
      calentitosLang = button.dataset.calentitosLang;
      localStorage.setItem(CALENTITOS_LANG_KEY, calentitosLang);
      calentitosApplyLanguage();
    });
  });
  return footer;
}

function calentitosEnsureChrome() {
  if (!document.querySelector('.calentitos-web-footer')) content.append(calentitosLegalFooter());
  calentitosApplyLanguage();
}

new MutationObserver(() => {
  clearTimeout(window.__calentitosI18nTimer);
  window.__calentitosI18nTimer = setTimeout(calentitosEnsureChrome, 0);
}).observe(content, { childList: true, subtree: true });

calentitosEnsureChrome();
