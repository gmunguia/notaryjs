import assert from 'assert'
import notary from '../src/notary'

describe('notary', () => {
  const ID = x => x
  const IGNORE = (result) => ( () => result )

  it('should throw if the signature is malformed', () => {
    const badSignatures = [
      '!foo->!bar', // It cannot contain special characters (but -=>_$).
      'foo=>bar=>baz', // It can only have one constraint block.
      'foo>-bar', // Arrow malformed.
      'foo bar>=a', // Arrow malformed.
      'foo bar=>[[a]->string', // Array malformed.
      'foo bar=>[[a]->string]', // Array malformed.
      'foo bar=>[[a]a]->string]', // Array malformed.
      'foo bar=>[a[a]]->string]', // Array malformed.
      'foo bar=>a[[a]]->string]', // Array malformed.
      'foo bar=>[[a, b]]->string]', // Tuples not allowed (yet).
      'foo bar=>', // It must contain a type block.
      'foo,bar=>a', // Constraints must contain type class and type variable.
      'a', // Type block must have at least an arrow.
      '' // Signature cannot be empty.
    ]

    badSignatures.forEach(bs => {
      assert.throws(() => {
        notary()(bs, ID)
      }, /Malformed signature/)
    })
  })

  it('should throw if the expected and actual number of types differ', () => {
    const badInputs = [
      ['a->a', ID, []],
      ['a->a->a', ID, ['a']],
      ['()->a', x => x, ['a']],
      ['()->[[number]]', IGNORE([[1]]), [1]],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      assert.throws(() => {
        notary()(sig, fn)(...args)
      }, /Type list doesn't match actual values\. Bad type count/)
    })
  })

  ;(function () {
    const badInputs = [
      ['string->string', ID, [1]],
      ['number->string', ID, [1]],
      ['string->number', ID, ['a']],
      ['function->number', ID, [ID]],
      ['[function]->number', IGNORE(1), [ID]],
      ['()->[number]', IGNORE(1), []],
      ['()->[[number]]', IGNORE([1]), []],
      ['string->number->function', ID, ['a', 1]],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      it('should throw if signature types don\'t match actual types', () => {
        assert.throws(() => {
          notary()(sig, fn)(...args)
        }, /Type list doesn't match actual values\. Wrong types/)
      })
    })
  }())

  ;(function () {
    const badInputs = [
      ['a->a', IGNORE({}), ['a']],
      ['a->a', IGNORE('a'), [1]],
      ['a->a->b', IGNORE('a'), [1, 'a']],
      ['a->b->a', IGNORE('a'), [1, 'a']],
      ['[a]->b->a', IGNORE([1]), [[1], 'a']],
      ['[a]->b->[a]', IGNORE([[1]]), [[1], 'a']],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      it('should throw if variable types are not consistent', () => {
        assert.throws(() => {
          notary()(sig, fn)(...args)
        }, /Inconsistent type variable/)
      })
    })
  }())

  ;(function () {
    const typeClasses = { 'bar': ID }

    const badInputs = [
      [{}, 'foo a => a->a', IGNORE({}), [{}]],
      [typeClasses, 'foo a => a->a', IGNORE({}), [{}]],
    ]

    badInputs.forEach(([tc, sig, fn, args]) => {
      it('should throw if type class has not been defined', () => {
        assert.throws(() => {
          notary(tc)(sig, fn)(...args)
        }, /Type class is not defined/)
      })
    })
  }())

  ;(function () {
    const typeClassesFoo = { 'foo': { foo: '' } }
    const typeClassesBar = { 'bar': ID }

    const badInputs = [
      [typeClassesFoo, 'foo a => a->a', IGNORE({ foo: '' }), [{}]],
      [typeClassesFoo, 'foo a => a->a', IGNORE({}), [{ foo: '' }]],
      [typeClassesBar, 'bar a => a->a', IGNORE(1), [0]],
      [typeClassesBar, 'bar a => a->a', IGNORE(false), [true]],
      [typeClassesBar, 'bar a => [a]->[a]', IGNORE([false]), [[true]]],
      //[typeClassesBar, 'bar a => [[a, a]]->[a]', IGNORE([true]), [[true, false]]] tupples not (yet) allowed.
    ]

    badInputs.forEach(([tc, sig, fn, args]) => {
      it('should throw if constraints are not met', () => {
        assert.throws(() => {
          notary(tc)(sig, fn)(...args)
        }, /Unmet class constraint .* on type variable/)
      })
    })
  }())

  ;(function () {
    const goodSignatures = [
      '() -> number',
      'number -> number',
      'number->number',
      'string->number',
      'a->string->number',
      'a->b->c',
      'a b=>c->d',
      'a b, c d=>e->f',
      '[a]->[a]',
      '[[a]]->[a]',
      //'[[a, b]]->[a]', tuples not allowed yet.
      //'foo a => [[a, b]]->[a]', tuples not allowed yet.
      '[a]->[string]->[a]',
    ]

    goodSignatures.forEach(gs => {
      it('should not throw if signature is properly formed', () => {
        assert.doesNotThrow(() => {
          notary()(gs, ID)
        })
      })
    })

    const tc = { x: { x: '' }, y: IGNORE(true) }
    const goodInputs = [
      [tc, '() -> number',            IGNORE(1),         []],
      [tc, '()->[[number]]',          IGNORE([[1]]),     []],
      [tc, 'number -> number',        IGNORE(1),         [1]],
      [tc, 'string -> number',        IGNORE(1),         ['a']],
      [tc, 'number -> a -> number',   IGNORE(1),         [1, 'a']],
      [tc, 'a -> string -> a',        IGNORE(1),         [1, 'a']],
      [tc, 'a -> b -> a',             IGNORE(1),         [1, 'a']],
      [tc, 'a -> b -> b',             IGNORE('a'),       [1, 'a']],
      [tc, '[a] -> b -> a',           IGNORE('a'),       [['b'], 1]],
      [tc, '[string] -> b -> string', IGNORE('a'),       [['a'], 1]],
      [tc, '[string] -> b -> string', IGNORE('a'),       [[], 1]],
      [tc, '[a] -> b -> a',           IGNORE(1),         [[], 1]],
      [tc, '[[a]] -> b -> a',         IGNORE(1),         [[], 1]],
      [tc, 'y a => a -> b -> b',      IGNORE('a'),       [1, 'a']],
      [tc, 'x a => a -> b -> b',      IGNORE('a'),       [{ x: '' }, 'a']],
      [tc, 'x a, x b => a -> b -> b', IGNORE({ x: '' }), [{ x: '' }, { x: '' }]],
      //[tc, 'x a => [[a, a]] -> a',    IGNORE({ x: '' }), [[[{ x: '' }, { x: '' }]]]] tuples not allowed yet.
    ]

    goodInputs.forEach(([typeClasses, sig, fn, args]) => {
      it('should not throw if values match signature', () => {
        assert.doesNotThrow(() => {
          notary(typeClasses)(sig, fn)(...args)
        })
      })
    })
  }())

})
