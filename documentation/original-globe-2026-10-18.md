# Eigene Globusoberfläche

## Darstellung

SchichtFunk erzeugt Ozeane, Vegetationsfarben, gestalterisches Relief, Schnee und Wolken
mit dem eigenen Offline-Werkzeug `scripts/generate-globe-surface.cjs`. Die enthaltenen
gemeinfreien Natural-Earth-Geometrien legen die Landfläche fest. Der daraus selbst
erstellte Atlas `assets/earth-surface-original-v2.webp` (4096 × 2048, ca. 512 KiB)
wird einmal vom eigenen Server geladen und gemeinsam wiederverwendet. Satellitenbilder,
fremde Texturen, Kartenkacheln und externe Dienste werden nicht verwendet. Beleuchtung
und atmosphärischer Rand entstehen weiterhin im Renderer.
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
  Ihre Auflösung bleibt während der Animation stabil; es gibt keine laufenden Qualitätswechsel.
  Ein einzelner Renderdurchgang und geglättete Mipmap-/Anisotropie-Filter ersetzen das
  hochfrequente Rauschen und die vorherigen drei Durchgänge. Auch der Kugelrand wird geglättet.
- Ohne WebGL, bei Shaderfehlern oder Kontextverlust erscheint die bisherige
  Canvas-Darstellung. Beim Entfernen der Ansicht werden GPU-Ressourcen freigegeben.
- Ein selbst erzeugter, lokal ausgelieferter Atlas; keine neuen Paketabhängigkeiten.
  Vorladen, Cachekennungen und Bereitschaftsereignisse für die Anmeldeanimation aktualisiert.
  Auch die Ersatzdarstellung enthält keine blinkenden Zufallspunkte mehr.

## Prüfung

`npm test`: 1.037 Tests erfolgreich. `npm run test:globe` prüft den tatsächlichen
Shader in Chromium: Kompilierung, Land-/Ozeanfarben an geografisch projizierten
Positionen, transparenter Hintergrund, deterministische statische Ansicht,
Regionalkamera, Freigabe der Ressourcen und fehlendes WebGL. 13 Bildprüfungen einschließlich
zwölf identischer Frames trotz simulierter langsamer Renderzeit und gemessener Bilddifferenz
bei kleiner Kamerabewegung. Nur ein Download des eigenen Atlas, keine externen Bildquellen.
Die Bilder werden als lokale QA-Artefakte erzeugt.

Die vorhandene Site-Loading-Browserprüfung umfasst die wirkliche Anwendungsseite
mit isolierten Konten und Daten, sieben Rollen, Standortfenstern, Standortfiltern,
Region-/Globusumschaltung, Hell/Dunkel und Breiten von 320 bis 1920 Pixeln.
Die Entry-Browserprüfung lädt ebenfalls den neuen Renderer und prüft weiterhin
Mitarbeiter-/Verwaltungsanmeldung, Deutschland-Zoom, fehlende Kartendaten und
reduzierte Bewegung. Keine realen Mitarbeiterdaten oder Produktivanmeldungen.

## Aufbau-Transformation beim Einstieg (19.10.2026)

Der bestehende Punkt-/Linienglobus bleibt zunächst als bewusste Grundform sichtbar.
Sobald die neue Oberfläche tatsächlich gezeichnet werden kann, werden die beiden
Darstellungen weich überblendet: mindestens 650 ms aktive Grundform, anschließend
1.600 ms Transformation mit sanftem Beginn und Ende. Kugelzentrum, Radius,
Längengrad und Neigung stimmen überein. Die vollständigen Bildebenen werden
gewichtet zusammengesetzt, damit die Kugel während des Übergangs nicht dunkler
wird und auch die bisherige Atmosphäre verschwindet.

Dies verlängert weder Ladeablauf noch Anmeldung; die Transformation darf auch
während der bereits bedienbaren Anmeldung im Hintergrund auslaufen. Unsichtbare
Tabs pausieren. Reduzierte Bewegung und „Animation überspringen“ zeigen die neue
Oberfläche sofort nach deren Verfügbarkeit. Ein abgeschlossener Aufbau wird bei
einem Wechsel der Bewegungseinstellung nicht wiederholt. Ohne Oberflächendatei
oder WebGL bleibt der vorhandene Globus nutzbar.

`node tests/browser/entry-globe-transform-qa.cjs` prüft 19 Bedingungen mit der
tatsächlichen WebGL-Oberfläche: verzögerte Textur, sichtbare Zwischenstufe,
gleichmäßige Bildänderung, finale Oberfläche, reduzierte Bewegung, Überspringen,
fehlende Textur und Ressourcenfreigabe. Die Pixelprüfung berücksichtigt Alpha
über dem tatsächlichen Hintergrund. Der maximale mittlere RGB-Unterschied je
50-ms-Schritt lag lokal bei 1,0798 von 255. Die Prüfung läuft auch vor dem
Produktionsupload; die bestehenden rollenabhängigen Login-Prüfungen bleiben bestehen.
