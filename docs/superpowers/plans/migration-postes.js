// Passe unique sur l'état sauvegardé : deux postes nommés par créneau de salle.
// À exécuter dans la console de l'application, puis RECHARGER la page.
//
// Délibérément hors de parseState, qui s'exécuterait à chaque chargement et
// devrait rester idempotent indéfiniment.
const KEY = 'regie-helpers-v1';
const s = JSON.parse(localStorage.getItem(KEY));
if (!s) throw new Error('Aucune régie enregistrée sous ' + KEY + ' : rien à migrer.');

// 1. Sauvegarde horodatée, restaurable.
const backupKey = KEY + '-backup-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
localStorage.setItem(backupKey, JSON.stringify(s));

// 2. Les besoins du seed n'atteignent pas un état déjà enregistré.
for (const f of s.formats) if (f.key === 'atelier' || f.key === 'universite') f.need = 2;

// 3. Le champ peut manquer sur une sauvegarde antérieure.
s.roles = s.roles || {};

// 4. Déduction : sur un binôme complet, la seule personne formée assure la
//    captation, l'autre tient le time keeper. Les cas ambigus — deux personnes
//    formées, ou aucune — restent vacants et remonteront dans « Postes à
//    pourvoir », où l'auto-affectation ou toi-même trancherez.
const formes = new Set(s.slots.filter((x) => x.format === 'formation').flatMap((x) => s.assign[x.id] || []));
let deduits = 0, ambigus = 0;
for (const x of s.slots) {
  if (!/amphi|^lab/i.test(x.salle || '')) continue;
  const ids = s.assign[x.id] || [];
  if (ids.length < 2 || (s.roles[x.id] && s.roles[x.id].captation)) continue;
  const formesIci = ids.filter((i) => formes.has(i));
  if (formesIci.length === 1) {
    const capt = formesIci[0];
    s.roles[x.id] = { captation: capt, keeper: ids.find((i) => i !== capt) };
    deduits++;
  } else ambigus++;
}

localStorage.setItem(KEY, JSON.stringify(s));
({ backupKey, deduits, ambigus });
