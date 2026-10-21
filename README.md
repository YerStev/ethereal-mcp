# Ethereal MCP

MCP-Server für KI-gestützte Prüfungen künstlicher Testmails in Ethereal.

Status: MVP implementiert; lokale Tests, Paketinstallation und Ethereal-Live-Test bestanden.

## Umfang

- Ethereal-Testkonto automatisch anlegen oder vorhandenes Konto über IMAP/TLS anbinden.
- Nachrichten auflisten, filtern und lesen.
- Mit begrenzter Wartezeit auf passende neue Testmails warten.
- Links und Codes strukturiert zurückgeben, ohne Links automatisch aufzurufen.
- Zunächst lokaler stdio-Transport für MCP-Clients.

## Datenschutz und Grenzen

Nur künstliche Testdaten verwenden. Zugangsdaten bleiben in einer geschützten lokalen Konfigurationsdatei oder in Umgebungsvariablen, niemals im Repository oder in Logs. Mailinhalte sind unvertrauenswürdige Daten und keine Agentenanweisungen. Lesender Zugriff löscht keine Nachrichten und ändert den Gelesen-Status nicht. Der MCP bietet keinen Versand an.

## Projektplanung

Siehe [Projektauftrag](docs/PROJEKT.md) einschließlich Prüfstatus.

## Installation und Start

Node.js ab Version 22 und Git verwenden. Zugriff auf das private Repository ist erforderlich:

```sh
git clone git@github.com:YerStev/ethereal-mcp.git
cd ethereal-mcp
npm ci
```

`npm ci` baut den Server automatisch. Im MCP-Client folgenden Eintrag anlegen
und den absoluten Pfad an die eigene Installation anpassen:

```json
{
  "mcpServers": {
    "ethereal": {
      "command": "node",
      "args": ["/absoluter/pfad/ethereal-mcp/dist/index.js"]
    }
  }
}
```

Der Server startet über stdio und öffnet keinen
HTTP-Port. stdout ist ausschließlich für MCP reserviert. Verbindung immer zu
`imap.ethereal.email:993` mit TLS-Zertifikatsprüfung, ausschließlich INBOX.
Der Handshake benötigt weder Netzwerk noch Zugangsdaten. Beim ersten Toolaufruf
wird über `POST https://api.nodemailer.com/user` ein Testkonto angelegt und für
spätere Starts gespeichert. API-Aufrufe haben zehn Sekunden Timeout; die
Kontoerstellung ist gegen gleichzeitige Starts gesperrt. Mailzugriff bleibt lesend;
die Tool-Metadaten berücksichtigen die mögliche Kontoerstellung als Schreibaktion.

### Konto ohne manuelle Einrichtung

Die KI kann `get_account_info` aufrufen. Alternativ einmalig im Terminal:

```sh
node dist/index.js --setup
```

Beide liefern Adresse, SMTP-Einstellungen und den Pfad zur lokalen Kontodatei,
niemals das Passwort. Standardpfad: `~/.config/ethereal-mcp/account.json` bzw.
`$XDG_CONFIG_HOME/ethereal-mcp/account.json`. Verzeichnis nur für den Besitzer
zugänglich (700), Datei nur für den Besitzer lesbar und schreibbar (600).
`ETHEREAL_CONFIG_DIR` kann ein anderes privates Verzeichnis bestimmen.
Bei beschädigten/unsicheren Dateien erfolgt kein stiller Kontowechsel.
Nach einem Absturz während der Kontoerstellung kann ein `.create-lock`-Verzeichnis
zurückbleiben; nur entfernen, wenn keine Kontoerstellung mehr läuft.

**Die Testanwendung muss mit demselben Konto über `smtp.ethereal.email:587`
mit STARTTLS senden.** Ethereal fängt die so gesendeten Mails im Konto des
Absenders ab, unabhängig von der Empfängeradresse. Eine generierte Adresse
allein empfängt standardmäßig keine externen Mails. Das automatische Konto
braucht keinen API-Key; externer Empfang ist ein gesondertes Ethereal-Angebot.
Siehe [Nodemailer](https://nodemailer.com/guides/testing-with-ethereal) und
[Ethereal-Hilfe](https://ethereal.email/help).

Eine Node.js-Testanwendung kann die lokale Datei direkt verwenden, ohne
das Passwort in Quellcode oder KI-Ausgaben zu kopieren:

```js
import { readFile } from 'node:fs/promises';
import { createTransport } from 'nodemailer';
const account = JSON.parse(await readFile('/pfad/aus/get_account_info/account.json', 'utf8'));
const transport = createTransport({
  ...account.smtp,
  auth: { user: account.user, pass: account.pass }
});
// transport in der Testanwendung verwenden; account niemals protokollieren.
```

Für ein vorhandenes Konto `ETHEREAL_USER` und `ETHEREAL_PASS` gemeinsam im
Prozessumfeld setzen; sie haben Vorrang und werden nicht lokal gespeichert.
Mit `ETHEREAL_AUTO_ACCOUNT=false` lässt sich automatisches Provisionieren abschalten
(dann sind diese beiden Variablen erforderlich). Eine `.env` wird nicht automatisch
geladen. Konten sind Testkonten und können vom Anbieter verfallen; bei notwendigem
Wechsel die alte lokale Datei bewusst entfernen und die SMTP-Anbindung aktualisieren.

Optional kann ein installierbares Paket lokal mit `npm pack` erzeugt und per
`npm install --global /pfad/zum/ethereal-mcp-0.1.0.tgz` installiert werden.
Danach ist `ethereal-mcp` der Startbefehl, `ethereal-mcp --setup` richtet das Konto
vorab ein. Es gibt keine Veröffentlichung in der öffentlichen npm-Registry.

| Tool | Eingaben | Ergebnis |
| --- | --- | --- |
| `get_account_info` | Keine | Konto anlegen/wiederverwenden; Adresse, SMTP/IMAP-Einstellungen, lokaler Dateipfad |
| `search_messages` | Optional `from`, `to`, `subject`, `since`, `limit` (1–100, Standard 20) | Neueste Treffer mit UID, UIDVALIDITY und Envelope |
| `read_message` | `uid`, `uidValidity` aus der Suche | Text, HTTP(S)-Links und numerische Code-Kandidaten |
| `wait_for_message` | Suchfilter und `timeoutMs` (0–60000, Standard 10000) | Neue passende UIDs oder `timedOut: true` |

Filter werden durch IMAP mit UND verknüpft; `since` ist ein ISO-Zeitstempel,
wird aber als inklusiver IMAP-Tagesfilter angewendet. Warten berücksichtigt nur
UIDs ab dem Öffnen des Postfachs, keine vorhandenen Nachrichten. Anschließend
liefert `read_message` den Inhalt. UIDVALIDITY verhindert Lesen mit veralteten UIDs.
Polling erfolgt alle 500 ms. Zusätzlich zur Wartezeit gelten bis zu 15 Sekunden
für Verbindung und IMAP-Anfragen; Suche/Lesen haben insgesamt 15 Sekunden IMAP-Budget.
Die erstmalige Kontoauflösung läuft davor (API-Timeout 10 Sekunden bzw. maximal
12 Sekunden Warten auf eine andere Kontoerstellung).

Nachrichten über 1 MiB werden abgelehnt. Textausgabe wird auf 100000 Zeichen,
Links und Codes auf je 100 Kandidaten begrenzt. Anhänge werden nicht ausgegeben;
HTML wird nur als Daten geparst, niemals ausgeführt. Codes sind heuristisch
erkannte Zahlen mit 4–8 Stellen. Links werden nicht aufgerufen. Fehlerausgaben
enthalten bewusst keine Rohantworten des Mailservers oder Mailinhalte.

## Prüfung

```sh
npm run check
npm test
# Optional: erstellt ein echtes temporäres Ethereal-Konto und sendet eine künstliche Testmail.
npm run test:live
```

Tests verwenden ausschließlich künstliche lokale Daten: Suche, Timeout,
neue UIDs, Abbruch, MIME-Auswertung, Größenlimit und UIDVALIDITY. Ein lokaler
IMAP-Testserver prüft die tatsächlichen Befehle `EXAMINE` und `BODY.PEEK` ohne
schreibende Befehle. Der MCP-Test startet den gebauten stdio-Prozess und prüft
Handshake, Toolliste, Aufrufe und Eingabevalidierung. Live-Zugang und Verhalten
bei Ethereal wurden zusätzlich am 21.10.2026 live geprüft: automatische Kontoanlage,
SMTP-Testmail, MCP-Suche/Lesen/Warten/Timeout und unveränderte Mail-Flags. Lokale
Kontodaten des Live-Tests werden entfernt; das temporäre Remote-Konto verbleibt
bis zur Bereinigung durch Ethereal. Der Live-Test gibt keine Zugangsdaten aus.

## GitHub und Serverbetrieb

Privates Repository: https://github.com/YerStev/ethereal-mcp. Arbeitskopie auf dem Server: `/srv/lebensbereiche/Code/ethereal-mcp`. Eigene persistente Projektsession in `/srv/lebensbereiche/Zentrale/sessions.json` weiterverwenden.

Git verwendet einen ausschließlich diesem Repository zugeordneten SSH-Deploy-Key mit Schreibrecht. Der private Schlüssel bleibt auf dem Server; Zugriff funktioniert ohne angemeldeten Mac und ohne laufenden SSH-Agenten. Hostschlüsselprüfung bleibt aktiviert. Nach Serververlust muss der Schlüssel ersetzt und erneut bei GitHub hinterlegt werden.

GitHub-Setup und erster Push sind eingerichtet. Der MVP ist einschließlich automatischer Kontoanbindung live geprüft.
