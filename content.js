"use strict";

(() => {
  if (window.__fbPhotoAutoScrollInstalled) return;
  window.__fbPhotoAutoScrollInstalled = true;

  if (typeof window.createPhotoAutoScroll !== "function") {
    console.warn("[Photos Auto-Scroll] engine.js manquant");
    return;
  }

  const controller = window.createPhotoAutoScroll({
    onState(state) {
      try {
        chrome.runtime.sendMessage({ type: "STATE", ...state });
      } catch {
        /* service worker asleep — le prochain tick rappellera */
      }
    },
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "TOGGLE") {
      sendResponse(controller.toggle());
      return true;
    }
    if (msg.type === "GET_STATE") {
      sendResponse(controller.getState());
      return true;
    }
  });
})();
