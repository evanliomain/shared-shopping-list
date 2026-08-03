import { TranslatableError } from './translatable-error';

describe('TranslatableError', () => {
  it('reste identifiable dans une console ou un rapport de crash', () => {
    // La clé sert de `message` : une erreur qui remonte brute doit encore dire
    // de quoi elle parle, même sans couche de traduction.
    const error = new TranslatableError('errors.github.tokenInvalid');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('errors.github.tokenInvalid');
    expect(error.name).toBe('TranslatableError');
    expect(error.key).toBe('errors.github.tokenInvalid');
  });

  it('transporte les paramètres du libellé jusqu’à l’affichage', () => {
    const error = new TranslatableError('errors.github.repoNotFound', {
      owner: 'evan',
      repo: 'courses',
    });

    expect(error.params).toEqual({ owner: 'evan', repo: 'courses' });
  });

  it('n’oblige pas les couches basses à passer des paramètres', () => {
    // La plupart des messages n'en ont pas : `catch` doit rester lisible.
    expect(new TranslatableError('errors.scan.aborted').params).toEqual({});
  });
});
