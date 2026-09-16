# SchichtFunk – Schlüsselrotations-Drill Datenschutz-Worker

Stand: 16.09.2026  
Status: technischer Drill mit ausschließlich fiktiven Testwerten; **kein Produktivgeheimnis geändert**

## Zweck

Der Datenschutz-Worker wird über den Header `x-privacy-worker-token` authentifiziert. Für einen späteren Schlüsselwechsel muss verhindert werden, dass zwischen Edge-Function-Deployment und Aktualisierung des aufrufenden Schedulers ein unnötiges Ausfallfenster entsteht.

Dafür wurde ein begrenztes Zwei-Slot-Verfahren vorbereitet:

- `PRIVACY_WORKER_TOKEN` = aktuell gültiger Token;
- `PRIVACY_WORKER_TOKEN_PREVIOUS` = ausschließlich während eines geplanten Rotationsfensters vorübergehend gültiger Vorgängertoken.

Die Prüfung verwendet keine echten Schlüssel und schreibt keine Produktivdaten.

## Technische Umsetzung

Die gemeinsame Authentifizierungslogik liegt in `supabase/functions/_shared/worker-auth.mjs`. `privacy-worker/index.ts` akzeptiert einen Request nur, wenn der gelieferte Token mit dem aktuellen Token oder – falls ausdrücklich konfiguriert – mit dem temporären Vorgängertoken übereinstimmt.

Ohne gesetzten aktuellen Token bleibt der Worker fail-closed. Ein leerer oder falscher Token wird abgelehnt. Tokenmaterial wird nicht in Workerantworten oder Konsolenlogs ausgegeben.

## Drill-Szenario

Der automatisierte Test `tests/privacy-worker-token-rotation.test.mjs` bildet mit fiktiven Werten folgende Reihenfolge ab:

1. **Vor Rotation:** nur `OLD` ist aktuell; `OLD` wird akzeptiert, `NEW` abgelehnt.
2. **Überlappungsphase:** `NEW` wird aktuell und `OLD` kommt vorübergehend in den Previous-Slot; beide werden akzeptiert.
3. **Fehlversuch:** ein dritter, falscher Token sowie ein leerer Token werden abgelehnt.
4. **Abschluss:** Previous-Slot wird entfernt; `OLD` wird sofort abgelehnt, `NEW` bleibt gültig.
5. **Quellcodeprüfung:** Worker nutzt die gemeinsame Prüffunktion und enthält keinen Konsolen-Logpfad für Tokenwerte.

Damit ist die sichere Cutover-Logik reproduzierbar getestet, ohne ein Produktivgeheimnis rotieren zu müssen.

## Verbindliche Reihenfolge für eine echte spätere Rotation

1. neuen hochentropischen Token außerhalb von Git und Tickets erzeugen;
2. alten Token temporär als `PRIVACY_WORKER_TOKEN_PREVIOUS` und neuen als `PRIVACY_WORKER_TOKEN` hinterlegen;
3. Worker deployen und einen authentifizierten Health-/Leerlaufaufruf mit dem neuen Token prüfen;
4. Scheduler/Vault-Aufrufer auf den neuen Token umstellen;
5. mindestens einen erfolgreichen Scheduler-Aufruf mit dem neuen Token nachweisen;
6. `PRIVACY_WORKER_TOKEN_PREVIOUS` unverzüglich entfernen;
7. kontrolliert nachweisen, dass der alte Token mit HTTP 401 abgelehnt wird und der neue weiterhin funktioniert;
8. Zeitpunkt, Verantwortliche, betroffene Secret-Namen und Prüfergebnis dokumentieren – niemals die Secretwerte selbst.

## Rückfallweg

Falls der neue Token im Rotationsfenster nicht funktioniert, darf der Aufrufer kurzfristig auf den alten Token zurückgestellt werden, solange dieser ausschließlich im temporären Previous-Slot vorhanden ist. Nach Ursachenbehebung wird der Wechsel erneut durchgeführt. Der Previous-Slot ist kein dauerhafter Zweitschlüssel und muss nach erfolgreichem Cutover entfernt werden.

## Abgrenzung

Dieser Drill belegt die **technische Rotierbarkeit und den Fehler-/Rückfallpfad**. Er ist keine Behauptung, dass am 16.09.2026 ein Produktivtoken gewechselt wurde. Eine echte Rotation des aktiven Privacy-Worker-Tokens erfolgt nur geplant und mit anschließendem Scheduler-Nachweis; sie ist nicht erforderlich, um die Produktionsdaten für diesen Drill zu berühren.

Status: 🟢 **TECHNISCHE SCHLÜSSELROTATION MIT FIKTIVEN TESTTOKENS UND RÜCKFALLPFAD IMPLEMENTIERT UND AUTOMATISIERT ABGESICHERT; PRODUKTIVSECRET UNVERÄNDERT.**
