// 3D-Modelle von Sketchfab für die 3D-Strecke: auf der Modellseite „Download 3D Model“ → „glTF Binary (.glb)“ und unter models/<datei> ablegen.
// Fehlt die Datei oder lädt sie nicht, fährt weiter das aus der Silhouette extrudierte Auto. Das Modell wird auf die Länge des Silhouetten-Autos skaliert.
// rot: Drehung um die Hochachse in Grad, falls das Auto quer oder rückwärts fährt (0 / 90 / 180 / -90; ohne Angabe: längste Seite = Fahrtrichtung, Front nach +X).
// paint: RegExp auf Material- oder Objektnamen, die die gewählte Lackfarbe bekommen (ohne Angabe bleibt die Originallackierung).
// cockpit: 'sim' für Modelle ohne Innenraum oder mit undurchsichtigen Scheiben – die Cockpit-Kamera zeigt dann das einfache eigene Cockpit.
// sat: Farbsättigung verstärken (1 = original, 1.5 = deutlich kräftiger), für blasse Lackierungen.
// opaque: true, wenn Karosserie oder Innenraum Löcher haben bzw. durchscheinen (Sketchfab exportiert manchmal einen sinnlosen Alphakanal).
// Räder mit Namen wie wheel/tire/tyre/rim drehen und lenken mit, sonst bleiben sie stehen.
const CAR_MODELS = {
  supra: {file: 'models/supra.glb', title: 'Toyota Supra (A80) 1993', author: 'Lexyc16', license: 'CC BY-NC 4.0',
          url: 'https://sketchfab.com/3d-models/toyota-supra-a80-1993-dd897d7823784bc5893c183c1328e8cb'},
  // „Rexy“-Lackierung statt Grello; mit Blender verkleinert (nur Innenraum dezimiert 0.15, Texturen 1024 px WebP), 41 → 15 MB
  gt3r:  {file: 'models/gt3r.glb', opaque: true, title: 'Porsche 992 GT3R (Rexy)', author: 'toddeppe', license: 'CC BY 4.0',
          url: 'https://sketchfab.com/3d-models/porsche-992-gt3r-rexy-858bfc7639cd44d2bc0f9c1963d00161'},
  r8lms: {file: 'models/r8lms.glb', title: '2019 Audi R8 LMS GT3', author: 'Ddiaz Design', license: 'CC BY-NC-SA 4.0',
          url: 'https://sketchfab.com/3d-models/2019-audi-r8-lms-gt3-026a2639ecce4f0ea23f0264bd5cc243'},
  twingo: {file: 'models/twingo.glb', rot: -90, cockpit: 'sim', paint: '^object_1[57]$', title: 'Renault Twingo', author: 'GraveDiggerMonsterTruck', license: 'CC BY 4.0',
           url: 'https://sketchfab.com/3d-models/renault-twingo-a96fb412e30f450c864f74e2124ac2de'},
  m4gt3: {file: 'models/m4gt3.glb', sat: 1.5, title: '2021 BMW M4 GT3', author: 'OUTPISTON', license: 'CC BY-NC-SA 4.0',
          url: 'https://sketchfab.com/3d-models/2021-bmw-m4-gt3-4ac4a18be9c24500b4f4f813cea1145f'},
  // Rennversion statt Strassen-M3; mit Blender verkleinert (Decimate 0.4, Texturen 1024 px WebP), 40 → 22 MB
  m3comp: {file: 'models/m3comp.glb', title: '2026 BMW M3 Touring 24H Shell Helix', author: 'Dave Love SketchFab', license: 'CC BY 4.0',
           url: 'https://sketchfab.com/3d-models/2026-bmw-m3-touring-24h-shell-helix-6828c91db6a34d1ca6bc204f064e28c1'},
  mcl720: {file: 'models/mcl720.glb', title: '2019 McLaren 720S GT3', author: 'Ddiaz Design', license: 'CC BY 4.0',
           url: 'https://sketchfab.com/3d-models/2019-mclaren-720s-gt3-d5600ac3eed54b808ad3c154ca2c8f69'},
  // mit Blender verkleinert (Decimate 0.5, Texturen 1024 px WebP), 40 → 17 MB
  f296:  {file: 'models/f296.glb', rot: 53, title: 'Ferrari 296 GT3', author: 'MattDoesBlender', license: 'CC BY 4.0',
          url: 'https://sketchfab.com/3d-models/ferrari-296-gt3-e6760847bb2d4b579d43cf916f348526'},
};
