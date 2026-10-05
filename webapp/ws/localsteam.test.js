import { isValidSteamId64, parseLoginUsers, STEAM_ID_OFFSET, isValidSiteMove, applySiteMove, applySiteReset, parseAvatarXml, parseAvatarXmlAll, cleanAvatarTriple } from './app.js';

let failures = 0;
const check = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
  if (!cond) failures++;
};

// 1. Walidacja SteamID64
check('poprawne ID', isValidSteamId64('76561198636183978') === true);
check('poprawne ID 2', isValidSteamId64('76561199250613456') === true);
check('za krotkie', isValidSteamId64('12345') === false);
check('zly prefiks', isValidSteamId64('86561198636183978') === false);
check('puste', isValidSteamId64('') === false);
check('null', isValidSteamId64(null) === false);

// 2. Konwersja ActiveUser (accountID32 -> SteamID64), jak w rejestrze
const accountId = 2759147250; // przyklad
const steam64 = String(BigInt(accountId) + STEAM_ID_OFFSET);
check('konwersja ActiveUser daje poprawne ID (' + steam64 + ')', isValidSteamId64(steam64));

// 3. Parsowanie loginusers.vdf
const vdf = `"users"
{
  "76561199250613456"
  {
    "AccountName" "konto1"
    "MostRecent" "0"
  }
  "76561198636183978"
  {
    "AccountName" "konto2"
    "MostRecent" "1"
  }
}`;
const users = parseLoginUsers(vdf);
check('parsuje 2 userow', users.length === 2);
check(
  'wykrywa MostRecent',
  users.find((u) => u.recent)?.steamId === '76561198636183978'
);

// 4. Meta-wiadomosc serwera nie psuje liczb (regex z frontendu)
const raw = '{"m_steam_id":76561198636183978,"m_players":[]}';
const safe = raw.replace(/"m_steam_id"\s*:\s*(\d{10,})/g, '"m_steam_id":"$1"');
check('regex zachowuje precyzje', JSON.parse(safe).m_steam_id === '76561198636183978');

// 5. Sync pozycji siteow
check('poprawny move', isValidSiteMove({ map: 'de_mirage', label: 'A', x: 0.5, y: 0.5 }) === true);
check('zly label', isValidSiteMove({ map: 'de_mirage', label: 'C', x: 0.5, y: 0.5 }) === false);
check('poza zakresem', isValidSiteMove({ map: 'de_mirage', label: 'A', x: 1.5, y: 0.5 }) === false);
check('zla mapa (injection)', isValidSiteMove({ map: '../x', label: 'A', x: 0.5, y: 0.5 }) === false);

const s1 = applySiteMove({}, { map: 'de_mirage', label: 'A', x: 0.56, y: 0.71 });
check('dodaje wpis', s1.de_mirage?.length === 1 && s1.de_mirage[0].x === 0.56);
const s2 = applySiteMove(s1, { map: 'de_mirage', label: 'A', x: 0.57, y: 0.72 });
check('nadpisuje te sama litere', s2.de_mirage?.length === 1 && s2.de_mirage[0].x === 0.57);
check('nie mutuje poprzedniego stanu', s1.de_mirage[0].x === 0.56);
const s3 = applySiteMove(s2, { map: 'de_mirage', label: 'B', x: 0.25, y: 0.29 });
check('doklada druga litere', s3.de_mirage?.length === 2);
const s4 = applySiteMove(s3, { map: 'de_mirage', label: 'C', x: 0.1, y: 0.1 });
check('odrzuca bledny move', s4 === s3);
const s5 = applySiteReset(s3, 'de_mirage');
check('reset usuwa mape', s5.de_mirage === undefined);
check('reset nie mutuje', s3.de_mirage?.length === 2);

// 6. Parsowanie XML profilu Steam (awatary)
const xmlFull = `<profile><steamID64>76561198636183978</steamID64><avatarMedium>https://avatars.steamstatic.com/abc_m.jpg</avatarMedium><avatarFull>https://avatars.steamstatic.com/abc_f.jpg</avatarFull></profile>`;
check('bierze avatarFull', parseAvatarXml(xmlFull) === 'https://avatars.steamstatic.com/abc_f.jpg');
const xmlMedium = `<profile><avatarMedium>https://avatars.steamstatic.com/abc_m.jpg</avatarMedium></profile>`;
check('fallback do medium', parseAvatarXml(xmlMedium) === 'https://avatars.steamstatic.com/abc_m.jpg');
check('brak tagow', parseAvatarXml('<profile></profile>') === null);
check('odrzuca http', parseAvatarXml('<profile><avatarFull>http://evil/x.jpg</avatarFull></profile>') === null);
check('pusty input', parseAvatarXml('') === null);
// Prawdziwy format Steama (2026): URL w CDATA, nowy CDN fastly
const xmlCdata = `<profile><avatarMedium><![CDATA[https://avatars.fastly.steamstatic.com/abc_medium.jpg]]></avatarMedium><avatarFull><![CDATA[https://avatars.fastly.steamstatic.com/abc_full.jpg]]></avatarFull></profile>`;
check('CDATA wyciaga full', parseAvatarXml(xmlCdata) === 'https://avatars.fastly.steamstatic.com/abc_full.jpg');

// 7. Trojka rozmiarow awatara
const xml3 = `<profile><avatarIcon><![CDATA[https://x/i.jpg]]></avatarIcon><avatarMedium><![CDATA[https://x/m.jpg]]></avatarMedium><avatarFull><![CDATA[https://x/f.jpg]]></avatarFull></profile>`;
const triple = parseAvatarXmlAll(xml3);
check('trojka icon/medium/full', triple && triple.icon === 'https://x/i.jpg' && triple.medium === 'https://x/m.jpg' && triple.full === 'https://x/f.jpg');
check('trojka czesciowa', (() => { const t = parseAvatarXmlAll('<profile><avatarMedium>https://x/m.jpg</avatarMedium></profile>'); return t && t.medium === 'https://x/m.jpg' && !t.full && !t.icon; })());
check('trojka pusta', parseAvatarXmlAll('<profile></profile>') === null);
check('migracja string->full', (() => { const t = cleanAvatarTriple('https://x/old.jpg'); return t && t.full === 'https://x/old.jpg'; })());
check('czysci trojke', (() => { const t = cleanAvatarTriple({ icon: 'https://x/i.jpg', medium: 'http://zle', full: 'https://x/f.jpg', extra: 'https://x/e.jpg' }); return t && t.icon === 'https://x/i.jpg' && t.full === 'https://x/f.jpg' && !t.medium && !t.extra; })());
check('odrzuca smieci', cleanAvatarTriple({ medium: 'nie-url' }) === null && cleanAvatarTriple(123) === null);

if (failures > 0) {
  console.error(failures + ' testow NIE przeszlo');
  process.exit(1);
}
console.log('Wszystkie testy przeszly.');
process.exit(0);
