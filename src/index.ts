import {areDependenciesEqual} from './are-dependencies-equal';
import {isFunction} from './is-function';
import {
  CreateState,
  DisposeEffect,
  Effect,
  EffectMemoryCell,
  MemoMemoryCell,
  Memory,
  SetState,
  StateMemoryCell,
} from './memory';

export {CreateState, DisposeEffect, Effect, SetState};

export type AnyAgent = (...args: any[]) => any;

export type HostListener<TAgent extends AnyAgent> = (
  event: HostEvent<TAgent>
) => void;

export type HostEvent<TAgent extends AnyAgent> =
  | HostValueEvent<TAgent>
  | HostResetEvent
  | HostErrorEvent;

export interface HostValueEvent<TAgent extends AnyAgent> {
  readonly type: 'value';
  readonly value: ReturnType<TAgent>;
  readonly async: boolean;
  readonly intermediate: boolean;
}

export interface HostResetEvent {
  readonly type: 'reset';
}

export interface HostErrorEvent {
  readonly type: 'error';
  readonly error: unknown;
  readonly async: boolean;
}

let activeHost: Host<AnyAgent> | undefined;

export class Host<TAgent extends AnyAgent> {
  static useState<TState>(
    initialState: TState | (() => TState)
  ): readonly [TState, SetState<TState>] {
    const host = activeHost!;

    let memoryCell = host.#memory.read<StateMemoryCell<TState>>('state');

    if (!memoryCell) {
      memoryCell = host.#memory.write({
        type: 'state',
        setState: (state) => {
          memoryCell!.stateChanges = [...memoryCell!.stateChanges, state];

          if (host !== activeHost) {
            Promise.resolve()
              .then(() => host.#renderAsync())
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
    const host = activeHost!;
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
    const host = activeHost!;

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
  readonly #agent: TAgent;
  readonly #listener: HostListener<TAgent>;

  #args: Parameters<TAgent> | undefined;

  constructor(agent: TAgent, listener: HostListener<TAgent>) {
    this.#agent = agent;
    this.#listener = listener;
  }

  render(args: Parameters<TAgent>): void {
    this.#args = args;

    try {
      this.#render(false);
    } catch (error: unknown) {
      this.#memory.reset(true);
      this.#listener({type: 'error', error, async: false});
    }
  }

  reset(): void {
    this.#memory.reset(true);
    this.#listener({type: 'reset'});
  }

  readonly #renderAsync = (): void => {
    try {
      if (this.#memory.applyStateChanges()) {
        this.#render(true);
      }
    } catch (error: unknown) {
      this.#memory.reset(true);
      this.#listener({type: 'error', error, async: true});
    }
  };

  readonly #render = (async: boolean): void => {
    let valueEvent: Omit<HostValueEvent<TAgent>, 'intermediate'> | undefined;

    do {
      do {
        if (valueEvent) {
          this.#listener({...valueEvent, intermediate: true});
        }

        try {
          activeHost = this;

          valueEvent = {
            type: 'value',
            value: this.#agent(...this.#args!),
            async,
          };
        } finally {
          activeHost = undefined;
        }

        this.#memory.reset();
      } while (this.#memory.applyStateChanges());

      this.#memory.triggerEffects();
    } while (this.#memory.applyStateChanges());

    this.#listener({...valueEvent, intermediate: false});
  };
}
