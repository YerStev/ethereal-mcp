# Projektauftrag und Entscheidungen

Steven möchte seine KI Testmails in Ethereal prüfen lassen. Es werden ausschließlich künstliche Daten verwendet. Ethereal bleibt bestehen; Mailpit wird nicht eingeführt.

Auftrag vom 19.10.2026: Projekt mit GitHub und eigener persistenter Session aufsetzen. Dieser Auftrag richtet zunächst Repository, Projektkontext und Session ein; keine vollständige Implementierung voraussetzen.

Geplantes MVP: MCP über stdio, Ethereal IMAP/TLS, Nachrichten suchen/auflisten/lesen, begrenzt auf neue passende Mails warten, Links und Codes auslesen. Vor Implementierung aktuelle offizielle MCP- und Bibliotheksdokumentation prüfen. TypeScript/Node.js ist eine vorgesehene, noch nicht festgelegte Option.

Abnahme des späteren MVP: Build/Typprüfung, aussagekräftige Tests für Suche und Timeout sowie lesenden Zugriff; MCP-Handshake und Toolaufrufe prüfen. Live-Test mit temporärem Ethereal-Konto getrennt dokumentieren. Niemals Tests behaupten, die nicht ausgeführt wurden.

GitHub-Ziel: YerStev/ethereal-mcp, zunächst privat. Auf diesem Server ist bislang nur ein repo-spezifischer hushpen-Deploy-Key bekannt; er darf nicht für dieses Projekt umgewidmet werden. Ohne GitHub-Kontozugang kann das Remote-Repository nicht angelegt werden.
