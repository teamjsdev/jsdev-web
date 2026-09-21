import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const API_BASE = "https://hotcrave-api-staging-274560140811.southamerica-east1.run.app";
const BUSINESS_WEB_BASE = "https://jsdevmobile.com/hotcrave/b/";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBG67zAGYRofpCxu02oRKfPjD_v1HHiOrM",
  authDomain: "hotcrave-app.firebaseapp.com",
  projectId: "hotcrave-app",
  appId: "1:274560140811:web:841b72c8b3c8a0fae4e90e",
};

const appRoot = document.querySelector("#app");
let auth = null;
let currentUser = null;
let businessContext = null;
let entitlements = null;
let products = [];
let hotEvents = [];
let activeView = "hot-events";

function configured() {
  return Object.values(FIREBASE_CONFIG).every((value) => value && !value.startsWith("REPLACE_WITH_"));
}

function render(html) {
  appRoot.innerHTML = html;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function effectiveStatus(event, now = Date.now()) {
  if (event.status === "SOLD_OUT") return "SOLD_OUT";
  const expiresAt = new Date(event.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt <= now) return "EXPIRED";
  return event.status;
}

function statusLabel(status) {
  return {
    AVAILABLE_NOW: "Disponible ahora",
    READY_IN_15_MIN: "Listo en 15 min",
    READY_IN_30_MIN: "Listo en 30 min",
    SOLD_OUT: "Agotado",
    EXPIRED: "Expirado",
  }[status] || status;
}

function statusClass(status) {
  if (status === "SOLD_OUT") return "status-sold";
  if (status === "EXPIRED") return "status-expired";
  if (status === "AVAILABLE_NOW") return "status-live";
  return "status-ready";
}

function apiErrorMessage(error) {
  const messages = {
    PRODUCT_NOT_FOUND: "No encontramos ese producto.",
    PRODUCT_INACTIVE: "Ese producto no está activo.",
    PRODUCT_LIMIT_REACHED: "Alcanzaste el límite de productos de tu plan.",
    CUSTOM_PRODUCT_REQUIRES_PREMIUM: "Los productos personalizados requieren HotCrave Premium.",
    CUSTOM_CATEGORY_REQUIRES_PREMIUM: "Las categorías personalizadas requieren HotCrave Premium.",
    INVALID_PRODUCT_CATEGORY: "La categoría no es válida para este producto.",
    HOT_EVENT_LIMIT_REACHED: "Alcanzaste el límite de Hot Events activos de tu plan.",
    INVALID_HOT_EVENT_DURATION: "La duración seleccionada no está disponible para tu plan.",
    HOT_EVENT_NOT_FOUND: "No encontramos ese Hot Event.",
    HOT_EVENT_EXPIRED: "Ese Hot Event ya venció.",
    HOT_EVENT_NOT_ACTIVE: "Ese Hot Event ya no está disponible para marcar como agotado.",
    BUSINESS_NOT_FOUND: "No encontramos tu negocio.",
    PREDEFINED_PRODUCT_CANNOT_BE_DELETED: "Los productos predefinidos no se pueden eliminar.",
  };
  return messages[error?.code] || "No se pudo completar la operación. Intentá nuevamente.";
}

async function api(path, options = {}) {
  const token = await currentUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let error = null;
    try { error = await response.json(); } catch {}
    const exception = new Error(error?.message || "Request failed");
    exception.code = error?.code;
    exception.status = response.status;
    throw exception;
  }
  if (response.status === 204) return null;
  return response.json();
}

function isManager() {
  return ["OWNER", "MANAGER"].includes(businessContext?.membership?.role);
}

async function loadBusiness() {
  return api("/business/me");
}

async function loadProducts() {
  const response = await api("/business/me/products");
  products = response.products || [];
}

async function loadHotEvents() {
  const response = await api("/business/me/hot-events");
  hotEvents = response.hotEvents || [];
}

async function loadEntitlements() {
  try {
    entitlements = await api("/me/entitlements");
  } catch {
    entitlements = null;
  }
}

async function refreshData() {
  await Promise.all([loadBusinessData(), loadEntitlements()]);
}

async function loadBusinessData() {
  businessContext = await loadBusiness();
  await Promise.all([loadProducts(), loadHotEvents()]);
}

function shell(content) {
  const business = businessContext.business;
  const items = [
    ["hot-events", "♨", "Hot Events"],
    ["profile", "◉", "Perfil"],
    ["products", "▦", "Productos"],
    ["qr", "⌁", "QR"],
    ["premium", "★", "Premium"],
    ["dashboard", "•", "Resumen"],
  ];
  const nav = items.map(([view, icon, label]) => `<button class="${activeView === view ? "nav-active" : ""}" data-view="${view}"><span aria-hidden="true">${icon}</span>${label}</button>`).join("");
  return `<div class="business-shell"><header class="topbar"><div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><strong>Panel de negocio</strong></div><div class="topbar-actions"><span class="business-name">${escapeHtml(business?.name || "Tu negocio")}</span><button id="logout" class="secondary">Cerrar sesión</button></div></header><main class="dashboard"><nav class="business-nav" aria-label="Administración">${nav}</nav>${content}</main></div>`;
}

function loadingPage(message = "Cargando…") {
  render(`<section class="loading-shell"><div class="spinner"></div><p>${escapeHtml(message)}</p></section>`);
}

function pageHeading(eyebrow, title, description = "") {
  return `<section class="page-heading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}</section>`;
}

function hotEventsView(message = "", error = false) {
  const business = businessContext.business;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  const active = hotEvents.filter((event) => {
    const status = effectiveStatus(event);
    return status !== "SOLD_OUT" && status !== "EXPIRED";
  }).length;
  const options = products.map((product) => `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.name)}</option>`).join("");
  const eventCards = hotEvents.length
    ? hotEvents.slice().sort((a, b) => new Date(b.createdAt || b.availableAt || 0) - new Date(a.createdAt || a.availableAt || 0)).map((event) => {
        const product = products.find((item) => item.productId === event.productId);
        const status = effectiveStatus(event);
        const canSoldOut = isManager() && status === "AVAILABLE_NOW";
        return `<article class="event-card"><div class="event-card-main"><div class="event-title-row"><h3>${escapeHtml(product?.name || "Producto")}</h3><span class="event-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></div><p class="muted">Disponible: ${escapeHtml(formatDate(event.availableAt))}</p><p class="event-expiry">Vence: ${escapeHtml(formatDate(event.expiresAt))}</p></div>${canSoldOut ? `<button class="secondary sold-out" data-event-id="${escapeHtml(event.hotEventId)}">Marcar agotado</button>` : ""}</article>`;
      }).join("")
    : `<div class="empty-card"><span>♨</span><h3>No hay Hot Events todavía</h3><p class="muted">Publicá el primero y avisá cuando haya comida recién hecha.</p></div>`;

  const publishForm = isManager()
    ? `<section class="publish-card"><div><p class="eyebrow">NUEVO AVISO</p><h2>Comida recién hecha</h2><p class="muted">Elegí un producto y cuándo querés avisar.</p></div><form id="hot-event-form"><label>Producto<select name="productId" required ${products.length ? "" : "disabled"}>${products.length ? `<option value="">Seleccioná un producto</option>${options}` : "<option>No hay productos activos</option>"}</select></label><fieldset><legend>Estado inicial</legend><label class="radio-option"><input type="radio" name="status" value="AVAILABLE_NOW" checked> Disponible ahora</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_15_MIN"> Listo en 15 minutos</label><label class="radio-option"><input type="radio" name="status" value="READY_IN_30_MIN"> Listo en 30 minutos</label></fieldset><button class="primary" type="submit" ${products.length ? "" : "disabled"}>Publicar Hot Event</button></form></section>`
    : `<section class="info-card"><strong>Solo los responsables del negocio pueden publicar Hot Events.</strong><p class="muted">Tu rol actual es ${escapeHtml(businessContext.membership?.role || "Miembro")}.</p></section>`;

  render(shell(`${pageHeading("PRIORIDAD", "Hot Events", `${active} de ${limit} activos. Publicá rápido cuando tengas comida recién hecha.`)}${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}${publishForm}<section class="section-heading compact"><p class="eyebrow">HISTORIAL</p><h2>Tus Hot Events</h2></section><div class="event-list">${eventCards}</div>`));
  bindShell();
  document.querySelector("#hot-event-form")?.addEventListener("submit", createHotEvent);
  document.querySelectorAll(".sold-out").forEach((button) => button.addEventListener("click", () => markSoldOut(button.dataset.eventId)));
}

function dashboardView() {
  const business = businessContext.business;
  const active = hotEvents.filter((event) => {
    const status = effectiveStatus(event);
    return status !== "SOLD_OUT" && status !== "EXPIRED";
  }).length;
  const limit = business?.plan === "PREMIUM" ? 10 : 1;
  render(shell(`${pageHeading("RESUMEN", "Tu negocio", "Accedé rápidamente a todas las herramientas de Calentitos.")}<section class="hero-card"><div><p class="eyebrow">ESTADO</p><h2>${escapeHtml(business?.name || "Tu negocio")}</h2><p class="muted">Plan ${escapeHtml(business?.plan || "FREE")} · ${escapeHtml(businessContext.membership?.role || "Miembro")}</p></div><button class="primary" id="open-hot-events">Publicar Hot Event</button></section><div class="stats-grid"><button class="stat-card stat-action" data-view="hot-events"><span>♨</span><strong>${active} / ${limit}</strong><p>Hot Events activos</p></button><button class="stat-card stat-action" data-view="products"><span>▦</span><strong>${products.length}</strong><p>Productos activos</p></button><button class="stat-card stat-action" data-view="qr"><span>⌁</span><strong>QR</strong><p>Compartí tu negocio</p></button><button class="stat-card stat-action" data-view="profile"><span>◉</span><strong>Perfil</strong><p>Información pública</p></button></div>`));
  bindShell();
  document.querySelector("#open-hot-events")?.addEventListener("click", () => showHotEvents());
}

function profileView(message = "", error = false) {
  const business = businessContext.business;
  const editable = isManager();
  render(shell(`${pageHeading("PERFIL", "Información del negocio", "Estos datos son los que identifican y presentan a tu negocio en Calentitos.")}${message ? `<p class="${error ? "error" : "success"}" role="status">${escapeHtml(message)}</p>` : ""}<section class="form-card"><form id="profile-form"><label>Nombre del negocio<input name="name" maxlength="120" value="${escapeHtml(business?.name)}" required ${editable ? "" : "disabled"}></label><label>Ubicación<input name="location" maxlength="160" value="${escapeHtml(business?.location)}" required ${editable ? "" : "disabled"}></label><p class="muted small">Las coordenadas actuales del negocio se conservan al editar estos datos.</p><button class="primary" type="submit" ${editable ? "" : "disabled"}>Guardar cambios</button></form></section>`));
  bindShell();
  document.querySelector("#profile-form")?.addEventListener("submit", updateProfile);
}

const WEB_PRODUCT_CATALOG = {
  BAKERY: ["Pan", "Criollos", "Facturas", "Medialunas", "Tortas"],
  PIZZERIA: ["Pizza", "Empanadas", "Fugazzeta", "Calzone", "Pizza muzzarella"],
  RESTAURANT: ["Hamburguesa", "Papas fritas", "Sándwich", "Milanesa", "Ensalada"],
  CAFE: ["Café", "Medialunas", "Tostado", "Muffin", "Croissant"],
  ROTISSERIE: ["Pollo al spiedo", "Milanesas", "Tortilla de papa", "Matambre arrollado", "Pastas caseras"],
  OTHER: ["Tarta", "Pastel", "Wrap", "Bowl", "Snack"],
};

const WEB_PRODUCT_CATEGORY_LABELS = {
  BAKERY: "Panadería",
  PIZZERIA: "Pizzería",
  RESTAURANT: "Restaurante",
  CAFE: "Cafetería",
  ROTISSERIE: "Rotisería",
  OTHER: "Otros",
};

const FREE_PREDEFINED_PRODUCT_LIMIT = 5;
const PREMIUM_CUSTOM_PRODUCT_LIMIT = 100;

function webProductCategory(product) {
  if (product.type === "CUSTOM") return "OTHER";
  const explicit = String(product.category || "").toUpperCase();
  if (WEB_PRODUCT_CATEGORY_LABELS[explicit]) return explicit;

  const name = String(product.name || "").trim().toLowerCase();
  for (const [category, names] of Object.entries(WEB_PRODUCT_CATALOG)) {
    if (names.some((catalogName) => catalogName.toLowerCase() === name)) {
      return category;
    }
  }
  return "OTHER";
}

function productsView(message = "", error = false) {
  const business = businessContext.business;
  const premium = business?.plan === "PREMIUM" || entitlements?.businessPlan === "PREMIUM";
  const customCount = products.filter((product) => product.type === "CUSTOM").length;
  const predefinedCount = products.filter((product) => product.type === "PREDEFINED").length;
  const categories = Object.keys(WEB_PRODUCT_CATALOG);
  const activeCategory = categories.includes(window.__catalogCategory) ? window.__catalogCategory : categories[0];

  const categoryProducts = products.filter((product) =>
    webProductCategory(product) === activeCategory
  );

  // Categories are only an index/filter. They never create separate quotas.
  const available = WEB_PRODUCT_CATALOG[activeCategory].filter((name) =>
    !products.some((product) =>
      product.type === "PREDEFINED" &&
      product.name.toLowerCase() === name.toLowerCase()
    )
  );

  const tabs = categories.map((category) =>
    '<button type="button" class="catalog-tab ' +
    (activeCategory === category ? "active" : "") +
    '" data-catalog-category="' + category + '">' +
    WEB_PRODUCT_CATEGORY_LABELS[category] +
    "</button>"
  ).join("");

  const freePredefinedFull = !premium && predefinedCount >= FREE_PREDEFINED_PRODUCT_LIMIT;
  const addPredefined = available.length
    ? '<div class="catalog-add-list">' +
      available.map((name) =>
        '<button type="button" class="secondary catalog-add-product" data-product-name="' +
        escapeHtml(name) + '"' +
        (!isManager() || freePredefinedFull ? " disabled" : "") +
        '>+ ' + escapeHtml(name) + "</button>"
      ).join("") +
      "</div>"
    : '<p class="muted small">Ya agregaste todos los productos predefinidos de esta categoría.</p>';

  const limitMessage = freePredefinedFull
    ? '<p class="muted small">Alcanzaste los 5 productos predefinidos del plan gratuito. El límite es global y no depende de la categoría.</p>'
    : "";

  const customForm = activeCategory === "OTHER" && isManager()
    ? '<section class="form-card"><div><p class="eyebrow">NUEVO PRODUCTO</p><h2>Agregar producto personalizado</h2><p class="muted">' +
      (premium ? customCount + " / " + PREMIUM_CUSTOM_PRODUCT_LIMIT + " productos personalizados utilizados." : "Los productos personalizados están disponibles con Premium.") +
      '</p></div><form id="product-form"><label>Nombre<input name="name" maxlength="120" placeholder="Ej. Medialuna rellena" required' +
      (premium && customCount < PREMIUM_CUSTOM_PRODUCT_LIMIT ? "" : " disabled") +
      '></label><button class="primary" type="submit"' +
      (premium && customCount < PREMIUM_CUSTOM_PRODUCT_LIMIT ? "" : " disabled") +
      '>Agregar producto</button></form></section>'
    : "";

  const customProducts = products.filter((product) => product.type === "CUSTOM");
  const managementProducts = categoryProducts;
  const customProductsSection = isManager()
    ? '<section class="form-card product-management-card"><div><p class="eyebrow">ADMINISTRAR PRODUCTOS</p><h2>Productos activos</h2><p class="muted">Eliminá productos que ya no ofrecés. Las categorías solo sirven para filtrar.</p></div>' +
      (managementProducts.length
        ? '<div class="product-management-list">' +
          managementProducts.map((product) =>
            '<div class="product-management-row"><div><strong>' +
            escapeHtml(product.name) +
            '</strong><span class="muted small">' + escapeHtml(product.type === "CUSTOM" ? "Personalizado" : "Predefinido") + '</span></div><button class="secondary delete-product" type="button" data-product-id="' +
            escapeHtml(product.productId) +
            '" data-product-name="' + escapeHtml(product.name) +
            '">Eliminar</button></div>'
          ).join("") +
          "</div>"
        : '<p class="muted small">No hay productos activos en esta categoría.</p>') +
      "</section>"
    : "";

  const productCards = categoryProducts.length
    ? categoryProducts.map((product) =>
        '<article class="product-card"><div><h3>' +
        escapeHtml(product.name) +
        '</h3><p class="muted">' +
        escapeHtml(product.type === "CUSTOM" ? "Personalizado" : "Producto predefinido") +
        '</p></div><span class="type-pill">' +
        escapeHtml(product.type === "CUSTOM" ? "Personalizado" : "Predefinido") +
        "</span></article>"
      ).join("")
    : '<div class="empty-card"><span>▦</span><h3>No hay productos activos</h3><p class="muted">Agregá productos de esta categoría para poder publicarlos.</p></div>';

  render(shell(
    pageHeading("PRODUCTOS", "Catálogo", "Las categorías sirven para encontrar productos. El límite de productos es global.") +
    (message ? '<p class="' + (error ? "error" : "success") + '" role="status">' + escapeHtml(message) + "</p>" : "") +
    '<section class="form-card catalog-card"><p class="eyebrow">CATÁLOGO</p><div class="catalog-summary"><strong>' + predefinedCount + ' / ' + FREE_PREDEFINED_PRODUCT_LIMIT + '</strong><span class="muted">productos predefinidos</span>' + (premium ? '<span class="muted"> · ' + customCount + ' / ' + PREMIUM_CUSTOM_PRODUCT_LIMIT + ' personalizados</span>' : '') + '</div><p class="eyebrow">CATEGORÍAS</p><div class="catalog-tabs" role="tablist">' +
    tabs +
    '</div><div class="catalog-panel"><h2>' +
    WEB_PRODUCT_CATEGORY_LABELS[activeCategory] +
    "</h2>" + limitMessage + addPredefined +
    '</div></section>' +
    customForm +
    customProductsSection +
    '<section class="section-heading compact"><p class="eyebrow">ACTIVOS</p><h2>' +
    categoryProducts.length +
    ' productos</h2></section><div class="product-list">' +
    productCards +
    "</div>"
  ));

  bindShell();

  document.querySelectorAll("[data-catalog-category]").forEach((button) =>
    button.addEventListener("click", () => {
      window.__catalogCategory = button.dataset.catalogCategory;
      productsView();
    })
  );

  document.querySelectorAll(".catalog-add-product").forEach((button) =>
    button.addEventListener("click", () => addPredefinedProduct(button.dataset.productName))
  );

  document.querySelector("#product-form")?.addEventListener("submit", createProduct);

  document.querySelectorAll(".delete-product").forEach((button) =>
    button.addEventListener("click", () =>
      deleteProduct(button.dataset.productId, button.dataset.productName)
    )
  );
}

async function addPredefinedProduct(name) {
  if (!isManager()) return;

  const button = [...document.querySelectorAll(".catalog-add-product")]
    .find((element) => element.dataset.productName === name);

  if (button) {
    button.disabled = true;
    button.textContent = "Agregando…";
  }

  try {
    await api("/business/me/products", {
      method: "POST",
      body: JSON.stringify({ name, type: "PREDEFINED", status: "ACTIVE" }),
    });
    await loadProducts();
    productsView("El producto fue agregado al catálogo.");
  } catch (error) {
    productsView(apiErrorMessage(error), true);
  }
}

function qrView() {
  const business = businessContext.business;
  const url = `${BUSINESS_WEB_BASE}${encodeURIComponent(business.businessId)}`;
  render(shell(`${pageHeading("QR", "Código QR del negocio", "Este enlace es permanente y lleva a la experiencia pública de tu negocio.")}<section class="qr-card"><div class="qr-frame"><canvas id="business-qr" width="280" height="280" aria-label="Código QR de tu negocio"></canvas></div><div class="qr-actions"><p class="muted qr-url">${escapeHtml(url)}</p><div class="button-row"><button id="download-qr" class="primary">Descargar QR</button><button id="copy-qr" class="secondary">Copiar enlace</button></div><p id="qr-message" class="small muted" role="status"></p></div></section>`));
  bindShell();
  if (typeof QRCode === "undefined") {
    document.querySelector("#qr-message").textContent = "No se pudo cargar el generador de QR. Recargá la página.";
    return;
  }
  const canvas = document.querySelector("#business-qr");
  QRCode.toCanvas(canvas, url, { width: 280, margin: 2 }, (error) => {
    if (error) document.querySelector("#qr-message").textContent = "No se pudo generar el QR.";
  });
  document.querySelector("#download-qr")?.addEventListener("click", () => downloadQr(canvas, business.name));
  document.querySelector("#copy-qr")?.addEventListener("click", () => copyBusinessUrl(url));
}

function premiumView() {
  const business = businessContext.business;
  const premium = business?.plan === "PREMIUM" || entitlements?.businessPlan === "PREMIUM";
  render(shell(`${pageHeading("PREMIUM", "HotCrave Premium", "Más capacidad para negocios que publican con frecuencia.")}<section class="premium-card ${premium ? "premium-active" : ""}"><div><span class="premium-badge">${premium ? "PREMIUM ACTIVO" : "PLAN GRATUITO"}</span><h2>${premium ? "Tu negocio tiene Premium" : "Potenciá tu negocio"}</h2><p class="muted">${premium ? "Disfrutás de las funciones Premium disponibles para tu negocio." : "Publicá hasta 10 Hot Events activos, agregá hasta 100 productos personalizados, usá categorías personalizadas y configurá la duración de los Hot Events."}</p></div><div class="premium-features"><div><strong>10</strong><span>Hot Events activos</span></div><div><strong>100</strong><span>productos personalizados</span></div><div><strong>15–60 min</strong><span>duración configurable</span></div><div><strong>Sin anuncios</strong><span>experiencia Premium</span></div></div>${!premium ? `<p class="security-note">La suscripción se gestiona mediante Google Play en la app Android. El estado Premium que se muestra acá proviene del backend.</p>` : ""}</section>`));
  bindShell();
}

async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const business = await api("/business/me", {
      method: "PATCH",
      body: JSON.stringify({ name: form.name.value.trim(), location: form.location.value.trim(), latitude: businessContext.business.latitude, longitude: businessContext.business.longitude }),
    });
    businessContext.business = business;
    profileView("Los datos del negocio fueron actualizados.");
  } catch (error) {
    profileView(apiErrorMessage(error), true);
  }
}

async function createProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Agregando…";
  try {
    await api("/business/me/products", {
      method: "POST",
      body: JSON.stringify({ name: form.name.value.trim(), type: "CUSTOM", status: "ACTIVE", category: "OTHER" }),
    });
    await loadProducts();
    productsView("El producto fue agregado al catálogo.");
  } catch (error) {
    productsView(apiErrorMessage(error), true);
  }
}

async function deleteProduct(productId, productName) {
  if (!isManager()) return;
  const confirmed = window.confirm(`¿Eliminar "${productName}" del catálogo? Esta acción no se puede deshacer.`);
  if (!confirmed) return;
  const button = document.querySelector(`.delete-product[data-product-id="${CSS.escape(productId)}"]`);
  if (button) { button.disabled = true; button.textContent = "Eliminando…"; }
  try {
    await api(`/business/me/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
    await loadProducts();
    productsView("El producto fue eliminado del catálogo.");
  } catch (error) {
    productsView(apiErrorMessage(error), true);
  }
}

async function createHotEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Publicando…";
  try {
    await api("/business/me/hot-events", {
      method: "POST",
      body: JSON.stringify({ productId: form.productId.value, status: form.status.value }),
    });
    await loadHotEvents();
    hotEventsView("Hot Event publicado correctamente.");
  } catch (error) {
    hotEventsView(apiErrorMessage(error), true);
  }
}

async function markSoldOut(hotEventId) {
  try {
    await api(`/business/me/hot-events/${encodeURIComponent(hotEventId)}/sold-out`, { method: "POST" });
    await loadHotEvents();
    hotEventsView("El Hot Event fue marcado como agotado.");
  } catch (error) {
    hotEventsView(apiErrorMessage(error), true);
  }
}

async function downloadQr(canvas, businessName) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${businessName || "calentitos"}-qr.png`.replace(/[^a-z0-9._-]+/gi, "-");
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

async function copyBusinessUrl(url) {
  const message = document.querySelector("#qr-message");
  try {
    await navigator.clipboard.writeText(url);
    message.textContent = "Enlace copiado.";
  } catch {
    message.textContent = "No se pudo copiar automáticamente. Seleccioná el enlace para copiarlo.";
  }
}

function showHotEvents() {
  activeView = "hot-events";
  hotEventsView();
}

function showView(view) {
  activeView = view;
  if (view === "hot-events") hotEventsView();
  else if (view === "profile") profileView();
  else if (view === "products") productsView();
  else if (view === "qr") qrView();
  else if (view === "premium") premiumView();
  else dashboardView();
}

function bindShell() {
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
}

function login(errorMessage = "") {
  render(`<section class="auth-shell"><div class="auth-card"><div class="brand-mark">♨</div><p class="eyebrow">CALENTITOS · NEGOCIOS</p><h1>Gestioná tu negocio</h1><p class="muted">Accedé al espacio de administración de tu negocio.</p>${errorMessage ? `<p class="error" role="alert">${escapeHtml(errorMessage)}</p>` : ""}<form id="login-form"><label>Correo electrónico<input name="email" type="email" autocomplete="email" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Ingresar</button></form><p class="security-note">Usa la misma cuenta de negocio de Firebase que la app Android.</p></div></section>`);
  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Ingresando…";
    try { await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value); }
    catch (error) { login(authError(error)); }
  });
}

function authError(error) {
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code)) return "El correo o la contraseña no son correctos.";
  if (error?.code === "auth/too-many-requests") return "Demasiados intentos. Probá nuevamente más tarde.";
  return "No se pudo iniciar sesión. Intentá nuevamente.";
}

async function signedIn(user) {
  currentUser = user;
  loadingPage("Accediendo a tu negocio…");
  try {
    businessContext = await loadBusiness();
    if (!businessContext) {
      render(`<section class="message-shell"><h1>No encontramos un negocio</h1><p class="muted">Esta cuenta no tiene un negocio asociado.</p><button id="logout" class="secondary">Cerrar sesión</button></section>`);
      document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
      return;
    }
    await Promise.all([loadProducts(), loadHotEvents(), loadEntitlements()]);
    showHotEvents();
  } catch (error) {
    render(`<section class="message-shell"><h1>No pudimos acceder</h1><p class="muted">${escapeHtml(error?.message || "Revisá tu conexión e intentá nuevamente.")}</p><button id="retry" class="primary">Reintentar</button><button id="logout" class="secondary">Cerrar sesión</button></section>`);
    document.querySelector("#retry")?.addEventListener("click", () => signedIn(user));
    document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  }
}

if (!configured()) {
  render(`<section class="message-shell"><div class="brand-mark">♨</div><h1>Configuración pendiente</h1><p class="muted">La interfaz web de negocios está creada, pero falta conectar la configuración pública de Firebase.</p><p class="security-note">No se debe colocar ninguna clave privada, service account ni secreto en este sitio.</p></section>`);
} else {
  auth = getAuth(initializeApp(FIREBASE_CONFIG));
  onAuthStateChanged(auth, (user) => user ? signedIn(user) : login());
}

const CALENTITOS_BUSINESS_LANG_KEY = 'calentitos_business_lang';
let businessLang = localStorage.getItem(CALENTITOS_BUSINESS_LANG_KEY) || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es');
if (!['es', 'en'].includes(businessLang)) businessLang = 'es';

const BUSINESS_I18N = {
  'CALENTITOS · NEGOCIOS':'CALENTITOS · BUSINESS','Panel de negocio':'Business dashboard','Cerrar sesión':'Sign out',
  'Administración':'Administration','Hot Events':'Hot Events','Perfil':'Profile','Productos':'Products','QR':'QR','Premium':'Premium','Resumen':'Overview',
  'Cargando…':'Loading…','PRIORIDAD':'PRIORITY','Publicá rápido cuando tengas comida recién hecha.':'Publish quickly when your food is freshly made.',
  'Disponible ahora':'Available now','Listo en 15 minutos':'Ready in 15 minutes','Listo en 30 minutos':'Ready in 30 minutes','Agotado':'Sold out','Expirado':'Expired',
  'Publicar Hot Event':'Publish Hot Event','Tus Hot Events':'Your Hot Events','HISTORIAL':'HISTORY','ACTIVOS':'ACTIVE',
  'Información del negocio':'Business information','Panadería':'Bakery','Pizzería':'Pizzeria','Restaurante':'Restaurant','Cafetería':'Café','Rotisería':'Rotisserie','Otros':'Other','Las categorías sirven para encontrar productos. El límite de productos es global.':'Categories are only used to find products. Product limits are global.','productos predefinidos':'predefined products','productos personalizados':'custom products','Alcanzaste los 5 productos predefinidos del plan gratuito. El límite es global y no depende de la categoría.':'You reached the 5 predefined-product limit on the free plan. The limit is global and does not depend on category.','Estos datos son los que identifican y presentan a tu negocio en Calentitos.':'These details identify and present your business on Calentitos.',
  'Nombre del negocio':'Business name','Ubicación':'Location','Guardar cambios':'Save changes','Catálogo':'Catalog','Administrá los productos que podés usar para publicar Hot Events.':'Manage the products you can use to publish Hot Events.',
  'NUEVO PRODUCTO':'NEW PRODUCT','Agregar producto personalizado':'Add custom product','Agregar producto':'Add product','Productos activos':'Active products',
  'Código QR del negocio':'Business QR code','Este enlace es permanente y lleva a la experiencia pública de tu negocio.':'This permanent link opens your public business page.',
  'Descargar QR':'Download QR','Copiar enlace':'Copy link','PLAN GRATUITO':'FREE PLAN','PREMIUM ACTIVO':'PREMIUM ACTIVE',
  'Potenciá tu negocio':'Grow your business','Tu negocio tiene Premium':'Your business has Premium','Plan gratuito':'Free plan','Resumen':'Overview',
  'Gestioná tu negocio':'Manage your business','Accedé al espacio de administración de tu negocio.':'Access your business management area.',
  'Correo electrónico':'Email','Contraseña':'Password','Ingresar':'Sign in',
  'No encontramos un negocio':'We could not find a business','Esta cuenta no tiene un negocio asociado.':'This account is not associated with a business.',
  'Reintentar':'Try again','No pudimos acceder':'We could not access your account',
  'Los datos del negocio fueron actualizados.':'Business information was updated.','El producto fue agregado al catálogo.':'The product was added to the catalog.','El producto fue eliminado del catálogo.':'The product was removed from the catalog.','PRODUCTOS PERSONALIZADOS':'CUSTOM PRODUCTS','Administrar productos':'Manage products','Eliminá productos personalizados que ya no ofrecés.':'Remove custom products you no longer offer.','No tenés productos personalizados para eliminar.':'You have no custom products to delete.','ADMINISTRAR PRODUCTOS':'MANAGE PRODUCTS','Productos activos':'Active products','Eliminá productos que ya no ofrecés. Las categorías solo sirven para filtrar.':'Remove products you no longer offer. Categories are only used for filtering.','No hay productos activos en esta categoría.':'There are no active products in this category.','Eliminar':'Delete','Eliminando…':'Deleting…',
  'Hot Event publicado correctamente.':'Hot Event published successfully.','El Hot Event fue marcado como agotado.':'The Hot Event was marked as sold out.',
  'Request failed':'Request failed','No se pudo completar la operación. Intentá nuevamente.':'The operation could not be completed. Please try again.',
  'No encontramos tu negocio.':'We could not find your business.','Ese producto no está activo.':'That product is not active.',
  'Alcanzaste el límite de productos de tu plan.':'You reached your plan’s product limit.','Los productos personalizados requieren HotCrave Premium.':'Custom products require Calentitos Premium.',
  'Las categorías personalizadas requieren HotCrave Premium.':'Custom categories require Calentitos Premium.','Alcanzaste el límite de Hot Events activos de tu plan.':'You reached your plan’s active Hot Events limit.',
  'No encontramos ese Hot Event.':'We could not find that Hot Event.','Ese Hot Event ya venció.':'That Hot Event has expired.',
  'Este navegador no admite notificaciones web.':'This browser does not support web notifications.'
};
const BUSINESS_REVERSE_I18N = Object.fromEntries(Object.entries(BUSINESS_I18N).map(([es,en])=>[en,es]));

function businessTranslateText(value) {
  if (businessLang === 'es') return BUSINESS_REVERSE_I18N[value] || value;
  return BUSINESS_I18N[value] || value;
}
function businessApplyLanguage() {
  businessObserver?.disconnect();
  document.documentElement.lang = businessLang;
  const walker=document.createTreeWalker(appRoot,NodeFilter.SHOW_TEXT);
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node=>{
    const raw=node.nodeValue;
    const trimmed=raw.trim();
    if(!trimmed) return;
    const translated=businessTranslateText(trimmed);
    if(translated!==trimmed) node.nodeValue=raw.replace(trimmed,translated);
  });
  const footer=document.querySelector('.calentitos-business-footer');
  if(footer) footer.remove();
  const f=document.createElement('footer');
  f.className='calentitos-business-footer';
  f.innerHTML=`<div><button type="button" data-business-lang="es">ES</button> <button type="button" data-business-lang="en">EN</button></div><p><a href="${calentitosLang === "en" ? "/calentitos/privacy" : "/calentitos/privacidad"}">${calentitosLang === "en" ? "Privacy Policy" : "Política de privacidad"}</a> · <a href="${calentitosLang === "en" ? "/calentitos/terms" : "/calentitos/terminos"}">${calentitosLang === "en" ? "Terms and Conditions" : "Términos y condiciones"}</a></p>`;
  f.querySelectorAll('[data-business-lang]').forEach(b=>b.addEventListener('click',()=>{
    businessLang=b.dataset.businessLang; localStorage.setItem(CALENTITOS_BUSINESS_LANG_KEY,businessLang); businessApplyLanguage();
  }));
  appRoot.append(f);
  businessObserver.observe(appRoot,{childList:true,subtree:true});
}
const businessObserver=new MutationObserver(()=>{clearTimeout(window.__businessI18nTimer);window.__businessI18nTimer=setTimeout(businessApplyLanguage,0);});
businessApplyLanguage();
