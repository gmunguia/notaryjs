
export default function notary (typeClasses = {}) {
  const processedTypeClasses = {}

  Object.keys(typeClasses)
    .map(tcn => [tcn, typeClasses[tcn]])
    .forEach(([name, behavior]) => {
      processedTypeClasses[name] = typeof behavior === 'function'
        ? behavior
        : objectToPredicate(behavior)
    })

  function objectToPredicate (a) {
    return function (b) {
      return Object.keys(a).every(k => k in b)
    }
  }

  return sign.bind(undefined, processedTypeClasses)
}

function sign (typeClasses, signature, fn) {

  const {constraints, types} = parseSignature(signature)

  const typedFn = function (...args) {
    checkSignature(typeClasses, constraints, types.slice(0, -1), args)
    const result = fn(...args)
    checkSignature(typeClasses, constraints, types, args.concat(result))
    return result
  }

  return typedFn
}



// ----------------------------------------------------------------------------
// Parsing.
// ----------------------------------------------------------------------------

// Signature = 'Num a, Ord a, Num b => string -> ...'
// { constraints: { a: [Num, Ord], b: [Num], ... }, types: ['string', ...] }
function parseSignature (signature) {
  const [,, unparsedConstraints, unparsedTypes] =
    signature.match(/^((.*)=>)?(.*)$/)

  checkSignatureSyntax(unparsedConstraints, unparsedTypes)

  // eg: { a: ['Num', 'Ord'], b: ['Ord'], ... }
  const constraints = unparsedConstraints === undefined
    ? {}
    : parseConstraints(unparsedConstraints)

  const types = unparsedTypes
    .replace(/\s/g, '')
    .split('->')
    .filter(type => type !== '()')

  return {constraints, types}
}

function checkSignatureSyntax (unparsedConstraints, unparsedTypes) {
  if (!unparsedTypes || unparsedTypes.trim().length === 0) {
    throw new SyntaxError(
      `Malformed signature. Empty type list in signature '
      ${unparsedConstraints}=>${unparsedTypes}'`)
  }

  if (/[^\w\s(->)(\(\))\[\]]/.test(unparsedTypes)) {
    throw new SyntaxError(
      `Malformed signature. Invalid characters in type list '${unparsedTypes}'`)
  }

  unparsedTypes
    .split('')
    .reduce((count, char) => {
      if (char === '[') ++count
      if (char === ']') --count
      if ((char === '-' && count !== 0) || count < 0) {
        throw new SyntaxError(
          `Malformed signature.
          Invalid use of brackets in type list '${unparsedTypes}'`)
      }
      return count
    }, 0)

  if (unparsedTypes.split('->').length < 2) {
    throw new SyntaxError(
      `Malformed signature. Too few types in type list '${unparsedTypes}'`)
  }

  if (!unparsedConstraints) return

  if (/[^\w\s,]/.test(unparsedConstraints)) {
    throw new SyntaxError(
      `Malformed signature.
      Invalid characters in class constraints '${unparsedConstraints}'`)
  }

  unparsedConstraints
    .split(',')
    .map(c => c.split(' ').filter(x => x !== ''))
    .forEach(c => {
      if (c.length !== 2) {
        throw SyntaxError(
          `Malformed signature. Malformed class constraint in signature
          '${unparsedConstraints}=>${unparsedTypes}'`)
      }
    })
}

// 'Num a, Ord a, Num b' -> { a: ['Num', 'Ord'], b : ['Num'] }
function parseConstraints (unparsedConstraints) {

  const constraintsList = unparsedConstraints
    .split(',')
    // Split, remove empty elements caused by multiple consecutive spaces.
    .map(c => c.split(' ').filter(x => x !== ''))
    // Prepare for turning into dictionary.
    .map(([v, k]) => [k, v])

  return toDictionary(constraintsList)

  function toDictionary (a) {
    const dict = {}
    a.forEach(([k, v]) => {
      dict[k] = dict[k] || []
      dict[k].push(v)
    })
    return dict
  }
}



// ----------------------------------------------------------------------------
// Checking.
// ----------------------------------------------------------------------------

const CONCRETE_TYPES = [
  'string',
  'number',
  'boolean',
  'object',
  'function',
  'symbol'
]

function checkSignature (typeClasses, constraints, expectedTypes, values) {
  const actualTypes = values.map(av => typeof av)

  checkTypes(actualTypes, expectedTypes)
  checkTypeVariableConsistancy(actualTypes, expectedTypes)
  checkConstraints(typeClasses, constraints, values, expectedTypes)
}

function checkTypes (actualTypes, expectedTypes) {
  if (actualTypes.length !== expectedTypes.length) {
    throw new TypeError(
      `Type list doesn't match actual values. Bad type count:
      expected ${expectedTypes.length}, got ${actualTypes.length}`)
  }

  zip(actualTypes, expectedTypes)
    .forEach(([at, et]) => {
      // Type variable consistancy is not checked here.
      if (!isConcreteType(et)) return
      if (at !== et) {
        throw new TypeError(
          `Type list doesn't match actual values. Wrong types:
          expected ${et}, got ${at}`)
      }
    })
}

function checkTypeVariableConsistancy (actualTypes, expectedTypes) {
  const typeVariables = {}

  zip(actualTypes, expectedTypes)
    .forEach(([at, et]) => {
      if (isConcreteType(et)) return
      typeVariables[et] = typeVariables[et] || at
      if (typeVariables[et] !== at) {
        throw new TypeError(
          `Inconsistent type variable: expected ${et}, got ${at}`)
      }
    })
}

function isConcreteType (type) {
  return CONCRETE_TYPES.includes(type)
}

// typeClasses = { Num: fn(x), Ord: fn(x), ... }
// constraints = { a: [Num, Ord], b: [Num], ... }
// values = [ ...args, fn(...args) ] | [ ...args ]
// expectedTypes = [ 'a', 'string', 'b', ... ]
function checkConstraints (typeClasses, constraints, values, expectedTypes) {

  zip(values, expectedTypes)
    .forEach(([v, et]) => {
      const expectedTypeClasses = constraints[et] || []
      expectedTypeClasses
        .forEach(etc => {
          if (typeClasses[etc] === undefined) {
            throw new ReferenceError(
              `Type class not found: ${etc}`
            )
          }

          const predicate = typeClasses[etc]
          if (!predicate(v)) {
            throw new TypeError(
              `Unmet class constraint:
              type variable ${et} should implement ${etc}`
            )
          }
        })
    })
}

function zip (a, b) {
  return a.map((e, i) => [e, b[i]])
}
