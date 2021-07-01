/**
 * Selectors _must not_ do any computations and state mutations except null-checks. Their sole purpose is extract a
 * piece of data from the given state object. Use `store.apply` to apply changes to current state.
 */
export type Selector<State, SubState> = (state: State) => SubState;

/**
 * Executes `patch` callback with current state of the store.
 */
export type Apply<State extends object> = <Result>(patch: Patch<State, Result>) => Result;

/**
 * _Mutates_ given `state` and may apply other patches to `state` using `apply` callback.
 */
export type Patch<State extends object, Result = void> = (state: State, apply: Apply<State>) => Result;

export interface IStore<State extends object> {

  /**
   * Executes `patch` callback with current state of the store.
   */
  apply: Apply<State>;

  /**
   * Returns current state of the store.
   */
  getState(): State;

  /**
   * Subscribes listener to changes of the store's state. Listeners are invoked once after all synchronous `apply`s are
   * completed.
   *
   * @return The callback that unsubscribes the listener from changes.
   */
  subscribe(listener: () => void): () => void;
}
