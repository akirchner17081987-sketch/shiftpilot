# Persönliche Kurznachrichten

Ein gemeinsamer Nachrichtenbereich im Kopf von Verwaltungs- und Mitarbeiterportal. Direkte Textnachrichten mit höchstens 2.000 Zeichen; Gesprächsliste, Personensuche, Verlauf mit Seiten zu 50 Nachrichten und Ungelesen-Zähler. Die erste Version verwendet weder Gruppen noch Anhänge, Push-Nachrichten oder E-Mail-Versand.

## Zugriffe

- Persönliche, aktive Zugänge desselben Unternehmens: Mitarbeiter, Teamleiter/Planer, Administratoren, Inhaber und Lesekonten.
- Gemeinsame Zeiterfassungskonten ohne aktive Mitarbeiterverknüpfung bleiben ausgeschlossen.
- Ein gesperrter Unternehmenszugang hat Vorrang vor einer noch aktiven Mitarbeiterverknüpfung. Gelöschte, deaktivierte und gesperrte Auth-Konten sind ausgeschlossen.
- Nur die beiden Gesprächspartner lesen Inhalte. Es gibt keinen Verwaltungszugriff auf fremde Gespräche. Der Verlauf eines deaktivierten Gesprächspartners bleibt dem aktiven Teilnehmer zugänglich, aber neue Nachrichten an diesen Zugang werden abgelehnt.
- Kontakte enthalten nur Zugang-ID, Anzeigename und Rolle. Keine Personalakten, Personalnummern, Kontaktdaten oder Dienstplandaten werden freigegeben. Bei Verwaltungskonten ohne Mitarbeiternamen wird der hinterlegte Anzeigename bzw. der lokale Teil der Loginadresse verwendet.
- Die Datenbank erzwingt den Absender. Direkte Inserts, Änderungen und Löschungen sind für Clients gesperrt. Der Lesestatus lässt sich nur für eigene empfangene Nachrichten setzen.

## Verhalten

Automatische Aktualisierung bei sichtbarer App: alle 15 Sekunden im offenen Bereich, sonst alle 30 Sekunden für den Zähler; zusätzlich beim Zurückkehren zur App und bei wiederhergestellter Verbindung. Es werden die letzten 100 Gespräche angezeigt, weitere aktive Kontakte bleiben über die Personensuche erreichbar.

Entwürfe liegen ausschließlich im Arbeitsspeicher. Sie bleiben beim Schließen und Wechseln des Gesprächs erhalten; beim Abmelden, Unternehmenswechsel und Neuladen werden sie entfernt. Kein Nachrichteninhalt wird in Local Storage, Audit-Log oder Push-Payload kopiert.

Eine vom Client erzeugte UUID schützt vor doppelten Nachrichten bei unverändertem Wiederholen nach verloren gegangener Antwort. Pro Absender werden höchstens 30 neue Nachrichten je Minute zugelassen. Ausstehende Antworten werden beim Wechsel des Kontos, Unternehmens oder Gesprächs verworfen.

## Veröffentlichung

1. Geprüfte Migration `supabase/migrations/*_internal_messages_v1.sql` auf SchichtFunk anwenden. `database/internal-messages-v1.sql` enthält denselben SQL-Stand zur Prüfung; nur einmal anwenden.
2. Datenbank-Sicherheitsberater ausführen und Lese-/Schreibrechte kontrollieren. Mit authentifiziertem persönlichem Testkonto `messages_contacts`, `messages_inbox` und `messages_unread` prüfen. Keine Nachrichten an reale Nutzer zu Testzwecken versenden.
3. PR in den bestehenden IONOS-Produktionszweig übernehmen und den Build/Upload prüfen.
4. Mit zwei freigegebenen Testkonten den wechselseitigen Empfang auf Verwaltung und Mitarbeiterportal prüfen. Bis zur Migration meldet der Client verständlich, dass der Bereich noch nicht freigeschaltet ist.

## Prüfungen

`npm run test:messages` prüft die echte SQL-Implementierung mit isoliertem PostgreSQL/PGlite und die echte Browserkomponente mit fiktiven Konten auf Desktop, 390px und 360px, in Hell- und Dunkelansicht. Abgedeckt: Mandantentrennung, Zugriffsschutz inklusive Administratoren, Sperrung, Empfängerprüfung, Lesestatus, Seitenumbrüche mit gleichen Zeitstempeln, Wiederholschutz, Begrenzung, XSS, Fehler mit erhaltenem Entwurf, Portalwechsel und veraltete Antworten nach Unternehmenswechsel.
