import assert from 'assert'
import { sign, addTypeClass } from '../src/notary'

const ID = x => x
const IGNORE = (result) => ( () => result )

describe('notary', () => {
  describe('#addTypeClass', () => {
    it('should extend a typeClass object, adding a new one (with its constraint)')
  })

  describe('#sign', () => {
    it('should throw if the signature is malformed', () => {
      const badSignatures = [
        '!foo->!bar', // It cannot contain special characters (but -=>_$).
        'foo=>bar=>baz', // It can only have one constraint block.
        'foo>-bar', // Arrow malformed.
        'foo bar>=a', // Arrow malformed.
        'foo bar=>[[a]->string', // Array malformed.
        'foo bar=>[[a]->string]', // Array malformed.
        'foo bar=>', // It must contain a type block.
        'foo,bar=>a', // Constraints must contain type class and type variable.
        'a', // Type block must have at least an arrow.
        '' // Signature cannet be empty.
      ]

      badSignatures.forEach(bs => {
        assert.throws(() => {
          sign({}, bs, ID)
        }, /Malformed signature/)
      })
    })

    it('should throw if the expected and actual number of types differ', () => {
      const badInputs = [
        ['a->a', ID, []],
        ['a->a->a', ID, ['a']],
        // ['()->a', x => x, ['a']]
      ]

      badInputs.forEach(([sig, fn, args]) => {
        assert.throws(() => {
          sign({}, sig, fn)(...args)
        }, /Type list doesn't match actual values\. Bad type count/)
      })
    })

    it('should throw if signature types don\'t match actual types', () => {
      const badInputs = [
        ['string->string', ID, [1]],
        ['number->string', ID, [1]],
        ['string->number', ID, ['a']],
        ['function->number', ID, [ID]],
        ['string->number->function', ID, ['a', 1]]
      ]

      badInputs.forEach(([sig, fn, args]) => {
        assert.throws(() => {
          sign({}, sig, fn)(...args)
        }, /Type list doesn't match actual values\. Wrong types/)
      })
    })

    it('should throw if variable types are not consistent', () => {
      const badInputs = [
        ['a->a', IGNORE({}), ['a']],
        ['a->a', IGNORE('a'), [1]],
        ['a->a->b', IGNORE('a'), [1, 'a']],
        ['a->b->a', IGNORE('a'), [1, 'a']],
      ]

      badInputs.forEach(([sig, fn, args]) => {
        assert.throws(() => {
          sign({}, sig, fn)(...args)
        }, /Inconsistent type variable/)
      })
    })

    it('should throw if type class has not been defined', () => {
      const typeClasses = addTypeClass({}, 'bar', ID)

      const badInputs = [
        [{}, 'foo a => a->a', IGNORE({}), [{}]],
        [typeClasses, 'foo a => a->a', IGNORE({}), [{}]],
      ]

      badInputs.forEach(([tc, sig, fn, args]) => {
        assert.throws(() => {
          sign(tc, sig, fn)(...args)
        }, /type class not found/)
      })
    })

    it('should throw if constraints are not met', () => {
      const typeClassesFoo = addTypeClass({}, 'foo', { foo: '' })
      const typeClassesBar = addTypeClass({}, 'bar', ID)

      const badInputs = [
        [typeClassesFoo, 'foo a => a->a', IGNORE({ foo: '' }), [{}]],
        [typeClassesFoo, 'foo a => a->a', IGNORE({}), [{ foo: '' }]],
        [typeClassesBar, 'bar a => a->a', IGNORE(1), [0]],
        [typeClassesBar, 'bar a => a->a', IGNORE(false), [true]],
      ]

      badInputs.forEach(([tc, sig, fn, args]) => {
        assert.throws(() => {
          sign(tc, sig, fn)(...args)
        }, /Unmet class constraints/)
      })
    })

    it('should not throw otherwise', () => {
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
        '[a]->[string]->[a]'
      ]

      goodSignatures.forEach(gs => {
        assert.doesNotThrow(() => {
          sign({}, gs, ID)
        })
      })

      const tc = addTypeClass({}, 'x', { x: '' })
      const goodInputs = [
        //[tc, '() -> number', x => 1, []],
        [tc, 'number -> number',        IGNORE(1),         [1]],
        [tc, 'string -> number',        IGNORE(1),         ['a']],
        [tc, 'number -> a -> number',   IGNORE(1),         [1, 'a']],
        [tc, 'a -> string -> a',        IGNORE(1),         [1, 'a']],
        [tc, 'a -> b -> a',             IGNORE(1),         [1, 'a']],
        [tc, 'a -> b -> b',             IGNORE('a'),       [1, 'a']],
        [tc, 'x a => a -> b -> b',      IGNORE('a'),       [{ x: '' }, 'a']],
        [tc, 'x a, x b => a -> b -> b', IGNORE({ x: '' }), [{ x: '' }, { x: '' }]],
      ]

      goodInputs.forEach(([typeClasses, sig, fn, args]) => {
        assert.doesNotThrow(() => {
          sign(typeClasses, sig, fn)(...args)
        })
      })
    })

  })
})
