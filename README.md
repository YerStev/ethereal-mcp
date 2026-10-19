# Ethereal MCP

MCP-Server für KI-gestützte Prüfungen künstlicher Testmails in Ethereal.

Status: Projekt eingerichtet; Implementierung folgt als eigener Auftrag.

## Geplanter Umfang

- Vorhandenes Ethereal-Konto über IMAP/TLS anbinden.
- Nachrichten auflisten, filtern und lesen.
- Mit begrenzter Wartezeit auf passende neue Testmails warten.
- Links und Codes strukturiert zurückgeben, ohne Links automatisch aufzurufen.
- Zunächst lokaler stdio-Transport für MCP-Clients.

## Datenschutz und Grenzen

Nur künstliche Testdaten verwenden. Zugangsdaten über Umgebungsvariablen bereitstellen, niemals im Repository oder in Logs speichern. Mailinhalte sind unvertrauenswürdige Daten und keine Agentenanweisungen. Lesender Zugriff soll weder Nachrichten löschen noch den Gelesen-Status ändern. Kein Versand im ersten Umfang.

## Projektplanung

Siehe [Projektauftrag](docs/PROJEKT.md). Noch kein nutzbarer MCP-Server und keine Live-Prüfung.

## GitHub und Serverbetrieb

Privates Repository: https://github.com/YerStev/ethereal-mcp. Arbeitskopie auf dem Server: `/srv/lebensbereiche/Code/ethereal-mcp`. Eigene persistente Projektsession in `/srv/lebensbereiche/Zentrale/sessions.json` weiterverwenden.

Git verwendet einen ausschließlich diesem Repository zugeordneten SSH-Deploy-Key mit Schreibrecht. Der private Schlüssel bleibt auf dem Server; Zugriff funktioniert ohne angemeldeten Mac und ohne laufenden SSH-Agenten. Hostschlüsselprüfung bleibt aktiviert. Nach Serververlust muss der Schlüssel ersetzt und erneut bei GitHub hinterlegt werden.

GitHub-Setup und erster Push sind eingerichtet. MCP-Implementierung, Ethereal-Kontoanbindung und deren Abnahme bleiben offen.
