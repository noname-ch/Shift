// 3D-Rennstrecke (Three.js): Rundkurs mit Leitplanken, Bäumen und Tribüne. Das Auto wird aus der Seitensilhouette (CARS[].path) extrudiert.
// Die Längsdynamik kommt weiter aus physStep (S.v); hier nur Lenkung, Position, Grip-Grenze, Leitplanken, Rundenzeit und Kamera.
'use strict';
const W3 = (() => {
  const T = typeof THREE !== 'undefined' ? THREE : null;
  if (!T) return null;
  T.ColorManagement.legacyMode = false;
  const SC = .0185, HW = 6, WALL = HW + 10, GRAV = 9.81;
  // Kontrollpunkte des Rundkurses (x, z in m); Start/Ziel bei [0,0] auf der langen Geraden
  const CTRL = [[0,0],[300,0],[500,0],[640,30],[700,130],[660,240],[540,280],[420,260],[320,320],[300,440],[380,540],[520,580],[620,680],[580,800],[420,840],[200,800],[0,700],[-120,560],[-60,420],[-160,300],[-340,280],[-460,180],[-440,60],[-300,0]];
  const CAMS = ['chase', 'cockpit', 'bumper'], CAM_NAMES = {chase:'Verfolger', cockpit:'Cockpit', bumper:'Stossstange'};
  let R, scene, cam, sun, wrap, N = 0, STEP = 3, PX, PZ, RX, RZ, CURV, started = false;
  const st = {x:0, z:0, h:0, i:-1, lat:0, off:false, latA:0, acc:0, lastV:0, camH:0, shake:0, steer:0, touch:0};
  const lap = {t:0, run:false, start:0, cp:0, valid:true, last:null, best:null, prev:-1, n:0};
  const car3 = {key:'', g:null, body:null, upper:null, cockpit:null, wheels:[], tail:null, flames:[], eye:new T.Vector3(), bumper:new T.Vector3(), info:null, sw:null};
  let rng = 1;
  const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };
  const hud = {};

  // ---------------- Hilfen ----------------
  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy());
    if (rep) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }
  function noise(g, w, h, f) {
    const im = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const [r, gg, b] = f(Math.random(), i % w, i / w | 0); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }
  // SVG-Pfad (nur M/L/Q/Z) in Punkte mit y nach oben
  function pathPts(d) {
    const tok = d.match(/[MLQZ]|-?\d*\.?\d+/g), pts = [];
    let i = 0, cmd = 'M', cx = 0, cy = 0;
    while (i < tok.length) {
      if (/[MLQZ]/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z') continue; }
      if (cmd === 'Q') {
        const qx = +tok[i], qy = +tok[i + 1], x = +tok[i + 2], y = +tok[i + 3]; i += 4;
        for (let k = 1; k <= 8; k++) { const u = k / 8, a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u; pts.push([a * cx + b * qx + c * x, -(a * cy + b * qy + c * y)]); }
        cx = x; cy = y;
      } else { cx = +tok[i]; cy = +tok[i + 1]; i += 2; pts.push([cx, -cy]); }
    }
    return pts;
  }
  // Polygon an einer waagrechten Linie abschneiden (Sutherland-Hodgman)
  function clipY(poly, yc, below) {
    const out = [], ins = p => below ? p[1] <= yc : p[1] >= yc;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = ins(a), ib = ins(b);
      if (ia) out.push(a);
      if (ia !== ib) { const t = (yc - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), yc]); }
    }
    return out;
  }
  // vorderste (f>0) bzw. hinterste x-Koordinate des Umrisses auf Höhe y
  function xAt(poly, y, f) {
    let best = null;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const x = a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
        if (best === null || (f > 0 ? x > best : x < best)) best = x;
      }
    }
    return best;
  }
  function box(w, h, d, mat, x, y, z, parent) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
  function beam(a, b, th, mat, parent) {
    const d = new T.Vector3().subVectors(b, a), m = new T.Mesh(new T.BoxGeometry(th, d.length(), th), mat);
    m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); parent.add(m); return m;
  }
  // Seitenflächen einer Extrusion neu gruppieren: 0 = Seitendeckel (Textur), 1 = Lack, 2 = Glas, 3 = dunkel
  function regroup(g, classify) {
    const P = g.attributes.position.array, Nn = g.attributes.normal.array, U = g.attributes.uv.array, bk = [[], [], [], []];
    for (const grp of g.groups) for (let t = grp.start; t < grp.start + grp.count; t += 3) {
      bk[grp.materialIndex === 0 ? 0 : classify(Nn[t * 3 + 1], Nn[t * 3 + 2], (P[t * 3] + P[t * 3 + 3] + P[t * 3 + 6]) / 3)].push(t);
    }
    const n = g.attributes.position.count, p = new Float32Array(n * 3), no = new Float32Array(n * 3), uv = new Float32Array(n * 2), out = new T.BufferGeometry();
    let o = 0;
    bk.forEach((list, m) => {
      const s = o;
      for (const t of list) for (let k = 0; k < 3; k++, o++) { p.set(P.subarray((t + k) * 3, (t + k) * 3 + 3), o * 3); no.set(Nn.subarray((t + k) * 3, (t + k) * 3 + 3), o * 3); uv.set(U.subarray((t + k) * 2, (t + k) * 2 + 2), o * 2); }
      if (o > s) out.addGroup(s, o - s, m);
    });
    out.setAttribute('position', new T.BufferAttribute(p, 3)); out.setAttribute('normal', new T.BufferAttribute(no, 3)); out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.dispose(); return out;
  }
  function extrude(poly, width, bt, bs) {
    const g = new T.ExtrudeGeometry(new T.Shape(poly.map(p => new T.Vector2(p[0], p[1]))), {depth: width - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 1});
    g.translate(0, 0, -(width - 2 * bt) / 2); return g;
  }

  // ---------------- Strecke ----------------
  function buildTrack() {
    const curve = new T.CatmullRomCurve3(CTRL.map(([x, z]) => new T.Vector3(x, 0, z)), true, 'centripetal');
    const len = curve.getLength(); N = Math.round(len / 3); STEP = len / N;
    const pts = curve.getSpacedPoints(N); pts.pop();
    PX = new Float32Array(N); PZ = new Float32Array(N); RX = new Float32Array(N); RZ = new Float32Array(N); CURV = new Float32Array(N);
    for (let i = 0; i < N; i++) { PX[i] = pts[i].x; PZ[i] = pts[i].z; }
    const tx = new Float32Array(N), tz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N, dx = PX[b] - PX[a], dz = PZ[b] - PZ[a], l = Math.hypot(dx, dz);
      tx[i] = dx / l; tz[i] = dz / l; RX[i] = -tz[i]; RZ[i] = tx[i];
    }
    for (let i = 0; i < N; i++) {
      const a = (i + N - 3) % N, b = (i + 3) % N;
      CURV[i] = Math.atan2(tx[a] * tz[b] - tz[a] * tx[b], tx[a] * tx[b] + tz[a] * tz[b]) / (6 * STEP);
    }
    // Strassenband (u quer, v entlang)
    const ribbon = (l0, l1, y0, y1, vScale) => {
      const pos = [], uv = [], idx = [];
      for (let k = 0; k <= N; k++) {
        const i = k % N;
        pos.push(PX[i] + RX[i] * l0, y0, PZ[i] + RZ[i] * l0, PX[i] + RX[i] * l1, y1, PZ[i] + RZ[i] * l1);
        uv.push(0, k * STEP / vScale, 1, k * STEP / vScale);
        if (k < N) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const asphalt = canvasTex(256, 512, (g, w, h) => {
      noise(g, w, h, (r, x) => { const v = 56 + r * 20 + (Math.abs(x / w - .5) < .12 ? -6 : 0) | 0; return [v, v + 1, v + 4]; });
      g.fillStyle = '#e9e6df'; g.fillRect(w * .012, 0, w * .022, h); g.fillRect(w * .966, 0, w * .022, h);
    }, true);
    asphalt.wrapS = T.ClampToEdgeWrapping;
    const road = new T.Mesh(ribbon(-HW, HW, .03, .03, 12), new T.MeshStandardMaterial({map: asphalt, roughness: .92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2}));
    road.receiveShadow = true; scene.add(road);
    // Randsteine rot/weiss in Kurven
    const cp = [], cc = [], red = new T.Color('#c8321a'), white = new T.Color('#eeeeea');
    for (let i = 0; i < N; i++) {
      let c = 0; for (let k = -4; k <= 4; k++) c = Math.max(c, Math.abs(CURV[(i + k + N) % N]));
      if (c < 1 / 260) continue;
      const j = (i + 1) % N, col = (i & 1) ? red : white;
      for (const s of [-1, 1]) {
        const a = HW * s, b = (HW + 1.3) * s, P = (ii, l) => [PX[ii] + RX[ii] * l, .05, PZ[ii] + RZ[ii] * l];
        const q = [P(i, a), P(i, b), P(j, a), P(j, b)];
        for (const v of s > 0 ? [q[0], q[1], q[2], q[1], q[3], q[2]] : [q[0], q[2], q[1], q[1], q[2], q[3]]) { cp.push(...v); cc.push(col.r, col.g, col.b); }
      }
    }
    const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(cp, 3)); cg.setAttribute('color', new T.Float32BufferAttribute(cc, 3)); cg.computeVertexNormals();
    const curbs = new T.Mesh(cg, new T.MeshStandardMaterial({vertexColors: true, roughness: .7, side: T.DoubleSide})); curbs.receiveShadow = true; scene.add(curbs);
    // Leitplanken
    const rail = new T.MeshStandardMaterial({color: '#b9c0c8', metalness: .6, roughness: .35, side: T.DoubleSide});
    for (const s of [-1, 1]) {
      const g = new T.BufferGeometry(), pos = [], idx = [];
      for (let k = 0; k <= N; k++) { const i = k % N, x = PX[i] + RX[i] * WALL * s, z = PZ[i] + RZ[i] * WALL * s; pos.push(x, .3, z, x, .85, z); if (k < N) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, rail); m.castShadow = true; scene.add(m);
    }
    const posts = new T.InstancedMesh(new T.BoxGeometry(.12, .85, .12), new T.MeshStandardMaterial({color: '#7d848c', roughness: .6}), Math.ceil(N / 2) * 2);
    const M4 = new T.Matrix4(); let pi = 0;
    for (let i = 0; i < N; i += 2) for (const s of [-1, 1]) { M4.makeTranslation(PX[i] + RX[i] * (WALL + .1) * s, .42, PZ[i] + RZ[i] * (WALL + .1) * s); posts.setMatrixAt(pi++, M4); }
    posts.count = pi; scene.add(posts);
    // Start/Ziel: Schachbrett und Portal
    const chk = canvasTex(64, 256, (g, w, h) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) & 1 ? '#111' : '#f2f0ea'; g.fillRect(x * 16, y * 16, 16, 16); } });
    const line = new T.Mesh(new T.PlaneGeometry(2.4, HW * 2).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({map: chk, roughness: .8}));
    line.position.set(PX[0], .06, PZ[0]); line.rotation.y = Math.atan2(-tz[0], tx[0]); line.receiveShadow = true; scene.add(line);
    const steel = new T.MeshStandardMaterial({color: '#2a2f34', metalness: .5, roughness: .5});
    const gantry = new T.Group(); gantry.position.set(PX[0], 0, PZ[0]); gantry.rotation.y = Math.atan2(-tz[0], tx[0]); scene.add(gantry);
    box(.5, 7.5, .5, steel, 0, 3.75, -HW - 2, gantry); box(.5, 7.5, .5, steel, 0, 3.75, HW + 2, gantry);
    const banner = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#14171a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5a524'; g.font = '800 84px "Barlow Condensed",Arial Narrow,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SCHALT · SIMULATOR', w / 2, h / 2 + 4); });
    const bm = new T.MeshStandardMaterial({color: '#14171a', roughness: .6}), bf = new T.MeshStandardMaterial({map: banner, roughness: .6, emissive: '#ffffff', emissiveMap: banner, emissiveIntensity: .25});
    const ban = new T.Mesh(new T.BoxGeometry(.4, 1.6, HW * 2 + 4.5), [bf, bf, bm, bm, bm, bm]); ban.position.y = 7; ban.castShadow = true; gantry.add(ban);
    // Tribüne links, Boxengebäude rechts der Start-Geraden
    const at = i => { const g = new T.Group(); g.position.set(PX[i], 0, PZ[i]); g.rotation.y = Math.atan2(-tz[i], tx[i]); scene.add(g); return g; };
    const crowd = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h); const cs = ['#c8321a', '#f5a524', '#1f6fd1', '#e9e6df', '#2f7d4a', '#26292d', '#e5484d']; for (let i = 0; i < 1400; i++) { g.fillStyle = cs[i % cs.length]; g.fillRect(rand() * w, rand() * h * .8 + h * .1, 3, 4); } }, true);
    crowd.repeat.set(14, 1);
    const stand = at(N - Math.round(150 / STEP)), concrete = new T.MeshStandardMaterial({color: '#9aa1a8', roughness: .9}), people = new T.MeshStandardMaterial({map: crowd, roughness: .9});
    for (let k = 0; k < 6; k++) {
      const hh = 1 + k * 1.1, z = -(WALL + 5 + k * 2.4), m = box(180, hh, 2.4, concrete, 0, hh / 2, z, stand); m.receiveShadow = true;
      const f = new T.Mesh(new T.PlaneGeometry(180, .9), people); f.position.set(0, hh - .5, z + 1.21); stand.add(f);
    }
    box(184, .4, 16, steel, 0, 10, -(WALL + 11), stand);
    for (let x = -84; x <= 84; x += 28) box(.4, 9.5, .4, steel, x, 5, -(WALL + 18), stand);
    const winT = canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#d9dcdf'; g.fillRect(0, 0, w, h); g.fillStyle = '#25303b'; for (let x = 6; x < w; x += 32) g.fillRect(x, 16, 24, 30); }, true);
    winT.repeat.set(10, 1);
    const pit = at(N - Math.round(120 / STEP)), pw = new T.MeshStandardMaterial({map: winT, roughness: .5}), pr = new T.MeshStandardMaterial({color: '#d9dcdf', roughness: .7});
    const pm = new T.Mesh(new T.BoxGeometry(200, 7, 12), [pr, pr, pr, pr, pr, pw]); pm.position.set(0, 3.5, WALL + 12); pm.castShadow = pm.receiveShadow = true; pit.add(pm);
    box(204, .5, 15, steel, 0, 7.2, WALL + 12, pit);
    // Werbetafeln aussen an den Kurven
    const SIGNS = ['KUPPLUNG LANGSAM KOMMEN LASSEN', 'GT3', 'ZWISCHENGAS!', 'SCHALT · SIMULATOR', 'NICHT ÜBERDREHEN', 'SPÄT BREMSEN'];
    let si = 0;
    for (let i = 0; i < N && si < SIGNS.length; i += 4) {
      if (Math.abs(CURV[i]) < 1 / 90 || Math.abs(CURV[i]) < Math.abs(CURV[(i + 4) % N]) || Math.abs(CURV[i]) < Math.abs(CURV[(i + N - 4) % N])) continue;
      const side = CURV[i] > 0 ? 1 : -1, g = at(i), text = SIGNS[si++];
      g.position.set(PX[i] + RX[i] * (WALL + 10) * side, 0, PZ[i] + RZ[i] * (WALL + 10) * side);
      const tex = canvasTex(1024, 192, (c, w, h) => { c.fillStyle = si & 1 ? '#f5a524' : '#14171a'; c.fillRect(0, 0, w, h); c.fillStyle = si & 1 ? '#1a1204' : '#f5a524'; c.font = '800 96px "Barlow Condensed",Arial Narrow,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 4, w - 40); });
      const sm = new T.Mesh(new T.PlaneGeometry(16, 3), new T.MeshStandardMaterial({map: tex, roughness: .6, side: T.DoubleSide}));
      sm.position.y = 2.6; sm.rotation.y = -Math.PI / 2; sm.castShadow = true; g.add(sm);   // zeigt den anfahrenden Autos entgegen
      box(.2, 2, .2, steel, 0, 1, -6, g); box(.2, 2, .2, steel, 0, 1, 6, g);
    }
    // Bäume (nicht zu nah an der Strecke)
    const trees = 900, fol = new T.InstancedMesh(new T.ConeGeometry(2.6, 8, 7), new T.MeshStandardMaterial({roughness: .95}), trees);
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(.25, .35, 2.4, 6), new T.MeshStandardMaterial({color: '#4b3621', roughness: 1}), trees);
    const col = new T.Color(); let ti = 0;
    for (let tries = 0; tries < 6000 && ti < trees; tries++) {
      const x = -1500 + rand() * 3300, z = -900 + rand() * 2600;
      let d = 1e9; for (let i = 0; i < N; i += 2) { const dx = x - PX[i], dz = z - PZ[i]; d = Math.min(d, dx * dx + dz * dz); }
      if (d < (WALL + 9) ** 2) continue;
      const s = .7 + rand() * .9;
      M4.makeScale(s, s, s).setPosition(x, 1.2 * s, z); trunk.setMatrixAt(ti, M4);
      M4.makeScale(s, s * (.8 + rand() * .5), s).setPosition(x, (2.4 + 3.6) * s, z); fol.setMatrixAt(ti, M4);
      fol.setColorAt(ti, col.setHSL(.27 + rand() * .07, .45 + rand() * .2, .18 + rand() * .1)); ti++;
    }
    fol.count = trunk.count = ti; fol.castShadow = trunk.castShadow = true; scene.add(fol, trunk);
  }

  function buildWorld() {
    // Himmel (Verlauf), Berge am Horizont, Wiese
    const sky = new T.Mesh(new T.SphereGeometry(4500, 32, 16), new T.MeshBasicMaterial({vertexColors: true, side: T.BackSide, fog: false, depthWrite: false}));
    const sp = sky.geometry.attributes.position, sc = [], top = new T.Color('#3f74b0'), hor = new T.Color('#cfdbe6'), c = new T.Color();
    for (let i = 0; i < sp.count; i++) { const y = sp.getY(i) / 4500; c.copy(hor).lerp(top, Math.pow(Math.max(0, y), .55)); if (y < 0) c.copy(hor); sc.push(c.r, c.g, c.b); }
    sky.geometry.setAttribute('color', new T.Float32BufferAttribute(sc, 3));
    const envScene = new T.Scene(); envScene.add(sky.clone());
    const envGround = new T.Mesh(new T.CircleGeometry(4000, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({color: '#55613f'})); envGround.position.y = -20; envScene.add(envGround);
    const pm = new T.PMREMGenerator(R); scene.environment = pm.fromScene(envScene, .02).texture; pm.dispose();
    scene.add(sky);
    const mtn = new T.MeshBasicMaterial({color: '#8a9db3', fog: false});
    for (let k = 0; k < 44; k++) {
      const a = k / 44 * Math.PI * 2 + rand() * .1, r = 3300 + rand() * 500, h = 260 + rand() * 520;
      const m = new T.Mesh(new T.ConeGeometry(h * 1.6, h, 5), k & 1 ? mtn : new T.MeshBasicMaterial({color: '#7c90a8', fog: false}));
      m.position.set(150 + Math.cos(a) * r, h / 2 - 30, 400 + Math.sin(a) * r); m.rotation.y = rand() * 3; scene.add(m);
    }
    const grass = canvasTex(256, 256, (g, w, h) => noise(g, w, h, r => [52 + r * 26 | 0, 92 + r * 38 | 0, 38 + r * 16 | 0]), true);
    grass.repeat.set(900, 900);
    const ground = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({map: grass, roughness: 1}));
    ground.position.set(150, -.06, 400); ground.receiveShadow = true; scene.add(ground);
    scene.add(new T.HemisphereLight('#cfe0f5', '#4d5a36', .35));
    sun = new T.DirectionalLight('#fff1dc', 2.1); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, {left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 400});
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
    scene.add(sun, sun.target);
    buildTrack();
  }

  // ---------------- Auto ----------------
  function disposeTree(o) { o.traverse(m => { if (m.geometry) m.geometry.dispose(); const ms = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; for (const x of ms) { if (x.map) x.map.dispose(); x.dispose(); } }); }
  function buildCar() {
    const C = car(), col = S.cfg.color || '#c8321a', key = S.cfg.car + col;
    if (key === car3.key) return;
    car3.key = key;
    if (car3.g) { scene.remove(car3.g); disposeTree(car3.g); }
    const L = C.livery, pts = pathPts(C.path), win = pathPts(C.win);
    const front = Math.max(...pts.map(p => p[0])), back = Math.min(...pts.map(p => p[0])), top = Math.max(...pts.map(p => p[1]));
    const belt = Math.min(...win.map(p => p[1]));
    const W = clamp((front - back) * SC * .43, 1.62, 2.02) / SC, WU = W * .82;
    // Radläufe in die Unterkante schneiden
    const outline = pts.slice(), yb = (pts[0][1] + pts[pts.length - 1][1]) / 2, ar = C.wr + 3.5, dy = yb - C.wr, a0 = Math.atan2(dy, Math.sqrt(Math.max(1, ar * ar - dy * dy)));
    for (const wx of [C.wx, -C.wx]) for (let k = 0; k <= 14; k++) { const a = a0 + (Math.PI - 2 * a0) * k / 14; outline.push([wx + ar * Math.cos(a), C.wr + ar * Math.sin(a)]); }

    // Seitentextur: Lack, Livery, Fenster, Säulen (gleiche Koordinaten wie die 2D-Zeichnung)
    const tex = canvasTex(1200, 480, (g, w, h) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.setTransform(4, 0, 0, 4, 600, 480);
      if (L) {
        for (const [y, hh, c, a] of L.bands || []) { g.globalAlpha = a ?? 1; g.fillStyle = c; g.fillRect(-150, y, 300, hh); }
        for (const [x, ww, c, k, a] of L.slash || []) { g.globalAlpha = a ?? 1; g.fillStyle = c; g.beginPath(); g.moveTo(x, -14); g.lineTo(x + ww, -14); g.lineTo(x + ww + k, -100); g.lineTo(x + k, -100); g.closePath(); g.fill(); }
        g.globalAlpha = 1;
      }
      if (C.scoop) { g.fillStyle = shade(col, .5); g.fillRect(-150, -44, 300, 4); }
      g.fillStyle = '#0f141b'; g.fill(pathOf(C.win));
      g.strokeStyle = shade(col, -.45); g.lineWidth = 3;
      for (const p of [C.pillar, C.pillar2]) if (p) { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .8;   // Türfuge
      const dx = C.pillar ? C.pillar[0] : (Math.min(...win.map(p => p[0])) + Math.max(...win.map(p => p[0]))) / 2;
      g.beginPath(); g.moveTo(dx + 2, -belt); g.lineTo(dx + 2, -24); g.stroke();
    });
    tex.repeat.set(1 / 300, 1 / 120); tex.offset.set(.5, 0);
    const paint = new T.MeshStandardMaterial({color: col, metalness: .45, roughness: .3});
    const capM = new T.MeshStandardMaterial({map: tex, metalness: .45, roughness: .3});
    const glass = new T.MeshStandardMaterial({color: '#0d1218', metalness: .2, roughness: .05});
    const dark = new T.MeshStandardMaterial({color: '#0c0d0f', roughness: .8});
    const trim = new T.MeshStandardMaterial({color: '#15181c', roughness: .5, metalness: .3});
    const g = new T.Group(), body = new T.Group(); body.scale.setScalar(SC); g.add(body);
    const winX0 = Math.min(...win.map(p => p[0])) - 30, winX1 = Math.max(...win.map(p => p[0])) + 30;
    const lower = new T.Mesh(regroup(extrude(clipY(outline, belt, true), W, 9, 2), ny => ny < -.25 ? 3 : 1), [capM, paint, glass, dark]);
    const upPoly = clipY(outline, belt - 1.5, false);
    const upper = new T.Mesh(regroup(extrude(upPoly, WU, 6, 2), (ny, nz, x) => ny > .9 || ny < -.3 || Math.abs(nz) > .8 || x < winX0 || x > winX1 ? (ny < -.3 ? 3 : 1) : 2), [capM, paint, glass, dark]);
    lower.castShadow = upper.castShadow = true; lower.receiveShadow = upper.receiveShadow = true;
    body.add(lower, upper);
    // Anbauteile
    const wingC = new T.MeshStandardMaterial({color: (L && L.wingCol) || '#111316', roughness: .45, metalness: .3});
    const fx = y => xAt(pts, y, 1) ?? front, bx = y => xAt(pts, y, -1) ?? back;
    if (C.bigWing) {
      box(48, 5, W * .94, wingC, back + 16, 87, 0, body);
      for (const s of [-1, 1]) { box(5, 28, 3, trim, back + 19, 72, s * W * .22, body); box(34, 18, 2, wingC, back + 14, 85, s * W * .48, body); }
    }
    if (C.wing) { box(34, 5, W * .86, trim, -109, 61.5, 0, body); for (const s of [-1, 1]) box(4, 12, 3, trim, -110, 54, s * W * .25, body); }
    if (C.splitter) box(30, 3, W * 1.02, trim, front - 6, 17.5, 0, body);
    if (C.scoop) box(30, 7, W * .3, new T.MeshStandardMaterial({color: shade(col, -.6)}), 81, 55, 0, body);
    if (C.bed) box(92, 1, W * .86, dark, -80, 62.6, 0, body);
    if (C.rally) box(30, 4, WU * .6, trim, -15, top + 1.5, 0, body);
    if (C.grille) box(4, 20, W * .5, dark, fx(34) - 1, 34, 0, body);
    // Lichter
    let headY = 44, tailY = 44;
    for (let y = 62; y >= 24; y -= 2) if ((xAt(pts, y, 1) ?? -1e9) > front - 10) { headY = y - 5; break; }
    for (let y = 70; y >= 24; y -= 2) if ((xAt(pts, y, -1) ?? 1e9) < back + 10) { tailY = y - 5; break; }
    const headM = new T.MeshStandardMaterial({color: '#ffffff', emissive: '#fff3c4', emissiveIntensity: 1.2, roughness: .2});
    const tailM = new T.MeshStandardMaterial({color: '#5a0a0a', emissive: '#ff2020', emissiveIntensity: .5, roughness: .3});
    for (const s of [-1, 1]) { box(4, 6, W * .2, headM, fx(headY) - 1.2, headY, s * W * .33, body); box(4, 7, W * .24, tailM, bx(tailY) + 1.2, tailY, s * W * .32, body); }
    // Auspuff + Flammen
    car3.flames = [];
    const [ex, ey] = C.ex, pipeM = new T.MeshStandardMaterial({color: '#8d939b', metalness: .9, roughness: .3});
    const flameG = new T.ConeGeometry(4, 30, 10, 1, true).rotateZ(Math.PI / 2).translate(-15, 0, 0);
    for (const z of C.quad ? [-W * .3, -W * .2, W * .2, W * .3] : [-W * .25]) {
      const p = new T.Mesh(new T.CylinderGeometry(3, 3, 14, 12).rotateZ(Math.PI / 2), pipeM); p.position.set(bx(-ey) + 4, -ey, z); body.add(p);
      const f = new T.Mesh(flameG, new T.MeshBasicMaterial({color: '#ffb020', transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false}));
      f.position.set(bx(-ey) - 2, -ey, z); f.visible = false; body.add(f); car3.flames.push(f);
    }
    // Startnummer als Aufkleber auf beiden Seiten
    const num = L && L.num ? [L.num, L.numAt || [10, -36], L.numBg || '#f2f0ea', L.numCol || '#111'] : C.rally ? ['7', [-40, -42], '#f2f0ea', '#111'] : null;
    if (num) {
      const [txt, [nx, ny], bg, fg] = num;
      const nt = canvasTex(128, 128, (c, w, h) => { c.fillStyle = bg; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill(); c.fillStyle = fg; c.font = `700 ${txt.length > 2 ? 64 : 84}px "Barlow Condensed",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 64, 70); });
      const nm = new T.MeshStandardMaterial({map: nt, transparent: true, roughness: .35, polygonOffset: true, polygonOffsetFactor: -2});
      const zz = (-ny < belt ? W : WU) / 2 + .4;
      for (const s of [-1, 1]) { const d = new T.Mesh(new T.PlaneGeometry(24, 24), nm); d.position.set(nx, -ny, s * zz); if (s < 0) d.rotation.y = Math.PI; body.add(d); }
    }
    // Cockpit (nur in der Cockpit-Kamera sichtbar)
    const ck = new T.Group(); ck.visible = false; body.add(ck);
    const xf = xAt(outline, belt, 1) ?? front * .5, xb = xAt(outline, belt, -1) ?? back * .5;
    const roof = outline.filter(p => p[1] > top - 5), xrf = Math.max(...roof.map(p => p[0])), xrr = Math.min(...roof.map(p => p[0]));
    const inner = new T.MeshStandardMaterial({color: '#1a1c1f', roughness: .8}), liner = new T.MeshStandardMaterial({color: '#2b2e33', roughness: .9, side: T.DoubleSide});
    const eyeX = clamp(C.pillar ? C.pillar[0] - 8 : (xf + xrr) / 2 - 4, xrr + 6, xf - 28);
    car3.eye.set(eyeX, belt + (top - belt) * .45, -W * .2);
    box(28, 9, W * .84, inner, xf - 16, belt - 1, 0, ck);
    for (const s of [-1, 1]) {
      beam(new T.Vector3(xf, belt, s * WU * .47), new T.Vector3(xrf, top - 1, s * WU * .44), 4, inner, ck);
      beam(new T.Vector3(xb, belt, s * WU * .47), new T.Vector3(xrr, top - 1, s * WU * .44), 6, inner, ck);
    }
    box(Math.max(4, xrf - xrr), 1.5, WU * .9, liner, (xrf + xrr) / 2, top - 2, 0, ck);
    box(4, 4, WU * .9, inner, xrf, top - 2.5, 0, ck);
    const sw = new T.Group(); sw.position.set(eyeX + 26, car3.eye.y - 13, car3.eye.z); sw.rotation.set(0, Math.PI / 2, 0); sw.rotateX(.35); ck.add(sw);
    const swi = new T.Group(); sw.add(swi);
    swi.add(new T.Mesh(new T.TorusGeometry(9.5, 1.1, 8, 28), inner));
    const spoke = new T.Mesh(new T.BoxGeometry(18, 1.6, 1), inner); swi.add(spoke);
    const mark = new T.Mesh(new T.BoxGeometry(1.2, 2.5, 1.4), new T.MeshBasicMaterial({color: '#f5a524'})); mark.position.y = 9.5; swi.add(mark);
    car3.sw = swi;
    car3.bumper.set(front + 3, 28, 0);
    // Räder
    car3.wheels = [];
    const r = C.wr * SC, tw = C.bigWing ? .32 : .26, tireG = new T.CylinderGeometry(r, r, tw, 28).rotateX(Math.PI / 2);
    const tireM = new T.MeshStandardMaterial({color: '#121214', roughness: .85}), rimM = new T.MeshStandardMaterial({color: C.bigWing ? '#2b2f36' : '#b5bcc4', metalness: .85, roughness: .25});
    for (const [x, s] of [[C.wx, -1], [C.wx, 1], [-C.wx, -1], [-C.wx, 1]]) {
      const piv = new T.Group(), spin = new T.Group(); piv.position.set(x * SC, r, s * (W * SC / 2 - tw / 2 - .015)); piv.add(spin); g.add(piv);
      const tire = new T.Mesh(tireG, tireM); tire.castShadow = true; spin.add(tire);
      const rim = new T.Mesh(new T.CylinderGeometry(r * .64, r * .64, .02, 20).rotateX(Math.PI / 2), rimM); rim.position.z = s * (tw / 2 + .002); spin.add(rim);
      for (let k = 0; k < 3; k++) { const sp = new T.Mesh(new T.BoxGeometry(r * 1.2, r * .13, .03), trim); sp.rotation.z = k * Math.PI / 3; sp.position.z = s * (tw / 2 + .012); spin.add(sp); }
      car3.wheels.push({piv, spin, front: x > 0});
    }
    car3.g = g; car3.body = body; car3.upper = upper; car3.cockpit = ck; car3.tail = tailM;
    car3.info = {W: W * SC, len: (front - back) * SC, base: 2 * C.wx * SC, r, back: back * SC, belt, top};
    scene.add(g);
    applyCam();
  }

  // ---------------- Rauch ----------------
  const smoke = [];
  let smokeTex;
  function emitSmoke(dt) {
    const D = S.dmg, C = car(), em = (rate, lx, ly, color, rise) => {
      let n = rate * dt;
      while (n > 0) {
        if (Math.random() < n && smoke.length < 160) {
          const m = new T.Sprite(new T.SpriteMaterial({map: smokeTex, color, transparent: true, depthWrite: false, opacity: .5}));
          m.position.copy(car3.body.localToWorld(new T.Vector3(lx, ly, (Math.random() - .5) * 20)));
          m.scale.setScalar(.5); scene.add(m);
          smoke.push({m, vy: rise * (.6 + Math.random() * .6), vx: (Math.random() - .5) * .6, vz: (Math.random() - .5) * .6, life: 2, max: 2});
        }
        n--;
      }
    };
    const [ex, ey] = C.ex;
    if (S.running && D.engine > .35) em((D.engine - .35) * 50 * (.3 + S.thrEff), ex, -ey, '#9aa3ad', .8);
    if (S.running && D.turbo >= 1) em(12 * (.3 + S.thrEff), ex, -ey, '#bfcbe0', .7);
    if (S.temp > 112) em((S.temp - 112) * 3, C.hood[0], -C.hood[1] + 6, '#eef1f3', 2.2);
    if (S.blown) em(4 + 30 * S.blowT / 5, C.hood[0], -C.hood[1] + 6, '#28282a', 1.8);
    if (st.slide > 3 && Math.abs(S.v) > 8) for (const w of car3.wheels) if (!w.front) em(st.slide * 1.5, w.piv.position.x / SC, 4, '#d9dadb', .5);
    for (let i = smoke.length - 1; i >= 0; i--) {
      const q = smoke[i]; q.life -= dt;
      if (q.life <= 0) { scene.remove(q.m); q.m.material.dispose(); smoke.splice(i, 1); continue; }
      q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt;
      q.m.scale.setScalar(.5 + (q.max - q.life) * 1.6); q.m.material.opacity = q.life / q.max * .45;
    }
  }

  // ---------------- Strecke abfragen ----------------
  function nearest(x, z, hint) {
    let best = 0, bd = Infinity;
    const scan = (a, b) => { for (let k = a; k <= b; k++) { const i = (k % N + N) % N, dx = x - PX[i], dz = z - PZ[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } };
    if (hint >= 0) scan(hint - 40, hint + 40);
    if (hint < 0 || bd > 900) { bd = Infinity; scan(0, N - 1); }
    return best;
  }
  function placeAt(i) {
    st.i = i; st.x = PX[i]; st.z = PZ[i]; st.h = Math.atan2(RX[i], RZ[i]); st.camH = st.h; st.lat = 0;
  }
  function reset() {
    if (!started) return;
    placeAt(nearest(st.x, st.z, st.i)); S.v = 0; st.steer = 0; lap.valid = false; lap.prev = st.i;
    toast('Zurück auf die Strecke');
  }

  // ---------------- Fahren ----------------
  function drive(dt) {
    const C = car(), I = car3.info, kb = S.kbd;
    const target = clamp((kb.left ? 1 : 0) - (kb.right ? 1 : 0) + st.touch, -1, 1);
    st.steer = approach(st.steer, target, dt * (target === 0 ? 4.5 : Math.sign(target) !== Math.sign(st.steer) ? 6 : 2.6));
    const v = S.v, delta = st.steer * .55 / (1 + Math.abs(v) / 16);
    let yaw = v * Math.tan(delta) / I.base;
    let mu = C.bigWing ? 1.35 + 1.6e-4 * v * v : C.wing || C.splitter ? 1.12 : 1;
    if (st.off) mu *= .6;
    const aMax = mu * GRAV, aLat = v * yaw;
    let scrub = Math.abs(aLat) * .025;
    st.slide = 0;
    if (Math.abs(aLat) > aMax) { st.slide = Math.abs(aLat) - aMax; yaw *= aMax / Math.abs(aLat); scrub += st.slide * .45; }
    S.extraF = C.mass * (scrub + (st.off ? 1.2 : 0));
    st.h += yaw * dt;
    st.x += Math.cos(st.h) * v * dt; st.z -= Math.sin(st.h) * v * dt;
    st.i = nearest(st.x, st.z, st.i);
    let i = st.i;
    st.lat = (st.x - PX[i]) * RX[i] + (st.z - PZ[i]) * RZ[i];
    st.off = Math.abs(st.lat) > HW + 1.3;
    // Leitplanke: zurückschieben, Geschwindigkeit quer zur Planke wegnehmen, entlang gleiten
    const lim = WALL - I.W / 2 - .1;
    if (Math.abs(st.lat) > lim) {
      const s = Math.sign(st.lat), nx = RX[i] * s, nz = RZ[i] * s, push = Math.abs(st.lat) - lim;
      st.x -= nx * push; st.z -= nz * push; st.lat = s * lim;
      const vx = Math.cos(st.h) * v, vz = -Math.sin(st.h) * v, vn = vx * nx + vz * nz;
      if (vn > 0) {
        const tx = vx - vn * nx, tz = vz - vn * nz, tl = Math.hypot(tx, tz);
        if (tl > .5) { const d = v >= 0 ? 1 : -1; st.h = Math.atan2(-tz * d, tx * d); }
        S.v = Math.sign(v) * tl * .85;
        st.shake = Math.min(1, vn / 10);
        if (vn > 7) toast('Leitplanke!');
      }
    }
    // Karosserie: Wanken in Kurven, Nicken beim Bremsen/Beschleunigen
    st.latA += (v * yaw - st.latA) * Math.min(1, dt * 6);
    st.acc += ((S.v - st.lastV) / Math.max(dt, 1e-3) - st.acc) * Math.min(1, dt * 5); st.lastV = S.v;
    const soft = C.bigWing ? .0028 : .006;
    car3.g.position.set(st.x, 0, st.z); car3.g.rotation.y = st.h;
    const bump = st.off ? (Math.random() - .5) * .012 * Math.min(1, Math.abs(v) / 8) : 0;
    const vib = S.running ? (Math.random() - .5) * .0012 * (.4 + S.thrEff + S.dmg.engine * 2) : 0;
    car3.body.rotation.set(clamp(st.latA * soft, -.07, .07) + bump, 0, clamp(st.acc * soft * .55, -.05, .05) + bump * .5);
    car3.body.position.y = vib + Math.abs(bump) * 2;
    for (const w of car3.wheels) { w.spin.rotation.z = -S.dist / I.r; if (w.front) w.piv.rotation.y = delta; }
    if (car3.sw) car3.sw.rotation.z = -delta * 9;
    car3.tail.emissiveIntensity = S.brake > .1 ? 4 : .5;
    for (const f of car3.flames) { f.visible = S.flame > .03; if (f.visible) { f.scale.set(S.flame * (.5 + Math.random() * .8), .7 + Math.random() * .5, 1); f.material.opacity = Math.min(1, S.flame * 1.2); } }
    S.flame = Math.max(0, S.flame - dt * 5);
    if (S.blown) S.blowT = Math.max(0, S.blowT - dt);
    // Runde: Start/Ziel vorwärts überqueren, unterwegs zwei Kontrollpunkte
    lap.t += dt;
    if (st.off && Math.abs(st.lat) > HW + 2) lap.valid = false;
    const p = lap.prev;
    if (p >= 0) {
      if (p > N * .9 && i < N * .1) {
        if (lap.run && lap.cp >= 2) {
          const time = lap.t - lap.start; lap.last = time; lap.n++;
          if (lap.valid && (lap.best == null || time < lap.best)) { lap.best = time; try { localStorage.setItem('shift.best.' + S.cfg.car, String(time)); } catch (e) {} toast('Neue Bestzeit ' + fmt(time)); }
          else toast((lap.valid ? 'Runde ' : 'Runde (ungültig) ') + fmt(time));
        } else if (!lap.run) toast('Fliegende Runde – los!');
        lap.run = true; lap.start = lap.t; lap.cp = 0; lap.valid = true;
      } else if (p < N * .1 && i > N * .9) { lap.cp = -1; lap.valid = false; }
      if (lap.cp === 0 && i > N * .3 && i < N * .45) lap.cp = 1;
      if (lap.cp === 1 && i > N * .6 && i < N * .75) lap.cp = 2;
    }
    lap.prev = i;
  }
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`; };

  // ---------------- Kamera ----------------
  const qLook = new T.Quaternion().setFromEuler(new T.Euler(-.06, -Math.PI / 2, 0, 'YXZ')), tmpQ = new T.Quaternion(), tmpV = new T.Vector3();
  function applyCam() {
    const m = S.cfg.cam;
    if (car3.cockpit) { car3.cockpit.visible = m === 'cockpit'; car3.upper.visible = m !== 'cockpit'; }
    cam.near = m === 'chase' ? .2 : .05; cam.updateProjectionMatrix();
  }
  function camStep(dt) {
    const I = car3.info, m = S.cfg.cam, kmh = Math.abs(S.v) * 3.6;
    st.shake = Math.max(0, st.shake - dt * 3);
    const sh = st.shake * .08 + (st.off ? Math.min(.02, Math.abs(S.v) * .002) : 0);
    if (m === 'chase') {
      let dh = st.h - st.camH; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      st.camH += dh * Math.min(1, dt * 5);
      const dist = 4.2 + I.len * .55, fx = Math.cos(st.camH), fz = -Math.sin(st.camH);
      cam.position.set(st.x - fx * dist, 1.5 + I.len * .12, st.z - fz * dist);
      cam.lookAt(st.x + fx * 2.5, .85, st.z + fz * 2.5);
      cam.fov = 60 + Math.min(14, kmh / 18);
    } else {
      car3.body.updateWorldMatrix(true, false);
      cam.position.copy(car3.body.localToWorld(tmpV.copy(m === 'cockpit' ? car3.eye : car3.bumper)));
      car3.body.getWorldQuaternion(tmpQ); cam.quaternion.copy(tmpQ).multiply(qLook);
      cam.fov = m === 'cockpit' ? 68 : 62 + Math.min(12, kmh / 20);
    }
    if (sh) { cam.position.x += (Math.random() - .5) * sh; cam.position.y += (Math.random() - .5) * sh; }
    cam.updateProjectionMatrix();
    sun.position.set(st.x - 90, 160, st.z + 70); sun.target.position.set(st.x, 0, st.z);
  }
  function setCam(m) {
    S.cfg.cam = m; applyCam();
    S.cfg.view = m === 'cockpit' ? 'innen' : 'aussen'; syncUI(); AU.sendMix();
    toast('Kamera: ' + CAM_NAMES[m]);
  }
  function nextCam() { setCam(CAMS[(CAMS.indexOf(S.cfg.cam) + 1) % CAMS.length]); }

  // ---------------- HUD ----------------
  let hudT = 0;
  function hudStep(dt) {
    hudT -= dt;
    const E = eng(), rpm = S.we * RPM, lit = clamp(Math.round((rpm - (E.red - 2200)) / 2200 * 10), 0, 10), flash = rpm > E.red - 150 && (performance.now() / 70 | 0) & 1;
    hud.leds.forEach((l, k) => { l.className = flash ? 'on blink' : k < lit ? 'on' : ''; });
    if (hudT > 0) return;
    hudT = .08;
    hud.spd.textContent = Math.round(Math.abs(S.v) * 3.6);
    hud.gear.textContent = gearName(S.shift ? S.shift.to : S.gear);
    hud.lap.textContent = lap.run ? fmt(lap.t - lap.start) : 'Über die Startlinie fahren';
    hud.lap.classList.toggle('bad', lap.run && !lap.valid);
    hud.last.textContent = lap.last != null ? fmt(lap.last) : '–';
    hud.best.textContent = lap.best != null ? fmt(lap.best) : '–';
    hud.off.hidden = !st.off;
  }

  // ---------------- öffentlich ----------------
  function init(el) {
    wrap = el;
    const cv = el.querySelector('canvas');
    R = new T.WebGLRenderer({canvas: cv, antialias: true, powerPreference: 'high-performance'});
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    scene = new T.Scene(); scene.fog = new T.Fog('#cfdbe6', 250, 3200);
    cam = new T.PerspectiveCamera(62, 2, .2, 6000);
    smokeTex = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    buildWorld();
    const fit = () => { const r = cv.getBoundingClientRect(); if (r.width < 2) return; R.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); };
    new ResizeObserver(fit).observe(cv); fit();
    hud.spd = el.querySelector('[data-h=spd]'); hud.gear = el.querySelector('[data-h=gear]'); hud.lap = el.querySelector('[data-h=lap]');
    hud.last = el.querySelector('[data-h=last]'); hud.best = el.querySelector('[data-h=best]'); hud.off = el.querySelector('[data-h=off]');
    const leds = el.querySelector('.leds'); hud.leds = [];
    for (let k = 0; k < 10; k++) { const s = document.createElement('i'); s.style.setProperty('--c', k < 4 ? '#22c55e' : k < 7 ? '#f5a524' : '#e5484d'); leds.appendChild(s); hud.leds.push(s); }
    el.querySelectorAll('[data-steer]').forEach(b => {
      const d = +b.dataset.steer;
      b.addEventListener('pointerdown', e => { AU.init(); b.setPointerCapture(e.pointerId); st.touch = d; });
      const up = () => { if (st.touch === d) st.touch = 0; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    el.querySelector('[data-act=cam]').addEventListener('click', e => { nextCam(); e.currentTarget.blur(); });
    el.querySelector('[data-act=full]').addEventListener('click', e => { fullscreen(); e.currentTarget.blur(); });
    placeAt(N - Math.round(60 / STEP)); lap.prev = st.i;
    started = true;
  }
  function loadBest() { try { const b = localStorage.getItem('shift.best.' + S.cfg.car); lap.best = b ? +b : null; } catch (e) { lap.best = null; } }
  function frame(dt) {
    if (!started) init(document.getElementById('view3d'));
    if (car3.key !== S.cfg.car + S.cfg.color) {
      if (car3.car !== S.cfg.car) { car3.car = S.cfg.car; loadBest(); lap.run = false; lap.cp = 0; lap.last = null; }
      buildCar();
    }
    drive(dt); emitSmoke(dt); camStep(dt); hudStep(dt);
    R.render(scene, cam);
  }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wrap && wrap.requestFullscreen) wrap.requestFullscreen().catch(() => toast('Vollbild nicht möglich'));
  }
  return {frame, reset, nextCam, setCam: m => { if (started) setCam(m); else S.cfg.cam = m; }, fullscreen, applyCam: () => started && applyCam(), get st() { return st; }, get lap() { return lap; }};
})();
