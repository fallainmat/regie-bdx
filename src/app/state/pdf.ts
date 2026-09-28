import { RegieState } from '../domain/model';
import { BlocPdf, SectionPdf, blocsFeuilles, blocsPlanning } from '../domain/impression';
// Type seul : effacé à la compilation, il n'entraîne aucun import à l'exécution.
import type { CellDef } from 'jspdf-autotable';

/** Marge de page, en millimètres. */
const MARGE = 12;

type RVB = [number, number, number];
/** Reprises de la palette de l'application (styles.css). */
const ENCRE: RVB = [20, 33, 61];        // --ink
const TEXTE: RVB = [20, 20, 20];
const BANDE_HEURE: RVB = [219, 226, 244];
const TEINTE: RVB = [238, 242, 249];
const BLANC: RVB = [255, 255, 255];
const MANQUE: RVB = [192, 58, 43];      // --miss
const PARTIEL: RVB = [155, 105, 10];    // --part, assombri pour rester lisible à l'impression
const MUET: RVB = [110, 120, 138];      // --muted, pour les heures de fin

/**
 * Traduit les lignes en cellules jsPDF. Les en-têtes de créneau horaire
 * deviennent une cellule unique étalée sur toute la largeur ; les autres
 * portent la teinte de leur groupe, et la colonne « Équipe » prend la couleur
 * de l'état de couverture — comme l'écran teinte la carte du créneau.
 */
function corps(section: SectionPdf): CellDef[][] {
  const colonnes = section.entetes.length;
  const segmente = section.lignes.some((l) => l.entete);
  return section.lignes.map((l) => {
    if (l.entete) {
      return [{
        content: l.cellules[0],
        colSpan: colonnes,
        styles: { fillColor: BANDE_HEURE, textColor: ENCRE, fontStyle: 'bold' as const, fontSize: 10 },
      }];
    }
    const fond = l.bande ? TEINTE : BLANC;
    const etat = l.couverture === 'miss' ? MANQUE : l.couverture === 'part' ? PARTIEL : TEXTE;
    return l.cellules.map((c, i) => {
      // Dans un tableau segmenté, la colonne de gauche porte une heure de fin :
      // gris, plus petite et sans gras, pour ne pas concurrencer la bande de début.
      if (segmente && i === 0) {
        return { content: c, styles: { fillColor: fond, textColor: MUET, fontSize: 8, fontStyle: 'normal' as const } };
      }
      return { content: c, styles: { fillColor: fond, textColor: l.couverture && i === 2 ? etat : TEXTE } };
    });
  });
}

/**
 * jsPDF et son greffon de tableaux ne sont chargés qu'au moment de l'export :
 * un `import()` dynamique les isole dans un morceau à part, pour que le bundle
 * initial de l'application n'en porte pas le poids.
 */
async function rendre(blocs: BlocPdf[], titre: string): Promise<Blob> {
  const [{ jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then((m) => m.default),
  ]);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: titre });
  const largeur = doc.internal.pageSize.getWidth();

  blocs.forEach((bloc, i) => {
    if (i) doc.addPage();
    let y = MARGE + 4;

    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ENCRE);
    doc.text(bloc.titre.toUpperCase(), MARGE, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
    doc.text(bloc.soustitre, largeur - MARGE, y, { align: 'right' });

    y += 2;
    doc.setDrawColor(...ENCRE).setLineWidth(0.4).line(MARGE, y, largeur - MARGE, y);
    y += 5;

    for (const section of bloc.sections) {
      // Heure de groupe en vigueur pour chaque ligne du corps : sert à rappeler
      // le contexte quand un groupe se poursuit sur la page suivante.
      const heures: string[] = [];
      let courante = '';
      for (const l of section.lignes) {
        if (l.entete) courante = l.cellules[0];
        heures.push(courante);
      }
      const heureParPage = new Map<number, string>();

      if (section.titre) {
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...ENCRE);
        doc.text(section.titre, MARGE, y + 3);
        y += 6;
      }
      autoTable(doc, {
        startY: y,
        head: [section.entetes],
        body: corps(section),
        // Les pages de continuation réservent de la place pour le rappel de contexte.
        margin: { left: MARGE, right: MARGE, top: MARGE + 9, bottom: MARGE },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.4, textColor: TEXTE },
        headStyles: { fillColor: ENCRE, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        // 186 mm utiles : on rend de la largeur à « Créneau » au détriment d'« Équipe ».
        columnStyles: section.lignes.some((l) => l.entete)
          ? { 0: { cellWidth: 22 }, 1: { cellWidth: 72 }, 2: { cellWidth: 92 } }
          : { 0: { cellWidth: 30, fontStyle: 'bold' as const } },
        willDrawCell: (data) => {
          if (data.section === 'body' && !heureParPage.has(data.pageNumber)) {
            heureParPage.set(data.pageNumber, heures[data.row.index] ?? '');
          }
        },
        didDrawPage: (data) => {
          if (data.pageNumber < 2) return;
          const heure = heureParPage.get(data.pageNumber) ?? '';
          const rappel = heure ? `${bloc.titre} (suite) · créneau de ${heure}` : `${bloc.titre} (suite)`;
          doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...ENCRE);
          doc.text(rappel, MARGE, MARGE + 4);
          doc.setDrawColor(...BANDE_HEURE).setLineWidth(0.4);
          doc.line(MARGE, MARGE + 6, largeur - MARGE, MARGE + 6);
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  });

  return doc.output('blob');
}

export function pdfPlanning(state: RegieState): Promise<Blob> {
  return rendre(blocsPlanning(state), `${state.nom} — planning`);
}

export function pdfFeuillesDeRoute(state: RegieState): Promise<Blob> {
  return rendre(blocsFeuilles(state), `${state.nom} — feuilles de route`);
}
