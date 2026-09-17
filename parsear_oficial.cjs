// Parser de la tabla que publica el Gran DT. Se ancla en "Modificó equipo",
// que es lo unico que aparece SIEMPRE y en un formato fijo:
//    [puesto] / nombre del DT / nombre del equipo / "Modificó equipo" / "N vez(es)" / puntos
module.exports = function parsearOficial(txt) {
  const L = String(txt || '').split(/\r?\n/).map(s => s.trim());
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (!/^modific[oó]\s+equipo$/i.test(L[i])) continue;
    const equipo = L[i - 1] || '';
    const dt = L[i - 2] || '';
    // despues: "N vez"/"N veces" y luego los puntos
    let j = i + 1, veces = null, pts = null;
    const mv = (L[j] || '').match(/^(\d+)\s+(vez|veces)$/i);
    if (mv) { veces = +mv[1]; j++; }
    while (j < L.length && pts == null) {
      const m = (L[j] || '').match(/^-?\d+$/);
      if (m) pts = +L[j];
      else if (L[j] !== '') break;
      j++;
    }
    if (equipo && pts != null) out.push({ dt, equipo, veces, pts });
  }
  return out;
};
