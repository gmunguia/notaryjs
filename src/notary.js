
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
  // todo: add explicit static check, check existance of typeClasses here.

  const typedFn = function (...args) {
    checkSignature(typeClasses, constraints, types.slice(0, -1), args)
    const result = fn(...args)
    checkSignature(typeClasses, constraints, types, args.concat([result]))
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

  const types = parseTypes(unparsedTypes)

  return {constraints, types}
}

function checkSignatureSyntax (unparsedConstraints, unparsedTypes) {
  if (!unparsedTypes || unparsedTypes.trim().length === 0) {
    throw new SyntaxError(
      `Malformed signature. Empty type list in signature '
      ${unparsedConstraints}=>${unparsedTypes}'`)
  }

  const simpleArrow = '-(?=>)'
  const emptyType = '\\((?\\)>)'
  const alphanumeric = 'A-Za-z0-9'
  const brackets = '\\[\\]'
  const disallowedChars = new RegExp(
    `[^${alphanumeric}${simpleArrow}${emptyType}${brackets}\\s]`)

  if (disallowedChars.test(unparsedTypes)) {
    throw new SyntaxError(
      `Malformed signature. Invalid characters in type list '${unparsedTypes}'`)
  }

  unparsedTypes
    .replace(/\s/g, '')
    .split('->')
    .filter(type => type !== '()')
    .forEach(ut => {
      const matches = ut.match(/^\[*([^\[\]]*)\]*$/)

      if (matches === null) {
        throw new SyntaxError(
          `Malformed signature.
          Invalid usage of brackets in type list '${unparsedTypes}'`)
      }
    })

  unparsedTypes
    .split('')
    .reduce((count, char) => {
      if (char === '[') return count + 1
      if (char === ']') return count - 1
      if ((char === '-' && count !== 0) || count < 0) {
        throw new SyntaxError(
          `Malformed signature.
          Unbalanced brackets in type list '${unparsedTypes}'`)
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

function parseTypes (unparsedTypes) {
  return unparsedTypes
    .replace(/\s/g, '')
    .split('->')
    .filter(type => type !== '()')
    .map(ut => {
      const matches = ut.match(/^\[*([^\[\]]*)\]*$/)
      // todo: do this check in syntax checking.
      if (matches === null) {
        throw new SyntaxError(
          `Uncaught syntax error in type list '${unparsedTypes}'`)
      }

      const baseType = matches[1]
      const depth = ut.split('[').length - 1

      return { baseType, depth }
    })
}



// ----------------------------------------------------------------------------
// Checking.
// ----------------------------------------------------------------------------

const CONCRETE_TYPES = [
  'undefined', // Matches anything. Used when type can't be infered.
  'string',
  'number',
  'boolean',
  'object',
  'function',
  'symbol'
]

function checkSignature (typeClasses, constraints, expectedTypes, values) {

  const actualTypes = values.map(inferType)

  checkTypes(actualTypes, expectedTypes)

  const typeVariableValues =
    extractTypeVariableValues(values, actualTypes, expectedTypes)

  checkTypeVariableConsistency(typeVariableValues)
  checkConstraints (typeClasses, constraints, typeVariableValues)
}

// returns { a: [ 'a', ['a'] ], b: [ 'b' ] }
// for arrays, only returns the first value.
function extractTypeVariableValues (values, actualTypes, expectedTypes) {

  return zip(values, actualTypes, expectedTypes)
    .reduce((typeVariableValues, [v, at, et]) => {
      if (!isTypeVariable(et)) return typeVariableValues

      typeVariableValues[et.baseType] =
        typeVariableValues[et.baseType] || []

      // If baseType is undefined, it's type couldn't be infered, so we can't
      // determine what value would be there in the array.
      if (et.depth > at.depth && at.baseType === 'undefined') {
        return typeVariableValues
      }

      // todo: get infered types as parameter to avoid calculating it again.
      // [[a]] can't match [string] (however, [a] can match [[string]]).
      if (et.depth > at.depth) {
        throw new TypeError(
          `Type list doesn't match actual values. Bad type depth:
          expected '${et}', got '${v}'.`
        )
      }

      typeVariableValues[et.baseType]
        .push(range(et.depth).reduce(v => v[0], v))

      return typeVariableValues
    }, {})
}

function checkTypes (actualTypes, expectedTypes) {
  if (actualTypes.length !== expectedTypes.length) {
    throw new TypeError(
      `Type list doesn't match actual values. Bad type count:
      expected ${expectedTypes.length}, got ${actualTypes.length}`)
  }

  zip(actualTypes, expectedTypes)
    .forEach(([at, et]) => {
      // Type variables are checked in checkTypeVariableConsistency().
      if (isTypeVariable(et)) return

      if (!compareTypes(at, et)) {
        throw new TypeError(
          `Type list doesn't match actual values. Wrong types:
          expected ${et}, got ${at}`)
      }
    })
}

// Checks all types of each type variable instance are the same.
// eg: 'a -> [a]' matches 'a'->['b'], but not 'a'->[1]
function checkTypeVariableConsistency (typeVariableValues) {

  Object.keys(typeVariableValues)
    .map(k => ([k, typeVariableValues[k]]))
    .map(([typeVariableName, typeVariableValues]) =>
      ([typeVariableName, typeVariableValues.map(inferType)]))
    .forEach(([typeVariableName, typeVariableTypes]) => {
      if (!isArrayHomogeneous(typeVariableTypes, compareTypes)) {
        throw new TypeError(
          `Inconsistent type variable '${typeVariableName}':
          expected homogenous types, got ${typeVariableTypes}.`
        )
      }
    })
}

// [['a']] -> { depth: 2, baseType: 'string' }
// 1 -> { depth: 0, baseType: 'number' }
// [] -> { depth: 1, baseType: 'undefined' }
function inferType (value) {
  if (!Array.isArray(value)) {
    return { depth: 0, baseType: typeof value }
  }

  // Corner case: array is empty; can't infer it's type.
  // 'undefined' is used as wildcard.
  if (!value.length) return { depth: 1, baseType: 'undefined' }

  const typeOfFirstElement = inferType(value[0])

  // Check homogeneity or array.
  const typeOfElements = value.map(inferType)
  // todo: treat Unhomogeneous arrays as objects, instead of throw.
  if (!isArrayHomogeneous(typeOfElements, compareTypes)) {
    throw new TypeError(`Unhomogeneous array: ${value}`)
  }

  return {
    depth: typeOfFirstElement.depth + 1,
    baseType: typeOfFirstElement.baseType
  }
}

function compareTypes (a, b) {
  // Corner case: array was empty; couldn't infer type, so it matches anything.
  if (a.baseType === 'undefined' && a.depth <= b.depth
      || b.baseType === 'undefined' && b.depth <= a.depth) {

    return true
  }
  return a.baseType === b.baseType && a.depth === b.depth
}

function isTypeVariable (type) {
  return !CONCRETE_TYPES.includes(type.baseType)
}

// typeClasses = { Num: fn(x), Ord: fn(x), ... }
// constraints = { a: [Num, Ord], b: [Num], ... }
// typeVariableValues = { a: ['a', 'b', 'c'], b: [1], c: [ [1, 2], [] ], ... }
function checkConstraints (typeClasses, constraints, typeVariableValues) {

  const variableNames = Object.keys(typeVariableValues)

  // Join all objects into a flat array of tuples like:
  // [ variable name, class name, predicate, value ]
  // Then, check whether all values pass their predicate.
  variableNames
    // Add type class names. (reduce is used as flatmap)
    .reduce((output, vn) => {
      const classNames = constraints[vn] || []
      return output.concat(
        classNames.map(cn => [vn, cn])
      )
    }, [])
    // Filter out type variables without constraints.
    .filter(x => x.length)
    // Add predicates.
    .map(( [vn, cn] ) => {
      const predicate = typeClasses[cn]
      if (predicate === undefined) {
        throw new ReferenceError(
          `Unmet class constraint '${cn}'. Type class is not defined.`
        )
      }
      return [vn, cn, predicate]
    })
    // Filter out type classes without predicates.
    .filter(( [,, p] ) => p)
    // Add values. (reduce is used as flatmap)
    .reduce(( output, [vn, cn, p] ) => {
      const values = typeVariableValues[vn]
      return output.concat(
        values.map(v => [vn, cn, p, v])
      )
    }, [])
    // Actually check predicates pass.
    .forEach(( [vn, cn, p, v] ) => {
      if (!p(v)) {
        throw new TypeError(
          `Unmet class constraint '${cn}', on type variable '${vn}'`
        )
      }
    })
}

function zip (a, ...bs) {
  if (bs.some(b => a.length !== b.length)) {
    throw Error('Can\'t zip arrays of different lengths')
  }

  return a.map( (e, i) => [e].concat(bs.map(b => b[i])) )
}

function range (n) {
  return Array.apply(undefined, Array(n)).map((_, i) => i)
}

function isArrayHomogeneous (array, compare) {
  return array.every(x => compare(x, array[0]))
}
