import { Person, RegieState, Slot } from './model';
import { blankState } from './seed';
import { captationOf, isSalleConference } from './rules';

function person(id: string): Person {
  return { id, nom: id, email: '', role: '', tags: [], jours: [], maxCharge: 0, notes: '' };
}

function slot(id: string, over: Partial<Slot> = {}): Slot {
  return { id, jour: 'Jeudi 29', debut: 600, fin: 660, salle: 'Amphi A', titre: '', format: 'conference', besoin: 2, ...over };
}

function state(over: Partial<RegieState> = {}): RegieState {
  return { ...blankState(), people: [], slots: [], assign: {}, captation: {}, ...over };
}

describe('isSalleConference', () => {
  it('returns true for Amphi A', () => {
    expect(isSalleConference(slot('a', { salle: 'Amphi A' }))).toBe(true);
  });

  it('returns false for other rooms', () => {
    expect(isSalleConference(slot('b', { salle: 'Grand amphi' }))).toBe(false);
  });

  it('returns false for non-conference rooms', () => {
    expect(isSalleConference(slot('c', { salle: 'Lab' }))).toBe(false);
  });
});

describe('captationOf', () => {
  it('returns the person designated for captation if they are assigned to the slot', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p1', 'p2'] },
      captation: { s1: 'p1' },
    });
    expect(captationOf(st, s)).toBe('p1');
  });

  it('ignores a designation if the person is not assigned to the slot', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p2'] },
      captation: { s1: 'p1' },
    });
    expect(captationOf(st, s)).toBeNull();
  });

  it('ignores a stale designation when the person has left the slot', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1'), person('p2')],
      slots: [s],
      assign: { s1: ['p2'] },
      captation: { s1: 'p1' },
    });
    expect(captationOf(st, s)).toBeNull();
  });

  it('returns null when no captation is designated', () => {
    const s = slot('s1');
    const st = state({
      people: [person('p1')],
      slots: [s],
      assign: { s1: ['p1'] },
    });
    expect(captationOf(st, s)).toBeNull();
  });
});
