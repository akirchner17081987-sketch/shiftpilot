# Eigene Globusoberfläche

## Darstellung

SchichtFunk berechnet Ozeane, Vegetationsfarben, gestalterisches Relief, Schnee, Wolken,
Beleuchtung und atmosphärischen Rand mit einem eigenen WebGL-Shader. Dafür werden
keine Satellitenbilder, Bildtexturen, Kartenkacheln oder externen Dienste angefordert.
Das Relief und die Wolken sind dekorativ; sie stellen keine gemessene Topografie,
aktuelles Wetter oder eine Echtzeit-Sonnenposition dar.

Die Landfläche wird mit den bereits enthaltenen gemeinfreien Natural-Earth-Geometrien
beschnitten. Ländergrenzen und Standortpunkte verwenden unverändert dieselbe
orthografische Projektion. Vorhandene Natural-Earth-/OpenStreetMap-Hinweise und die
Lizenzhinweise der bestehenden D3-/TopoJSON-Bibliotheken bleiben bestehen.

## Integration und Betrieb

- Gemeinsamer Renderer `assets/globe-surface-v1.js` für Tagesübersicht, Entry-Globus
  und den bestehenden Login-Zoom. Die Authentifizierung wird nicht geändert.
- Die Tagesübersicht bleibt statisch; Standortauswahl, Standortfenster, Kennzahlen
  und Umschaltung zwischen Region und Globus bleiben erhalten.
- Auf der Entry Page drehen sich Oberfläche und Wolken langsam. Hintergrundtabs,
  reduzierte Bewegung und der vorhandene Animationsschalter pausieren weiterhin.
- Die Renderfläche ist unabhängig von der Bildschirm-Pixeldichte begrenzt.
  Animierte Instanzen reduzieren bei langsamen Frames die Auflösung automatisch.
- Ohne WebGL, bei Shaderfehlern oder Kontextverlust erscheint die bisherige
  Canvas-Darstellung. Beim Entfernen der Ansicht werden GPU-Ressourcen freigegeben.
- Keine zusätzlichen Bilddateien oder Abhängigkeiten; Cachekennungen aktualisiert.

## Prüfung

`npm test`: 1.037 Tests erfolgreich. `npm run test:globe` prüft den tatsächlichen
Shader in Chromium: Kompilierung, Land-/Ozeanfarben an geografisch projizierten
Positionen, transparenter Hintergrund, deterministische statische Ansicht,
Regionalkamera, Freigabe der Ressourcen und fehlendes WebGL. Der Renderer fordert
keine Netzwerkressourcen an. Die Bilder werden als lokale QA-Artefakte erzeugt.

Die vorhandene Site-Loading-Browserprüfung umfasst die wirkliche Anwendungsseite
mit isolierten Konten und Daten, sieben Rollen, Standortfenstern, Standortfiltern,
Region-/Globusumschaltung, Hell/Dunkel und Breiten von 320 bis 1920 Pixeln.
Die Entry-Browserprüfung lädt ebenfalls den neuen Renderer und prüft weiterhin
Mitarbeiter-/Verwaltungsanmeldung, Deutschland-Zoom, fehlende Kartendaten und
reduzierte Bewegung. Keine realen Mitarbeiterdaten oder Produktivanmeldungen.
