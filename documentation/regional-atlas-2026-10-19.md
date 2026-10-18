# Regionale Standortkarte

Die Regionalansicht der Tagesübersicht ist eine eigenständige, lokal ausgelieferte
Atlas-Karte. Sie verwendet eine Mercator-Projektion statt einer stark vergrößerten
Globusoberfläche. Die bestehenden Standortkoordinaten, Berechtigungen, Auswahl,
Standortfenster und Kategorien bleiben bestehen. Der Button „Globus ansehen“
wechselt weiterhin zum bisherigen eigenen Globus.

## Darstellung

- Eigene Blau-, Salbei- und Steintöne, ruhige Reliefschattierung, keine zufälligen
  Punkte oder wechselnde Renderauflösung.
- Geografische Länderflächen, Flussläufe, Seen und ausgewählte Städtenamen.
- Die Reliefschattierung stammt aus tatsächlicher Landschaftsgeometrie; die
  Farbgestaltung ist dekorativ und keine Karte exakter Höhen oder Vegetation.
- Automatische Größenanpassung anhand der Standorte und der tatsächlich
  gemessenen Höhe von Titel und Filter. Standortmarkierungen und Geografie
  verwenden dieselbe Projektion.
- Ortsbeschriftungen berücksichtigen Standortbuttons und Kartenpunkte, damit
  diese bedienbar und lesbar bleiben.
- Die Karte ruht zwischen Änderungen; beim Ansichtswechsel gibt es eine kurze
  Überblendung. Reduzierte Bewegung und abgeschaltete Animation werden beachtet.
- Ohne Relief-/Detaildaten bleibt eine geografische Basiskarte verfügbar. Auch
  Standorte außerhalb des detaillierten Mitteleuropa-Ausschnitts erhalten die
  bestehende weltweite Ländergrundlage.

## Daten und Nutzung

Alle neu verwendeten geografischen Daten sind Natural-Earth-Daten. Die
[Nutzungsbedingungen](https://www.naturalearthdata.com/about/terms-of-use/)
bezeichnen die Raster- und Vektordaten als Public Domain und erlauben Bearbeitung
und kommerzielle Nutzung ohne verpflichtende Namensnennung. Es werden keine
externen Kartenkacheln, Kartendienste oder kostenpflichtigen APIs aufgerufen.
Die bestehenden ISC-Lizenzhinweise der D3-/TopoJSON-Bibliothek und die vorhandene
Attribution der Standortkoordinaten bleiben erhalten.

Quelldatensätze:

- Natural Earth 1:50m Admin 0 Countries, Geometrie und Länderkennung.
- Natural Earth 1:10m Rivers + Lake Centerlines und Lakes, Geometrie/Name/Rang.
- Natural Earth 1:10m Populated Places Simple, Ortsname/Position/Rang;
  keine übernommenen Bevölkerungsdaten im ausgelieferten Datensatz.
- Natural Earth 1:50m Shaded Relief Basic, Version 3.2.0, eigenes Recoloring
  und Mercator-Ausschnitt mit Grenzen −10°/40°/32°/61°.

`scripts/generate-region-atlas.py` dokumentiert die Download-URLs, schneidet und
vereinfacht die Vektoren, entfernt nicht benötigte Attribute und erzeugt die
lokalen Assets. Autorenvoraussetzungen: Python, Pillow, numpy und shapely;
keine neuen Laufzeitabhängigkeiten für Schichtfunk. Der Generator gibt die
SHA-256-Summen der Originaldateien aus. Originaldateien werden nur im expliziten
temporären Cache gespeichert, nicht im öffentlichen Repository.

## Prüfung

Die Browserprüfung der echten Seite lädt den Atlas vollständig, prüft ruhige
Canvas-Pixel, Wechsel zum Globus und zurück, sechs Standortpositionen und deren
vorhandene Dialogfunktionen. Screenshots werden bei 320, 390, 1440 und 1920 Pixeln
sowie in heller und dunkler Oberfläche geprüft. Die Tests verwenden synthetische
Anmeldung und Testdaten und verändern keine produktiven Mitarbeiterdaten.
