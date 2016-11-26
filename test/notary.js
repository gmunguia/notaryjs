import assert from 'assert'
import { sign, notary } from '../src/notary'

describe('notary', () => {
  const ID = x => x
  const RETURN = (result) => ( () => result )

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
        sign(bs, ID)
      }, /Malformed signature/)
    })
  })

  it('should throw if the expected and actual number of types differ', () => {
    const badInputs = [
      ['a->a', ID, []],
      ['a->a->a', ID, ['a']],
      ['()->a', x => x, ['a']],
      ['()->[[number]]', RETURN([[1]]), [1]],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      assert.throws(() => {
        sign(sig, fn)(...args)
      }, /Type list doesn't match actual values\. Bad type count/)
    })
  })

  {
    const badInputs = [
      ['string->string', ID, [1]],
      ['number->string', ID, [1]],
      ['string->number', ID, ['a']],
      ['function->number', ID, [ID]],
      ['[function]->number', RETURN(1), [ID]],
      ['()->[number]', RETURN(1), []],
      ['()->[[number]]', RETURN([1]), []],
      ['string->number->function', ID, ['a', 1]],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      it('should throw if signature types don\'t match actual types', () => {
        assert.throws(() => {
          sign(sig, fn)(...args)
        }, /Type list doesn't match actual values\. Wrong types/)
      })
    })
  }

  {
    const badInputs = [
      ['a->a', RETURN({}), ['a']],
      ['a->a', RETURN('a'), [1]],
      ['a->a->b', RETURN('a'), [1, 'a']],
      ['a->b->a', RETURN('a'), [1, 'a']],
      ['[a]->b->a', RETURN([1]), [[1], 'a']],
      ['[a]->b->[a]', RETURN([[1]]), [[1], 'a']],
    ]

    badInputs.forEach(([sig, fn, args]) => {
      it('should throw if variable types are not consistent', () => {
        assert.throws(() => {
          sign(sig, fn)(...args)
        }, /Inconsistent type variable/)
      })
    })
  }

  {
    const typeClasses = { 'bar': ID }

    const badInputs = [
      [{}, 'foo a => a->a', RETURN({}), [{}]],
      [typeClasses, 'foo a => a->a', RETURN({}), [{}]],
    ]

    badInputs.forEach(([tc, sig, fn, args]) => {
      it('should throw if type class has not been defined', () => {
        assert.throws(() => {
          notary(tc)(sig, fn)(...args)
        }, /Type class '.*' is not defined/)
      })
    })
  }

  {
    const typeClassesFoo = { 'foo': { foo: '' } }
    const typeClassesBar = { 'bar': ID }

    const badInputs = [
      [typeClassesFoo, 'foo a => a->a', RETURN({ foo: '' }), [{}]],
      [typeClassesFoo, 'foo a => a->a', RETURN({}), [{ foo: '' }]],
      [typeClassesBar, 'bar a => a->a', RETURN(1), [0]],
      [typeClassesBar, 'bar a => a->a', RETURN(false), [true]],
      [typeClassesBar, 'bar a => [a]->[a]', RETURN([false]), [[true]]],
      //[typeClassesBar, 'bar a => [[a, a]]->[a]', RETURN([true]), [[true, false]]] tupples not (yet) allowed.
    ]

    badInputs.forEach(([tc, sig, fn, args]) => {
      it('should throw if constraints are not met', () => {
        assert.throws(() => {
          notary(tc)(sig, fn)(...args)
        }, /Unmet class constraint .* on type variable/)
      })
    })
  }

  {
    const tc = { a: RETURN(true), c: RETURN(true) }
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
          notary(tc)(gs, ID)
        })
      })
    })
  }

  {
    const tc = { x: { x: '' }, y: RETURN(true) }
    const goodInputs = [
      [tc, '() -> number',            RETURN(1),         []],
      [tc, '()->[[number]]',          RETURN([[1]]),     []],
      [tc, 'number -> number',        RETURN(1),         [1]],
      [tc, 'string -> number',        RETURN(1),         ['a']],
      [tc, 'number -> a -> number',   RETURN(1),         [1, 'a']],
      [tc, 'a -> string -> a',        RETURN(1),         [1, 'a']],
      [tc, 'a -> b -> a',             RETURN(1),         [1, 'a']],
      [tc, 'a -> b -> b',             RETURN('a'),       [1, 'a']],
      [tc, '[a] -> b -> a',           RETURN('a'),       [['b'], 1]],
      [tc, '[string] -> b -> string', RETURN('a'),       [['a'], 1]],
      [tc, '[string] -> b -> string', RETURN('a'),       [[], 1]],
      [tc, '[a] -> b -> a',           RETURN(1),         [[], 1]],
      [tc, '[[a]] -> b -> a',         RETURN(1),         [[], 1]],
      [tc, 'y a => a -> b -> b',      RETURN('a'),       [1, 'a']],
      [tc, 'x a => a -> b -> b',      RETURN('a'),       [{ x: '' }, 'a']],
      [tc, 'x a, x b => a -> b -> b', RETURN({ x: '' }), [{ x: '' }, { x: '' }]],
      //[tc, 'x a => [[a, a]] -> a',    RETURN({ x: '' }), [[[{ x: '' }, { x: '' }]]]] tuples not allowed yet.
    ]

    goodInputs.forEach(([typeClasses, sig, fn, args]) => {
      it('should not throw if values match signature', () => {
        assert.doesNotThrow(() => {
          notary(typeClasses)(sig, fn)(...args)
        })
      })
    })
  }

})
