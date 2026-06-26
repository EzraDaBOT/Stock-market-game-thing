const firebaseConfig = {
  apiKey: "AIzaSyBg-OrSGKO-XnevTqruoTQ_mtwtv-JSBAM",
  authDomain: "stockmarketfake.firebaseapp.com",
  databaseURL: "https://stockmarketfake-default-rtdb.firebaseio.com",
  projectId: "stockmarketfake",
  storageBucket: "stockmarketfake.firebasestorage.app",
  messagingSenderId: "8654116956",
  appId: "1:8654116956:web:8cc95540726630ab21ae99",
  measurementId: "G-6D8W01ZQLW"
};

const WAIT_MS = 150000;
const NEGATIVE_GRACE_MS = 10000;
const MARKET_MINUTE_MS = 60000;
const STORAGE_KEY = "peg-exchange-state-v1";

const els = {
  authView: document.querySelector("#authView"),
  marketView: document.querySelector("#marketView"),
  authForm: document.querySelector("#authForm"),
  signupButton: document.querySelector("#signupButton"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  authMessage: document.querySelector("#authMessage"),
  activeUser: document.querySelector("#activeUser"),
  cashBalance: document.querySelector("#cashBalance"),
  bankBalance: document.querySelector("#bankBalance"),
  loanBalance: document.querySelector("#loanBalance"),
  equityValue: document.querySelector("#equityValue"),
  syncStatus: document.querySelector("#syncStatus"),
  marketClock: document.querySelector("#marketClock"),
  tabs: document.querySelector("#tabs"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  notifications: document.querySelector("#notifications"),
  assetGrid: document.querySelector("#assetGrid"),
  assetFilter: document.querySelector("#assetFilter"),
  searchInput: document.querySelector("#searchInput"),
  assetCardTemplate: document.querySelector("#assetCardTemplate"),
  holdingsList: document.querySelector("#holdingsList"),
  ownerTools: document.querySelector("#ownerTools"),
  createAssetForm: document.querySelector("#createAssetForm"),
  logoutButton: document.querySelector("#logoutButton"),
  bankAmount: document.querySelector("#bankAmount"),
  loanAmount: document.querySelector("#loanAmount"),
  depositButton: document.querySelector("#depositButton"),
  withdrawButton: document.querySelector("#withdrawButton"),
  borrowButton: document.querySelector("#borrowButton"),
  repayButton: document.querySelector("#repayButton")
};

let dbRef = null;
let firebaseReady = false;
let saveTimer = null;
let marketStarted = Date.now();
let lastMarketMinute = -1;
let activeUserId = localStorage.getItem("peg-exchange-user") || "";
let state = loadLocalState();

ensureState();
bindEvents();
render();
connectFirebase();
setInterval(tickMarket, 1000);

async function connectFirebase() {
  try {
    const [{ initializeApp }, { getDatabase, ref, onValue }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js")
    ]);
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    dbRef = ref(db, "pegExchange");
    onValue(dbRef, snapshot => {
      const remote = snapshot.val();
      if (remote && remote.updatedAt >= state.updatedAt) {
        state = remote;
        ensureState();
        render();
      }
      firebaseReady = true;
      els.syncStatus.textContent = "Firebase synced";
    }, () => {
      firebaseReady = false;
      els.syncStatus.textContent = "Local market";
    });
  } catch {
    firebaseReady = false;
    els.syncStatus.textContent = "Local market";
  }
}

function defaultState() {
  return {
    updatedAt: Date.now(),
    users: {},
    assets: {
      orx: seedAsset("orx", "Orion Rockets", "ORX", "stock", "MarketMaker", 1.18, "#46e08d"),
      nvc: seedAsset("nvc", "Nova Coin", "NVC", "crypto", "MarketMaker", 0.94, "#b99cff")
    },
    notices: []
  };
}

function seedAsset(id, name, ticker, type, owner, price, color) {
  return {
    id,
    name,
    ticker,
    type,
    owner,
    logo: logoData(ticker, color),
    cashInvested: Math.round(price * 240),
    sharesIssued: 240,
    price,
    previousPrice: 1,
    sentiment: 0,
    costs: [],
    announcements: [],
    createdAt: Date.now()
  };
}

function loadLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState();
  } catch {
    return defaultState();
  }
}

function ensureState() {
  state.users ||= {};
  state.assets ||= {};
  state.notices ||= [];
  state.updatedAt ||= Date.now();
  Object.values(state.users).forEach(user => {
    user.cash ??= 100;
    user.bank ??= 0;
    user.loan ??= 0;
    user.holdings ||= {};
    user.notifications ||= [];
  });
}

function bindEvents() {
  els.authForm.addEventListener("submit", event => {
    event.preventDefault();
    login();
  });
  els.signupButton.addEventListener("click", signup);
  els.logoutButton.addEventListener("click", () => {
    activeUserId = "";
    localStorage.removeItem("peg-exchange-user");
    render();
  });
  els.tabs.addEventListener("click", event => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    showView(button.dataset.view);
  });
  els.assetFilter.addEventListener("change", renderAssets);
  els.searchInput.addEventListener("input", renderAssets);
  els.createAssetForm.addEventListener("submit", createAsset);
  els.depositButton.addEventListener("click", () => bankTransfer("deposit"));
  els.withdrawButton.addEventListener("click", () => bankTransfer("withdraw"));
  els.borrowButton.addEventListener("click", () => loanTransfer("borrow"));
  els.repayButton.addEventListener("click", () => loanTransfer("repay"));
}

function signup() {
  const username = cleanName(els.usernameInput.value);
  const password = els.passwordInput.value;
  if (!username || password.length < 3) return message("Use a username and a password with 3+ characters.");
  if (state.users[username]) return message("That username already exists.");
  state.users[username] = {
    id: username,
    username,
    password,
    cash: 100,
    bank: 0,
    loan: 0,
    holdings: {},
    notifications: [`Welcome, ${username}. You start with $100.00.`],
    createdAt: Date.now()
  };
  activeUserId = username;
  localStorage.setItem("peg-exchange-user", username);
  persist();
  render();
}

function login() {
  const username = cleanName(els.usernameInput.value);
  const user = state.users[username];
  if (!user || user.password !== els.passwordInput.value) return message("Username or password is wrong.");
  activeUserId = username;
  localStorage.setItem("peg-exchange-user", username);
  render();
}

function message(text) {
  els.authMessage.textContent = text;
}

function currentUser() {
  return state.users[activeUserId] || null;
}

function render() {
  const user = currentUser();
  els.authView.classList.toggle("hidden", !!user);
  els.marketView.classList.toggle("hidden", !user);
  if (!user) return;
  els.activeUser.textContent = user.username;
  els.cashBalance.textContent = money(user.cash);
  els.bankBalance.textContent = money(user.bank);
  els.loanBalance.textContent = money(user.loan);
  els.equityValue.textContent = money(netWorth(user));
  renderNotifications();
  renderAssets();
  renderPortfolio();
  renderOwnerTools();
}

function showView(view) {
  const titles = {
    exchange: ["Exchange", "Live fake stocks and volatile crypto markets."],
    portfolio: ["Portfolio", "Your positions, equity, and notifications."],
    founder: ["Founder", "Create assets and manage CEO events."],
    bank: ["Bank", "Store money for interest or take risky loans."]
  };
  document.querySelectorAll(".view").forEach(panel => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.tabs.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  els.viewTitle.textContent = titles[view][0];
  els.viewSubtitle.textContent = titles[view][1];
}

function renderNotifications() {
  const user = currentUser();
  const notes = [...(user.notifications || []), ...state.notices].slice(-4).reverse();
  els.notifications.innerHTML = "";
  notes.forEach(note => {
    const div = document.createElement("div");
    div.className = "notice";
    div.textContent = typeof note === "string" ? note : note.text;
    els.notifications.append(div);
  });
}

function renderAssets() {
  const user = currentUser();
  const query = els.searchInput.value.trim().toLowerCase();
  const filter = els.assetFilter.value;
  els.assetGrid.innerHTML = "";
  Object.values(state.assets)
    .filter(asset => filter === "all" || asset.type === filter)
    .filter(asset => [asset.name, asset.ticker, asset.owner].join(" ").toLowerCase().includes(query))
    .sort((a, b) => b.cashInvested - a.cashInvested)
    .forEach(asset => {
      const card = els.assetCardTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".asset-logo").src = asset.logo || logoData(asset.ticker, "#6eb8ff");
      card.querySelector("h3").textContent = asset.name;
      card.querySelector(".ticker").textContent = `${asset.ticker} / ${asset.type.toUpperCase()}`;
      card.querySelector(".price").textContent = money(asset.price);
      card.querySelector(".peg").textContent = `Peg value ${money(asset.cashInvested)} / ${round(asset.sharesIssued)} shares`;
      const move = asset.price - asset.previousPrice;
      const movement = card.querySelector(".movement");
      movement.textContent = `${move >= 0 ? "+" : ""}${money(move)} last move`;
      movement.classList.toggle("up", move >= 0);
      movement.classList.toggle("down", move < 0);
      card.querySelector(".owner").textContent = `CEO ${asset.owner}`;
      card.querySelector(".announcement").innerHTML = announcementText(asset);
      card.querySelector(".buyButton").addEventListener("click", () => trade(asset.id, "buy", readAmount(card)));
      card.querySelector(".sellButton").addEventListener("click", () => trade(asset.id, "sell", readAmount(card)));
      card.querySelector(".buyAllButton").addEventListener("click", () => trade(asset.id, "buyAll"));
      card.querySelector(".sellAllButton").addEventListener("click", () => trade(asset.id, "sellAll"));
      if (user?.holdings?.[asset.id]) card.classList.add("owned");
      els.assetGrid.append(card);
    });
}

function announcementText(asset) {
  const pending = activeAnnouncement(asset);
  const latest = [...(asset.announcements || [])].reverse().find(item => item.status === "applied");
  if (pending) {
    const remaining = Math.max(0, pending.appliesAt - Date.now());
    return `<strong>${pending.direction === "positive" ? "Positive" : "Negative"} event queued</strong><br>${escapeHtml(pending.text)}<br>${formatTimer(remaining)} until effect.`;
  }
  if (latest) {
    return `<strong class="${latest.direction}">${latest.direction} ${latest.severity}/100</strong><br>${escapeHtml(latest.text)}`;
  }
  return "No active announcement. Price is moving from peg demand and operating costs.";
}

function activeAnnouncement(asset) {
  return (asset.announcements || []).find(item => item.status === "queued" || item.status === "grace");
}

function readAmount(card) {
  const value = Number(card.querySelector(".tradeAmount").value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function trade(assetId, mode, amount = 0) {
  const user = currentUser();
  const asset = state.assets[assetId];
  if (!user || !asset) return;
  user.holdings ||= {};
  const owned = user.holdings[assetId] || 0;
  if (mode === "buyAll") amount = Math.floor((user.cash / asset.price) * 100) / 100;
  if (mode === "sellAll") amount = owned;
  if (amount <= 0) return notify(user, "Enter an amount first.");
  const total = amount * asset.price;
  if (mode === "buy" || mode === "buyAll") {
    if (total > user.cash + 0.0001) return notify(user, "Not enough wallet cash for that buy.");
    user.cash -= total;
    user.holdings[assetId] = round((user.holdings[assetId] || 0) + amount);
    asset.cashInvested += total;
    asset.sharesIssued += amount;
    recalcPrice(asset, asset.type === "crypto" ? randomBetween(-0.015, 0.025) : 0.01);
    notify(user, `Bought ${round(amount)} ${asset.ticker} for ${money(total)}.`);
  } else {
    if (amount > owned + 0.0001) return notify(user, "You do not own that many shares.");
    user.cash += total;
    user.holdings[assetId] = round(owned - amount);
    if (user.holdings[assetId] <= 0) delete user.holdings[assetId];
    asset.cashInvested = Math.max(1, asset.cashInvested - total);
    recalcPrice(asset, asset.type === "crypto" ? randomBetween(-0.03, 0.01) : -0.005);
    notify(user, `Sold ${round(amount)} ${asset.ticker} for ${money(total)}.`);
  }
  persist();
  render();
}

async function createAsset(event) {
  event.preventDefault();
  const user = currentUser();
  const name = document.querySelector("#assetName").value.trim();
  const ticker = document.querySelector("#assetTicker").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const type = document.querySelector("#assetType").value;
  const file = document.querySelector("#assetLogo").files[0];
  if (!name || !ticker) return;
  if (Object.values(state.assets).some(asset => asset.ticker === ticker)) return notify(user, "That ticker already exists.");
  const id = `${ticker.toLowerCase()}-${Date.now().toString(36)}`;
  state.assets[id] = {
    id,
    name,
    ticker,
    type,
    owner: user.username,
    logo: file ? await fileToDataUrl(file) : logoData(ticker, type === "crypto" ? "#b99cff" : "#46e08d"),
    cashInvested: 100,
    sharesIssued: 100,
    price: 1,
    previousPrice: 1,
    sentiment: 0,
    costs: [],
    announcements: [],
    createdAt: Date.now()
  };
  notify(user, `You launched ${name} at $1.00 and became the CEO.`);
  els.createAssetForm.reset();
  persist();
  render();
}

function renderOwnerTools() {
  const user = currentUser();
  const owned = Object.values(state.assets).filter(asset => asset.owner === user.username);
  els.ownerTools.innerHTML = "";
  if (!owned.length) {
    const empty = document.createElement("section");
    empty.className = "owner-card";
    empty.textContent = "Create a company or crypto to unlock CEO controls.";
    els.ownerTools.append(empty);
    return;
  }
  owned.forEach(asset => {
    const card = document.createElement("section");
    card.className = "owner-card";
    card.innerHTML = `
      <div class="owner-header">
        <div><strong>${escapeHtml(asset.name)}</strong><br><span class="ticker">${asset.ticker} at ${money(asset.price)}</span></div>
        <button data-skip="${asset.id}">Pay $8 skip wait</button>
      </div>
      <form class="owner-form" data-announce="${asset.id}">
        <textarea name="text" maxlength="160" placeholder="Rocket failure, major partnership, exchange hack..."></textarea>
        <div class="range-wrap">
          <label>Severity <strong data-sev>${50}</strong></label>
          <input name="severity" type="range" min="1" max="100" value="50" />
        </div>
        <select name="direction">
          <option value="negative">Negative</option>
          <option value="positive">Positive</option>
        </select>
        <button class="primary">Post</button>
      </form>
      <form class="cost-row" data-cost="${asset.id}">
        <input name="label" placeholder="Fuel, servers, legal..." />
        <input name="cost" type="number" min="0.01" step="0.01" value="15" />
        <select name="period">
          <option value="minute">per minute</option>
          <option value="day">per fake day</option>
          <option value="week">per fake week</option>
          <option value="month">per fake month</option>
          <option value="year">per fake year</option>
          <option value="decade">per fake decade</option>
        </select>
        <button>Add cost</button>
      </form>
      <p>${costSummary(asset)}</p>
    `;
    card.querySelector("[name='severity']").addEventListener("input", event => {
      card.querySelector("[data-sev]").textContent = event.target.value;
    });
    card.querySelector("[data-announce]").addEventListener("submit", queueAnnouncement);
    card.querySelector("[data-cost]").addEventListener("submit", addCost);
    card.querySelector("[data-skip]").addEventListener("click", () => skipAnnouncement(asset.id));
    els.ownerTools.append(card);
  });
}

function queueAnnouncement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const user = currentUser();
  const asset = state.assets[form.dataset.announce];
  if (!asset || activeAnnouncement(asset)) return notify(user, "That asset already has a pending announcement.");
  const direction = form.direction.value;
  const severity = Number(form.severity.value);
  const queuedAt = Date.now();
  const appliesAt = queuedAt + WAIT_MS + (direction === "negative" ? NEGATIVE_GRACE_MS : 0);
  asset.announcements.push({
    id: `ann-${queuedAt}`,
    text: form.text.value.trim() || "CEO issued a market event.",
    severity,
    direction,
    queuedAt,
    graceAt: queuedAt + WAIT_MS,
    appliesAt,
    status: "queued"
  });
  notify(user, `${asset.ticker} announcement queued. Market effect waits 2.5 minutes.`);
  persist();
  render();
}

function skipAnnouncement(assetId) {
  const user = currentUser();
  const asset = state.assets[assetId];
  const ann = activeAnnouncement(asset);
  if (!ann) return notify(user, "No announcement is waiting.");
  if (user.cash < 8) return notify(user, "Skipping costs $8 in wallet cash.");
  user.cash -= 8;
  ann.graceAt = Date.now();
  ann.appliesAt = Date.now() + (ann.direction === "negative" ? NEGATIVE_GRACE_MS : 0);
  ann.status = ann.direction === "negative" ? "grace" : "queued";
  notify(user, `Paid $8 to rush ${asset.ticker}.`);
  if (ann.direction === "negative") warnInvestors(asset, ann);
  persist();
  render();
}

function addCost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const asset = state.assets[form.dataset.cost];
  asset.costs ||= [];
  asset.costs.push({
    label: form.label.value.trim() || "Operating cost",
    perMinute: costPerMinute(Number(form.cost.value), form.period.value),
    createdAt: Date.now()
  });
  persist();
  render();
}

function tickMarket() {
  const elapsed = Math.floor((Date.now() - marketStarted) / 1000);
  els.marketClock.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  let changed = false;
  Object.values(state.assets).forEach(asset => {
    const ann = activeAnnouncement(asset);
    if (ann && ann.status === "queued" && ann.direction === "negative" && Date.now() >= ann.graceAt) {
      ann.status = "grace";
      warnInvestors(asset, ann);
      changed = true;
    }
    if (ann && Date.now() >= ann.appliesAt) {
      applyAnnouncement(asset, ann);
      changed = true;
    }
    if (asset.type === "crypto" && Math.random() < 0.16) {
      recalcPrice(asset, randomBetween(-0.04, 0.045));
      changed = true;
    }
  });
  const minute = Math.floor(elapsed / 60);
  if (minute > 0 && minute !== lastMarketMinute) {
    lastMarketMinute = minute;
    changed = marketMinute() || changed;
  }
  if (changed) {
    persist();
    render();
  } else {
    renderAssets();
  }
}

function marketMinute() {
  let changed = false;
  Object.values(state.assets).forEach(asset => {
    const burn = (asset.costs || []).reduce((sum, cost) => sum + cost.perMinute, 0);
    if (burn > 0) {
      asset.cashInvested = Math.max(1, asset.cashInvested - burn);
      recalcPrice(asset, -Math.min(0.08, burn / Math.max(1, asset.cashInvested)));
      changed = true;
    }
  });
  Object.values(state.users).forEach(user => {
    if (user.bank > 0) user.bank *= 1.002;
    if (user.loan > 0) user.loan *= 1.005;
  });
  return changed;
}

function applyAnnouncement(asset, ann) {
  const swing = (ann.severity / 100) * 0.5;
  recalcPrice(asset, ann.direction === "positive" ? swing : -swing);
  ann.status = "applied";
  ann.appliedAt = Date.now();
  state.notices.push(`${asset.ticker} ${ann.direction} event hit the market for ${Math.round(swing * 100)}%.`);
  state.notices = state.notices.slice(-12);
}

function warnInvestors(asset, ann) {
  Object.values(state.users).forEach(user => {
    if (user.holdings?.[asset.id]) {
      notify(user, `Alert: ${asset.ticker} negative ${ann.severity}/100 event has a 10 second grace period before price impact.`);
    }
  });
}

function recalcPrice(asset, pressure = 0) {
  asset.previousPrice = asset.price;
  const peg = Math.max(0.01, asset.cashInvested / Math.max(1, asset.sharesIssued));
  const volatility = asset.type === "crypto" ? 1.6 : 1;
  asset.sentiment = Math.max(-0.75, Math.min(0.85, (asset.sentiment || 0) * 0.55 + pressure * volatility));
  asset.price = round(Math.max(0.01, peg * (1 + asset.sentiment)));
}

function bankTransfer(mode) {
  const user = currentUser();
  const amount = Number(els.bankAmount.value);
  if (!amount || amount <= 0) return;
  if (mode === "deposit") {
    if (user.cash < amount) return notify(user, "Not enough wallet cash to deposit.");
    user.cash -= amount;
    user.bank += amount;
  } else {
    if (user.bank < amount) return notify(user, "Not enough bank balance to withdraw.");
    user.bank -= amount;
    user.cash += amount;
  }
  persist();
  render();
}

function loanTransfer(mode) {
  const user = currentUser();
  const amount = Number(els.loanAmount.value);
  if (!amount || amount <= 0) return;
  if (mode === "borrow") {
    user.loan += amount;
    user.cash += amount;
  } else {
    if (user.cash < amount) return notify(user, "Not enough wallet cash to repay.");
    const paid = Math.min(amount, user.loan);
    user.loan -= paid;
    user.cash -= paid;
  }
  persist();
  render();
}

function renderPortfolio() {
  const user = currentUser();
  els.holdingsList.innerHTML = "";
  const entries = Object.entries(user.holdings || {});
  if (!entries.length) {
    els.holdingsList.innerHTML = `<section class="holding-row"><span>No shares yet.</span><strong>${money(user.cash)} cash</strong></section>`;
    return;
  }
  entries.forEach(([assetId, shares]) => {
    const asset = state.assets[assetId];
    if (!asset) return;
    const row = document.createElement("section");
    row.className = "holding-row";
    row.innerHTML = `<div><strong>${escapeHtml(asset.name)}</strong><br><span class="ticker">${round(shares)} ${asset.ticker}</span></div><strong>${money(shares * asset.price)}</strong>`;
    els.holdingsList.append(row);
  });
}

function notify(user, text) {
  user.notifications ||= [];
  user.notifications.push(text);
  user.notifications = user.notifications.slice(-10);
}

function persist() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  clearTimeout(saveTimer);
  if (dbRef && firebaseReady) {
    saveTimer = setTimeout(async () => {
      try {
        const { set } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js");
        await set(dbRef, state);
      } catch {
        els.syncStatus.textContent = "Local market";
      }
    }, 250);
  }
}

function netWorth(user) {
  const holdings = Object.entries(user.holdings || {}).reduce((sum, [assetId, shares]) => {
    return sum + (state.assets[assetId]?.price || 0) * shares;
  }, 0);
  return user.cash + user.bank + holdings - user.loan;
}

function costPerMinute(value, period) {
  const factors = {
    minute: 1,
    day: 24,
    week: 24 * 7,
    month: 24 * 30,
    year: 24 * 365,
    decade: 24 * 365 * 10
  };
  return value / factors[period];
}

function costSummary(asset) {
  if (!asset.costs?.length) return "No operating costs yet.";
  const total = asset.costs.reduce((sum, cost) => sum + cost.perMinute, 0);
  return `Costs burn ${money(total)} per market minute from company value.`;
}

function cleanName(value) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value || 0);
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function formatTimer(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function fileToDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function logoData(text, color) {
  const safe = encodeURIComponent(text.slice(0, 3));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="${color}"/><path d="M18 66 36 39l13 15 13-24 16 36" fill="none" stroke="#06110e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><text x="48" y="85" text-anchor="middle" font-family="Arial" font-size="18" font-weight="800" fill="#06110e">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
