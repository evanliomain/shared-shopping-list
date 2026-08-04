import { AISLE_EMOJI, aisleOf, DEFAULT_AISLE } from './aisles';
import { emojiForAisle, normalize, suggestCategory } from './suggest';

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

  it.each([
    ['Semi-skimmed milk', 'cremerie'],
    ['Sourdough bread', 'boulangerie'],
    ['Minced beef', 'boucherie'],
    ['Smoked salmon', 'poissonnerie'],
    ['Toilet paper', 'hygiene'],
    ['Laundry detergent', 'entretien'],
    ['Nappies size 4', 'bebe'],
    ['Cat food', 'animaux'],
  ])('range « %s » au rayon %s', (label, aisle) => {
    // Le dictionnaire n'est pas traduit, il est fusionné : ce qu'on tape ne
    // suit pas la langue de l'interface.
    expect(suggestCategory(label).aisle).toBe(aisle);
  });

  it('préfère l’expression la plus spécifique', () => {
    // Sans le tri par spécificité, « pomme » capterait « pommes de terre » et
    // proposerait une image de pomme.
    expect(suggestCategory('Pommes de terre').emoji).toBe('🥔');
    expect(suggestCategory('Pommes').emoji).toBe('🍎');

    // Même arbitrage en anglais : « pepper » l'épice contre « bell pepper »
    // le légume.
    expect(suggestCategory('Bell peppers').aisle).toBe('fruits-legumes');
    expect(suggestCategory('Black pepper').aisle).toBe('epicerie-salee');
  });

  it('reconnaît les pluriels', () => {
    expect(suggestCategory('Carottes').aisle).toBe('fruits-legumes');
    expect(suggestCategory('Oeufs').aisle).toBe('cremerie');
    expect(suggestCategory('Carrots').aisle).toBe('fruits-legumes');
    // Pluriel irrégulier : il lui faut son entrée à lui.
    expect(suggestCategory('Tomatoes').aisle).toBe('fruits-legumes');
  });

  it('ne confond pas un mot avec une sous-chaîne', () => {
    // « ail » ne doit pas être trouvé dans « volaille ».
    expect(suggestCategory('Volaille fermière').aisle).toBe('boucherie');
    expect(suggestCategory('Ail').aisle).toBe('fruits-legumes');
  });

  it('retombe sur « divers » quand rien ne correspond', () => {
    const suggestion = suggestCategory('Cadeau anniversaire mamie');

    expect(suggestion.aisle).toBe(DEFAULT_AISLE);
    expect(suggestion.emoji).toBe(AISLE_EMOJI[DEFAULT_AISLE]);
  });

  it('avoue le repli au lieu de le faire passer pour une trouvaille', () => {
    // C'est ce drapeau qui décide d'aller chercher une image dans la banque :
    // le 🛒 de « divers » ne doit pas se faire passer pour un emoji trouvé.
    expect(suggestCategory('Cadeau anniversaire mamie').recognized).toBe(false);
    expect(suggestCategory('Carottes').recognized).toBe(true);
  });
});

describe('helpers de rayon', () => {
  it('donne l’emoji du rayon, avec repli sur « divers »', () => {
    expect(emojiForAisle('cremerie')).toBe('🧀');
    expect(emojiForAisle('rayon-inconnu')).toBe(AISLE_EMOJI[DEFAULT_AISLE]);
    expect(emojiForAisle('')).toBe(AISLE_EMOJI[DEFAULT_AISLE]);
  });

  it('ramène toute catégorie inconnue sur un rayon connu', () => {
    // Un produit venu d'un appareil plus récent doit rester affichable.
    expect(aisleOf('cremerie')).toBe('cremerie');
    expect(aisleOf('rayon-du-futur')).toBe(DEFAULT_AISLE);
    expect(aisleOf('')).toBe(DEFAULT_AISLE);
  });
});
