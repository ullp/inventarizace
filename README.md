# IQ-Čtečka – Inventura majetku 📱🏷️

Mobilní **HTML live stránka** pro inventuru majetku – bez nutnosti instalovat nativní aplikaci. Funguje v terénu **pouze s mobilním telefonem** a po prvním načtení i **offline**.

## Jak to odpovídá zadání

1. **Účetní má seznam majetku** → záložka **Seznam**: nahraje CSV export (`data/Inventář majetku - List 1.csv`).
2. **2 štítky pro každou položku** → záložka **Štítky**: pro každý **kus** (počet se rozpadne: židle ×5 → 5 unikátních kódů) se generují **2 identické QR štítky se stejným kódem**:
   - `SEZNAM` – do papírového seznamu účetní
   - `MAJETEK` – nalepit na fyzický majetek
3. **Validace v terénu mobilem** → záložka **Inventura**: kamera skenuje QR na majetku (nebo v seznamu), položka se okamžitě spáruje ✅ + čas.
4. **Párování štítků** → sken kteréhokoliv ze 2 štítků označí daný kus jako nalezený. Duplicitní / neznámé kódy hlásí zvukem a hláškou.
5. **HTML live stránka, ne nativní app** → jeden `index.html`, installovatelný jako PWA (Add to Homescreen), data v `localStorage`.

## Spuštění

### Varianta A – rychle (PC)
```bash
cd /Users/ullp/git/iq-ctecka
python3 -m http.server 8000
# otevřít http://localhost:8000
```

### Varianta B – mobilní telefon (terén)
- Nasadit obsah složky na libovolný HTTPS hosting (GitHub Pages / Netlify / interní server).
- V mobilu otevřít URL → **Zapnout kameru** → skenovat. (Kamera vyžaduje HTTPS nebo localhost.)
- Pro offline: jednou načíst, pak funguje bez internetu (service worker). Lze i „Přidat na plochu“.

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

## Soubory
| Soubor | Účel |
|---|---|
| `index.html` | celá aplikace (3 záložky) |
| `app.js` | CSV parse, generování kódů, QR, sken, export |
| `styles.css` | responzivní mobilní design + tiskové styly |
| `sw.js`, `manifest.json`, `icon.svg` | PWA / offline |
| `data/` | zadání + vzorový CSV |

## Poznámky
- QR generování (`qrcode-generator`) i skenování (`html5-qrcode`) přes CDN – při prvním načtení nutný internet, poté vše offline (kódy i data).
- Formát kódu: `IQ-0001`, `IQ-0002`, … (prefix nastavitelný). Lze zachovat kódy z exportu, pokud jsou vyplněny.
- Tisk: 3 velikosti štítků, volba „jen nenalezené“, tiskne se 2× každý kus.
- Export výsledku: CSV (`kód;název;stav;čas`) pro účetní + JSON záloha pro přenos PC → mobil.
