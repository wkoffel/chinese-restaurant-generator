(() => {
  "use strict";

  const W = window.WORDS;
  const $ = (sel) => document.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const FIRST = [...W.first, ...W.both];
  const SECOND = [...W.second, ...W.both];

  // Odds
  const P_JACKPOT = 0.04;  // doubled word, e.g. "Panda Panda"
  const P_SPECIAL = 0.05;  // pun names, e.g. "Wok This Way"
  const P_BONUS = 0.15;    // third bolted-on sign, e.g. "& Sushi"

  const rand = (list) => list[Math.floor(Math.random() * list.length)];

  // ---------- Names & share links ----------

  const slug = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const SLUGS = new Map();
  [...FIRST, ...SECOND, ...W.bonus, ...W.specials.flat(), ...W.jackpot]
    .forEach((w) => SLUGS.set(slug(w), w));

  function kindOf(a, b) {
    if (a === b) return "jackpot";
    if (W.specials.some(([x, y]) => x === a && y === b)) return "special";
    return "normal";
  }

  function generate() {
    const r = Math.random();
    let a, b;
    if (r < P_JACKPOT) {
      a = b = rand(W.jackpot);
    } else if (r < P_JACKPOT + P_SPECIAL) {
      [a, b] = rand(W.specials);
    } else {
      a = rand(FIRST);
      do { b = rand(SECOND); } while (b === a);
    }
    const bonus = Math.random() < P_BONUS ? rand(W.bonus) : null;
    return { a, b, bonus, kind: kindOf(a, b) };
  }

  const fullName = (r) => [r.a, r.b, r.bonus].filter(Boolean).join(" ");
  const toHash = (r) => [r.a, r.b, r.bonus].filter(Boolean).map(slug).join("+");

  function fromHash() {
    let h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch { return null; }
    if (!h) return null;
    const parts = h.split(/[+ ]/).map((p) => SLUGS.get(p.toLowerCase()));
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => !p)) return null;
    const [a, b, bonus = null] = parts;
    return { a, b, bonus, kind: kindOf(a, b) };
  }

  const shareUrl = (r) => location.origin + location.pathname + "#" + toHash(r);

  // ---------- Deterministic details (same name → same restaurant) ----------

  function seedFrom(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function detailsFor(name) {
    const rng = mulberry32(seedFrom(name));
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const year = 1979 + Math.floor(rng() * 41);
    let tagline = pick(W.taglines);
    if (/panda express/i.test(name)) tagline = "Not Affiliated With Anyone. Please Don't Sue.";
    const nums = new Set();
    while (nums.size < 6) nums.add(1 + Math.floor(rng() * 49));
    return {
      est: `Est. ${year} · ${tagline}`,
      rating: pick(W.ratings),
      dish: pick(W.dishes),
      price: `$${7 + Math.floor(rng() * 8)}.95`,
      side: pick(W.sides),
      phone: `(555) ${pick(["888", "868", "828", "688"])}-${String(Math.floor(rng() * 10000)).padStart(4, "0")}`,
      fortune: pick(W.fortunes),
      nums: [...nums].sort((x, y) => x - y).join("  "),
    };
  }

  // ---------- Sound (Web Audio, synthesized; off by default) ----------

  const sfx = (() => {
    let ctx = null;
    let on = false;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone(freq, dur, { type = "sine", vol = 0.2, at = 0, to = null } = {}) {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    function noise(dur, { vol = 0.2, at = 0, freq = 1200, q = 1 } = {}) {
      const c = ensure(); if (!c) return;
      const t = c.currentTime + at;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(c.destination);
      src.start(t);
    }

    return {
      get on() { return on; },
      set(v) { on = v; },
      tick() { if (on) tone(2200, 0.025, { type: "square", vol: 0.03 }); },
      thunk() {
        if (!on) return;
        tone(140, 0.18, { vol: 0.4, to: 60 });
        noise(0.06, { vol: 0.3, freq: 900 });
      },
      lever() {
        if (!on) return;
        for (let i = 0; i < 6; i++) noise(0.02, { vol: 0.25, at: i * 0.045, freq: 3000, q: 4 });
      },
      clank() {
        if (!on) return;
        tone(520, 0.25, { type: "square", vol: 0.06 });
        tone(780, 0.3, { type: "triangle", vol: 0.08, at: 0.02 });
        noise(0.1, { vol: 0.25, freq: 2500, q: 2 });
      },
      ding() {
        if (!on) return;
        tone(1318.5, 0.7, { type: "triangle", vol: 0.18 });
        tone(1975.5, 0.9, { vol: 0.1, at: 0.09 });
      },
      fanfare() {
        if (!on) return;
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.35, { type: "triangle", vol: 0.15, at: i * 0.1 }));
      },
      gong() {
        if (!on) return;
        noise(0.25, { vol: 0.5, freq: 300, q: 0.7 });
        [[82, 0.45], [164.5, 0.3], [231, 0.22], [329, 0.15], [415, 0.1], [553, 0.07]]
          .forEach(([f, v]) => tone(f, 4.5, { vol: v, to: f * 1.02 }));
      },
      crunch() {
        if (!on) return;
        noise(0.09, { vol: 0.5, freq: 2200, q: 0.8 });
        noise(0.12, { vol: 0.35, freq: 1400, q: 0.8, at: 0.07 });
      },
    };
  })();

  // ---------- Elements ----------

  const reelEls = [$("#reel1"), $("#reel2")];
  const spinBtn = $("#spin");
  const lever = $("#lever");
  const machine = $(".machine");
  const placardSlot = $(".placard-slot");
  const placard = $("#bonus");
  const card = $("#card");
  const cookie = $("#cookie");
  const cookiePlate = $("#cookie-plate");
  const fortune = $("#fortune");
  const celebrate = $("#celebrate");
  const toast = $("#toast");
  const soundBtn = $("#sound");

  let current = null;
  let spinning = false;

  // ---------- Marquee bulbs ----------

  function layoutBulbs() {
    const frame = $("#bulb-frame");
    const box = $("#bulbs");
    const w = frame.clientWidth, h = frame.clientHeight;
    const inset = 8, spacing = 24;
    const pts = [];
    const iw = w - inset * 2, ih = h - inset * 2;
    const nx = Math.max(2, Math.round(iw / spacing));
    const ny = Math.max(2, Math.round(ih / spacing));
    for (let i = 0; i < nx; i++) pts.push([inset + (iw * i) / nx, inset]);
    for (let i = 0; i < ny; i++) pts.push([inset + iw, inset + (ih * i) / ny]);
    for (let i = 0; i < nx; i++) pts.push([inset + iw - (iw * i) / nx, inset + ih]);
    for (let i = 0; i < ny; i++) pts.push([inset, inset + ih - (ih * i) / ny]);
    box.replaceChildren(...pts.map(([x, y], i) => {
      const b = document.createElement("span");
      b.className = "bulb" + (i % 2 ? " b" : "");
      b.style.left = x + "px";
      b.style.top = y + "px";
      return b;
    }));
  }

  // ---------- Reels ----------

  function makeItem(text) {
    const d = document.createElement("div");
    d.className = "reel-item";
    const s = document.createElement("span");
    s.textContent = text;
    d.append(s);
    return d;
  }

  // Shrink long words to fit the reel window; long phrases
  // ("Around the Clock") wrap onto two lines instead of getting tiny.
  function fit(item) {
    const span = item.firstElementChild;
    span.style.fontSize = "";
    item.classList.remove("wrap");
    const maxW = item.clientWidth - 12;
    const maxH = item.clientHeight - 10;
    const w = span.scrollWidth;
    if (!w || w <= maxW) return;
    let size = parseFloat(getComputedStyle(span).fontSize);
    if (span.textContent.includes(" ") && maxW / w < 0.75) {
      item.classList.add("wrap");
      for (let i = 0; i < 24 && (span.scrollWidth > span.clientWidth || span.offsetHeight > maxH); i++) {
        size *= 0.93;
        span.style.fontSize = size + "px";
      }
    } else {
      span.style.fontSize = Math.floor(size * (maxW / w)) + "px";
    }
  }

  function setReel(reel, word) {
    const strip = reel.querySelector(".strip");
    strip.style.transition = "none";
    strip.style.transform = "translateY(0)";
    const item = makeItem(word);
    strip.replaceChildren(item);
    fit(item);
  }

  function currentWord(reel) {
    const last = reel.querySelector(".strip").lastElementChild;
    return last ? last.textContent : "???";
  }

  function spinReel(reel, finalWord, pool, duration, steps) {
    return new Promise((resolve) => {
      const strip = reel.querySelector(".strip");
      const words = [currentWord(reel)];
      let prev = words[0];
      for (let i = 0; i < steps; i++) {
        let w;
        do { w = rand(pool); } while (w === prev);
        words.push(w);
        prev = w;
      }
      words.push(finalWord);

      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      strip.replaceChildren(...words.map(makeItem));
      strip.querySelectorAll(".reel-item").forEach(fit);

      const h = reel.clientHeight;
      void strip.offsetHeight; // commit the start position
      strip.style.transition = `transform ${duration}ms cubic-bezier(.15,.65,.25,1.06)`;
      strip.style.transform = `translateY(${-(words.length - 1) * h}px)`;
      if (duration > 400) reel.classList.add("blur");

      // Tick as each word passes the window
      let lastIdx = 0;
      const start = performance.now();
      const watch = (now) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
        const idx = Math.floor(-m.m42 / h + 0.5);
        if (idx !== lastIdx) { lastIdx = idx; sfx.tick(); }
        if (now - start > duration * 0.7) reel.classList.remove("blur");
        if (now - start < duration) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);

      setTimeout(() => {
        reel.classList.remove("blur");
        setReel(reel, finalWord);
        sfx.thunk();
        resolve();
      }, duration + 30);
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function showBonus(text) {
    placard.textContent = text;
    placardSlot.classList.remove("show");
    void placardSlot.offsetHeight;
    placardSlot.classList.add("show");
    sfx.clank();
    await wait(reduceMotion.matches ? 50 : 550);
  }

  function hideBonus() {
    placardSlot.classList.remove("show");
    placard.textContent = "";
  }

  // ---------- Result card & cookie ----------

  function render(r, { pop = false } = {}) {
    const name = fullName(r);
    const d = detailsFor(name);
    $("#card-name").textContent = name;
    $("#card-est").textContent = d.est;
    $("#card-rating").textContent = d.rating;
    $("#card-dish").textContent = d.dish;
    $("#card-price").textContent = d.price;
    $("#card-side").textContent = d.side;
    $("#card-phone").textContent = d.phone;
    $("#fortune-text").textContent = d.fortune;
    $("#fortune-nums").textContent = d.nums;
    card.classList.remove("is-empty");
    cookiePlate.classList.remove("is-empty");
    if (pop) {
      card.classList.remove("pop");
      void card.offsetWidth;
      card.classList.add("pop");
    }
    document.title = `${name} · Restaurant Name Generator`;
  }

  function resetCookie() {
    cookie.classList.remove("cracked");
    fortune.classList.remove("show");
    cookie.setAttribute("aria-label", "Crack open your fortune cookie");
  }

  cookie.addEventListener("click", () => {
    if (cookie.classList.contains("cracked")) return;
    cookie.classList.add("cracked");
    cookie.setAttribute("aria-label", "Fortune cookie, cracked open");
    sfx.crunch();
    fortune.classList.add("show");
  });

  // ---------- Celebrations ----------

  function burst(count) {
    if (reduceMotion.matches) return;
    const kinds = ["coin", "coin", "envelope"];
    for (let i = 0; i < count; i++) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#" + rand(kinds));
      el.append(use);
      el.setAttribute("class", "confetti");
      el.style.left = Math.random() * 100 + "vw";
      el.style.setProperty("--size", 18 + Math.random() * 22 + "px");
      el.style.setProperty("--dx", (Math.random() - 0.5) * 300 + "px");
      el.style.setProperty("--rot", (Math.random() - 0.5) * 1080 + "deg");
      el.style.setProperty("--dur", 2 + Math.random() * 1.8 + "s");
      el.style.setProperty("--delay", Math.random() * 0.6 + "s");
      el.addEventListener("animationend", () => el.remove());
      celebrate.append(el);
    }
  }

  function banner(text, small) {
    const b = document.createElement("div");
    b.className = "banner" + (small ? " small" : "");
    b.textContent = text;
    b.addEventListener("animationend", () => b.remove());
    celebrate.append(b);
  }

  function celebrateResult(r) {
    if (r.kind === "jackpot") {
      sfx.gong();
      banner("JACKPOT!!!");
      burst(70);
      document.body.classList.add("jackpot-flash");
      setTimeout(() => document.body.classList.remove("jackpot-flash"), 2200);
    } else if (r.kind === "special") {
      sfx.fanfare();
      banner("HOUSE SPECIAL!", true);
      burst(30);
    } else {
      sfx.ding();
      if (r.bonus) burst(10);
    }
  }

  // ---------- Spin ----------

  async function spin() {
    if (spinning) return;
    spinning = true;
    spinBtn.disabled = true;
    machine.classList.add("spinning-machine");
    hideBonus();
    resetCookie();

    lever.classList.remove("pull");
    void lever.offsetWidth;
    lever.classList.add("pull");
    sfx.lever();

    const r = generate();
    const quick = reduceMotion.matches;
    const d1 = quick ? 200 : 1500;
    const d2 = quick ? 300 : r.kind === "jackpot" ? 3200 : 2300;
    await Promise.all([
      spinReel(reelEls[0], r.a, FIRST, d1, quick ? 1 : 14),
      spinReel(reelEls[1], r.b, SECOND, d2, quick ? 1 : r.kind === "jackpot" ? 30 : 22),
    ]);
    if (r.bonus) await showBonus(r.bonus);

    current = r;
    render(r, { pop: true });
    celebrateResult(r);
    history.replaceState(null, "", "#" + toHash(r));

    machine.classList.remove("spinning-machine");
    spinning = false;
    spinBtn.disabled = false;
  }

  spinBtn.addEventListener("click", spin);
  lever.addEventListener("click", spin);

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    const t = e.target;
    // Leave Space alone on controls, except the already-cracked cookie
    const ctl = t.closest && t.closest("button, input, textarea, select, a");
    if (ctl && !(ctl === cookie && cookie.classList.contains("cracked"))) return;
    e.preventDefault();
    spinBtn.classList.add("pressed");
    setTimeout(() => spinBtn.classList.remove("pressed"), 120);
    spin();
  });

  // ---------- Share ----------

  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  $("#share").addEventListener("click", async () => {
    if (!current) return;
    const url = shareUrl(current);
    const text = `I'm opening a restaurant: "${fullName(current)}" 🥡`;
    if (navigator.share && matchMedia("(hover: none)").matches) {
      try { await navigator.share({ title: fullName(current), text, url }); return; }
      catch (err) { if (err && err.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast("Link copied! Spread the word 🥢");
    } catch {
      window.prompt("Copy this link:", url);
    }
  });

  // ---------- Sound toggle (remembered per browser) ----------

  function setSound(on) {
    sfx.set(on);
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.querySelector(".icon").textContent = on ? "🔊" : "🔇";
    soundBtn.querySelector(".label").textContent = on ? "Sound on" : "Sound off";
  }
  soundBtn.addEventListener("click", () => {
    const on = !sfx.on;
    setSound(on);
    try { localStorage.setItem("crng-sound", on ? "1" : "0"); } catch {}
    if (on) sfx.ding();
  });
  // Browsers need a click before audio can start, so we only restore the
  // preference visually here; the AudioContext starts on the next gesture.
  try {
    if (localStorage.getItem("crng-sound") === "1") {
      setSound(true);
    }
  } catch {}

  // ---------- Startup ----------

  function loadFromHash() {
    const r = fromHash();
    if (!r) return false;
    current = r;
    setReel(reelEls[0], r.a);
    setReel(reelEls[1], r.b);
    if (r.bonus) {
      placard.textContent = r.bonus;
      placardSlot.classList.add("show");
    } else {
      hideBonus();
    }
    resetCookie();
    render(r);
    return true;
  }

  if (!loadFromHash()) {
    setReel(reelEls[0], "???");
    setReel(reelEls[1], "???");
  }

  window.addEventListener("hashchange", () => { if (!spinning) loadFromHash(); });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutBulbs();
      reelEls.forEach((reel) => reel.querySelectorAll(".reel-item").forEach(fit));
    }, 100);
  });

  layoutBulbs();
  // Refit once web fonts arrive (they change word widths)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      layoutBulbs();
      reelEls.forEach((reel) => reel.querySelectorAll(".reel-item").forEach(fit));
    });
  }
})();
