const CONCRETE_TYPES = [
  'string',
  'number',
  'boolean',
  'object',
  'function',
  'symbol'
]

export function sign (typeClasses, signature, fn) {

  const {constraints, types} = parseSignature(signature)

  const typedFn = function (...args) {

    const constraintPredicates =
      constraintsToPredicates(typeClasses, constraints)

    checkSignature(constraintPredicates, args, types.slice(0, -1))
    const result = fn(...args)
    checkSignature(constraintPredicates, args.concat(result), types)
    return result
  }

  return typedFn
}

// todo: rethink name.
export function addTypeClass (typeClasses, name, constraint) {
  // todo: improve this to allow properties to lay in prototype chain.
  function objectToConstraint (a) {
    return function (b) {
      return Object.keys(a).every(k => b.hasOwnProperty(k))
    }
  }

  // todo: desired? add test in that case.
  if (typeClasses.hasOwnProperty(name)) {
    throw Error (`Type class '${name}' already exists.`)
  }

  typeClasses[name] = typeof constraint === 'function'
    ? constraint
    : objectToConstraint(constraint)

  return typeClasses
}

function constraintsToPredicates (typeClasses, constraints) {

  const predicates = {}

  // todo: improve readability. Flatmap it
  Object.keys(constraints).forEach(typeVariableName => {

    predicates[typeVariableName] = predicates[typeVariableName] || []

    constraints[typeVariableName].forEach(typeClassName => {

      if (!typeClasses.hasOwnProperty(typeClassName)) {
        throw ReferenceError(`type class not found: ${typeClassName}`)
      }

      predicates[typeVariableName].push(typeClasses[typeClassName])
    })
  })

  return predicates
}

// string -> { constraints: {}, types: [string] }
function parseSignature (signature) {
  const [,, unparsedConstraints, unparsedTypes] =
    signature.match(/^((.*)=>)?(.*)$/)

  checkSignatureIntegrity(unparsedConstraints, unparsedTypes)

  // eg: { a: ['Num', 'Ord'], b: ['Ord'], ... }
  const constraints = unparsedConstraints === undefined
    ? {}
    : parseConstraints(unparsedConstraints)
  // todo: check typeClasses exist.

  const types = unparsedTypes
    .replace(/\s/g, '')
    .split('->')

  return {constraints, types}
}

function checkSignatureIntegrity (unparsedConstraints, unparsedTypes) {
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

function checkSignature (constraints, values, signature) {
  checkTypes(inferTypes(values), signature)
  checkTypeVariableConsistancy(inferTypes(values), signature)
  checkConstraints(constraints, values, signature)
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

function checkTypeVariableConsistancy (actualTypes, signatureTypes) {
  const typeVariables = {}

  zip(signatureTypes, actualTypes)
    .forEach(([st, at]) => {
      if (isConcreteType(st)) return
      typeVariables[st] = typeVariables[st] || at
      if (typeVariables[st] !== at) {
        throw new TypeError(
          `Inconsistent type variable: expected ${st}, got ${at}`)
      }
    })
}

function checkConstraints (constraints, actualValues, signatureTypes) {

  const signatureTypesConstraints = signatureTypes
    .map(st => constraints[st] || [])

  const unmetConstraints = zip(actualValues, signatureTypesConstraints)
    .filter(([av, stcs]) => stcs.some(stc => !stc(av)))

  if (unmetConstraints.length) {
    throw new TypeError(
      `Unmet class constraints: ${JSON.stringify(unmetConstraints)}`)
  }
}

function inferTypes (actualValues) {
  return actualValues.map(av => typeof av)
}

function isConcreteType (type) {
  return CONCRETE_TYPES.includes(type)
}

function zip (a, b) {
  return a.map((e, i) => [e, b[i]])
}
