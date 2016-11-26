# notaryjs v0.2.0

Library allowing type checking of functions at runtime, using haskell-like function signatures.

## Install

For general usage, only the file notary.js is needed. You can just copy that one into your library folder.

Take into account the library is written in es6, so babel or another transpiler will be needed in most cases.

## Usage

### Basic: type signatures
```
import { sign } from '<path-to-library-folder>/notary'

const addNumbers = sign('number -> number -> number', (n, m) => n + m)

// The next call will work seamlessly.
const one = addNumbers(.5, .5)

// The next call will throw an error, warning about a signature violation.
const two = addNumbers('one', 1)
```

### Advanced: type classes
```
import { notary } from '<path-to-library-folder>/notary'

const sign = notary({
  int: i => typeof i === 'number' && i % 1 === 0
})

const addIntegers = sign('int i => i -> i -> i', (i, j) => i + j)

// The next call will work seamlessly.
const five = addIntegers(1, 4)

// The next call will throw an error, warning about signature violation.
const six = addIntegers(1.5, 4.5)
```

## API

### notary(typeClasses)
Initialize a notary, passing in an object containing all the type classes that will be used in signature constraints. The returned object will contain the `sign` function described later.

The first parameter must contain one key for each type class. Their values can either be:
* a function, which will be used to test whether a value matches the type class. It's first argument will be the value to test, and must return a truthy value if the test is passed, and a falsy value otherwise.
Example:
```
const sign = notary({
    letter: le => typeof le === 'string' && le.length === 1
})
```

* another object. In this case, values will match the type class if all the properties in the object are defined for them (or in their protoype chain).
Example:
```
const sign = notary({
    point: {
      x: 'x coordinate of the point',
      y: 'y coordinate of the point'
    }
})
```

### notary#sign(signature, function)
Creates a typed function. It's first argument is a string containing a haskell-like type signature, the second one is the function to be typed. It returns a function just like the one passed in, only this one will throw errors whenever the signature is violated.

Valid signatures must have the following structure:
```
[class constraints => ] parameter-type-1 -> parameter-type-2 -> ... -> return type
```
where class constraints are a list or type class, type variable pairs:
```
type-class-1 type-variable-1, type-class-2 type-variable-2, ...
```
Allowed types are:
* string
* number
* boolean
* function
* symbol
* object
* homogenous arrays: [[string]], [number], ...
* type variables (their name must not match any other type)

Examples:
```
const basicSign = notary()

const words = basicSign(
  'string -> [string]',
  str => str.split(' ').filter( w => w !== '' ).map( w => w.trim() )
)

const advancedSign = notary({
  functor: { fmap: '' }
})

const apply = advancedSign(
  'functor f => function -> f -> f',
  (callback, f) => f.fmap(callback)
)
```

## Testing

In order to test the library, just run `npm test`. Make sure you have installed all dependencies by running `npm install` first.
