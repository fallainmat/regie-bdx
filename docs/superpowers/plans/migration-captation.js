// Passe unique sur l'état sauvegardé de la régie.
// À exécuter dans la console de l'application, puis RECHARGER la page.
//
// Le seed ne touche pas une régie déjà enregistrée : restore() lit le
// localStorage et ne retombe sur blankState() que s'il est vide. Cette passe
// est délibérément hors de parseState, qui s'exécuterait à chaque chargement
// et devrait rester idempotent indéfiniment.
const KEY = 'regie-helpers-v1';
const s = JSON.parse(localStorage.getItem(KEY));

// 1. Sauvegarde horodatée, restaurable.
const backupKey = KEY + '-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
localStorage.setItem(backupKey, JSON.stringify(s));

// 2. Les besoins du seed n'atteignent pas un état déjà enregistré.
for (const f of s.formats) if (f.key === 'atelier' || f.key === 'universite') f.need = 2;

// 3. Le champ peut manquer sur une sauvegarde antérieure.
s.captation = s.captation || {};

// 4. Déduction : sur un binôme complet, la seule personne formée assure la captation.
//    Les cas ambigus (zéro ou deux personnes formées) restent sans rôle et
//    remonteront dans « Captation à désigner ».
const formes = new Set(s.slots.filter((x) => x.format === 'formation').flatMap((x) => s.assign[x.id] || []));
let deduits = 0, ambigus = 0;
for (const x of s.slots) {
  if (!/amphi|^lab/i.test(x.salle || '')) continue;
  const ids = s.assign[x.id] || [];
  if (ids.length < 2 || s.captation[x.id]) continue;
  const formesIci = ids.filter((i) => formes.has(i));
  if (formesIci.length === 1) { s.captation[x.id] = formesIci[0]; deduits++; } else ambigus++;
}

localStorage.setItem(KEY, JSON.stringify(s));
({ backupKey, deduits, ambigus });
