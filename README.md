# Raumaufmaß

App für iPhone und iPad. Mit ihr zeichnest du Grundrisse und berechnest Bodenflächen und Sockelleisten. Das Ergebnis exportierst du als PDF.

## Aufbau

1. **Projekte**: Du legst ein Projekt mit Namen, Kunde und Adresse an.
2. **Hauptfenster des Projekts**: Jeder Raum erscheint als kleine Zeichnung mit Wandmaßen, m² und laufenden Metern Sockelleiste. Ganz unten stehen Gesamtfläche, Sockelleiste gesamt und die Anzahl der Räume. Darunter folgt der Materialbedarf mit Verschnitt.
3. **Raum**: Hier skizzierst und misst du. Mit „Fertig“ oder „‹ Übersicht“ geht es zurück zum Hauptfenster.

## Funktionen

- **Diagonalen als Kontrollmaße**, z. B. für Spanndecken:
  - Die App berechnet für jeden Raum alle Diagonalen von Ecke zu Ecke.
  - Gemessene Diagonalen trägst du daneben ein. Die Zeichnung wird angeglichen.
  - Für jede Diagonale zeigt die App „✓ passt“ oder die Abweichung in cm.
  - Der Knopf ⤡ im Plan blendet alle Diagonalen ein.
  - Im PDF erscheinen die Diagonalen im Plan und als Tabelle.
- **Räume anlegen** als Rechteck, L-Form oder Trapez. Ein **schiefes Viereck** legst du aus 4 Wandlängen und einer Diagonale an, ohne Winkel zu messen. Du kannst einen Raum auch **frei zeichnen**, mit beliebig vielen Ecken.
- **Schiefe Räume:**
  - Für jede Wand trägst du Länge und Innenwinkel ein.
  - Ecken kannst du frei verschieben. Der Fang richtet sie am 5-cm-Raster und an anderen Ecken aus.
  - Über ⊕ fügst du in einer Wand eine neue Ecke ein.
- **Mit dem Laser aufmessen** (Tab „📏 Messen“):
  1. Du skizzierst den Raum grob mit dem Finger. Die Maße müssen dabei nicht stimmen.
  2. Du gehst Wand für Wand vor: Laserwert eintragen, Enter drücken, die App springt zur nächsten Wand.
  3. Die App bringt die Skizze automatisch auf die echten Maße. Fläche und Sockelleiste werden sofort neu berechnet.
  - Ecken, die fast 90° haben, werden als 90° angenommen.
  - Bei schiefen Räumen misst du zusätzlich eine Diagonale von Ecke zu Ecke, damit die Form exakt stimmt.
  - Messwerte gibst du in m (4,235), cm (423,5 oder „423,5 cm“) oder mm („4235 mm“) ein.
  - Passen die Werte nicht zusammen, warnt die App.
  - Laser mit Tastatur-Modus wie viele Leica DISTO können den Wert direkt ins Feld schreiben.
- **Türen:**
  - Im Werkzeug „Tür“ tippst du auf eine Wand. Die Tür lässt sich dann entlang der Wand verschieben.
  - Die Breite der Türöffnung wird von der Sockelleiste **abgezogen**.
  - Optional zählt die Leiste in der Laibung mit (+ 2 × Tiefe).
  - Optional zählt der Boden im Türdurchgang zur Fläche.
- **Abzüge und Zuschläge:** Säulen und Schächte werden abgezogen, Nischen und Erker hinzugerechnet. Auf Wunsch zählen auch ihre Sockelleisten mit.
- **Ergebnis:** Für jeden Raum und für alle Räume zusammen:
  - Bodenfläche netto in m²
  - Umfang
  - Sockelleiste in laufenden Metern
  - Materialbedarf inklusive Verschnitt in %
  - Anzahl der Leisten (z. B. à 2,40 m)
- **PDF-Export:**
  - Ein Deckblatt mit Projektdaten, Zusammenfassung und Materialbedarf.
  - Für jeden Raum eine Seite mit Grundriss im Maßstab, Wandmaßen, Türen und dem Rechenweg.
  - Auf dem iPhone öffnet sich danach das Teilen-Menü. Dort wählst du „In Dateien sichern“, AirDrop oder Mail.
- **Mehrere Projekte:** Projekte werden automatisch auf dem Gerät gespeichert. Du kannst sie als Datei exportieren und wieder importieren. Mit ↶ machst du den letzten Schritt rückgängig.

## Auf das iPhone bringen

### Weg A: Web-App (ohne Computer, kostenlos)
1. In GitHub: **Settings → Pages → Source: „GitHub Actions“** einstellen.
2. Unter **Actions → „Web-App veröffentlichen“ → Run workflow** den Workflow starten.
3. Die angezeigte Adresse auf dem iPhone in **Safari** öffnen.
4. **Teilen → „Zum Home-Bildschirm“** wählen.

Danach startet die App wie eine normale App vom Home-Bildschirm. Sie funktioniert auch offline.

### Weg B: Echte iOS-App (.ipa)
Bei jedem Push baut GitHub Actions die App auf einem Mac. Das macht der Workflow `iOS-App bauen`. Die Datei `Raumaufmass-unsigned.ipa` findest du dann unter **Actions → letzter Lauf → Artifacts**.

Die Datei ist **unsigniert**. Apple erlaubt die Installation nur nach dem Signieren, und dafür gibt es zwei Wege:
- **Mit kostenloser Apple-ID:** Du nutzt [Sideloadly](https://sideloadly.io) oder AltStore auf Mac oder Windows. Diese Programme signieren und installieren die App. Die Signatur musst du alle 7 Tage erneuern.
- **Mit Apple-Developer-Konto (99 €/Jahr):** Du öffnest `ios/App/App.xcodeproj` in Xcode, wählst dein Team aus und installierst über TestFlight oder direkt.

## Entwicklung

```bash
npm install
npm run vendor      # jsPDF nach www/vendor kopieren
npx cap sync ios    # Web-App ins iOS-Projekt kopieren
npx cap open ios    # in Xcode öffnen (nur auf dem Mac)
```

Die Web-App liegt in `www/`. Sie besteht aus reinem HTML, CSS und JavaScript und braucht keinen Build-Schritt. Zum Testen startest du einen lokalen Server, z. B. `python3 -m http.server -d www`.
