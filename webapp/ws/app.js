import { WebSocketServer } from "ws";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import os from "os";

console.log("web_server started")

const port = 22006;
// 0.0.0.0 = nasłuchuj na wszystkich interfejsach (localhost + LAN/Wi-Fi),
// dzięki temu telefon w tej samej sieci Wi-Fi też dostanie dane z PC-hosta.
const host = "0.0.0.0";
const server = http.createServer();
const web_socket_server = new WebSocketServer(
{
    server: server, path: "/cs2_webradar"
});

// ---------------------------------------------------------------------------
// AUTO-DETECT lokalnego konta Steam (żeby radar sam wiedział, kim jesteś).
// CS2 zawsze działa na koncie zalogowanym w kliencie Steam na tym PC,
// więc odczytujemy je na hoście i rozsyłamy do wszystkich podglądów
// (PC + telefon) jako { m_local_steam_id }. Frontend traktuje to konto
// jak "moje" i rysuje je na ZIELONO — bez żadnej listy i bez klikania.
// ---------------------------------------------------------------------------
const STEAM_ID_OFFSET = 76561197960265728n;

const isValidSteamId64 = (id) => typeof id === "string" && /^765\d{14}$/.test(id);

const regQueryValue = (keyPath, valueName) => new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(null);
    execFile("reg", ["query", keyPath, "/v", valueName], { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve(null);
        const m = String(stdout).match(/REG_(?:DWORD|QWORD|SZ|EXPAND_SZ)\s+([^\r\n]+)/);
        resolve(m ? m[1].trim() : null);
    });
});

// Sposób 1: rejestr HKCU\Software\Valve\Steam\ActiveUser (ID konta 32-bit).
const detectViaActiveUser = async () => {
    const raw = await regQueryValue("HKCU\\Software\\Valve\\Steam", "ActiveUser");
    if (!raw) return null;
    // Zwykle HEX (0x...), czasem decimal. 0 = nikt niezalogowany.
    const accountId = raw.toLowerCase().startsWith("0x") ? parseInt(raw, 16) : parseInt(raw, 10);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) return null;
    const steam64 = String(BigInt(accountId) + STEAM_ID_OFFSET);
    return isValidSteamId64(steam64) ? steam64 : null;
};

// Sposób 2: config/loginusers.vdf -> konto z "MostRecent" "1" (klucz = SteamID64).
const parseLoginUsers = (text) => {
    const users = [];
    const re = /"(\d{17})"\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        users.push({ steamId: m[1], recent: /"MostRecent"\s*"1"/.test(m[2]) });
    }
    return users;
};

const detectViaLoginUsers = async () => {
    let steamPath = await regQueryValue("HKCU\\Software\\Valve\\Steam", "SteamPath");
    const candidates = [
        steamPath && steamPath.replace(/\//g, "\\"),
        "C:\\Program Files (x86)\\Steam",
        "C:\\Program Files\\Steam",
    ].filter(Boolean);
    for (const base of candidates) {
        try {
            const text = fs.readFileSync(path.join(base, "config", "loginusers.vdf"), "utf8");
            const users = parseLoginUsers(text).filter((u) => isValidSteamId64(u.steamId));
            if (users.length === 0) continue;
            const recent = users.find((u) => u.recent);
            return (recent || (users.length === 1 ? users[0] : null))?.steamId || null;
        } catch {
            /* próbuj następną ścieżkę */
        }
    }
    return null;
};

let cachedLocalSteamId = null;

const detectLocalSteamId = async () => (await detectViaActiveUser()) || (await detectViaLoginUsers());

const broadcastLocalSteamId = (steamId) => {
    if (!isValidSteamId64(steamId)) return;
    const payload = JSON.stringify({ m_local_steam_id: steamId });
    web_socket_server.clients.forEach((client) => {
        try {
            if (client.readyState === 1) client.send(payload);
        } catch { /* ignore */ }
    });
};

const refreshLocalSteamId = async () => {
    try {
        const id = await detectLocalSteamId();
        if (id && id !== cachedLocalSteamId) {
            cachedLocalSteamId = id;
            console.info(`wykryto lokalne konto Steam: ${id} (będzie ZIELONE na radarze)`);
            broadcastLocalSteamId(id);
        }
    } catch { /* Steam niedostępny — działa lista zapasowa z pliku */ }
};

// ---------------------------------------------------------------------------
// SYNC pozycji liter A/B między wszystkimi podglądami (PC + telefon).
// Przeciągniesz literę w jednym miejscu -> serwer zapisuje to do pliku
// i rozsyła do reszty. Nowy podgląd dostaje zapisane pozycje przy połączeniu,
// więc nic nie znika po restarcie ani nie trzeba ustawiać dwa razy.
// Protokół (JSON, obie strony):
//   klient -> serwer: { m_bombsite_move: { map, label, x, y } }
//   klient -> serwer: { m_bombsite_reset: { map } }
//   serwer -> klienci: jak wyżej (relay) + { m_bombsites: { map: [{label,x,y}] } }
// ---------------------------------------------------------------------------
const SITE_OVERRIDES_FILE = new URL("./bombsites-overrides.json", import.meta.url);

const isValidSitePos = (p) =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

const isValidSiteMove = (m) =>
    m && typeof m.map === "string" && /^[a-z0-9_]+$/i.test(m.map) &&
    (m.label === "A" || m.label === "B") && isValidSitePos(m);

// Czyste funkcje (testowalne): zwracają NOWY stan, nie mutują wejścia.
const applySiteMove = (state, move) => {
    if (!isValidSiteMove(move)) return state;
    const next = { ...(state || {}) };
    const list = Array.isArray(next[move.map]) ? next[move.map].map((s) => ({ ...s })) : [];
    const idx = list.findIndex((s) => s.label === move.label);
    const entry = { label: move.label, x: move.x, y: move.y };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    next[move.map] = list;
    return next;
};

const applySiteReset = (state, map) => {
    if (typeof map !== "string" || !state || !state[map]) return state;
    const next = { ...(state || {}) };
    delete next[map];
    return next;
};

let siteOverrides = {};
try {
    const raw = fs.readFileSync(SITE_OVERRIDES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
        // wczytaj tylko poprawne wpisy
        const clean = {};
        for (const [map, list] of Object.entries(parsed)) {
            if (!Array.isArray(list)) continue;
            const ok = list.filter((s) => s && (s.label === "A" || s.label === "B") && isValidSitePos(s))
                .map((s) => ({ label: s.label, x: s.x, y: s.y }));
            if (ok.length > 0) clean[map] = ok;
        }
        siteOverrides = clean;
    }
} catch { /* brak pliku przy pierwszym starcie — powstanie po 1. przesunięciu */ }

const persistSiteOverrides = () => {
    try {
        fs.writeFileSync(SITE_OVERRIDES_FILE, JSON.stringify(siteOverrides, null, 2));
    } catch (err) {
        console.error(`nie zapisano pozycji siteów: ${err.message}`);
    }
};

// ---------------------------------------------------------------------------
// AWATARY Steam (?pfp=1 we frontendzie).
// Przeglądarka nie może sama pobrać awatarów (Steam blokuje CORS), więc robi
// to serwer: dla podanych SteamID64 ściąga publiczny XML profilu
// (https://steamcommunity.com/profiles/<id>/?xml=1, bez klucza API),
// wyciąga URL awatara, cache'uje (pamięć + plik) i rozsyła do wszystkich.
// Frontend pokazuje awatar tylko nad graczami PRZECIWNEJ drużyny.
// ---------------------------------------------------------------------------
const AVATARS_FILE = new URL("./avatars.json", import.meta.url);

let avatarCache = {};
try {
    const raw = fs.readFileSync(AVATARS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
            if (!/^765\d{14}$/.test(k)) continue;
            const triple = cleanAvatarTriple(v);
            if (triple) avatarCache[k] = triple;
        }
    }
} catch { /* brak pliku — powstanie po 1. pobraniu */ }

// Czyste funkcje (testowalne): wyciągnij URL-e awatara z XML profilu.
// Steam daje 3 rozmiary: avatarIcon (32px), avatarMedium (64px), avatarFull (184px).
// Uwaga: Steam zawija URL-e w <![CDATA[...]]> — trzeba to zdjąć przed regexem.
const stripCdata = (xml) => String(xml || "").replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");

const pickAvatarTag = (text, tag) => {
    const m = text.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    const url = m ? m[1].trim() : "";
    return url.startsWith("https://") ? url : null;
};

const parseAvatarXmlAll = (xml) => {
    const text = stripCdata(xml);
    const out = {};
    for (const [key, tag] of [["icon", "avatarIcon"], ["medium", "avatarMedium"], ["full", "avatarFull"]]) {
        const url = pickAvatarTag(text, tag);
        if (url) out[key] = url;
    }
    return Object.keys(out).length > 0 ? out : null;
};

// Kompatybilność wstecz: jeden URL (full > medium > icon).
const parseAvatarXml = (xml) => {
    const all = parseAvatarXmlAll(xml);
    return all ? (all.full || all.medium || all.icon) : null;
};

const cleanAvatarTriple = (v) => {
    if (typeof v === "string") {
        return v.startsWith("https://") ? { full: v } : null; // stary format cache
    }
    if (!v || typeof v !== "object") return null;
    const out = {};
    for (const k of ["icon", "medium", "full"]) {
        if (typeof v[k] === "string" && v[k].startsWith("https://")) out[k] = v[k];
    }
    return Object.keys(out).length > 0 ? out : null;
};

const fetchAvatarXml = async (steamId) => {
    if (typeof fetch !== "function") {
        console.warn(`awatar ${steamId}: ten Node (${process.version}) nie ma fetch — zaktualizuj Node.js do 18+`);
        return null;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
            signal: ctrl.signal,
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CS2Radar/1.0" },
        });
        if (!res.ok) {
            console.warn(`awatar ${steamId}: Steam odpowiedział HTTP ${res.status}`);
            return null;
        }
        const triple = parseAvatarXmlAll(await res.text());
        if (!triple) console.warn(`awatar ${steamId}: profil bez awatara w XML`);
        return triple;
    } catch (err) {
        console.warn(`awatar ${steamId}: brak połączenia ze Steam (${err.message || err})`);
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const persistAvatars = () => {
    try {
        fs.writeFileSync(AVATARS_FILE, JSON.stringify(avatarCache));
    } catch (err) {
        console.error(`nie zapisano awatarów: ${err.message}`);
    }
};

const broadcastAvatars = (map) => {
    if (!map || Object.keys(map).length === 0) return;
    const payload = JSON.stringify({ m_avatars: map });
    web_socket_server.clients.forEach((client) => {
        try {
            if (client.readyState === 1) client.send(payload);
        } catch { /* ignore */ }
    });
};

// Kolejka pobierania: po jednym na raz + 400 ms przerwy (limit Steama).
const avatarQueue = [];
let avatarPumpRunning = false;

const pumpAvatarQueue = async () => {
    if (avatarPumpRunning) return;
    avatarPumpRunning = true;
    try {
        while (avatarQueue.length > 0) {
            const id = avatarQueue.shift();
            if (!id || avatarCache[id]) continue;
            try {
                const triple = await fetchAvatarXml(id);
                if (triple) {
                    avatarCache[id] = triple;
                    const keys = Object.keys(avatarCache);
                    if (keys.length > 2000) {
                        for (const k of keys.slice(0, keys.length - 2000)) delete avatarCache[k];
                    }
                    persistAvatars();
                    broadcastAvatars({ [id]: triple });
                    console.info(`awatar ${id}: pobrano (${Object.keys(triple).join("/")})`);
                }
            } catch { /* pojedynczy fail nie zatrzymuje kolejki */ }
            if (avatarQueue.length > 0) {
                await new Promise((r) => setTimeout(r, 400));
            }
        }
    } finally {
        avatarPumpRunning = false;
    }
};

web_socket_server.on("connection", (web_socket, request) => {
    const client_address = request.socket.remoteAddress.replace("::ffff:", "");
    console.info(`${client_address} connected`);

    // Nowy podgląd od razu dostaje wykryte konto (bez czekania na tick).
    if (cachedLocalSteamId) {
        try { web_socket.send(JSON.stringify({ m_local_steam_id: cachedLocalSteamId })); } catch { /* ignore */ }
    } else {
        refreshLocalSteamId().then(() => {
            if (cachedLocalSteamId) {
                try { web_socket.send(JSON.stringify({ m_local_steam_id: cachedLocalSteamId })); } catch { /* ignore */ }
            }
        });
    }

    // Nowy podgląd od razu dostaje zapisane pozycje siteów (żeby po
    // restarcie / na telefonie litery stały tam gdzie je ustawiono).
    if (Object.keys(siteOverrides).length > 0) {
        try { web_socket.send(JSON.stringify({ m_bombsites: siteOverrides })); } catch { /* ignore */ }
    }

    // ...i znane awatary (żeby nie czekać aż serwer pobierze je od nowa).
    if (Object.keys(avatarCache).length > 0) {
        try { web_socket.send(JSON.stringify({ m_avatars: avatarCache })); } catch { /* ignore */ }
    }

    web_socket.on("message", (message, isBinary) => {
        // Fast-path: dane z gry idą binarnie — nie ma co ich parsować ani
        // konwertować na string (wcześniej: String() + wyjątek na każdy tick).
        // Kontrola (kolory/site/awatary/meta) idzie ramkami tekstowymi.
        if (!isBinary) {
        // Wiadomości o siteach: zapisz, potem puść dalej do wszystkich.
        try {
            const parsed = JSON.parse(String(message));
            if (parsed && parsed.m_bombsite_move && isValidSiteMove(parsed.m_bombsite_move)) {
                const m = parsed.m_bombsite_move;
                siteOverrides = applySiteMove(siteOverrides, m);
                persistSiteOverrides();
                console.info(`site ${m.map} ${m.label} -> (${m.x}, ${m.y})`);
            } else if (parsed && parsed.m_bombsite_reset && typeof parsed.m_bombsite_reset.map === "string") {
                siteOverrides = applySiteReset(siteOverrides, parsed.m_bombsite_reset.map);
                persistSiteOverrides();
                console.info(`site ${parsed.m_bombsite_reset.map} zresetowany`);
            } else if (parsed && Array.isArray(parsed.m_avatar_req)) {
                // Prośba o awatary: do kolejki tylko nowe, poprawne ID (max 10/prośbę).
                let added = 0;
                for (const rawId of parsed.m_avatar_req) {
                    const id = String(rawId ?? "").trim();
                    if (!/^765\d{14}$/.test(id) || avatarCache[id]) continue;
                    if (!avatarQueue.includes(id) && avatarQueue.length < 50) {
                        avatarQueue.push(id);
                        added++;
                    }
                    if (added >= 10) break;
                }
                if (added > 0) {
                    console.info(`awatary: prośba o ${added} (kolejka: ${avatarQueue.length}, cache: ${Object.keys(avatarCache).length})`);
                    pumpAvatarQueue();
                }
            }
        } catch { /* nie-JSON — po prostu przekaż dalej */ }
        }
        web_socket_server.clients.forEach((client) => {
            try {
                client.send(message, { binary: isBinary });
            } catch { /* martwy klient — reszta i tak dostanie */ }
        });
    });

    web_socket.on("close", () => {
        console.info(`${client_address} disconnected \n`);
    });

    web_socket.on("error", (error) => {
        console.error(error);
    });
});

server.listen(port, host, () => {
    console.info(`listening on '${host}:${port}' (LAN + localhost)`);
    // Wykryj konto Steam od razu na starcie + odświeżaj co 15 s
    // (np. po przełączeniu konta w kliencie Steam).
    refreshLocalSteamId();
    setInterval(refreshLocalSteamId, 15000);    // Wypisz adresy LAN, żeby było wiadomo co wpisać na telefonie
    const nets = os.networkInterfaces();
    for (const interfaces of Object.values(nets)) {
        for (const net of interfaces || []) {
            if (net.family === "IPv4" && !net.internal) {
                console.info(`  LAN podglad: http://${net.address}:5173  (WS: ws://${net.address}:${port}/cs2_webradar)`);
            }
        }
    }
});

// Eksport czystych helperów do testów (import odpala też serwer — tak ma być).
export { isValidSteamId64, parseLoginUsers, detectLocalSteamId, STEAM_ID_OFFSET, isValidSiteMove, applySiteMove, applySiteReset, parseAvatarXml, parseAvatarXmlAll, cleanAvatarTriple };