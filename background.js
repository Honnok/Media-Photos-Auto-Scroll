"use strict";

function isFacebookUrl(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function applyBadge(tabId, msg) {
  if (!tabId) return;

  let text = "";
  let color = "#16a34a";
  let title = "Photos Auto-Scroll — clic pour démarrer sur la grille de photos";

  if (msg && msg.running && msg.status === "lightbox") {
    text = "P";
    color = "#64748b";
    title = "En pause : une photo est ouverte en grand. Ferme-la pour reprendre.";
  } else if (msg && msg.running && msg.status === "hidden") {
    text = "P";
    color = "#64748b";
    title = "En pause : l’onglet n’est plus visible.";
  } else if (msg && msg.running && msg.recovering) {
    text = "R";
    color = "#ea580c";
    title = "Facebook a renvoyé en haut — retour vers la dernière photo…";
  } else if (msg && msg.running) {
    const n = Math.min(9999, msg.photos || 0);
    text = String(n);
    color = "#16a34a";
    title = `Auto-scroll ON — ${msg.photos || 0} photos vues. Clic pour arrêter.`;
  } else if (msg && msg.status === "fin") {
    text = "OK";
    color = "#2563eb";
    title = `Fin du fil photos — ${msg.photos || 0} images vues.`;
  } else if (msg && msg.status === "no_photos") {
    text = "!";
    color = "#dc2626";
    title = "Pas de grille de photos détectée. Ouvre Photos / un album d’un compte public.";
  } else if (msg && msg.status === "timeout") {
    text = "OK";
    color = "#2563eb";
    title = "Arrêt automatique (durée max).";
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setTitle({ tabId, title });
  try {
    const done = chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" });
    if (done && typeof done.catch === "function") done.catch(() => {});
  } catch {
    /* Chrome trop ancien */
  }
}

async function toggleTab(tab) {
  if (!tab || !tab.id) return;

  if (!isFacebookUrl(tab.url)) {
    applyBadge(tab.id, { running: false, status: "no_photos", photos: 0 });
    chrome.action.setTitle({
      tabId: tab.id,
      title: "Ouvre un onglet Facebook, onglet Photos d’un compte public.",
    });
    chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#dc2626" });
    return;
  }

  const send = () => chrome.tabs.sendMessage(tab.id, { type: "TOGGLE" });

  try {
    const state = await send();
    applyBadge(tab.id, state);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["engine.js", "content.js"],
      });
      const state = await send();
      applyBadge(tab.id, state);
    } catch (err) {
      console.warn("[Photos Auto-Scroll] inject failed", err);
      applyBadge(tab.id, { running: false, status: "no_photos", photos: 0 });
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  toggleTab(tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "STATE" && sender.tab && sender.tab.id) {
    applyBadge(sender.tab.id, msg);
  }
});
