import {deleted, proxyTarget} from './symbols';
import {shallowClone} from './shallowClone';

/**
 * Size of pre-allocated traversal stack. Would be auto-increased if needed.
 */
const initialStackDepth = 30;

/**
 * Object that can be wrapped in `Proxy`.
 */
export type Proxyable = Record<PropertyKey, any>;

/**
 * Object wrapped in `Proxy`.
 */
export interface IProxy {
  [proxyTarget]: IProxyTarget;
}

/**
 * Backing object used by proxy to store patches and nested proxies.
 */
export interface IProxyTarget {

  /**
   * Original object.
   */
  source: Record<PropertyKey, any>;

  /**
   * Root proxy object from which which proxy derives.
   */
  origin: IProxy;

  /**
   * Circular reference to the proxy this target belongs to.
   */
  proxy: IProxy;

  /**
   * Callback that revokes proxy.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/revocable Proxy.revocable() on MDN}
   */
  revokeProxy: () => void;

  /**
   * Map from property name to a new literal, proxy or `Symbol(Surefire.deleted)` if property was deleted. For object
   * `source`s this is a plain object, for array `source`s this is an array. This is lazily created when first patch is
   * applied.
   */
  patches: Record<PropertyKey, any> | null;

  /**
   * When a property is read from `source` and it contains a proxyable value then a new proxy is created and stored in
   * this record. This is always a plain object. This is lazily created when any proxyable property is retrieved.
   */
  proxies: Record<PropertyKey, IProxy> | null;

  /**
   * Options provided on `createProxy` invocation.
   */
  options: IProxyOptions;
}

export interface IProxyOptions {

  /**
   * If set to `true` then if property is assigned the same value it already holds then no change would be produced.
   *
   * @default false
   */
  referenceCheck?: boolean;
}

/**
 * Default for proxy handler used by Surefire.
 */
const proxyHandler: ProxyHandler<IProxyTarget> = {
  getPrototypeOf: trapGetPrototypeOf,
  setPrototypeOf: trapSetPrototypeOf,
  isExtensible: trapIsExtensible,
  preventExtensions: trapPreventExtensions,
  getOwnPropertyDescriptor: trapGetOwnPropertyDescriptor,
  has: trapHas,
  get: trapGet,
  set: trapSet,
  deleteProperty: trapDeleteProperty,
  defineProperty: trapDefineProperty,
  ownKeys: trapOwnKeys,
  apply: trapApply,
  construct: trapConstruct,
};

function trapGetPrototypeOf(target: IProxyTarget): object | null {
  return Reflect.getPrototypeOf(target.source);
}

function trapSetPrototypeOf(target: IProxyTarget, value: any): boolean {
  throw new TypeError('Surefire does not support Object.setPrototypeOf');
}

function trapIsExtensible(target: IProxyTarget): boolean {
  return true;
}

function trapPreventExtensions(target: IProxyTarget): boolean {
  throw new TypeError('Surefire does not support Object.preventExtensions');
}

function trapGetOwnPropertyDescriptor(target: IProxyTarget, key: PropertyKey): PropertyDescriptor | undefined {
  const desc = Reflect.getOwnPropertyDescriptor(target.source, key);

  if (desc && !(key === 'length' && Array.isArray(target.source))) {
    desc.writable = true;
    desc.configurable = true;
  }
  return desc;
}

function trapHas(target: IProxyTarget, key: any): boolean {
  if (key === proxyTarget) {
    return true;
  }
  return hasOwnProperty(target.patches, key) ? target.patches[key] !== deleted : Reflect.has(target.source, key);
}

function trapGet(target: IProxyTarget, key: any, receiver: any): any {
  if (key === proxyTarget) {
    return target;
  }
  if (hasOwnProperty(target.patches, key)) {
    return target.patches[key] !== deleted ? target.patches[key] : undefined;
  }
  const desc = Reflect.getOwnPropertyDescriptor(target.source, key);
  if (desc?.get) {
    return desc.get.call(target.proxy);
  }
  if (desc?.value) {
    if (hasOwnProperty(target.proxies, key) && target.proxies[key][proxyTarget].source === desc.value) {
      return target.proxies[key];
    }
    if (isProxyable(desc.value)) {
      const proxy = ensureProxies(target)[key] = createProxy(desc.value, target.options);
      proxy[proxyTarget].origin = target.proxy;
      return proxy;
    }
  }
  return target.source[key];
}

function trapSet(target: IProxyTarget, key: any, value: unknown, receiver: any): boolean {
  if (key === proxyTarget) {
    throw new TypeError('Surefire target is readonly');
  }
  const desc = Reflect.getOwnPropertyDescriptor(target.source, key);
  if (desc?.set) {
    desc.set.call(target.proxy, value);
    return true;
  }
  if (
      desc && (
          target.proxies && target.proxies[key] === value
          || target.options.referenceCheck && desc.value === value && !isProxy(value)
      )
  ) {
    if (!target.patches) {
      return true;
    }
    const desc = Reflect.getOwnPropertyDescriptor(target.patches, key);
    if (!desc) {
      return true;
    }
    if (desc.configurable) {
      delete target.patches[key];
      return true;
    }
  }
  ensurePatches(target)[key] = value;
  return true;
}

function trapDeleteProperty(target: IProxyTarget, key: any): boolean {
  if (key === proxyTarget) {
    throw new TypeError('Surefire target is readonly');
  }
  if (hasOwnProperty(target.source, key)) {
    const patches = ensurePatches(target);
    delete patches[key];
    patches[key] = deleted;
    return true;
  }
  if (hasOwnProperty(target.patches, key)) {
    delete target.patches[key];
  }
  return true;
}

function trapDefineProperty(target: IProxyTarget, key: PropertyKey, attributes: PropertyDescriptor): boolean {
  throw new TypeError('Surefire does not support Object.defineProperty');
}

function trapOwnKeys(target: IProxyTarget): Array<string | symbol> {
  const sourceKeys = ownKeys(target.source);

  if (target.patches) {
    const patchedKeys = ownKeys(target.patches);

    for (let i = 0, l = patchedKeys.length; i < l; ++i) {
      const j = sourceKeys.indexOf(patchedKeys[i]);
      if (j === -1) {
        sourceKeys.push(patchedKeys[i]);
        continue;
      }
      if (target.patches[patchedKeys[i] as any] === deleted) {
        sourceKeys.splice(j, 1);
      }
    }
  }
  return sourceKeys;
}

function trapApply(target: IProxyTarget, thisArg: any, argArray?: any): any {
  if (typeof target.source === 'function') {
    return Reflect.apply(target.source, thisArg, argArray);
  }
  throw new TypeError('Not a function');
}

function trapConstruct(target: IProxyTarget, argArray: any, newTarget?: any): object {
  if (typeof target.source === 'function') {
    return Reflect.construct(target.source, argArray, newTarget);
  }
  throw new TypeError('Not a constructor');
}

export function isProxyable(value: any): value is Proxyable {
  return value !== null && typeof value === 'object' && (value.__proto__ == null || value.__proto__.constructor === Object) || Array.isArray(value) || isProxy(value);
}

export function isProxy<T>(value: T): value is T & IProxy {
  return value !== null && typeof value === 'object' && proxyTarget in value;
}

function hasOwnProperty<T extends object>(obj: T | null | undefined, key: PropertyKey): obj is T {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function ownKeys(value: object): Array<any> {
  return Reflect.ownKeys(value);
}

function ensurePatches(target: IProxyTarget): Record<PropertyKey, any> {
  return target.patches ? target.patches : target.patches = Array.isArray(target.source) ? new Array(target.source.length) : Object.create(null);
}

function ensureProxies(target: IProxyTarget): Record<PropertyKey, IProxy> {
  return target.proxies ? target.proxies : target.proxies = Object.create(null);
}

/**
 * Creates a revocable proxy that tracks changes of given value.
 */
export function createProxy<T extends Proxyable>(value: T, options: IProxyOptions = {}): T & IProxy {
  if (isProxy(value)) {
    return value;
  }
  let target: IProxyTarget = {
    origin: null as any,
    source: value,
    proxy: null as any,
    revokeProxy: null as any,
    patches: null,
    proxies: null,
    options,
  };

  // Array.isArray(proxy) always returns Array.isArray(target)
  // https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Proxy
  if (Array.isArray(value)) {
    target = Object.assign([], target);
  }

  const {proxy, revoke} = Proxy.revocable<any>(target, proxyHandler);
  target.origin = proxy;
  target.proxy = proxy;
  target.revokeProxy = revoke;

  return proxy;
}

function traversableOwnKeys(obj: Proxyable): Array<any> | undefined {
  if (!isProxy(obj)) {
    return ownKeys(obj);
  }
  const target = obj[proxyTarget];

  let patchedKeys;
  let proxiedKeys;
  if (target.patches) {
    patchedKeys = ownKeys(target.patches);
  }
  if (target.proxies) {
    proxiedKeys = ownKeys(target.proxies);
  }
  if (!patchedKeys) {
    return proxiedKeys;
  }
  if (!proxiedKeys) {
    return patchedKeys;
  }
  for (const key of proxiedKeys) {
    if (!patchedKeys.includes(key)) {
      patchedKeys.push(key);
    }
  }
  return patchedKeys;
}

function traverseProxyable0(obj: Proxyable, visitor: (proxy: IProxy, stackDepth: number, stack: Array<Proxyable>, keys: Array<any>) => unknown, depthFirstOrder = false): void {
  const objStack = new Array<Proxyable>(initialStackDepth);
  const keyStack = new Array<PropertyKey>(initialStackDepth);
  const traversableKeysStack = new Array<Array<any> | undefined>(initialStackDepth);
  const traversableKeyIndexStack = new Array<number>(initialStackDepth);

  objStack[0] = obj;
  traversableKeysStack[0] = traversableOwnKeys(obj);
  traversableKeyIndexStack[0] = 0;

  let i = 1; // aka current stack depth

  nextStack: while (i !== 0) {
    const obj = objStack[i - 1];
    const traversableKeys = traversableKeysStack[i - 1];

    if (!traversableKeys) {
      if (isProxy(obj)) {
        visitor(obj, i, objStack, keyStack);
      }
      i--;
      continue;
    }

    const traversableKeysLength = traversableKeys.length;

    let j = traversableKeyIndexStack[i - 1]; // aka current traversable key index

    // Check for circular dependencies.
    for (let k = 0; k < i - 1; k++) {
      if (objStack[k] === obj) {
        i--;
        continue nextStack;
      }
    }

    if (isProxy(obj)) {
      const target = obj[proxyTarget];

      if (!depthFirstOrder && j === 0 && visitor(obj, i, objStack, keyStack) === false) {
        i--;
        continue;
      }
      let key: any; // always PropertyKey when used
      let value: any; // always Proxyable when used

      while (j < traversableKeysLength) {
        key = traversableKeys[j];

        if (target.patches && hasOwnProperty(target.patches, key)) {
          value = target.patches[key];
          if (!isProxyable(value)) {
            j++;
            continue;
          }
        } else {
          value = target.proxies![key];
        }
        break;
      }
      if (j < traversableKeysLength) {
        objStack[i] = value;
        traversableKeysStack[i] = traversableOwnKeys(value);
        traversableKeyIndexStack[i] = 0;
        traversableKeyIndexStack[i - 1] = j + 1;
        keyStack[i - 1] = key;
        i++;
        continue;
      }
      if (depthFirstOrder && visitor(obj, i, objStack, keyStack) === false) {
        i--;
        continue;
      }
    } else {
      while (j < traversableKeysLength) {
        const key = traversableKeys[j];
        const value = obj[key];

        if (isProxyable(value)) {
          objStack[i] = value;
          traversableKeysStack[i] = traversableOwnKeys(value);
          traversableKeyIndexStack[i] = 0;
          traversableKeyIndexStack[i - 1] = j + 1;
          keyStack[i - 1] = key;
          i++;
          continue nextStack;
        }
        j++;
      }
    }

    i--;
  }
}

/**
 * Traverses proxyable object and its proxyable children and invokes `visitor` for every nested proxy. Proxies that are
 * passed to `visitor` may come from different `origin`s. This method is not recursive and allows visiting object
 * structures of any depth. It heavily relies on `Reflect.ownKeys()` during iteration.
 *
 * Proxyable objects are proxies themselves and all objects for which `isProxyable()` returns `true`.
 *
 * @see https://v8.dev/blog/fast-for-in
 */
export function traverseProxyable(obj: Proxyable, visitor: (proxy: IProxy, stack: Array<Proxyable>, keys: Array<PropertyKey>) => unknown, depthFirstOrder = false): void {
  traverseProxyable0(obj, (proxy, stackDepth, stack, keys) => visitor(proxy, stack.slice(0, stackDepth), keys.slice(0, stackDepth - 1)), depthFirstOrder);
}

/**
 * Returns proxy source or returns given value as is if it is not proxy.
 */
export function toSource<T>(value: T): T {
  return isProxy(value) ? value[proxyTarget].source : value;
}

export function captureSnapshot<T extends Proxyable>(value: T, rebaseOnto?: T): T {
  const source = toSource(value);
  rebaseOnto = rebaseOnto ?? source;

  const rebasing = rebaseOnto !== source;
  const base = rebaseOnto;

  let copy = base;

  traverseProxyable0(value, (proxy, stackDepth, stack, keys) => {
    // Target that is currently being visited.
    const target = proxy[proxyTarget];

    let stackPatched = false; // aka plain objects exist in stack (but we expected proxies only)
    let proxyPatched = false; // aka changes on proxy itself exist

    // Walk down the stack and ensure we can apply patches to current base copy.
    for (let i = 0, copyI = copy; i < stackDepth; ++i) {

      if (i === stackDepth - 1) {
        // Compare proxy patches with corresponding base to ensure there are actual changes.
        if (target.patches) {
          for (const key of ownKeys(target.patches)) {
            if (target.patches[key] !== copyI[key] || hasOwnProperty(target.patches, key) !== hasOwnProperty(copyI, key)) {
              proxyPatched = true;
              break;
            }
          }
        }
        break;
      }

      if (!isProxy(stack[i])) {
        // Non-proxy objects and their contents are not rebased, snapshot from original source is used.
        stackPatched = true;
        break;
      }
      copyI = copyI[keys[i]];
      if (!isProxyable(copyI)) {
        // No base object was found to apply changes from proxy being visited.
        return false;
      }
    }

    let baseI = base;
    let copyI = copy;

    let parentCopy = copyI;

    for (let i = 0; i < stackDepth; ++i) {
      if (!isProxy(stack[i])) {
        copyI = stack[i];

        if (i === 0) {
          copy = copyI;
        } else {
          parentCopy[keys[i - 1]] = copyI;
        }
      } else {
        if (copyI === baseI || copyI === toSource(stack[i])) {
          if (proxyPatched) {
            copyI = shallowClone(baseI);
          }

          if (i === 0) {
            copy = copyI;
          } else {
            parentCopy[keys[i - 1]] = copyI;
          }
        }
      }
      if (i < stackDepth - 1) {
        parentCopy = copyI;
        copyI = copyI[keys[i]];
        baseI = baseI?.[keys[i]];
      }
    }

    if (stackPatched || rebasing && Array.isArray(target.source)) {
      parentCopy[keys[stackDepth - 2]] = captureSnapshot(proxy);
      return false;
    }
    if (proxyPatched && target.patches) {
      for (const key of ownKeys(target.patches)) {
        const patch = target.patches[key];

        if (isProxy(patch)) {
          copyI[key] = patch[proxyTarget].source;
          continue;
        }
        if (patch === deleted) {
          delete copyI[key];
          continue;
        }
        copyI[key] = patch;
      }
    }
  });

  return copy;
}
