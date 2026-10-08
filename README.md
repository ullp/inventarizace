# IQ-Čtečka – Inventura majetku 📱🏷️

**Webová aplikace** (HTML + JavaScript) pro inventuru majetku – spustí se přímo v prohlížeči, **bez instalace a bez service workeru**. V terénu ji obsluhujete **pouze mobilním telefonem**.

## Jak to odpovídá zadání

1. **Účetní má seznam majetku** → záložka **Seznam**: nahraje CSV export (`data/Inventář majetku - List 1.csv`).
2. **2 štítky pro každou položku** → záložka **Štítky**: pro každý **kus** (počet se rozpadne: židle ×5 → 5 unikátních kódů) se generují **2 identické QR štítky se stejným kódem**:
   - `SEZNAM` – do papírového seznamu účetní
   - `MAJETEK` – nalepit na fyzický majetek
3. **Validace v terénu mobilem** → záložka **Inventura**: kamera skenuje QR na majetku (nebo v seznamu), položka se okamžitě spáruje ✅ + čas.
4. **Párování štítků** → sken kteréhokoliv ze 2 štítků označí daný kus jako nalezený. Duplicitní / neznámé kódy hlásí zvukem a hláškou.
5. **HTML live stránka, ne nativní app** → čistě webová aplikace (jeden `index.html` + JS), **žádná instalace ani PWA**; data v `localStorage`. Viz [Čistě webová aplikace](#čistě-webová-aplikace-bez-instalace-).
6. **Opakovaná inventura v čase** → záložka **Štítky**: vytvořenou sadu QR kódů uložíte pod názvem, později ji znovu otevřete a **ověříte skenerem** (kódy zobrazené na obrazovce počítače) – viz [Sady štítků](#sady-štítků--uložení-znovuotevření-a-ověření-).

## Přihlášení a uživatelské role 🔐

Aplikace začíná **přihlašovací stránkou**. Účty a ukázková data jsou součástí aplikace (jde o klientské demo bez serveru – hesla jsou proto volně viditelná v `demo-data.js`).

> **Přihlašovací stránka záměrně nezobrazuje seznam demo účtů.** Přehled uživatelů a hesel je pouze zde v dokumentaci.

| Role | Uživatel | Heslo | Co smí |
|---|---|---|---|
| 👑 **Admin** | `admin` | `Eonflux*442699` | vidí a spravuje **všechny firmy**, přepíná firmu v liště |
| 🏢 **Firma A** | `alfa` | `alfa` | plná editace dat firmy Alfa |
| 🏢 **Firma B** | `beta` | `beta` | plná editace dat firmy Beta |
| 🧪 **Demo firma** | `demo` | `demo` | plná editace demo firemních dat |
| 👁️ **Host (guest)** | `host` | `host` | **jen čtení** – prohlíží demo data, nic nemění |

**Oprávnění v praxi**
- **Editor** (admin / firma) vidí nahrání CSV, generování kódů, skenování, ruční zadání, mazání, obnovu zálohy i tlačítka akcí v tabulce.
- **Host** má tyto prvky skryté nebo zakázané a v záložce *Inventura* se mu zobrazí žlutý pruh **„Režim čtení“**. Export CSV/JSON a tisk štítků (čtení dat) mu zůstávají dostupné.
- Každá firma má **oddělená data** (`localStorage` klíč `iq-ctecka-v1:<firma>`), takže se seznamy ani výsledky inventury nemíchají.
- Přihlášení se pamatuje (relace v `localStorage`) – po obnovení stránky zůstáváte přihlášeni. Tlačítko **Odhlásit** relaci zruší.

### Ukázková data k hraní

Při prvním přihlášení se každá firma automaticky naplní vzorovým majetkem (rozpad na kusy + kódy + QR):

| Firma | Prefix kódů | Ukázkový majetek |
|---|---|---|
| 🧪 Demo firma s.r.o. | `DMZ-0001…` | stoly, židle, notebooky, monitory, tiskárna, firemní auto, servírovací vozík – část už označena jako nalezená, aby byly vidět výsledky |
| 🅰️ Firma Alfa a.s. | `ALFA-0001…` | židle, psací stoly, notebooky ThinkPad, monitory, tiskárny (čistý start – 0 % nalezeno) |
| 🅱️ Firma Beta s.r.o. | `BETA-0001…` | firemní PC, monitory, tiskárna, tabule, dodávka (čistý start) |

Data si můžete kdykoli vyzkoušet „naostro“: **Nahrát CSV** (vlastní seznam), **Načíst ukázková data**, **Smazat** a znovu vygenerovat.

> Tip pro rychlý test role hosta: přihlaste se jako `admin`, naskenujte pár kódů v záložce *Inventura*, odhlaste se a přihlaste jako `host` – uvidíte stejná data, ale bez možnosti zápisu.

## Sady štítků – uložení, znovuotevření a ověření 📚

Záložka **Štítky** obsahuje kartu **„Sady štítků“**. Uložením vznikne **pojmenovaná sada QR kódů** z právě vytvořeného seznamu.

**Uložení**
1. V záložce *Seznam* nahrajte CSV nebo ukázková data (vzniknou kódy `DMZ-0001`, …).
2. V záložce *Štítky* napište **Název sady** (např. `Inventura 2026 – sklad A`) a klikněte **💾 Uložit sadu štítků**.
3. Sada se ihned uloží, objeví se v seznamu a hned se **otevře k ověření**.

**Ověření skenerem z obrazovky počítače** (přesně scénář „namířím kameru telefonu na obrazovku laptopu“)
1. Otevřete sadu v prohlížeči na počítači – zobrazí se **mřížka QR kódů**.
2. V telefonu otevřete stejnou adresu, přihlaste se a v záložce *Štítky* danou sadu **otevřete** (nebo si sadu přeneste tlačítkem **⬇️ Export / ⬆️ Import** jako JSON).
3. V telefonu stiskněte **📷 Spustit validaci** a **namiřte kameru na QR kódy na obrazovce počítače**.
4. Každý přečtený kód se okamžitě označí jako **ověřený** ✅, zapíše se **datum a čas** a průběh se aktualizuje (`6 / 18 ověřeno`, 33 %).
   Počítač i telefon ukazují stejný stav, protože jde o stejné uložené sadě (přenos přes Export/Import JSON).

**Co karta otevřené sady umí**

| Prvek | Význam |
|---|---|
| **📷 Spustit validaci** / **⏹️ Vypnout** | zapne/vypne kameru pro skenování kódů z této sady |
| **⬇️ Export sady (JSON)** | uloží sadu (včetně stavu ověření) do souboru pro přenos do telefonu |
| **↩️ Resetovat ověření** | vynuluje všechny kódy sady zpět na „čeká“ |
| **Velké QR (pro skenování z obrazovky)** | zvětší QR kódy, aby se daly pohodlně načíst kamerou telefonu z monitoru |
| **Zobrazit jen neověřené** | skryje už ověřené kódy – při ověřování zbývá jen to, co ještě chybí |
| **Ruční zadání / Bluetooth skener** | ověření bez kamery (např. USB/BT čtečka nebo přepis kódu) |

Seznam uložených sad u každé položky zobrazuje **datum vytvoření, počet kódů, velikost štítku a průběh** (`3 / 18 ověřeno`) a nabízí **▶ Otevřít / ▲ Zavřít**, **⬇️ Export** a **🗑️ Smazat**.

> Sady jsou uložené **odděleně pro každou firmu** a přežijí zavření prohlížeče. V režimu čtení (**host**) lze sady otevřít a prohlížet, ale nelze je vytvářet, ověřovat, resetovat ani mazat.

### Navigace a uchování stavu 🧭

Aplikace si **pamatuje, kde jste skončili**, a to i přes obnovení stránky (F5) nebo zavření prohlížeče:

- **Aktivní záložka** (Seznam / Štítky / Inventura) se ukládá do dat firmy – po přihlášení se vrátíte na stejné místo.
- **Otevřená sada štítků** zůstává otevřená – po reloadu i po přihlášení na jiném zařízení (po obnově ze zálohy) je hned připravená k validaci.
- Každá záložka si při přepnutí **překreslí svůj obsah z aktuálního stavu**, takže čísla, průběh ani mřížka QR nikdy neukazují zastaralá data.

**Sady štítků jsou vidět i v záložce Inventura.** Karta *„Sady štítků“* tam ukazuje právě otevřenou sadu s průběhem (`4 / 18 ověřeno`) a seznam všech uložených sad s tlačítky **▶ Otevřít / ▲ Zavřít**. Tlačítko **Zobrazit QR kódy** přeskočí do záložky Štítky.

**Sken se zapisuje na obě místa.** Když skenujete:

| Kde skenujete | Co se zapíše |
|---|---|
| **Inventura** – kamera nebo ruční zadání | kus se označí jako **nalezený v inventuře** ✅ *a zároveň* se kód **ověří v otevřené sadě** |
| **Štítky** – validace sady | kód se **ověří v sadě** ✅ *a zároveň* se kus označí jako **nalezený v inventuře** |

Obě záložky tak vždy drží **stejný stav** a je jedno, na které z nich skenujete. Pokud byl kus v inventuře už nalezený, sken ho v sadě přesto ověří (jde o dvě různé kontroly) – aplikace to dá najevo hláškou *„v inventuře už bylo nalezeno“*.

**Přenos na mobil (stejný uživatel).** Sady se ukládají do zařízení, takže se mezi počítačem a telefonem přenášejí souborem:
1. Na počítači **⬇️ Záloha JSON** (záložka *Přehled majetku*) – uloží majetek **i** všechny sady včetně stavu ověření.
2. Na mobilu se přihlaste **stejným uživatelem** a v záložce *Inventura* klikněte **⬆️ Obnova ze zálohy (JSON)**.
3. Aplikace obnoví majetek, sady i stav ověření a vrátí vás na stejnou záložku se stejnou otevřenou sadou – můžete rovnou **validovat**.
4. Po validaci **⬇️ Export sady (JSON)** na mobilu a **⬆️ Import sady (JSON)** na počítači – sloučí se stav ověření **a také inventura majetku** (ověřené kusy se v *Seznamu* označí jako ✅ Nalezeno a zapíší se do *Posledních skenů*).

> ⚠️ **Žádná automatická synchronizace neexistuje.** Každé zařízení má vlastní data (v prohlížeči). Co ověříte v telefonu, se v počítači projeví **až po importu** – a naopak. Pro celou inventuru najednou použijte **Zálohu JSON** (obousměrně); pro jednu sadu stačí **Export/Import sady (JSON)**. Opakovaný import stejného souboru nic nezdvojí – je bezpečné ho spustit vícekrát.

## Vzhled – business design 🎨

Aplikace má jednotnou vizuální identitu ve stylu moderního SaaS nástroje pro správu majetku.

**Přihlašovací stránka** je rozdělená na dvě části:
- vlevo tmavý „brand" panel s logem **IQ-Čtečka**, claimem *„Moderní správa majetku s QR skenerem"* a třemi přínosy (import z účetnictví, 2 QR štítky na kus, terénní skenování mobilem),
- vpravo světlá karta **„Vítejte zpět"** s přihlašovacím formulářem (jméno + heslo).
- Na mobilu se obě části poskládají pod sebe.

**Aplikace po přihlášení** používá:
- tmavý horní pruh (topbar) s logem, indikátorem průběhu `7 / 18`, jmenovkou uživatele s barevnou **rolí** (👑 Admin / 🏢 Firma / 👁️ Host) a tlačítkem *Odhlásit*,
- **pilulkové záložky** Seznam · Štítky · Inventura s ikonami a barevným stavem aktivní záložky,
- **progress bar** s gradientem indigo → violet a procentem dokončení,
- **karty** s barevně odlišenými číslovanými kroky (1 Seznam majetku, 2 Tisk štítků, 3 Terénní validace mobilem),
- **stavové štítky** v tabulce (✅ Nalezeno zeleně, ⏳ Čeká jantarově) a **statistiky** ve třech barevných dlaždicích (celkem / nalezeno / zbývá),
- žlutý pruh **„Režim čtení"** pro hosta.

Design je plně **responzivní** (od 320 px) – na úzkém displeji se skládají tlačítka i hlavička, tabulka se posouvá uvnitř karty, přičemž se **stránka nikdy neposouvá vodorovně**. Tiskové styly zůstávají zachované (tisknou se jen QR štítky).

## Čistě webová aplikace (bez instalace) 🌐

IQ-Čtečka je **obyčejná webová stránka** otevřená v prohlížeči. Záměrně nepoužívá:

- ❌ **service worker** – kdo aplikaci dřív otevřel, tomu se stará registrace sama zruší,
- ❌ **`manifest.json`** ani tlačítko *Instalovat* – prohlížeč proto nenabízí „nainstalovat aplikaci“,
- ✅ pouze `index.html` + `styles.css` + `app.js` / `auth.js` / `demo-data.js` + favicon `icon.svg`.

### Proč byl service worker odstraněn

Původní verze měla service worker s **cache-first** strategií. Ten při obyčejném obnovení
stránky (`F5`) vracel **zastaralé `styles.css` a `app.js`** ze své cache – nové HTML se tak
potkalo se starým CSS a **vzhled se rozbil**. Tvrdé obnovení (`Ctrl+F5`) service worker
obchází, a proto vypadalo správně. To je matoucí chování, a proto je offline cache pryč.

### Přejdete-li ze starší (PWA) verze: jednou `Ctrl+F5`

Pokud jste aplikaci už dřív otevřeli ve verzi se service workerem, proveďte **jednou**
tvrdé obnovení: **`Ctrl+F5`** (Windows) / **`Cmd+Shift+R`** (macOS).

Tvrdé obnovení service worker obchází, takže se načte **nové `index.html`**, jehož skript
starý service worker zruší a smaže jeho cache. **Od té chvíle funguje i obyčejné `F5`.**

> **Proč to nejde úplně samo:** dokud je starý service worker aktivní, servíruje
> *staré* `index.html` ze své cache – a to ještě neobsahuje uklízecí skript. Do té doby
> se tedy nový kód na stránku vůbec nedostane; pomůže jen obnovení mimo cache.

### Když se i tak zobrazí stará verze

1. **`Ctrl+F5`** (Windows) nebo **`Cmd+Shift+R`** (macOS) – tvrdé obnovení mimo cache.
2. Zkontrolujte service workery: *DevTools → Application → Service Workers* → **Unregister**
   a *Application → Storage* → **Clear site data**.
3. Načtěte stránku znovu – aplikace si cache i registraci uklidí sama (viz níže).

### Jak probíhá automatické „vyléčení“

Aby se problém neopakoval u zařízení, která už aplikaci mají v cache, dělají se dvě věci:

1. `index.html` po načtení **zruší všechny registrace service workeru** a smaže cache
   aplikace (`iq-ctecka-*`) – viz skript na konci `index.html`. **Toto je hlavní
   a okamžitá cesta** – ověřeno: po načtení nové stránky je registrací `0` a cache `0`.
2. Soubor `sw.js` v repozitáři **zůstává**, ale už jen jako „sebezničující" worker:
   nemá žádný `fetch` handler (tedy nikdy neobsluhuje zastaralé soubory ze cache),
   po aktivaci smaže cache a **zruší sám sebe**.
   Kdyby soubor zmizel (404), prohlížeč by nemohl provést aktualizaci a **nechal by
   běžet starý service worker i s jeho cache** – proto tam schválně je.

> **Zjištěno při testování:** prohlížeč v rámci jednoho dne znovu *nenačítá* skript
> service workeru (použije svoji cache), takže „sebezničující" `sw.js` se sám od sebe
> neprojeví okamžitě – nastoupí až při pozdější kontrole aktualizace. Proto je pro
> přechod důležité to jedno `Ctrl+F5` výše; `sw.js` je jen záchranná síť.
>
> Až si aplikaci jednou otevřou všechna zařízení, která ji měla v cache (a stará
> registrace se tím zruší), je možné soubor `sw.js` zcela odstranit.

## Spuštění

### Varianta A – rychle (PC)
```bash
cd /Users/ullp/git/iq-ctecka
./serve.sh            # nebo: python3 -m http.server 8000
# otevřít http://localhost:8000
```

> **Pozor na port 63342 (zabudovaný server IntelliJ IDEA):** adresa
> `http://localhost:63342/iq-ctecka/index.html?_ijt=…` vrací **404**, pokud projekt
> není v IDE zaregistrovaný pro zabudovaný server. Řešení:
> 1. V projektu klikněte pravým na `index.html` → **Open in Browser** → vyberte prohlížeč
>    (IDE tím server zaregistruje a vygeneruje platnou `_ijt` adresu), nebo
> 2. použijte výše uvedený `./serve.sh` / `python3 -m http.server` na portu 8000.

### Varianta B – mobilní telefon (terén)
- Nasadit obsah složky na libovolný HTTPS hosting (GitHub Pages / Netlify / interní server).
- V mobilu otevřít URL → **Zapnout kameru** → skenovat. (Kamera vyžaduje HTTPS nebo localhost.)
- Aplikace se **neinstaluje** – žádné PWA, žádný service worker. Stačí otevřít adresu v prohlížeči; záložku si můžete na plochu přidat ručně, jde o běžnou webovou stránku.

## Testovací data
Tlačítko **„Načíst ukázková data“** nahraje: stůl ×3, židle ×5, auto ×2, tiskárna ×5 = **15 kusů → 30 štítků**.

Nebo nahrajte vlastní `data/Inventář majetku - List 1.csv` přes **Nahrát CSV**.

## Workflow
```
ÚČETNÍ (PC)                    TERÉN (mobil)
1. Nahrát CSV              →   3. Otevřít stejnou stránku / obnovit zálohu JSON
2. Vygenerovat kódy        →   4. Zapnout kameru, skenovat QR na majetku
3. Vytisknout štítky (2×)  →   5. Export CSV výsledku → předat účetní
   SEZNAM + MAJETEK
```

### Workflow: uložená sada štítků (ověření z obrazovky)
```
POČÍTAČ (prohlížeč)                       TELEFON (kamera)
1. Štítky → název sady → Uložit sadu  →   2. Štítky → otevřít sadu
3. Otevřená sada = mřížka QR kódů     →   4. Spustit validaci
   (Velké QR – pro skenování z obrazovky)     namířit kameru na obrazovku
5. Průběh se plní: 6 / 18 ověřeno     ←   3. Každý kód = ✅ + datum a čas
   (Export sady JSON přenese sadu i stav do telefonu)
```

## Soubory
| Soubor | Účel |
|---|---|
| `index.html` | celá aplikace (přihlášení + 3 záložky) |
| `app.js` | CSV parse, generování kódů, QR, sken, export, **sady štítků (uložení / ověření)**, oprávnění v UI |
| `auth.js` | přihlášení, relace, role (admin / firma / host) a oprávnění |
| `demo-data.js` | demo uživatelé a ukázkový majetek firem (seed dat) |
| `styles.css` | responzivní mobilní design + tiskové styly |
| `icon.svg` | logo aplikace (favicon v titulku prohlížeče) |
| `sw.js` | už jen „sebezničující“ service worker – ruší starou registraci a cache, viz [Čistě webová aplikace](#čistě-webová-aplikace-bez-instalace-) |
| `serve.sh` | rychlý lokální HTTP server (`./serve.sh`) |
| `data/` | zadání + vzorový CSV |

## Poznámky
- QR generování (`qrcode-generator`) i skenování (`html5-qrcode`) se načítají z CDN – prohlížeč si je běžně uloží do mezipaměti. Aplikace **není navržena pro offline režim** (záměrně, viz [Čistě webová aplikace](#čistě-webová-aplikace-bez-instalace-)). Data a výsledky zůstávají v zařízení (`localStorage`).
- **Přihlášení je záměrně klientské demo bez serveru** – účty, role a hesla jsou v `demo-data.js`. Data firem jsou oddělená jen v prohlížeči (`localStorage`), takže jde o simulaci více firem pro ukázku a testování, nikoli o bezpečné oddělení. Pro produkční nasazení nahraďte `auth.js` serverovým ověřením (a datové úložiště serverem/DB).
- Formát kódu: `IQ-0001`, `IQ-0002`, … (prefix nastavitelný). Ukázková data používají prefixy `DMZ`, `ALFA`, `BETA`. Lze zachovat kódy z exportu, pokud jsou vyplněny.
- Tisk: 3 velikosti štítků, volba „jen nenalezené“, tiskne se 2× každý kus.
- Export výsledku: CSV (`kód;název;stav;čas`) pro účetní + JSON záloha pro přenos PC → mobil.
