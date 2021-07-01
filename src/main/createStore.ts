import {captureSnapshot, createProxy, IProxyOptions, isProxyable} from './surefire';
import {Apply, IStore} from './store-types';

export interface IStoreOptions extends IProxyOptions {
}

/**
 * Creates the new store object that encapsulates state and provides means of applying patches to it.
 */
export function createStore<State extends object>(initialState: State, options?: IStoreOptions): IStore<State> {
  const listeners = new Set<() => void>();

  let stackDepth = 0;
  let currState = initialState;
  let prevState = initialState;
  let listenersPending = false;

  const apply: Apply<State> = (patch) => {
    const proxy = createProxy(getState(), options);

    let result;
    try {
      stackDepth++;
      result = patch(proxy, apply);
    } finally {
      stackDepth--;
    }

    const resolve = (result: any) => {
      currState = captureSnapshot(proxy, getState());

      if (prevState !== currState) {
        if (stackDepth) {
          listenersPending = true;
        } else {
          prevState = currState;
          listenersPending = false;
          for (const listener of listeners) {
            listener();
          }
        }
      }
      if (result === proxy) {
        return currState;
      }
      if (isProxyable(result)) {
        return captureSnapshot(result);
      }
      return result;
    };

    if (result instanceof Promise) {
      result = result.then(resolve);
    } else {
      result = resolve(result);
    }

    if (!stackDepth && listenersPending) {
      listenersPending = false;
      for (const listener of listeners) {
        listener();
      }
    }
    return result;
  };

  const getState = () => currState;

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    apply,
    getState,
    subscribe,
  };
}
