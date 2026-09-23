"use strict";

/**
 * Auto-scroll doux d'une grille de photos Facebook.
 * - Petits pas + pauses (évite le jump en haut si on scrolle trop fort)
 * - Ancres sur les fbid : si Facebook reset le scroll sans refresh, on redescend jusqu'à la dernière photo vue
 */
(function (root) {
  function createPhotoAutoScroll(options) {
    const onState = (options && options.onState) || function () {};

    const cfg = {
      stepRatio: 0.2,
      minStep: 70,
      maxStep: 220,
      substeps: 5,
      substepMs: 50,
      settleMs: 720,
      loadTimeoutMs: 1600,
      extraLoadMs: 450,
      recoverStepRatio: 0.3,
      recoverMaxStep: 320,
      resetDropPx: 1000,
      resetNearTopPx: 480,
      idleRoundsToStop: 12,
      nudgePx: 130,
      userPauseMs: 1800,
      noPhotosMs: 12000,
      maxMs: 8 * 60 * 60 * 1000,
    };

    const AFTER_SECTION =
      /^(amis|friends|à propos|about|abonnés|followers|abonnements|following|musique|music|films|livres|books|sport|check-ins?|centres d'intérêt|intérêts|plus d'infos)$/i;

    const state = {
      running: false,
      recovering: false,
      programmatic: false,
      status: "off",
      loopToken: 0,
      startedAt: 0,
      seen: [],
      seenSet: new Set(),
      anchorIds: [],
      recoverTarget: [],
      lastTop: 0,
      lastHeight: 0,
      idleRounds: 0,
      stuckMoves: 0,
      scrollerIndex: 0,
      ignoreResetUntil: 0,
      userQuietUntil: 0,
      pageKey: "",
      recentResets: [],
    };

    let listenersBound = false;

    function report(status) {
      if (status) state.status = status;
      onState(getState());
    }

    function getState() {
      return {
        running: state.running,
        recovering: state.recovering,
        photos: state.seen.length,
        status: state.status,
      };
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isLightbox() {
      const path = (location.pathname || "").replace(/\/+$/, "") || "/";
      if (path === "/photo" || path.endsWith("/photo.php")) {
        return /(?:\?|&)fbid=/.test(location.search);
      }
      return false;
    }

    function isPhotosUrl() {
      const path = location.pathname.toLowerCase();
      const href = location.href.toLowerCase();
      if (path.includes("/photos")) return true;
      if (path.includes("/media/set")) return true;
      if (/[?&]sk=photos/.test(href)) return true;
      if (/[?&]set=(a\.|pb\.|pcb\.)/.test(href) && !isLightbox()) return true;
      return false;
    }

    function pageKey() {
      const u = new URL(location.href);
      return [
        u.pathname,
        u.searchParams.get("sk") || "",
        u.searchParams.get("set") || "",
        u.searchParams.get("id") || "",
      ].join("|");
    }

    function extractId(href) {
      if (!href) return null;
      try {
        const u = new URL(href, location.origin);
        const fbid = u.searchParams.get("fbid");
        if (fbid) return fbid;
        let m = u.pathname.match(/\/photos\/[^/]+\/(\d+)/);
        if (m) return m[1];
        m = u.pathname.match(/\/photo\.php$/);
        if (m && u.searchParams.get("fbid")) return u.searchParams.get("fbid");
        m = String(href).match(/fbid=(\d+)/);
        if (m) return m[1];
        m = u.pathname.match(/\/(\d{8,})\/?$/);
        if (m && /photo/.test(u.pathname)) return m[1];
      } catch {
        const m = String(href).match(/fbid=(\d+)/);
        if (m) return m[1];
      }
      return null;
    }

    function isChromeUi(el) {
      return !!(el && el.closest && el.closest("header, [role='banner'], [role='navigation'], [role='search']"));
    }

    function isPhotoThumb(anchor) {
      if (!anchor || isChromeUi(anchor)) return false;
      const img = anchor.querySelector("img");
      if (img) {
        const r = img.getBoundingClientRect();
        const w = r.width || img.width || 0;
        const h = r.height || img.height || 0;
        if (w >= 56 && h >= 56) return true;
        if ((w === 0 && h === 0) && (img.getAttribute("src") || img.getAttribute("srcset"))) return true;
      }
      const box = anchor.getBoundingClientRect();
      if (box.width >= 64 && box.height >= 64) return true;
      return false;
    }

    function collectPhotoAnchors() {
      const nodes = document.querySelectorAll(
        'a[href*="fbid="], a[href*="/photo/?"], a[href*="/photo.php"], a[href*="/photos/"]'
      );
      const out = [];
      const seen = new Set();
      for (const a of nodes) {
        if (!isPhotoThumb(a)) continue;
        const id = extractId(a.href || a.getAttribute("href"));
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ el: a, id });
      }
      return out;
    }

    function isDoc(el) {
      return (
        !el ||
        el === document.documentElement ||
        el === document.body ||
        el === document.scrollingElement
      );
    }

    function getTop(el) {
      return isDoc(el) ? window.scrollY || document.documentElement.scrollTop || 0 : el.scrollTop;
    }

    function getClient(el) {
      return isDoc(el) ? window.innerHeight : el.clientHeight;
    }

    function getHeight(el) {
      if (isDoc(el)) {
        return Math.max(
          document.documentElement.scrollHeight,
          document.body ? document.body.scrollHeight : 0
        );
      }
      return el.scrollHeight;
    }

    function setTop(el, top) {
      const t = Math.max(0, top);
      if (isDoc(el)) window.scrollTo(0, t);
      else el.scrollTop = t;
    }

    function isElementScrollable(el) {
      if (!el) return false;
      if (isDoc(el)) {
        const se = document.scrollingElement || document.documentElement;
        return se.scrollHeight > window.innerHeight + 60;
      }
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
      return el.scrollHeight > el.clientHeight + 60;
    }

    function scrollParent(el) {
      let n = el ? el.parentElement : null;
      while (n && n !== document.body && n !== document.documentElement) {
        if (isElementScrollable(n)) return n;
        n = n.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    function unique(list) {
      const out = [];
      const set = new Set();
      for (const x of list) {
        if (!x || set.has(x)) continue;
        set.add(x);
        out.push(x);
      }
      return out;
    }

    function candidateScrollers() {
      const se = document.scrollingElement || document.documentElement;
      const list = [se];
      const photos = collectPhotoAnchors();
      const votes = new Map();
      for (const p of photos.slice(0, 50)) {
        const s = scrollParent(p.el);
        votes.set(s, (votes.get(s) || 0) + 1);
      }
      const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      list.push(...ranked);
      const main = document.querySelector('[role="main"]');
      if (main) {
        let n = main;
        for (let i = 0; i < 10 && n; i++) {
          if (isElementScrollable(n)) list.push(n);
          n = n.parentElement;
        }
      }
      return unique(list);
    }

    function findScroller() {
      const all = candidateScrollers();
      if (!all.length) return document.scrollingElement || document.documentElement;
      const i = state.scrollerIndex % all.length;
      return all[i];
    }

    function currentPassedAnchor(photos) {
      const cutoff = window.innerHeight * 0.42;
      let last = null;
      for (const p of photos) {
        const r = p.el.getBoundingClientRect();
        if (r.top < cutoff) last = p;
      }
      return last;
    }

    function harvest() {
      const photos = collectPhotoAnchors();
      let added = 0;
      for (const p of photos) {
        if (!state.seenSet.has(p.id)) {
          state.seenSet.add(p.id);
          state.seen.push(p.id);
          added++;
        }
      }
      const anchor = currentPassedAnchor(photos);
      if (anchor) {
        const last = state.anchorIds[state.anchorIds.length - 1];
        if (anchor.id !== last) {
          state.anchorIds.push(anchor.id);
          if (state.anchorIds.length > 24) state.anchorIds.shift();
        }
      }
      return { photos, added };
    }

    function noteProgress(added) {
      if (added > 0) state.idleRounds = 0;
      else state.idleRounds += 1;
    }

    function findAnchorEl(ids) {
      if (!ids || !ids.length) return null;
      const photos = collectPhotoAnchors();
      const map = new Map(photos.map((p) => [p.id, p.el]));
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = map.get(ids[i]);
        if (el) return { id: ids[i], el };
      }
      return null;
    }

    function detectReset(scroller) {
      if (Date.now() < state.ignoreResetUntil) return false;
      const top = getTop(scroller);
      const drop = state.lastTop - top;
      if (drop >= cfg.resetDropPx && top <= cfg.resetNearTopPx) return true;
      if (state.lastTop > 1800 && top < 220) return true;
      return false;
    }

    function onResetAdaptive() {
      const now = Date.now();
      state.recentResets.push(now);
      state.recentResets = state.recentResets.filter((t) => now - t < 30000);
      if (state.recentResets.length >= 2) {
        cfg.settleMs = Math.min(1500, cfg.settleMs + 140);
        cfg.maxStep = Math.max(90, cfg.maxStep - 28);
        cfg.recoverMaxStep = Math.max(140, cfg.recoverMaxStep - 30);
      }
    }

    function enterRecover() {
      if (!state.anchorIds.length) {
        state.lastTop = 0;
        return;
      }
      state.recovering = true;
      state.idleRounds = 0;
      state.recoverTarget = state.anchorIds.slice();
      state.ignoreResetUntil = Date.now() + 900;
      onResetAdaptive();
      report("recover");
    }

    function stepSize(scroller, ratio, maxStep) {
      const view = getClient(scroller);
      const raw = Math.round(view * ratio);
      return Math.max(cfg.minStep, Math.min(maxStep, raw));
    }

    async function smoothStep(scroller, delta) {
      const from = getTop(scroller);
      const max = Math.max(0, getHeight(scroller) - getClient(scroller));
      const to = Math.min(max, from + delta);
      if (to <= from + 1) return false;
      const n = cfg.substeps;
      state.programmatic = true;
      try {
        for (let i = 1; i <= n; i++) {
          if (!state.running) break;
          setTop(scroller, from + ((to - from) * i) / n);
          await sleep(cfg.substepMs);
        }
      } finally {
        state.programmatic = false;
      }
      return getTop(scroller) > from + 2;
    }

    function viewportImagesPending() {
      let pending = 0;
      const vh = window.innerHeight;
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (img.complete) continue;
        const r = img.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        pending += 1;
        if (pending >= 6) break;
      }
      return pending;
    }

    async function settle(scroller) {
      const h0 = getHeight(scroller);
      await sleep(cfg.settleMs);
      const t0 = Date.now();
      while (Date.now() - t0 < cfg.loadTimeoutMs && state.running) {
        if (viewportImagesPending() === 0) break;
        await sleep(120);
      }
      if (getHeight(scroller) > h0 + 30) await sleep(cfg.extraLoadMs);
    }

    function atBottom(scroller) {
      return getTop(scroller) + getClient(scroller) >= getHeight(scroller) - 100;
    }

    function passedPhotosSection(photos) {
      if (!photos.length) return false;
      const last = photos[photos.length - 1].el;
      const lastBox = last.getBoundingClientRect();
      const headings = document.querySelectorAll('h2, h3, [role="heading"]');
      for (const h of headings) {
        const t = (h.textContent || "").trim();
        if (!t || t.length > 48) continue;
        if (!AFTER_SECTION.test(t)) continue;
        const box = h.getBoundingClientRect();
        if (box.top > lastBox.bottom && box.top < window.innerHeight - 8) return true;
      }
      return false;
    }

    function shouldStop(scroller, photos) {
      if (state.idleRounds < cfg.idleRoundsToStop) return false;
      if (passedPhotosSection(photos)) return true;
      return atBottom(scroller);
    }

    async function maybeNudge(scroller) {
      if (!atBottom(scroller)) return;
      state.programmatic = true;
      state.ignoreResetUntil = Date.now() + 1500;
      try {
        const top = getTop(scroller);
        setTop(scroller, Math.max(0, top - cfg.nudgePx));
        await sleep(420);
        setTop(scroller, top + 40);
        await sleep(cfg.settleMs);
      } finally {
        state.programmatic = false;
      }
      harvest();
    }

    async function recoverTick(scroller) {
      const found = findAnchorEl(state.recoverTarget);
      if (found) {
        const r = found.el.getBoundingClientRect();
        const inView = r.top < window.innerHeight * 0.82 && r.bottom > 36;
        if (inView) {
          state.recovering = false;
          state.idleRounds = 0;
          state.ignoreResetUntil = Date.now() + 700;
          state.lastTop = getTop(scroller);
          report("run");
          await sleep(380);
          return;
        }
      }

      const moved = await smoothStep(
        scroller,
        stepSize(scroller, cfg.recoverStepRatio, cfg.recoverMaxStep)
      );
      await settle(scroller);
      harvest();

      const found2 = findAnchorEl(state.recoverTarget);
      if (found2) {
        const r = found2.el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.88 && r.bottom > 0) {
          state.recovering = false;
          state.idleRounds = 0;
        }
      }

      if (!moved && atBottom(scroller)) {
        state.recovering = false;
      }

      if (detectReset(scroller)) {
        state.ignoreResetUntil = Date.now() + 400;
        onResetAdaptive();
      }

      state.lastTop = getTop(scroller);
      state.lastHeight = getHeight(scroller);
      report(state.recovering ? "recover" : "run");
    }

    async function tick() {
      if (!state.running) return;

      if (document.hidden) {
        report("hidden");
        await sleep(500);
        return;
      }

      if (isLightbox()) {
        report("lightbox");
        await sleep(500);
        return;
      }

      const key = pageKey();
      if (key !== state.pageKey) {
        state.pageKey = key;
        state.seen = [];
        state.seenSet = new Set();
        state.anchorIds = [];
        state.idleRounds = 0;
        state.recovering = false;
        state.startedAt = Date.now();
      }

      if (Date.now() < state.userQuietUntil) {
        await sleep(180);
        return;
      }

      if (Date.now() - state.startedAt > cfg.maxMs) {
        stop("timeout");
        return;
      }

      const scroller = findScroller();
      const first = harvest();
      noteProgress(first.added);

      if (state.seen.length === 0 && Date.now() - state.startedAt > cfg.noPhotosMs) {
        if (!isPhotosUrl() && collectPhotoAnchors().length < 3) {
          stop("no_photos");
          return;
        }
      }

      if (detectReset(scroller)) enterRecover();

      if (state.recovering) {
        await recoverTick(scroller);
        return;
      }

      if (shouldStop(scroller, first.photos)) {
        await maybeNudge(scroller);
        const after = harvest();
        noteProgress(after.added);
        if (shouldStop(scroller, after.photos)) {
          stop("fin");
          return;
        }
      }

      const before = getTop(scroller);
      const moved = await smoothStep(scroller, stepSize(scroller, cfg.stepRatio, cfg.maxStep));
      await settle(scroller);

      if (detectReset(scroller)) {
        enterRecover();
        return;
      }

      if (!moved && !atBottom(scroller)) {
        state.stuckMoves += 1;
        if (state.stuckMoves >= 3) {
          state.scrollerIndex += 1;
          state.stuckMoves = 0;
        }
      } else {
        state.stuckMoves = 0;
      }

      state.lastTop = getTop(scroller);
      state.lastHeight = getHeight(scroller);
      if (state.lastTop === before && atBottom(scroller)) {
        state.idleRounds += 1;
      }
      report("run");
    }

    function bindListeners() {
      if (listenersBound) return;
      listenersBound = true;
      const pause = () => {
        if (!state.running || state.programmatic) return;
        state.userQuietUntil = Date.now() + cfg.userPauseMs;
      };
      window.addEventListener("wheel", pause, { passive: true, capture: true });
      window.addEventListener("touchmove", pause, { passive: true, capture: true });
      window.addEventListener(
        "keydown",
        (e) => {
          if (!state.running || state.programmatic) return;
          if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) {
            state.userQuietUntil = Date.now() + cfg.userPauseMs;
          }
        },
        { capture: true }
      );
    }

    function start() {
      if (state.running) return getState();
      bindListeners();
      state.running = true;
      state.recovering = false;
      state.status = "run";
      state.startedAt = Date.now();
      state.idleRounds = 0;
      state.stuckMoves = 0;
      state.pageKey = pageKey();
      state.lastTop = window.scrollY || 0;
      state.loopToken += 1;
      const token = state.loopToken;
      report("run");
      (async () => {
        while (state.running && state.loopToken === token) {
          try {
            await tick();
          } catch (err) {
            console.warn("[Photos Auto-Scroll]", err);
            await sleep(700);
          }
        }
      })();
      return getState();
    }

    function stop(reason) {
      state.running = false;
      state.recovering = false;
      state.status = reason || "off";
      report(state.status);
      return getState();
    }

    function toggle() {
      return state.running ? stop("off") : start();
    }

    return { start, stop, toggle, getState };
  }

  root.createPhotoAutoScroll = createPhotoAutoScroll;
})(typeof window !== "undefined" ? window : globalThis);
