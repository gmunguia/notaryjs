import assert from 'assert'
import { sign, addTypeClass } from '../src/notary'

const ID = x => x
const IGNORE = {
  string: () => 'foo',
  number: () => 1,
  object: () => ({})
}

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
        }, SyntaxError)
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
        }, TypeError)
      })
    })

    it('should throw if signature types don\'t match actual types', () => {
      // todo: add more cases.
      const fn = sign({}, 'string->string', x => x)
      assert.doesNotThrow(() => { fn('foo') })
      assert.throws(() => { fn(1) }, TypeError)
    })

    it('should throw if variable types are not consistent', () => {
      const badInputs = [
        ['a->a', IGNORE.object, ['a']],
        ['a->a', IGNORE.string, [1]],
        ['a->a->b', IGNORE.string, [1, 'a']],
        ['a->b->a', IGNORE.string, [1, 'a']],
      ]

      badInputs.forEach(([sig, fn, args]) => {
        assert.throws(() => {
          sign({}, sig, fn)(...args)
        }, TypeError)
      })
    })

    it('should throw if type class has not been defined', () => {
      assert.throws(() => {
        sign({}, 'foo a => a->a', IGNORE.object)({})
      }, ReferenceError)
    })

    it('should throw if constraints are not met', () => {
      // todo: reuse code, add cases.
      const typeClasses = addTypeClass({}, 'foo', { foo: '' })
      assert.throws(() => {
        sign(typeClasses, 'foo a => a->a', () => ({ foo: '' }))({})
      }, TypeError)
      assert.throws(() => {
        sign(typeClasses, 'foo a => a->a', IGNORE.object)({ foo: '' })
      }, TypeError)
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
        [tc, 'number -> number',        IGNORE.number,      [1]],
        [tc, 'string -> number',        IGNORE.number,      ['a']],
        [tc, 'number -> a -> number',   IGNORE.number,      [1, 'a']],
        [tc, 'a -> string -> a',        IGNORE.number,      [1, 'a']],
        [tc, 'a -> b -> a',             IGNORE.number,      [1, 'a']],
        [tc, 'a -> b -> b',             IGNORE.string,      [1, 'a']],
        [tc, 'x a => a -> b -> b',      IGNORE.string,      [{ x: '' }, 'a']],
        [tc, 'x a, x b => a -> b -> b', () => ({ x: '' } ), [{ x: '' }, { x: '' }]],
      ]

      goodInputs.forEach(([typeClasses, sig, fn, args]) => {
        assert.doesNotThrow(() => {
          sign(typeClasses, sig, fn)(...args)
        })
      })
    })

  })
})
