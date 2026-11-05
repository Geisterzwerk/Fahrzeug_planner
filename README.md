# 🚙 Fahrzeug-Planner

Persönliche iPhone-App (PWA) zur Fahrzeugplanung im WK: Fahrzeuge, Buchungen, Schnellfahrten, Schlüssel, Züge und Kontakte.

- Läuft im Browser und auf dem iPhone als App auf dem Home-Bildschirm
- **Offline-fähig**, alle Daten bleiben **lokal auf dem Gerät** (keine Cloud, kein Server)
- Reines HTML/CSS/JavaScript: **nichts zu installieren, kein pip, kein npm, kein Build**

---

## 1. Projektstruktur

```
fahrzeug-planner/
├── index.html              Grundgerüst + Tab-Leiste
├── manifest.webmanifest    App-Name, Icon, Farben (für iPhone-Homescreen)
├── sw.js                   Service Worker → Offline-Funktion (VERSION erhöhen bei Änderungen!)
├── css/style.css           Design
├── icons/                  App-Icons
└── js/
    ├── app.js              Start, Navigation, Erinnerungen
    ├── store.js            Datenspeicher (localStorage) + Backup
    ├── logic.js            Planungslogik: Verfügbarkeit, Konflikte, Status, Schlüssel
    ├── pages.js            Seiten: Planner (Tag/Woche), Fahrzeuge, Schlüssel, Züge, Kontakte, Einstellungen
    ├── sheets.js           Formulare: Buchung, Fahrzeugsuche, Schnellfahrt, Fahrzeug, Kontakt, Zug
    ├── ui.js               UI-Helfer (Sheets, Toast, Chips)
    └── demo.js             Beispieldaten zum Testen
```

## 2. In VS Code testen

Die App muss über einen kleinen lokalen Webserver laufen (Doppelklick auf `index.html` funktioniert wegen der JS-Module nicht).

**Variante A – Live Server (empfohlen)**
1. Ordner in VS Code öffnen → Erweiterung **Live Server** (Ritwick Dey) installieren
2. Rechtsklick auf `index.html` → **Open with Live Server**
3. Seite lädt bei jedem Speichern automatisch neu

**Variante B – Python (schon eingebaut, kein pip nötig)**
```bash
python -m http.server 8000
```
→ Browser: <http://localhost:8000>

**iPhone-Ansicht am PC:** Edge/Chrome → `F12` → `Strg+Shift+M` → „iPhone 14“.

**Zum Ausprobieren:** ⚙️ (oben rechts) → **Demo-Daten laden**.

## 3. Auf GitHub hochladen

Auf github.com zuerst ein leeres Repository `fahrzeug-planner` erstellen (ohne README). Dann im Projektordner:
```bash
git init
git add .
git commit -m "Fahrzeug-Planner v1.0"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/fahrzeug-planner.git
git push -u origin main
```

Zuhause weiterarbeiten:
```bash
git clone https://github.com/DEIN-NAME/fahrzeug-planner.git   # einmalig
git pull                                                       # danach immer zuerst
git add . && git commit -m "Was geändert" && git push          # nach der Arbeit
```

> ⚠️ **Keine echten Daten committen.** Echte Fahrzeuge/Kontakte liegen nur im Browser-Speicher. Backup-Dateien (`*backup*.json`) sind per `.gitignore` ausgeschlossen.

## 4. Aufs iPhone bringen (GitHub Pages)

1. GitHub → Repository → **Settings → Pages**
2. Source: **Deploy from a branch** → `main` / `/ (root)` → Save
3. Nach ca. 1 Minute: `https://DEIN-NAME.github.io/fahrzeug-planner/`
4. Auf dem iPhone in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**
5. Einmal mit Internet öffnen → danach funktioniert die App auch **offline**

> GitHub Pages ist gratis mit einem **öffentlichen** Repository. Das ist ok, weil nur Code und keine Daten im Repo liegen.

### Updates aufs iPhone
1. Code ändern
2. In `sw.js` die `VERSION` erhöhen (z. B. `fp-v1.0.1`)
3. `git push` → App auf dem iPhone 1–2× schliessen und öffnen

## 5. Wichtig zu wissen

| Thema | Hinweis |
|---|---|
| **Daten** | Liegen nur auf dem jeweiligen Gerät. PC und iPhone haben getrennte Daten. |
| **Backup** | ⚙️ → Backup exportieren (JSON) → in „Dateien“ sichern. Vor dem WK und regelmässig! |
| **Benachrichtigungen** | iPhone: nur als Home-Bildschirm-App (iOS 16.4+) und in ⚙️ erlauben. Im Hintergrund nicht zuverlässig. |
| **Sichere Erinnerung** | Buchung öffnen → **📅 In iPhone-Kalender** → Termin mit Alarm im iOS-Kalender. |
| **Anrufen** | Telefonnummern sind antippbar. |

## 6. Funktionen (v1.0)

- **Planner:** Dashboard, Schlüssel- und Überfällig-Warnungen, Kalender Tag/Woche, Engpass-Hinweis
- **Buchung:** Datum, Zeit, Personen, Ziel, Besteller (+ Telefon), Fahrer, Priorität, Erinnerung, Notiz, Anhänger, Status
- **Fahrzeugsuche:** verfügbar / nicht verfügbar **mit Grund**, „Verschieben“, „Übersteuern“ (Zug), „frei ab …“
- **Verschieben:** Buchung gedrückt halten und ziehen (15-Min-Raster) oder bearbeiten; Konflikte werden gewarnt
- **Schnellfahrt:** sofort / bedingt / nicht verfügbar, erwartete Rückkehr, „Für 15:30 buchen“
- **Schlüssel:** bei mir / ausgegeben / beim Zug / unklar, Überfällig mit Anruf, „Schlüssel zurück“ beendet die Fahrt
- **Fahrzeuge:** Typ, M-Nummer, Sitzplätze, technischer Status, Anhänger-Zuordnung, Zug, Historie
- **Züge:** Fahrzeuge zuteilen, gültig bis
- **Kontakte:** dynamische Liste, Nummer nachtragen, letzte Buchungen
- **Einstellungen:** Backup/Import, Standard-Erinnerungen, Überfällig-Zeit, Kalenderzeiten, Demo-Daten

## 7. Ideen für später

- Mehrere Fahrzeuge in einer Buchung
- QR-Code am Fahrzeug scannen
- Tagesplan als PDF teilen
- Synchronisation PC ↔ iPhone
