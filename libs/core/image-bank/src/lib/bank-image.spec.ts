import { formatLicense } from './bank-image';

describe('formatLicense', () => {
  it('met en forme une licence Creative Commons', () => {
    expect(formatLicense('by', '2.0')).toBe('CC BY 2.0');
    expect(formatLicense('by-nc-sa', '4.0')).toBe('CC BY-NC-SA 4.0');
  });

  it('traite à part les deux codes qui ne sont pas des licences', () => {
    // CC0 est une renonciation, et la marque du domaine public n'est pas une
    // licence : « CC PDM 1.0 » serait faux.
    expect(formatLicense('cc0', '1.0')).toBe('CC0 1.0');
    expect(formatLicense('pdm', '1.0')).toBe('Public Domain Mark');
  });

  it('se passe de la version quand la banque ne la donne pas', () => {
    expect(formatLicense('by', '')).toBe('CC BY');
  });
});
