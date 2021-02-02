import {areDependenciesEqual} from './are-dependencies-equal';
import {isFunction} from './is-function';
import {
  Effect,
  EffectMemoryCell,
  MemoMemoryCell,
  Memory,
  SetState,
  StateMemoryCell,
} from './memory';
import {microtask} from './microtask';

export type AnyHook = (...args: any[]) => any;

export type HostEventListener<THook extends AnyHook> = (
  event: HostEvent<THook>
) => void;

export type HostEvent<THook extends AnyHook> =
  | HostRenderingEvent<THook>
  | HostResetEvent
  | HostErrorEvent;

export interface HostRenderingEvent<THook extends AnyHook> {
  readonly type: 'rendering';
  readonly result: ReturnType<THook>;

  /**
   * The interim results are sorted in descending order.
   */
  readonly interimResults: readonly ReturnType<THook>[];

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly reason?: undefined;
}

/**
 * The host has lost its state and all side effects have been cleaned up.
 * The next rendering will start from scratch.
 */
export interface HostResetEvent {
  readonly type: 'reset';

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly result?: undefined;

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly interimResults?: undefined;

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly reason?: undefined;
}

/**
 * The host has lost its state and all side effects have been cleaned up.
 * The next rendering will start from scratch.
 */
export interface HostErrorEvent {
  readonly type: 'error';
  readonly reason: unknown;

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly result?: undefined;

  /**
   * Allows convenient access without discriminating the event by type.
   */
  readonly interimResults?: undefined;
}

let activeHost: Host<AnyHook> | undefined;
let rendering = false;

function getActiveHost(): Host<AnyHook> {
  if (!activeHost) {
    throw new Error('A Hook cannot be used without a host.');
  }

  return activeHost;
}

export class Host<THook extends AnyHook> {
  static createRenderingEvent<THook extends AnyHook>(
    result: ReturnType<THook>,
    ...interimResults: readonly ReturnType<THook>[]
  ): HostRenderingEvent<THook> {
    return {type: 'rendering', result, interimResults};
  }

  static createResetEvent(): HostResetEvent {
    return {type: 'reset'};
  }

  static createErrorEvent(reason: unknown): HostErrorEvent {
    return {type: 'error', reason};
  }

  static useState<TState>(
    initialState: TState | (() => TState)
  ): readonly [TState, SetState<TState>] {
    const host = getActiveHost();

    let memoryCell = host.#memory.read<StateMemoryCell<TState>>('state');

    if (!memoryCell) {
      memoryCell = host.#memory.write({
        type: 'state',
        setState: (state) => {
          memoryCell!.stateChanges = [...memoryCell!.stateChanges, state];

          if (!rendering) {
            microtask()
              .then(() => host.#renderAsynchronously())
              .catch();
          }
        },
        state: isFunction(initialState) ? initialState() : initialState,
        stateChanges: [],
      });
    }

    host.#memory.movePointer();

    return [memoryCell.state, memoryCell.setState];
  }

  static useEffect(effect: Effect, dependencies?: readonly unknown[]): void {
    const host = getActiveHost();
    const memoryCell = host.#memory.read<EffectMemoryCell>('effect');

    if (!memoryCell) {
      host.#memory.write({
        type: 'effect',
        outdated: true,
        effect,
        dependencies,
      });
    } else if (
      !areDependenciesEqual(memoryCell.dependencies, dependencies) ||
      memoryCell.outdated
    ) {
      memoryCell.outdated = true;
      memoryCell.effect = effect;
      memoryCell.dependencies = dependencies;
    }

    host.#memory.movePointer();
  }

  static useMemo<TValue>(
    createValue: () => TValue,
    dependencies: readonly unknown[]
  ): TValue {
    const host = getActiveHost();

    let memoryCell = host.#memory.read<MemoMemoryCell<TValue>>('memo');

    if (!memoryCell) {
      memoryCell = host.#memory.write({
        type: 'memo',
        value: createValue(),
        dependencies,
      });
    } else if (!areDependenciesEqual(memoryCell.dependencies, dependencies)) {
      memoryCell.value = createValue();
      memoryCell.dependencies = dependencies;
    }

    host.#memory.movePointer();

    return memoryCell.value;
  }

  static useCallback<TCallback extends (...args: any[]) => any>(
    callback: TCallback,
    dependencies: readonly unknown[]
  ): TCallback {
    return Host.useMemo(() => callback, dependencies);
  }

  static useRef<TValue>(initialValue: TValue): {current: TValue} {
    return Host.useMemo(() => ({current: initialValue}), []);
  }

  readonly #memory = new Memory();
  readonly #hook: THook;
  readonly #eventListener: HostEventListener<THook>;

  #args: Parameters<THook> | undefined;

  constructor(hook: THook, eventListener: HostEventListener<THook>) {
    this.#hook = hook;
    this.#eventListener = eventListener;
  }

  render(...args: Parameters<THook>): void {
    this.#args = args;

    try {
      this.#render();
    } catch (reason: unknown) {
      this.#memory.reset(true);
      this.#eventListener(Host.createErrorEvent(reason));
    }
  }

  /**
   * Reset the state and clean up all side effects.
   * The next rendering will start from scratch.
   */
  reset(): void {
    this.#memory.reset(true);
    this.#eventListener(Host.createResetEvent());
  }

  readonly #renderAsynchronously = (): void => {
    try {
      if (this.#memory.applyStateChanges()) {
        this.#render();
      }
    } catch (reason: unknown) {
      this.#memory.reset(true);
      this.#eventListener(Host.createErrorEvent(reason));
    }
  };

  readonly #render = (): void => {
    try {
      rendering = true;

      let results: [ReturnType<THook>, ...ReturnType<THook>[]] | undefined;

      do {
        do {
          try {
            activeHost = this;

            const result = this.#hook(...this.#args!);

            if (results) {
              results.unshift(result);
            } else {
              results = [result];
            }
          } finally {
            activeHost = undefined;
          }

          this.#memory.reset();
        } while (this.#memory.applyStateChanges());

        this.#memory.triggerEffects();
      } while (this.#memory.applyStateChanges());

      this.#eventListener(
        Host.createRenderingEvent<THook>(results[0], ...results.slice(1))
      );
    } finally {
      rendering = false;
    }
  };
}
