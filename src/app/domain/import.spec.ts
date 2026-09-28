import { parseState } from './import';
import { blankState } from './seed';

describe('parseState — champ captation', () => {
  it('accepte une sauvegarde antérieure, sans le champ', () => {
    const { captation, ...ancien } = blankState();
    expect(parseState(ancien).captation).toEqual({});
  });

  it('préserve les désignations existantes', () => {
    const sauvegarde = { ...blankState(), captation: { 's-1': 'p-1' } };
    expect(parseState(sauvegarde).captation).toEqual({ 's-1': 'p-1' });
  });
});
