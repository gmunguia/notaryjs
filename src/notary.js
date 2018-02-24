function notary (typeClasses = {}) {

  const processedTypeClasses = Object.keys(typeClasses)
    .map(tcn => [tcn, typeClasses[tcn]])
    .reduce( (ptc, [name, behavior]) => {
      ptc[name] = typeof behavior === 'function'
        ? behavior
        : objectToPredicate(behavior)

      return ptc
    }, {})

  function objectToPredicate (a) {
    return function (b) {
      return Object.keys(a).every(k => k in b)
    }
  }

  return signWithClasses.bind(undefined, processedTypeClasses)
}

function signWithClasses (typeClasses, signature, fn) {

  const {constraints, types} = parseCheckSignature(signature, typeClasses)

  const typedFn = function (...args) {
    try {
      checkSignature(typeClasses, constraints, types.slice(0, -1), args)
      const result = fn(...args)
      checkSignature(typeClasses, constraints, types, args.concat([result]))
      return result
    }
    catch (e) {
      e.message = `Failed checking signature '${signature}': ${e.message}`
      throw e
    }
  }

  return typedFn
}

export { notary }
export const sign = signWithClasses.bind(undefined, {})


// ----------------------------------------------------------------------------
// Parsing.
// ----------------------------------------------------------------------------

// Signature = 'Num a, Ord a, Num b => string -> ...'
// { constraints: { a: [Num, Ord], b: [Num], ... }, types: ['string', ...] }
function parseCheckSignature (signature, typeClasses) {
  const { constraints, types } = (function () {
    try {
      const { constraints, unparsedTypes } = parseConstraints(signature)
      const types = parseTypes(unparsedTypes)
      return { constraints, types }
    }
    catch (e) {
      e.message = `Malformed signature '${signature}': ${e.message}`
      throw e
    }
  }())

  // Make sure all type classes have been declared.
  Object.keys(constraints)
    .map(k => constraints[k])
    // Flatten array.
    .reduce( (allNames, thisNames) => allNames.concat(thisNames), [])
    .forEach(typeClassName => {
      if (!typeClasses.hasOwnProperty(typeClassName)) {
        throw ReferenceError(`Type class '${typeClassName}' is not defined.`)
      }
    })

  return {constraints, types}
}

// 'Num a, Ord a, Num b => a->a->b' -> {
//    constraints: { a: ['Num', 'Ord'], b : ['Num'] },
//    unparsedTypes: ' a->a->b'
// }
function parseConstraints (signature) {
  // Omit if no constraint block is found.
  if (!/=>/.test(signature)) return { constraints: {}, unparsedTypes: signature }

  const [unparsedTypes, constraints] = signature
    .split('')
    .reduce( ([buffer, constraints, finished], char) => {
      if (finished) return [buffer + char, constraints, true]

      switch (char) {
      case ',':
      case '=': {
        // Buffer must contain class-variable pair. Parse it and continue.
        const matches = buffer
          .trim()
          .match(/^(?:,\s*)?(\w+)\s+(\w+)$/)

        if (matches === null) {
          throw SyntaxError(`Cannot parse class constraint '${buffer}'.`)
        }

        const [, typeClassName, typeVariableName] = matches
        constraints[typeVariableName] = constraints[typeVariableName] || []
        constraints[typeVariableName].push(typeClassName)
        return [char, constraints, false]
      }
      case '>': {
        // Constraint block finished. Make sure arrow is not malformed and
        // set flag to skip the following iterations.
        if (buffer !== '=') {
          throw SyntaxError('Found extraneous \'>\' in class constraints.')
        }

        return ['', constraints, true]
      }
      default: {
        return [buffer + char, constraints, false]
      }
      }
    }, ['', {}, false])

  return { constraints, unparsedTypes }
}

function parseTypes (unparsedTypes) {
  const splittedUnparsedTypes = unparsedTypes
    .replace(/\s/g, '')
    .split('->')

  if (splittedUnparsedTypes.length < 2) {
    throw new SyntaxError('Type list too short. Expected at least two types.')
  }

  return splittedUnparsedTypes
    .filter(type => type !== '()')
    .map(ut => {
      const matches = ut.match(/^\[*([\w]*)\]*$/)
      // todo: do this check in syntax checking.
      if (matches === null) {
        throw new SyntaxError(`Cannot parse type '${ut}'.`)
      }

      const [, baseType] = matches
      const depthLeft = ut.split('[').length - 1
      const depthRight = ut.split(']').length - 1

      if (depthLeft !== depthRight) {
        throw new SyntaxError(`Unbalanced brackets in type '${ut}'.`)
      }

      return createType(baseType, depthLeft)
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
          expected ${et}, got ${v}.`
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
    return createType(typeof value)
  }

  // Corner case: array is empty; can't infer it's type.
  // 'undefined' is used as wildcard.
  if (!value.length) return createType('undefined', 1)

  const typeOfFirstElement = inferType(value[0])

  const typeOfElements = value.map(inferType)
  if (!isArrayHomogeneous(typeOfElements, compareTypes)) {
    // Treat Unhomogeneous arrays as objects.
    return createType('object')
  }

  return createType(typeOfFirstElement.baseType, typeOfFirstElement.depth + 1)
}

function compareTypes (a, b) {
  return a.baseType === b.baseType && a.depth === b.depth
    // Corner case: array was empty; couldn't infer type, so it matches anything.
    || a.baseType === 'undefined' && a.depth <= b.depth
    || b.baseType === 'undefined' && b.depth <= a.depth
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
      return [vn, cn, typeClasses[cn]]
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

function createType (baseType, depth = 0) {
  return {
    baseType,
    depth,
    toString() {
      const { depth, baseType } = this
      const leftBrackets = range(depth).map(() => '[')
      const rightBrackets = range(depth).map(() => ']')
      return `${leftBrackets}${baseType}${rightBrackets}`
    }
  }
}
