import { fuzzyScore, segments } from './fuzzy';

/** Le texte reconstitué : le découpage ne doit jamais perdre un caractère. */
function joined(text: string, query: string): string {
  return segments(text, query)
    .map((part) => part.text)
    .join('');
}

/** Ce qui a été surligné, dans l'ordre. */
function marked(text: string, query: string): readonly string[] {
  return segments(text, query)
    .filter((part) => part.matched)
    .map((part) => part.text);
}

describe('fuzzyScore', () => {
  it('trouve malgré les lettres manquantes', () => {
    // C'est tout l'objet : on tape d'un pouce, en marchant, dans un rayon.
    expect(fuzzyScore('lat', 'Lait')).not.toBeNull();
    expect(fuzzyScore('choc', 'Chocolat noir')).not.toBeNull();
    expect(fuzzyScore('ptl', 'Papier toilette')).not.toBeNull();
  });

  it('ignore accents et casse', () => {
    // Personne ne tape l'accent aigu au supermarché.
    expect(fuzzyScore('cafe', 'Café')).toBe(1);
    expect(fuzzyScore('CRÈME', 'crème fraîche')).not.toBeNull();
  });

  it('écarte ce qui ne répond pas', () => {
    expect(fuzzyScore('xyz', 'Lait')).toBeNull();
  });

  it('classe la correspondance franche devant la lointaine', () => {
    const franche = fuzzyScore('pomme', 'Pommes');
    const lointaine = fuzzyScore('pomme', 'Pommes de terre');

    expect(franche).not.toBeNull();
    expect(lointaine).not.toBeNull();
    expect(franche as number).toBeGreaterThan(lointaine as number);
  });

  it('retient le meilleur des textes proposés', () => {
    // Chercher « vanille » doit retrouver « Yaourt / à la vanille » : c'est
    // précisément le cas qui motive la description.
    expect(fuzzyScore('vanille', 'Yaourt', 'à la vanille')).not.toBeNull();
    expect(fuzzyScore('vanille', 'Yaourt')).toBeNull();
  });

  it('laisse tout passer sur une saisie vide', () => {
    // Les appelants n'ont donc pas à traiter le cas à part, et le tri stable
    // conserve l'ordre d'usage qu'ils avaient déjà établi.
    expect(fuzzyScore('', 'Lait')).toBe(1);
    expect(fuzzyScore('   ', 'Lait')).toBe(1);
  });
});

describe('segments', () => {
  it('marque les lettres trouvées, et elles seules', () => {
    expect(marked('Lait', 'lat')).toEqual(['La', 't']);
  });

  it('marque sous les accents, sans décaler', () => {
    // Le repli qui rend « Café » cherchable ne doit pas déplacer les index :
    // c'est le texte d'origine qu'on surligne.
    expect(marked('Café moulu', 'cafe')).toEqual(['Café']);
  });

  it('ne coupe pas un emoji en deux', () => {
    // Un emoji occupe deux unités de code : le découper en ferait deux
    // losanges à l'écran.
    expect(joined('🍎 Pommes', 'pom')).toBe('🍎 Pommes');
    expect(marked('🍎 Pommes', 'pom')).toEqual(['Pom']);
  });

  it('rend le texte entier, quoi qu’il arrive', () => {
    for (const query of ['', '   ', 'xyz', 'vanille', 'v']) {
      expect(joined('Yaourt à la vanille', query)).toBe('Yaourt à la vanille');
    }
  });

  it('ne marque rien sans saisie ni correspondance', () => {
    expect(segments('Lait', '')).toEqual([{ text: 'Lait', matched: false }]);
    expect(segments('Lait', 'xyz')).toEqual([{ text: 'Lait', matched: false }]);
    expect(segments('', 'lait')).toEqual([{ text: '', matched: false }]);
  });
});
