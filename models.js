// 3D-Modelle von Sketchfab für die 3D-Strecke: auf der Modellseite „Download 3D Model“ → „glTF Binary (.glb)“ und unter models/<datei> ablegen.
// Fehlt die Datei oder lädt sie nicht, fährt weiter das aus der Silhouette extrudierte Auto. Das Modell wird auf die Länge des Silhouetten-Autos skaliert.
// rot: Drehung um die Hochachse in Grad, falls das Auto quer oder rückwärts fährt (0 / 90 / 180 / -90; ohne Angabe: längste Seite = Fahrtrichtung, Front nach +X).
// paint: RegExp auf Material- oder Objektnamen, die die gewählte Lackfarbe bekommen (ohne Angabe bleibt die Originallackierung).
// Räder mit Namen wie wheel/tire/tyre/rim drehen und lenken mit, sonst bleiben sie stehen.
const CAR_MODELS = {
  supra: {file: 'models/supra.glb', title: 'Toyota Supra (A80) 1993', author: 'Lexyc16', license: 'CC BY-NC 4.0',
          url: 'https://sketchfab.com/3d-models/toyota-supra-a80-1993-dd897d7823784bc5893c183c1328e8cb'},
  gt3r:  {file: 'models/gt3r.glb', title: '2024 Porsche 992 GT3 R', author: 'Dave Love SketchFab', license: 'CC BY 4.0',
          url: 'https://sketchfab.com/3d-models/2024-porsche-992-gt3-r-b76c9b2ae2d548c3869426eac4ab8a19'},
  r8lms: {file: 'models/r8lms.glb', title: '2019 Audi R8 LMS GT3', author: 'Ddiaz Design', license: 'CC BY-NC-SA 4.0',
          url: 'https://sketchfab.com/3d-models/2019-audi-r8-lms-gt3-026a2639ecce4f0ea23f0264bd5cc243'},
};
