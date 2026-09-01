# Mitarbeiterportal-End-to-End-Tests

Die Browsertests laufen mit `npm run test:e2e` gegen die in `E2E_BASE_URL` angegebene Umgebung. Ohne Angabe wird die produktive SchichtFunk-Seite verwendet.

Die öffentlichen Tests benötigen keine Zugangsdaten. Für die geschützten Mitarbeiterabläufe werden zwei Umgebungsvariablen erwartet:

- `SF_E2E_EMAIL`: E-Mail-Adresse eines ausschließlich für Tests vorgesehenen Mitarbeiterkontos
- `SF_E2E_PASSWORD`: festes Passwort dieses Testkontos

In GitHub Actions werden diese Werte als gleichnamige Repository-Secrets hinterlegt. Fehlen sie, werden nur die geschützten Tests übersprungen; die öffentlichen Browser- und Regressionstests laufen weiterhin.

Die geschützten Tests lesen und navigieren ausschließlich. Sie senden keine Abwesenheitsanträge, Tauschangebote oder Arbeitszeiten ab.
