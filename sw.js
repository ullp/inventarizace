/* =============================================================================
   SEBEZNIČUJÍCÍ service worker – IQ-Čtečka je čistě webová aplikace a service
   worker už nepoužívá. Tento soubor záměrně ZŮSTÁVÁ na místě, aby se u zařízení,
   která mají zaregistrovanou starou verzi, provedla aktualizace a stará
   registrace se sama zrušila.

   Proč to nestačí jen smazat: kdyby soubor zmizel (404), prohlížeč by nemohl
   provést aktualizaci a PONECHAL by běžet starý service worker i s jeho cache –
   ten pak vrací zastaralé styles.css / app.js a po obyčejném obnovení (F5)
   rozbíjí vzhled, zatímco tvrdé obnovení (Ctrl+F5) vypadá správně.

   Tato verze:
     1. nemá žádný 'fetch' handler  → nic neobsluhuje z cache, vše jde ze sítě,
     2. po aktivaci smaže všechny cache aplikace 'iq-ctecka-*',
     3. zruší vlastní registraci.
   ============================================================================= */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 1) smazat cache starých verzí (držely zastaralé soubory)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.indexOf('iq-ctecka') === 0).map(k => caches.delete(k)));
    } catch (e) {}
    // 2) zrušit registraci service workeru – další načtení už jde čistě ze sítě
    try { await self.registration.unregister(); } catch (e) {}
  })());
});

// Žádný 'fetch' listener = prohlížeč vždy použije síť (žádné zastaralé soubory).
