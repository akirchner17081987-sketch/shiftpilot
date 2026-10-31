// Bebilderte Schrittfolgen. Die SVGs zeigen vereinfachte Ansichten der aktuellen Bedienoberfläche.
window.SFHelpGuides = {
  'Wie legt die Verwaltung eine QR-Stempelstation an?': {
    image: 'assets/help/qr-terminal.svg', alt: 'Vereinfachte Ansicht der QR-Stempelstationen mit Anlegen, QR anzeigen und den Ausgaben PNG speichern und Drucken.',
    steps: ['Unter Zeiterfassung die QR-Stempelstationen öffnen, Name und Standort-Hinweis eingeben, bei Bedarf einen Unternehmensstandort auswählen und „Anlegen“ wählen.', 'Beim gewünschten Terminal „QR anzeigen“ öffnen.', 'Den aktuellen Code als PNG speichern oder drucken und am Standort bereitstellen. „QR erneuern“ nur nutzen, wenn der bisherige Ausdruck ungültig werden soll.']
  },
  'Wie erfasst ein Mitarbeiter seine Zeit per QR?': {
    image: 'assets/help/qr-booking.svg', alt: 'Vereinfachte mobile QR-Buchung: Anmeldung, Arbeitszeit beginnen, Pause beginnen, Pause beenden und Arbeitszeit beenden.',
    steps: ['Den aktuellen QR-Code am Standort scannen und mit Personalnummer sowie persönlicher PIN anmelden. Für die Ersteinrichtung einen einmaligen Code bei der Leitung anfordern und „PIN mit Einrichtungscode einrichten“ wählen.', '„Arbeitszeit beginnen“ tippen. Jede Pause mit „Pause beginnen“ starten und mit „Pause beenden“ abschließen.', 'Am Ende „Arbeitszeit beenden“ tippen. Bis zu zehn Pausen werden einzeln dokumentiert.']
  },
  'Wie richte ich einen wiederkehrenden Tagesrhythmus ein?': {
    image: 'assets/help/day-rhythm.svg', alt: 'Vereinfachte feste Schichtregel mit Tagesrhythmus, Starttag, Vorlage 4 Arbeiten, 3 Frei, 3 Arbeiten, 2 Frei und Speichern.',
    steps: ['Mitarbeiter → Profil → „Feste Schichtregel“ öffnen und „Tagesrhythmus (Arbeiten / Frei)“ auswählen.', 'Den Starttag als Tag 1 festlegen und die Vorlage „4 Arbeiten · 3 Frei · 3 Arbeiten · 2 Frei einsetzen“ wählen oder Blöcke selbst hinzufügen.', 'Prüfen, ob die Regel bevorzugt oder verbindlich gelten soll, und „Änderungen speichern“ wählen. Der 12-Tage-Zyklus beginnt danach von vorn.']
  },
  'Was prüfe ich vor dem Veröffentlichen?': {
    image: 'assets/help/publish-plan.svg', alt: 'Vereinfachte Veröffentlichungsprüfung mit Kennzahlen, Prüfergebnis und Freigabeschaltfläche.',
    steps: ['Im Dienstplan den gewünschten Zeitraum wählen und die Veröffentlichung öffnen. Im Dialog kontrollieren, ob die ausgewählte Woche oder der Monat freigegeben wird.', 'In der Veröffentlichungsprüfung offene Positionen, Überschneidungen, Abwesenheitskonflikte und weitere Hinweise prüfen. Bei Bedarf „Zurück zur Planung“ wählen.', 'Erst nach der Prüfung die Veröffentlichung bestätigen. Dann werden die Schichten im Mitarbeiterportal sichtbar.']
  },
  'Wo sehe ich QR-Zeiten und Pausendetails?': {
    image: 'assets/help/qr-report.svg', alt: 'Vereinfachte QR-Auswertung mit Suche, Datumsbereich, Buchungszeile und Details zu einzelnen Pausen.',
    steps: ['Zeiterfassung → „QR-Buchungen ohne Schichtbezug“ öffnen.', 'Monat, Quartal oder Jahr sowie den gewünschten Zeitraum wählen; alternativ „Freier Zeitraum“ für bis zu 366 Tage verwenden. Nach Mitarbeiter oder Personalnummer suchen und bei mehreren Seiten weiterblättern.', 'Bei einer Buchung „Details“ öffnen, um Standort und die einzeln erfassten Pausen zu sehen.']
  }
};



// Aktuelle Arbeitsabläufe: Jeder Schritt beschreibt eine bewusst auszuführende Aktion.
Object.assign(window.SFHelpGuides, {
  'Wie stelle ich alle offenen Dienste gleichzeitig in den Schichtmarkt?': {
    image: 'assets/help/planung-menu-20261031.png', alt: 'Aktuelles Planungsmenü mit Dienstplan und Auto-Planung.', actual: true,
    steps: ['Öffne den Dienstplan oder die Auto-Planung und wähle das gewünschte Unternehmen sowie den Zeitraum.', 'Falls eine Vorplanung vorhanden ist, übernimm sie zuerst als Entwurf oder entferne sie. Prüfe anschließend die offenen Plätze.', 'Wähle „Alle offenen Dienste in den Schichtmarkt“. Prüfe im Bestätigungsfenster Anzahl und Zeitraum; unter „Dienste ansehen“ findest du die einzelnen Dienste.', 'Bestätige das Angebot. Künftig beginnende offene Plätze werden im Schichtmarkt angeboten; der Dienstplan wird dadurch weder veröffentlicht noch besetzt. Anfragen müssen weiterhin freigegeben werden.']
  },
  'Wie übernehme ich einen Entwurf mit offenen Positionen?': {
    image: 'assets/help/planung-menu-20261031.png', alt: 'Aktuelles Planungsmenü mit dem Zugang zur Auto-Planung.', actual: true,
    steps: ['Prüfe die Vorschau der Auto-Planung und die noch offenen Positionen.', 'Wähle „Als Entwurf übernehmen“ und prüfe die Hinweise im Bestätigungsfenster.', 'Setze das Bestätigungshäkchen und gib genau „OFFEN ÜBERNEHMEN“ ein. Bestätige anschließend die Übernahme.', 'Die offenen Stellen und der SOLL-Bedarf bleiben bestehen und können später besetzt werden. Der Dienstplan ist als Entwurf gespeichert und wird erst gesondert veröffentlicht.']
  }
});
