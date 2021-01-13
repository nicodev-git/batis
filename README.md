# Batis

[![][ci-badge]][ci-link] [![][version-badge]][version-link]
[![][license-badge]][license-link] [![][types-badge]][types-link]
[![][size-badge]][size-link]

[ci-badge]: https://github.com/clebert/batis/workflows/CI/badge.svg
[ci-link]: https://github.com/clebert/batis
[version-badge]: https://badgen.net/npm/v/batis
[version-link]: https://www.npmjs.com/package/batis
[license-badge]: https://badgen.net/npm/license/batis
[license-link]: https://github.com/clebert/batis/blob/master/LICENSE
[types-badge]: https://badgen.net/npm/types/batis
[types-link]: https://github.com/clebert/batis
[size-badge]: https://badgen.net/bundlephobia/minzip/batis
[size-link]: https://bundlephobia.com/result?p=batis

General reactive JavaScript programming using the idea of React Hooks.

<img src="./eagle.jpg"/>

## Installation

```
npm install batis --save
```

## Rationale

Even though [React Hooks](https://reactjs.org/docs/hooks-intro.html) are
actually a constrained solution for managing state and effects in functional
stateless components, they have proven to be very elegant in their design. In my
opinion, they are particularly suitable for modeling finite-state automata. I
wanted to use this type of reactive programming in areas other than web UI
development. Therefore I wrote Batis...

**Note:** With [Loxia](https://github.com/clebert/loxia), I try to shed more
light on the modeling of finite-state automata using Batis agents or React
Hooks.

## Terminology

There are two main entities in Batis, hosts and agents.

**By analogy with React, a host is like React DOM and an agent is like a
functional stateless component.**

An agent is comparable to a biological virus. A virus is dependent on a host
cell because it has no metabolism of its own. So, to use a functional stateless
agent, you need a host. A host manages the state and effects of an agent and
sends events to a listener function.

## Usage example

```js
import {Host} from 'batis';

const {useEffect, useMemo, useState} = Host;

function useGreeting(salutation) {
  const [name, setName] = useState('John Doe');

  useEffect(() => {
    if (name === 'John Doe') {
      setName('Jane Doe');
    }

    const timeoutId = setTimeout(() => setName('Johnny Doe'));

    return () => clearTimeout(timeoutId);
  }, [name]);

  return useMemo(() => `${salutation}, ${name}!`, [salutation, name]);
}

const greeting = new Host(useGreeting, console.log);

greeting.render(['Hello']);
greeting.render(['Welcome']);
greeting.reset();
greeting.render(['Hi']);
greeting.render(['Hey']);
```

```
{ type: 'value', value: 'Hello, John Doe!', async: false, intermediate: true }
{ type: 'value', value: 'Hello, Jane Doe!', async: false, intermediate: false }
{ type: 'value', value: 'Welcome, Jane Doe!', async: false, intermediate: false }
{ type: 'reset' }
{ type: 'value', value: 'Hi, John Doe!', async: false, intermediate: true }
{ type: 'value', value: 'Hi, Jane Doe!', async: false, intermediate: false }
{ type: 'value', value: 'Hey, Jane Doe!', async: false, intermediate: false }
{ type: 'value', value: 'Hey, Johnny Doe!', async: true, intermediate: false }
```

### Testing React/Preact Hooks

You can use Batis to test your React/Preact implemented Hooks, as long as the
Hooks you are testing only use the subset of React Hooks implemented by Batis. A
test with [Jest](https://jestjs.io) can be set up as follows:

<details>
  <summary>Show code</summary>

```js
import {Host} from 'batis';
```

```js
import * as React from 'react';

jest.mock('react', () => ({...React, ...Host}));
```

```js
jest.mock('preact/hooks', () => Host);
```

</details>

## API reference

The [React Hooks API reference](https://reactjs.org/docs/hooks-reference.html)
also applies to this library and should be consulted.

### Implementation status

Below you can see the subset of React Hooks implemented by Batis:

| React Hook                                   | Status                        |
| -------------------------------------------- | ----------------------------- |
| [`useState`][usestate]                       | ✅Implemented                 |
| [`useEffect`][useeffect]                     | ✅Implemented                 |
| [`useMemo`][usememo]                         | ✅Implemented                 |
| [`useCallback`][usecallback]                 | ✅Implemented                 |
| [`useRef`][useref]                           | ✅Implemented                 |
| [`useReducer`][usereducer]                   | ❌Not planned, see note below |
| [`useContext`][usecontext]                   | ❌Not planned                 |
| [`useImperativeHandle`][useimperativehandle] | ❌Not planned                 |
| [`useLayoutEffect`][uselayouteffect]         | ❌Not planned                 |
| [`useDebugValue`][usedebugvalue]             | ❌Not planned                 |

**Note:** The three primitives are `useState`, `useEffect`, and `useMemo`. For
example, `useCallback` and `useRef` are implemented using `useMemo` as
one-liners. In my opinion `useReducer` is rather special (due to the popularity
of Redux) and unlike `useCallback` and `useRef` not that widely used or
generally useful. Nevertheless, it can be implemented very easily by yourself
using `useState` and `useCallback`:

<details>
  <summary>Show code</summary>

```js
import {Host} from 'batis';

const {useCallback, useState} = Host;

function useReducer(reducer, initialArg, init) {
  const [state, setState] = useState(
    init ? () => init(initialArg) : initialArg
  );

  const dispatch = useCallback(
    (action) => setState((previousState) => reducer(previousState, action)),
    []
  );

  return [state, dispatch];
}
```

</details>

[usestate]: https://reactjs.org/docs/hooks-reference.html#usestate
[useeffect]: https://reactjs.org/docs/hooks-reference.html#useeffect
[usecontext]: https://reactjs.org/docs/hooks-reference.html#usecontext
[usereducer]: https://reactjs.org/docs/hooks-reference.html#usereducer
[usecallback]: https://reactjs.org/docs/hooks-reference.html#usecallback
[usememo]: https://reactjs.org/docs/hooks-reference.html#usememo
[useref]: https://reactjs.org/docs/hooks-reference.html#useref
[useimperativehandle]:
  https://reactjs.org/docs/hooks-reference.html#useimperativehandle
[uselayouteffect]: https://reactjs.org/docs/hooks-reference.html#uselayouteffect
[usedebugvalue]: https://reactjs.org/docs/hooks-reference.html#usedebugvalue

### Type definitions

```ts
class Host<TAgent extends AnyAgent> {
  static useState<TState>(
    initialState: TState | (() => TState)
  ): readonly [TState, SetState<TState>];

  static useEffect(effect: Effect, dependencies?: readonly unknown[]): void;

  static useMemo<TValue>(
    createValue: () => TValue,
    dependencies: readonly unknown[]
  ): TValue;

  static useCallback<TCallback extends (...args: any[]) => any>(
    callback: TCallback,
    dependencies: readonly unknown[]
  ): TCallback;

  static useRef<TValue>(
    initialValue: TValue
  ): {
    current: TValue;
  };

  constructor(agent: TAgent, listener: HostListener<TAgent>);

  render(args: Parameters<TAgent>): void;
  reset(): void;
}
```

```ts
type AnyAgent = (...args: any[]) => any;
```

```ts
type HostListener<TAgent extends AnyAgent> = (event: HostEvent<TAgent>) => void;
```

```ts
type HostEvent<TAgent extends AnyAgent> =
  | HostValueEvent<TAgent>
  | HostResetEvent
  | HostErrorEvent;

interface HostValueEvent<TAgent extends AnyAgent> {
  readonly type: 'value';
  readonly value: ReturnType<TAgent>;
  readonly async: boolean;
  readonly intermediate: boolean;
}

interface HostResetEvent {
  readonly type: 'reset';
}

interface HostErrorEvent {
  readonly type: 'error';
  readonly error: unknown;
  readonly async: boolean;
}
```

```ts
type SetState<TState> = (state: TState | CreateState<TState>) => void;
type CreateState<TState> = (previousState: TState) => TState;
```

```ts
type Effect = () => DisposeEffect | void;
type DisposeEffect = () => void;
```

## Development

<details>
  <summary>Publishing a new release</summary>

```
npm run release patch
```

```
npm run release minor
```

```
npm run release major
```

After a new release has been created by pushing the tag, it must be published
via the GitHub UI. This triggers the final publication to npm.

</details>

---

Copyright (c) 2020-2021, Clemens Akens. Released under the terms of the
[MIT License](https://github.com/clebert/batis/blob/master/LICENSE).
