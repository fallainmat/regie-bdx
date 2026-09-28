import { parseState } from './import';
import { blankState } from './seed';

describe('parseState — champ roles', () => {
  it('accepte une sauvegarde antérieure, sans le champ', () => {
    const { roles, ...ancien } = blankState();
    expect(parseState(ancien).roles).toEqual({});
  });

  it('préserve les désignations existantes', () => {
    const sauvegarde = { ...blankState(), roles: { 's-1': { captation: 'p-1' } } };
    expect(parseState(sauvegarde).roles).toEqual({ 's-1': { captation: 'p-1' } });
  });
});
