import { AISLE_INFO, DEFAULT_AISLE } from './aisles';
import {
  emojiForAisle,
  labelForAisle,
  normalize,
  suggestCategory,
} from './suggest';

describe('normalize', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalize('Crème Fraîche')).toBe('creme fraiche');
    expect(normalize('Pommes  de   terre')).toBe('pommes de terre');
    expect(normalize('Yaourt (x4)')).toBe('yaourt x4');
  });
});

describe('suggestCategory', () => {
  it.each([
    ['Lait demi-écrémé', 'cremerie'],
    ['Baguette', 'boulangerie'],
    ['Steak haché', 'boucherie'],
    ['Saumon fumé', 'poissonnerie'],
    ['Papier toilette', 'hygiene'],
    ['Lessive liquide', 'entretien'],
    ['Couches taille 4', 'bebe'],
    ['Croquettes pour le chat', 'animaux'],
  ])('range « %s » au rayon %s', (label, aisle) => {
    expect(suggestCategory(label).aisle).toBe(aisle);
  });

  it('préfère l’expression la plus spécifique', () => {
    // Sans le tri par spécificité, « pomme » capterait « pommes de terre » et
    // proposerait une image de pomme.
    expect(suggestCategory('Pommes de terre').emoji).toBe('🥔');
    expect(suggestCategory('Pommes').emoji).toBe('🍎');
  });

  it('reconnaît les pluriels', () => {
    expect(suggestCategory('Carottes').aisle).toBe('fruits-legumes');
    expect(suggestCategory('Oeufs').aisle).toBe('cremerie');
  });

  it('ne confond pas un mot avec une sous-chaîne', () => {
    // « ail » ne doit pas être trouvé dans « volaille ».
    expect(suggestCategory('Volaille fermière').aisle).toBe('boucherie');
    expect(suggestCategory('Ail').aisle).toBe('fruits-legumes');
  });

  it('retombe sur « divers » quand rien ne correspond', () => {
    const suggestion = suggestCategory('Cadeau anniversaire mamie');

    expect(suggestion.aisle).toBe(DEFAULT_AISLE);
    expect(suggestion.emoji).toBe(AISLE_INFO[DEFAULT_AISLE].emoji);
  });
});

describe('helpers de rayon', () => {
  it('donne emoji et libellé, avec repli sur « divers »', () => {
    expect(emojiForAisle('cremerie')).toBe('🧀');
    expect(labelForAisle('cremerie')).toBe('Crèmerie');

    expect(emojiForAisle('rayon-inconnu')).toBe(
      AISLE_INFO[DEFAULT_AISLE].emoji,
    );
    expect(labelForAisle('')).toBe(AISLE_INFO[DEFAULT_AISLE].label);
  });
});
