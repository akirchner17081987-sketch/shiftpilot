# Produktionsfreigabe Mitarbeiterportal – 01.09.2026

## Freigabestatus

- Status: produktiv freigegeben
- Produktionsadresse: https://shiftpilot-two.vercel.app/
- Vercel-Projekt: `shiftpilot`
- Aktives Deployment: `dpl_GBstKr5PaoBcbpXwr67L11APwZnQ`
- Aktives Deployment-Artefakt: https://shiftpilot-4417cn1n4-secure-match.vercel.app
- Vercel-Status bei Freigabe: `READY`
- Fehlerprotokoll bei Freigabe: keine Einträge

## Abnahme

- Mitarbeiter- und Manager-Testkonto gemeinsam geprüft.
- Rollenabgrenzung und gemeinsame Vorgänge geprüft.
- Statische Regressionstests bestanden.
- Öffentliche End-to-End-Tests auf Desktop und Mobil bestanden.
- Abhängigkeitsprüfung ohne bekannte Schwachstellen.
- Sicherheitsheader auf der Produktionsadresse geprüft.

## Akzeptierte Restrisiken

Die folgenden Punkte wurden auf ausdrücklichen Wunsch für diese Freigabe übersprungen:

1. Supabase-Schutz vor kompromittierten Passwörtern; im aktuellen Free-Tarif nicht verfügbar.
2. Weitere Härtung der fünf von Supabase gemeldeten `SECURITY DEFINER`-Funktionen.
3. Hinterlegung der Testkonto-Secrets für die acht geschützten automatisierten End-to-End-Tests.

Die geschützten Portalabläufe wurden stattdessen in der gemeinsamen Abnahme mit Mitarbeiter- und Manager-Testkonto manuell geprüft.

## Rückfallziel

- Vorheriges stabiles Deployment: `dpl_6ShoquoGBvoH2D5fD35wpLMfJLW1`
- Deployment-Artefakt: https://shiftpilot-kgvb5i548-secure-match.vercel.app
- Status bei Dokumentation: `READY`

Das Rückfallziel liegt vor der Einführung der neuen HTTP-Sicherheitsheader. Es soll deshalb nur verwendet werden, wenn die aktuelle Produktion einen schwerwiegenden Betriebsfehler verursacht.

## Rückfall ausführen

Vom verknüpften Projektverzeichnis aus:

```powershell
npx vercel promote https://shiftpilot-kgvb5i548-secure-match.vercel.app --yes
npx vercel inspect shiftpilot-two.vercel.app
```

Danach unmittelbar prüfen:

1. `https://shiftpilot-two.vercel.app/` liefert HTTP 200.
2. Anmeldung mit Manager-Testkonto funktioniert.
3. Anmeldung mit Mitarbeiter-Testkonto funktioniert.
4. Mitarbeiterportal zeigt ausschließlich persönliche Daten.
5. Managerportal und Schicht-Marktplatz laden ohne Fehlermeldung.

## Rückfall zurücknehmen

Wenn das Problem behoben oder als Fehlalarm bewertet wurde, kann die freigegebene Version wieder aktiviert werden:

```powershell
npx vercel promote https://shiftpilot-4417cn1n4-secure-match.vercel.app --yes
npx vercel inspect shiftpilot-two.vercel.app
```

## Datenbankhinweis

Diese Veröffentlichung enthält keine neue Datenbankmigration. Das dokumentierte Vercel-Rückfallverfahren schaltet ausschließlich das Frontend-Artefakt um und verändert keine Supabase-Daten. Bei späteren Veröffentlichungen mit Datenbankänderungen muss vorab ein gesonderter, migrationsbezogener Rückfallplan erstellt werden.
