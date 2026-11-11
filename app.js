(() => {
  const PIN_HASH =
    "b3bfc652a46a0d8fddd81e513f16606b1bcdbe77ba9761c47a8dcbbbe152e1d6";
  const SESSION_KEY = "the-wall-unlocked";
  const LOCAL_KEY = "the-wall-posts";
  const MAX_IMAGE_CHARS = 500000;

  const pinScreen = document.getElementById("pin-screen");
  const wallScreen = document.getElementById("wall-screen");
  const pinForm = document.getElementById("pin-form");
  const pinInput = document.getElementById("pin-input");
  const pinError = document.getElementById("pin-error");
  const composer = document.getElementById("composer");
  const authorInput = document.getElementById("author");
  const bodyInput = document.getElementById("body");
  const photoInput = document.getElementById("photo");
  const photoName = document.getElementById("photo-name");
  const photoPreviewWrap = document.getElementById("photo-preview-wrap");
  const photoPreview = document.getElementById("photo-preview");
  const photoClear = document.getElementById("photo-clear");
  const composerError = document.getElementById("composer-error");
  const postBtn = document.getElementById("post-btn");
  const feed = document.getElementById("feed");
  const feedStatus = document.getElementById("feed-status");
  const syncBanner = document.getElementById("sync-banner");

  let selectedImage = "";
  let supabaseClient = null;
  let knownIds = new Set();

  function config() {
    const raw = window.WALL_CONFIG || {};
    return {
      supabaseUrl: (raw.supabaseUrl || "").trim(),
      supabaseAnonKey: (raw.supabaseAnonKey || "").trim()
    };
  }

  function hasBackend() {
    const c = config();
    return Boolean(c.supabaseUrl && c.supabaseAnonKey);
  }

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function showError(el, message) {
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function setUnlocked(unlocked) {
    pinScreen.hidden = unlocked;
    wallScreen.hidden = !unlocked;
    if (unlocked) {
      bodyInput.focus();
    } else {
      pinInput.focus();
    }
  }

  function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "Just now";
    if (diff < hour) {
      const n = Math.floor(diff / minute);
      return n === 1 ? "1 minute ago" : n + " minutes ago";
    }
    if (diff < day) {
      const n = Math.floor(diff / hour);
      return n === 1 ? "1 hour ago" : n + " hours ago";
    }
    if (diff < 7 * day) {
      const n = Math.floor(diff / day);
      return n === 1 ? "1 day ago" : n + " days ago";
    }
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function loadLocalPosts() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveLocalPosts(posts) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(posts));
  }

  function renderPosts(posts) {
    feed.replaceChildren();
    if (!posts.length) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "No notes yet. Be the first to post.";
      feed.append(empty);
      return;
    }

    const listItems = posts
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((post) => {
        const item = document.createElement("li");
        item.className = "post";
        item.dataset.id = post.id;

        const meta = document.createElement("div");
        meta.className = "post-meta";

        const author = document.createElement("span");
        author.className = "post-author";
        author.textContent = post.author ? post.author : "Anonymous";

        const time = document.createElement("time");
        time.dateTime = post.created_at;
        time.textContent = formatTime(post.created_at);

        meta.append(author, time);
        item.append(meta);

        if (post.body) {
          const body = document.createElement("p");
          body.className = "post-body";
          body.textContent = post.body;
          item.append(body);
        }

        if (post.image_data && /^data:image\//.test(post.image_data)) {
          const image = document.createElement("img");
          image.src = post.image_data;
          image.alt = post.body ? "Photo for this note" : "Posted photo";
          item.append(image);
        }

        return item;
      });

    feed.append(...listItems);
    knownIds = new Set(posts.map((p) => p.id));
  }

  async function loadImageElement(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function compressImage(file) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Choose a photo.");
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Photo is larger than 8 MB.");
    }

    const image = await loadImageElement(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not prepare the photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.72;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > MAX_IMAGE_CHARS && quality > 0.4) {
      quality -= 0.08;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > MAX_IMAGE_CHARS) {
      throw new Error("Photo is still too large after shrinking.");
    }
    return data;
  }

  function clearPhoto() {
    selectedImage = "";
    photoInput.value = "";
    photoName.textContent = "";
    photoPreview.removeAttribute("src");
    photoPreviewWrap.hidden = true;
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!hasBackend()) return null;
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.10/dist/umd/supabase.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load the shared database library."));
        document.head.append(script);
      });
    }
    const c = config();
    supabaseClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
    return supabaseClient;
  }

  async function fetchPosts() {
    if (hasBackend()) {
      const client = await ensureSupabase();
      const { data, error } = await client
        .from("posts")
        .select("id, author, body, image_data, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data || [];
    }
    return loadLocalPosts();
  }

  async function createPost(post) {
    if (hasBackend()) {
      const client = await ensureSupabase();
      const { data, error } = await client
        .from("posts")
        .insert({
          author: post.author,
          body: post.body,
          image_data: post.image_data
        })
        .select("id, author, body, image_data, created_at")
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    const posts = [post, ...loadLocalPosts()];
    saveLocalPosts(posts);
    return post;
  }

  async function refreshFeed(statusMessage) {
    try {
      if (statusMessage) feedStatus.textContent = statusMessage;
      const posts = await fetchPosts();
      renderPosts(posts);
      feedStatus.textContent = hasBackend()
        ? "Shared with everyone who has the PIN."
        : "";
    } catch (err) {
      feedStatus.textContent = "Could not load notes. " + err.message;
    }
  }

  pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = pinInput.value.trim();
    if (!/^[0-9]{6}$/.test(pin)) {
      showError(pinError, "Enter the 6-digit PIN.");
      return;
    }
    const hash = await sha256Hex(pin);
    if (hash !== PIN_HASH) {
      showError(pinError, "Wrong PIN.");
      pinInput.select();
      return;
    }
    showError(pinError, "");
    sessionStorage.setItem(SESSION_KEY, "1");
    setUnlocked(true);
    await refreshFeed();
  });

  pinInput.addEventListener("input", () => {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
    showError(pinError, "");
  });

  photoInput.addEventListener("change", async () => {
    showError(composerError, "");
    const file = photoInput.files && photoInput.files[0];
    if (!file) {
      clearPhoto();
      return;
    }
    photoName.textContent = "Shrinking photo…";
    try {
      selectedImage = await compressImage(file);
      photoName.textContent = file.name;
      photoPreview.src = selectedImage;
      photoPreviewWrap.hidden = false;
    } catch (err) {
      clearPhoto();
      showError(composerError, err.message);
    }
  });

  photoClear.addEventListener("click", () => {
    clearPhoto();
    showError(composerError, "");
  });

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(composerError, "");
    const author = authorInput.value.trim();
    const body = bodyInput.value.trim();
    if (!body && !selectedImage) {
      showError(composerError, "Write a note or add a photo.");
      return;
    }

    const post = {
      id: crypto.randomUUID(),
      author: author || null,
      body,
      image_data: selectedImage || null,
      created_at: new Date().toISOString()
    };

    postBtn.disabled = true;
    try {
      await createPost(post);
      bodyInput.value = "";
      clearPhoto();
      await refreshFeed();
    } catch (err) {
      showError(composerError, "Could not post. " + err.message);
    } finally {
      postBtn.disabled = false;
    }
  });

  function updateBanner() {
    if (hasBackend()) {
      syncBanner.hidden = true;
      syncBanner.textContent = "";
      return;
    }
    syncBanner.hidden = false;
    syncBanner.textContent =
      "This preview keeps notes in this browser only. After Supabase is connected, everyone with the PIN will see the same wall.";
  }

  async function start() {
    updateBanner();
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setUnlocked(true);
      await refreshFeed();
    } else {
      setUnlocked(false);
    }

    if (hasBackend()) {
      setInterval(() => {
        if (!wallScreen.hidden) refreshFeed();
      }, 20000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && !wallScreen.hidden) {
          refreshFeed();
        }
      });
    }
  }

  start();
})();
