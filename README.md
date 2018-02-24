[![npm version](https://img.shields.io/npm/v/notaryjs.svg)](https://www.npmjs.com/package/notaryjs)
[![CircleCI build](https://img.shields.io/circleci/project/github/gmunguia/notaryjs.svg)](https://circleci.com/gh/gmunguia/notaryjs/tree/master)

# notaryjs

Library allowing type checking of functions at runtime, using haskell-like function signatures.
Actually, a toy project for learning js back in the days.

## Install

`npm install --save notaryjs`

## Usage

### Basic: type signatures
```javascript
import { sign } from 'notaryjs'

const addNumbers = sign('number -> number -> number', (n, m) => n + m)

// The following call will work seamlessly.
const one = addNumbers(.5, .5)

// The following call will throw an error, warning about a signature violation.
const two = addNumbers('one', 1)
```

### Advanced: type classes
```javascript
import { notary } from 'notaryjs'

const sign = notary({
  int: i => typeof i === 'number' && i % 1 === 0
})

const addIntegers = sign('int i => i -> i -> i', (i, j) => i + j)

// The following call will work seamlessly.
const five = addIntegers(1, 4)

// The following call will throw an error, warning about signature violation.
const six = addIntegers(1.5, 4.5)
```

## API

### notary(typeClasses)
Create a sign function, passing in an object containing all the type classes that will be used in signature constraints. The returned `sign` function is described later.

The first parameter must contain one key for each type class. Their values can either be:
* a function, which will be used to test whether a value matches the type class. It's first argument will be the value to test, and must return a truthy value if the test is passed, and a falsy value otherwise.
Example:
```javascript
const sign = notary({
    letter: le => typeof le === 'string' && le.length === 1
})
```

* another object. In this case, values will match the type class if all the properties in the object are defined for them (or in their protoype chain).
Example:
```javascript
const sign = notary({
    point: {
      x: 'x coordinate of the point',
      y: 'y coordinate of the point'
    }
})
```

### sign(signature, function)
Creates a typed function. It's first argument is a string containing a haskell-like type signature, the second one is the function to be typed. It returns a function just like the one passed in, only this one will throw errors whenever the signature is violated. It can be used straight from the library for basic signatures, or previous creation with notary() for class-constrained signatures.

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
```javascript
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
