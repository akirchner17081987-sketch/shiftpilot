# CSP-Härtung vom 17.10.2026

Die HTTP-CSP für IONOS und Vercel erlaubt JavaScript ausschließlich vom eigenen Ursprung: `script-src 'self'; script-src-attr 'none'`. Weder `unsafe-inline`, `unsafe-eval`, `unsafe-hashes` noch eine CDN-Freigabe gelten für Skripte. `base-uri 'none'` verhindert eine eingeschleuste Basis-URL. Die vorhandenen Grenzen für Objekte, Frames, Formulare und Supabase-Verbindungen bleiben bestehen. Dynamische Inline-Stile sind weiterhin erforderlich und über `style-src` erlaubt; diese Änderung betrifft die JavaScript-Ausführung.

## Auslieferung

Produktion muss das Ergebnis von `npm run build` aus **dist/** verwenden. IONOS und Vercel sind entsprechend konfiguriert. Der Build lagert 13 ausführbare Inline-Skripte aus den Quellseiten in lokale Dateien mit Inhalts-Hash im Namen aus. Reihenfolge, Script-Typ und vorhandene IDs bleiben erhalten; die relativen QR-Modulimporte werden angepasst. Preloads vermeiden eine zusätzliche Download-Warteschlange. Rohes `index.html` aus dem Repository ist kein Ersatz für das Produktionsartefakt.

159 HTML-Ereignisattribute wurden durch Datenattribute ersetzt. `assets/csp-actions-v1.js` enthält 97 feste JavaScript-Callbacks. Es interpretiert keine JavaScript-Zeichenketten und verwendet kein eval/Function. Parameter werden als Daten übergeben und beim Einsetzen in HTML percentkodiert. Die Ereignisart ist Teil des festen Schlüssels; ein Klick-Callback wird nicht als Fokus-Callback akzeptiert. Echte Target-Listener erhalten das native Event, `this` und `currentTarget`; `return false`, Weitergabe und eine spätere prozedurale `.onclick`-Zuweisung werden berücksichtigt.

Kalender-Zuordnungen und die Lesemodus-Sperre verwenden explizite Datenattribute anstelle des Auslesens von JavaScript aus `onclick`. Auch die nach einem Demo-Login eingefügte Boot-Markierung ist eine externe Datei. Der Build verweigert neue Ereignisattribute in Seiten und erzeugenden Anwendungsmodulen. Neue Bedienaktionen vorzugsweise direkt mit Funktions-Listenern implementieren.

Die bisherigen Client-Versionen von Supabase, SheetJS, jsPDF, AutoTable und jsQR liegen unter `assets/vendor/`. Ihre npm-Tarballs wurden vor Entnahme der benötigten Dateien gegen die SHA-512-Integrität des npm-Manifests geprüft. `client-libraries.json` dokumentiert Versionen, Herkunft, Dateiprüfsummen und Lizenzdateien. Die vorhandenen Versionen wurden beibehalten; diese Arbeit ersetzt keine gesonderte Prüfung auf Abhängigkeits-Updates. Der Supabase-Browser-Bundle erhält lediglich einen lokalen ESM-Export von `createClient`.

PWA: neuer Cache-Namensraum, Netzwerkvorrang für CSP-/Vendor-/generierte Seitenskripte und neue Versionsparameter für statisch/dynamisch geladene Anwendungsmodule verhindern eine Mischung mit alten Inline-Handler-Versionen. Bestehende Token, Konten und Datenbankrechte werden nicht geändert.

## Validierung

- 899 lokale Regressionstests bestanden, einschließlich vier neuer Prüfgruppen für identische Header, vollständige Auslagerung, lokale Bibliotheken samt Lizenzen und Parameter-/Zuordnungsgrenzen.
- 25 Prüfungen im echten Chromium mit den gebauten Seiten und tatsächlichen HTTP-CSP-Headern bestanden: zunächst Report-Only und anschließend verbindlich für abgemeldet sowie sieben Rollen; echte lokale Supabase-SDK-/Anmeldeoberfläche auf Desktop und Mobil; native Ereignisbehandlung und Abbruch-/Weitergabegrenzen; QR-PIN-Anmeldung und Einrichtung; Demo-Login mit document.write und vollständigem Boot; echte XLSX-Rückleseprüfung, PDF-Erzeugung und Decodierung eines erzeugten QR-Codes.
- Browser-Negativprüfung: neu eingefügte Inline-Skripte, onerror-Attribute und ein fremdes CDN-Skript werden vom Browser blockiert. Text in einem Aktionsparameter wird nicht als JavaScript ausgeführt.
- Fünf IONOS-Prüfungen und Build bestanden.
- Die bestehende vollständige Seiten-/Rollenprüfung mit echten Modulen und fiktiver Anmelde-/Datenquelle bestand ebenfalls. Keine produktiven Netzwerkanfragen oder Datenschreibvorgänge in diesen Oberflächenprüfungen.

Diese Nachweise stammen aus isolierten Umgebungen mit fiktiven Daten. Sie sind kein vollständiger Penetrationstest und keine erneute echte Benutzeranmeldung. Nach Veröffentlichung müssen der ausgelieferte Header, die gebauten Seiten und die neuen lokalen Skriptpfade auf der tatsächlichen Domain geprüft werden. Der produktive Nachweis gehört in den begleitenden Sicherheitsbericht, nicht als vorweggenommene Erfolgsaussage in diesen Quellstand.

## Betrieb und Rücknahme

Änderungen an Seiten oder Modulen erneut durch `npm run build`, `npm test` und `npm run test:csp:browser` prüfen. Bei Bibliotheksänderungen Version, Herkunft, Integrität und Lizenznachweise zusammen aktualisieren; das Produktions-Build lädt keine Pakete aus einem CDN nach.

Bei einem bestätigten Auslieferungsfehler das vorherige vollständige Release einschließlich Headern und Assets zurücknehmen. Einzelne alte Module mit der neuen strengen CSP zu mischen ist keine geeignete Rücknahme. Eine Rücknahme der CSP stellt vorübergehend den alten, schwächeren Skriptschutz wieder her und muss als solche dokumentiert werden.

Grundlagen: [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [MDN script-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src-attr).
