# Projektauftrag und Entscheidungen

Steven möchte seine KI Testmails in Ethereal prüfen lassen. Es werden ausschließlich künstliche Daten verwendet. Ethereal bleibt bestehen; Mailpit wird nicht eingeführt.

Auftrag vom 19.10.2026: Projekt mit GitHub und eigener persistenter Session aufsetzen. Dieser Auftrag richtet zunächst Repository, Projektkontext und Session ein; keine vollständige Implementierung voraussetzen.

Geplantes MVP: MCP über stdio, Ethereal IMAP/TLS, Nachrichten suchen/auflisten/lesen, begrenzt auf neue passende Mails warten, Links und Codes auslesen. Vor Implementierung aktuelle offizielle MCP- und Bibliotheksdokumentation prüfen. TypeScript/Node.js ist eine vorgesehene, noch nicht festgelegte Option.

Abnahme des späteren MVP: Build/Typprüfung, aussagekräftige Tests für Suche und Timeout sowie lesenden Zugriff; MCP-Handshake und Toolaufrufe prüfen. Live-Test mit temporärem Ethereal-Konto getrennt dokumentieren. Niemals Tests behaupten, die nicht ausgeführt wurden.

GitHub eingerichtet am 19.10.2026: YerStev/ethereal-mcp, privat. Eigener repo-spezifischer Server-Deploy-Key mit Schreibrecht; privater Schlüssel ausschließlich auf dem Server. hushpen-Schlüssel bleibt unverändert. Erster Push und unabhängiger Rücklesevergleich sind Bestandteil der Einrichtung; Nachweise in der Serverdokumentation. MCP-Implementierung bleibt ein eigener Folgeauftrag.

## MVP-Auftrag und Umsetzung am 19.10.2026

Folgeauftrag: „Implementieren und testen“. TypeScript/Node.js umgesetzt mit
offiziellem MCP-SDK, ImapFlow und MailParser. Vorab offizielle Dokumentation geprüft:
[MCP stdio und Tools](https://ts.sdk.modelcontextprotocol.io/server),
[ImapFlow API](https://imapflow.com/docs/api/imapflow-client/),
[MailParser](https://nodemailer.com/extras/mailparser).

Drei Tools für Suche, Lesen und begrenztes Warten; nur INBOX, Ethereal TLS,
read-only-Lock und BODY.PEEK. Zugangsdaten ausschließlich im Prozessumfeld.
Keine Server-Rohlogs, kein Versand, keine automatischen Linkaufrufe.
Build, Typprüfung und lokale Tests einschließlich MCP-Handshake und tatsächlicher
IMAP-Befehle sind Teil der Prüfung. Kein Ethereal-Live-Test durchgeführt;
temporäres Testkonto und Live-Abnahme bleiben offen. Kein Push, Merge oder Release
im Implementierungsauftrag.

## Anwenderinstallation und automatisches Konto am 21.10.2026

Auftrag: aus Anwendersicht installieren/testen, Konto-API untersuchen, passenden
konfigurationsarmen Start umsetzen, aufräumen und bei Erfolg pushen.

Ethereal unterstützt `POST https://api.nodemailer.com/user` ohne API-Key für
normale Testkonten. Automatisches Konto beim ersten Toolaufruf; geschützte lokale
Datei außerhalb des Repositorys, Wiederverwendung auch nach Neustart. Explizite
Umgebungsvariablen bleiben möglich. `get_account_info` und CLI `--setup` liefern
Konfigurationsdaten ohne Passwort. Die Anwendung verwendet denselben SMTP-Zugang;
externer Mailempfang ist standardmäßig deaktiviert. Keine Versandfunktion im MCP.

Prüfungen: 13 lokale Tests bestanden; isolierte Installation des npm-Tarballs und
Handshake über den installierten CLI-Befehl geprüft. Ethereal-Live-Test bestanden:
API-Kontoanlage, SMTP mit ausschließlich künstlichen Daten, stdio-Tools,
Suche/Lesen/Warten/Timeout sowie unveränderte Flags vor/nach Lesen. Lokale
Live-Zugangsdaten entfernt; keine Geheimnisse oder Mailinhalte eingecheckt.
