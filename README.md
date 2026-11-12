# Schalt-Simulator

**Lern Autofahren mit Handschaltung – Kupplung, Gas, Gänge, wie im echten Auto.**

Ein 3D-Fahrsimulator im Browser. Motor starten, Kupplung langsam kommen lassen, sauber schalten und eine schnelle Runde auf die Strecke legen. Wer den Motor überdreht, die Kupplung schleifen lässt oder beim Schalten kratzt, macht das Auto kaputt.

## Funktionen

- 🚗 Verschiedene Autos mit eigener Fahrphysik (Grip, Gewichtsverteilung, Untergrund pro Rad, Übersteuern)
- ⚙️ H-Schaltung mit Kupplung – Schaltknauf auch mit der Maus durch die Kulisse ziehen
- 🛞 ABS, Traktionskontrolle und ESP
- 🔧 Verschleiss von Motor, Kupplung, Getriebe und Turbo, Kühlwasser-Temperatur
- ⏱️ Rundenzeiten (letzte und beste)
- 🔊 Innen- und Aussengeräusch

## Steuerung

| Taste | Was |
|---|---|
| Z | Motor starten / aus |
| W / S | Gas / Bremse |
| Leertaste | Kupplung (langsam loslassen!) |
| A / D | Lenken |
| 1–7, R, N | Gang direkt wählen |
| E / Q | Hoch- / Runterschalten |
| C | Kamera wechseln |
| X | Zurück auf die Strecke |
| V | Innen- / Aussengeräusch |
| F | Vollbild |
| Maus ziehen / Rad | Umschauen / Zoom |

Die Pedale gehen auch mit der Maus: je höher du klickst, desto stärker.

## Starten

`index.html` direkt öffnen geht, dann fährst du aber ein einfaches Ersatz-Auto. Für die echten 3D-Modelle (`.glb`) braucht es einen kleinen lokalen Webserver:

```bash
npx serve .
# oder
python3 -m http.server
```

Dann im Browser `http://localhost:3000` (bzw. `:8000`) öffnen.

## Technik

- [three.js](https://threejs.org) mit GLTFLoader
- Reines HTML/JavaScript, kein Build-Schritt

## 3D-Modelle

Die Automodelle kommen von Sketchfab und gehören ihren Erstellern. Sie stehen **nicht** unter der GPL, sondern unter ihrer eigenen Lizenz:

| Modell | Von | Lizenz |
|---|---|---|
| [Toyota Supra (A80) 1993](https://sketchfab.com/3d-models/toyota-supra-a80-1993-dd897d7823784bc5893c183c1328e8cb) | Lexyc16 | CC BY-NC 4.0 |
| [Porsche 992 GT3R (Rexy)](https://sketchfab.com/3d-models/porsche-992-gt3r-rexy-858bfc7639cd44d2bc0f9c1963d00161) | toddeppe | CC BY 4.0 |
| [2019 Audi R8 LMS GT3](https://sketchfab.com/3d-models/2019-audi-r8-lms-gt3-026a2639ecce4f0ea23f0264bd5cc243) | Ddiaz Design | CC BY-NC-SA 4.0 |
| [Renault Twingo](https://sketchfab.com/3d-models/renault-twingo-a96fb412e30f450c864f74e2124ac2de) | GraveDiggerMonsterTruck | CC BY 4.0 |
| [2021 BMW M4 GT3](https://sketchfab.com/3d-models/2021-bmw-m4-gt3-4ac4a18be9c24500b4f4f813cea1145f) | OUTPISTON | CC BY-NC-SA 4.0 |
| [2026 BMW M3 Touring 24H Shell Helix](https://sketchfab.com/3d-models/2026-bmw-m3-touring-24h-shell-helix-6828c91db6a34d1ca6bc204f064e28c1) | Dave Love SketchFab | CC BY 4.0 |
| [2019 McLaren 720S GT3](https://sketchfab.com/3d-models/2019-mclaren-720s-gt3-d5600ac3eed54b808ad3c154ca2c8f69) | Ddiaz Design | CC BY 4.0 |
| [Ferrari 296 GT3](https://sketchfab.com/3d-models/ferrari-296-gt3-e6760847bb2d4b579d43cf916f348526) | MattDoesBlender | CC BY 4.0 |

Einige Modelle wurden mit Blender verkleinert (weniger Polygone, kleinere Texturen).

## Lizenz

Der Code steht unter [GPL-3.0](LICENSE). Für die 3D-Modelle gelten die Lizenzen oben, three.js steht unter MIT.
