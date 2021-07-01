import {
  captureSnapshot,
  createProxy,
  isProxy,
  isProxyable,
  traverseProxyable,
} from '../main/Surefire';
import {deleted, proxyTarget} from '../main/symbols';

describe('isProxyable', () => {

  it('returns true for objects', () => {
    expect(isProxyable({})).toBe(true);
  });

  it('returns true for objects', () => {
    expect(isProxyable({})).toBe(true);
  });

  it('returns false for null and undefined', () => {
    expect(isProxyable(null)).toBe(false);
    expect(isProxyable(undefined)).toBe(false);
  });

  it('returns false for functions', () => {
    expect(isProxyable(() => undefined)).toBe(false);
  });

  it('returns true for proxy objects', () => {
    expect(isProxyable(createProxy({}))).toBe(true);
  });
});

describe('isProxy', () => {

  it('returns false for non-proxy objects', () => {
    expect(isProxy({})).toBe(false);
    expect(isProxy(1)).toBe(false);
    expect(isProxy(null)).toBe(false);
  });

  it('returns true for proxy objects', () => {
    expect(isProxy(createProxy({}))).toBe(true);
  });
});

describe('createProxy', () => {

  it('does not create a new proxy if proxy is provided as an argument', () => {
    const p = createProxy({});
    expect(createProxy(p)).toBe(p);
  });

  it('different proxies of the same value are not equal', () => {
    const source = {};
    expect(createProxy(source)).not.toBe(createProxy(source));
  });

  it('preserves instanceof calls', () => {
    class Foo {
    }

    expect(createProxy(new Foo())).toBeInstanceOf(Foo);
  });

  it('returns true for isArray check for proxied arrays', () => {
    expect(Array.isArray(createProxy([]))).toBe(true);
  });
});

describe('trapHas', () => {

  it('returns true if internal target is checked', () => {
    expect(proxyTarget in createProxy({})).toBe(true);
  });

  it('returns false if property exist on source object', () => {
    expect('foo' in createProxy({foo: 123})).toBe(true);
  });

  it('returns false if property does not exist on source object', () => {
    expect('bar' in createProxy({foo: 123})).toBe(false);
  });

  it('returns false if property was deleted', () => {
    const p = createProxy<any>({foo: 123});
    delete p.foo;
    expect('foo' in p).toBe(false);
  });
});

describe('trapGet', () => {

  it('returns underlying target', () => {
    expect(createProxy({})[proxyTarget]).toBeInstanceOf(Object);
  });

  it('returns undefined if property was deleted', () => {
    const p = createProxy<any>({foo: 123});
    delete p.foo;
    expect(p.foo).toBeUndefined();
  });

  it('returns proxyable property value wrapped in proxy', () => {
    const p = createProxy({foo: {bar: 123}});
    expect(isProxy(p.foo)).toBe(true);
    expect(p[proxyTarget].proxies!.foo).toBe(p.foo);
  });

  it('returns non-proxyable object values as is', () => {
    const fixture = new Map();
    const p = createProxy({foo: fixture});
    const v = p.foo;
    expect(isProxy(v)).toBe(false);
    expect(v).toBe(fixture);
  });

  it('returns primitive values as is', () => {
    const p = createProxy({foo: 123});
    const v = p.foo;
    expect(isProxy(v)).toBe(false);
    expect(v).toBe(123);
  });

  it('returns a the same proxy if property was read multiple times', () => {
    const p = createProxy({foo: {bar: 123}});
    expect(p.foo).toBe(p.foo);
  });

  it('returns values of non-enumerable properties', () => {
    const p = createProxy(['a', 'b']);
    expect(p.length).toBe(2);
  });

  it('returns new proxy for same object if it is stored under different keys', () => {
    const obj = {};
    const p = createProxy([obj, obj, obj]);
    expect(p[0]).not.toBe(p[1]);
  });

  it('returns new proxy for each nested read operation even if it contains the same object reference', () => {
    const a: any = {};
    a.a = a;
    const p = createProxy(a);
    expect(p.a).not.toBe(p);
    expect(p.a.a).not.toBe(p);
    expect(p.a.a).not.toBe(p.a);
  });

  it('returns new proxy for same object if it is stored under different keys', () => {
    const fixture = {foo: {}};
    const p = createProxy(fixture);
    const fooProxy = p.foo;
    fixture.foo = {};
    expect(p.foo).not.toBe(fooProxy);
  });

  it('populates origin of the derived proxy', () => {
    const p = createProxy({foo: {}});
    expect(p[proxyTarget].origin).toBe((p.foo as any)[proxyTarget].origin);
  });

  it('does not create proxy for object retrieved via accessor', () => {
    const value = {};
    const obj: any = {};
    Object.defineProperty(obj, 'foo', {
      get() {
        return value;
      },
    });

    const p = createProxy(obj);
    expect(p.foo).toBe(value);
    expect(isProxy(p.foo)).toBe(false);
  });

  it('creates proxy for object retrieved via accessor if it is hosted on the same proxy', () => {
    const obj: any = {bar: {}};
    Object.defineProperty(obj, 'foo', {
      get() {
        return this.bar;
      },
    });

    const p = createProxy(obj);
    expect(p.foo).toBe(p.bar);
    expect(isProxy(p.foo)).toBe(true);
    expect(isProxy(p.bar)).toBe(true);
  });

  it('creates proxy for defined property that does not use accessor', () => {
    const value = {};
    const obj: any = {};
    Object.defineProperty(obj, 'foo', {value});

    const p = createProxy(obj);
    expect(isProxy(p.foo)).toBe(true);
  });
});

describe('trapSet', () => {

  it('does not allow to set underlying target', () => {
    expect(() => createProxy({})[proxyTarget] = null as any).toThrow();
  });

  it('creates a new patch when property is updated', () => {
    const p = createProxy({foo: 123});
    p.foo = 456;
    expect(p[proxyTarget].patches!.foo).toBe(456);
  });

  it('creates a new patch when property is introduced', () => {
    const p = createProxy<any>({});
    p.foo = 123;
    expect(p[proxyTarget].patches!.foo).toBe(123);
  });

  it('updates an existing patch', () => {
    const p = createProxy({foo: 123});
    p.foo = 456;
    p.foo = 789;
    expect(p[proxyTarget].patches!.foo).toBe(789);
  });

  it('updates with undefined value', () => {
    const p = createProxy<any>({foo: 123});
    p.foo = undefined;
    expect(p[proxyTarget].patches!.foo).toBe(undefined);
  });

  it('updates with null value', () => {
    const p = createProxy<any>({foo: 123});
    p.foo = null;
    expect(p[proxyTarget].patches!.foo).toBe(null);
  });

  it('preserves patch if property is reverted to its primitive initial value with referenceCheck disabled', () => {
    const p = createProxy({foo: 123}, {referenceCheck: false});
    p.foo = 456;
    p.foo = 123;
    expect(p[proxyTarget].patches!.foo).toBe(123);
  });

  it('deletes existing patch if property is reverted to its primitive initial value with referenceCheck enabled', () => {
    const p = createProxy({foo: 123}, {referenceCheck: true});
    p.foo = 456;
    p.foo = 123;
    expect(p[proxyTarget].patches!.foo).toBeUndefined();
  });

  it('deletes existing patch if property is reverted to proxy of its initial value', () => {
    const p = createProxy({foo: {bar: 123}});
    const p1 = p.foo;
    const q = {bar: 999};
    p.foo = q;
    expect(p[proxyTarget].patches!.foo).toBe(q);
    p.foo = p1;
    expect(p[proxyTarget].patches!.foo).toBeUndefined();
  });

  it('array push and pop produces no patches', () => {
    const a = {};
    const b = {};
    const p = createProxy<Array<any>>([a]);
    p.push(b);
    p.pop();
    expect(Object.keys(p[proxyTarget].patches!)).toEqual([]);
  });

  it('array pop and push produce no patches with referenceCheck enabled', () => {
    const a = {};
    const p = createProxy<Array<any>>([a], {referenceCheck: true});
    p.pop();
    p.push(a);
    expect(Object.keys(p[proxyTarget].patches!)).toEqual([]);
  });

  it('array pop and push produce patches with referenceCheck disabled', () => {
    const a = {};
    const p = createProxy<Array<any>>([a], {referenceCheck: false});
    p.pop();
    p.push(a);
    expect(p[proxyTarget].patches).toEqual([a]);
  });

  it('array splice in and splice out of original values produces no patches', () => {
    const a = {};
    const b = {};
    const c = {};
    const p = createProxy<Array<any>>([a, b, c], {referenceCheck: true});
    p.splice(1, 1);
    p.splice(1, 0, b);
    expect(Object.keys(p[proxyTarget].patches!)).toEqual([]);
  });

  it('updates length patch', () => {
    const arr: Array<any> = [];
    const p = createProxy(arr);
    p.length = 100;
    expect(p[proxyTarget].patches!.length).toEqual(100);
  });

  it('array splice in and splice out of proxies value produces no patches', () => {
    const p = createProxy<Array<any>>([{}, {}, {}]);
    const b = p[1];
    p[0], p[2];

    p.splice(1, 1);
    p.splice(1, 0, b);
    expect(Object.keys(p[proxyTarget].patches!)).toEqual([]);
  });

  it('removes patches that are out of bounds if array length is changed', () => {
    const a = {};
    const b = {};
    const p = createProxy<Array<any>>([a]);
    p.push(b);
    p.length = 1;
    expect(Object.keys(p[proxyTarget].patches!)).toEqual([]);
  });
});

describe('trapDeleteProperty', () => {

  it('does not allow to set underlying target', () => {
    expect(() => delete createProxy<any>({})[proxyTarget]).toThrow();
  });

  it('does nothing when absent property is deleted', () => {
    const p = createProxy<any>({foo: 123});
    delete p.bar;
    expect(p[proxyTarget].patches).toBeNull();
  });

  it('does nothing when existing inherited property is deleted', () => {
    class Foo {
    }

    (Foo.prototype as any).baz = 123;
    const p = createProxy<any>(new Foo());
    delete p.baz;
    expect(p[proxyTarget].patches).toBeNull();
  });

  it('creates a new patch when existing own property is deleted', () => {
    const p = createProxy<any>({foo: 123});
    delete p.foo;
    expect(p[proxyTarget].patches!.foo).toBe(deleted);
  });

  it('updates patch when existing own property is deleted', () => {
    const p = createProxy<any>({foo: 123});
    p.foo = 456;
    delete p.foo;
    expect(p[proxyTarget].patches!.foo).toBe(deleted);
  });

  it('deletes patch when absent property is deleted', () => {
    const p = createProxy<any>({});
    p.foo = 123;
    delete p.foo;
    expect(p[proxyTarget].patches!).toEqual({});
  });

  it('deletes patch when existing inherited property is deleted', () => {
    class Foo {
    }

    (Foo.prototype as any).baz = 123;
    const p = createProxy<any>(new Foo());
    p.baz = 123;
    delete p.baz;
    expect(p[proxyTarget].patches!).toEqual({});
  });

  it('throws when deleting non-configurable properties', () => {
    const p = createProxy<any>([]);
    expect(() => delete p.length).toThrow(new TypeError(`Cannot delete property 'length' of [object Array]`));
  });
});

describe('trapOwnKeys', () => {

  it('returns own keys of original object', () => {
    expect(Reflect.ownKeys(createProxy({foo: 123, bar: 345}))).toEqual(['foo', 'bar']);
  });

  it('does not list deleted properties', () => {
    const p = createProxy<any>({foo: 123, bar: 345});
    delete p.foo;
    expect(Reflect.ownKeys(p)).toEqual(['bar']);
  });

  it('lists newly added properties', () => {
    const p = createProxy<any>({foo: 123, bar: 345});
    p.qux = 999;
    expect(Reflect.ownKeys(p)).toEqual(['foo', 'bar', 'qux']);
  });

  it('does not list overwritten properties twice', () => {
    const p = createProxy({foo: 123, bar: 345});
    p.foo = 999;
    expect(Reflect.ownKeys(p)).toEqual(['foo', 'bar']);
  });

  it('does not reorder keys after delete and consequent set', () => {
    const p = createProxy<any>({foo: 123, bar: 345});
    delete p.foo;
    p.foo = 999;
    expect(Reflect.ownKeys(p)).toEqual(['foo', 'bar']);
  });

  it('does not list length among keys of array', () => {
    expect(Object.keys(createProxy(['a']))).toEqual(['0']);
  });

  it('does not list length among keys of array even after patch', () => {
    const p = createProxy(['a']);
    p.length = 2;
    expect(p.length).toBe(2);
    expect(Object.keys(p)).toEqual(['0']);
  });
});

describe('traverseProxyable', () => {

  it('calls visitor for each proxy/stack pair in parent first order by default', () => {
    const p = createProxy({
      a1: {
        b1: {www: 1},
        b2: {www: 2},
      },
      a2: {
        c1: {www: 3},
        c2: {www: 4},
      },
    });

    p.a1.b1, p.a1.b2, p.a2.c1, p.a2.c2;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(7);

    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, p.a1, [p, p.a1], ['a1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(3, p.a1.b1, [p, p.a1, p.a1.b1], ['a1', 'b1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(4, p.a1.b2, [p, p.a1, p.a1.b2], ['a1', 'b2']);
    expect(visitorSpy).toHaveBeenNthCalledWith(5, p.a2, [p, p.a2], ['a2']);
    expect(visitorSpy).toHaveBeenNthCalledWith(6, p.a2.c1, [p, p.a2, p.a2.c1], ['a2', 'c1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(7, p.a2.c2, [p, p.a2, p.a2.c2], ['a2', 'c2']);
  });

  it('can call visitor for each proxy/stack pair in child first order', () => {
    const p = createProxy({
      a1: {
        b1: {www: 1},
        b2: {www: 2},
      },
      a2: {
        c1: {www: 3},
        c2: {www: 4},
      },
    });

    // Populate proxy tree
    p.a1.b1, p.a1.b2, p.a2.c1, p.a2.c2;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy, true);

    expect(visitorSpy).toHaveBeenCalledTimes(7);

    expect(visitorSpy).toHaveBeenNthCalledWith(1, p.a1.b1, [p, p.a1, p.a1.b1], ['a1', 'b1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, p.a1.b2, [p, p.a1, p.a1.b2], ['a1', 'b2']);
    expect(visitorSpy).toHaveBeenNthCalledWith(3, p.a1, [p, p.a1], ['a1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(4, p.a2.c1, [p, p.a2, p.a2.c1], ['a2', 'c1']);
    expect(visitorSpy).toHaveBeenNthCalledWith(5, p.a2.c2, [p, p.a2, p.a2.c2], ['a2', 'c2']);
    expect(visitorSpy).toHaveBeenNthCalledWith(6, p.a2, [p, p.a2], ['a2']);
    expect(visitorSpy).toHaveBeenNthCalledWith(7, p, [p], []);
  });

  it('calls visitor with same proxy if stack is different', () => {
    const p = createProxy<any>({a: {b: {}, c: null}});
    p.a.c = p.a.b;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(4);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, p.a, [p, p.a], ['a']);
    expect(visitorSpy).toHaveBeenNthCalledWith(3, p.a.b, [p, p.a, p.a.c], ['a', 'c']);
    expect(visitorSpy).toHaveBeenNthCalledWith(4, p.a.c, [p, p.a, p.a.b], ['a', 'b']);
  });

  it('does not cause infinite with immediate cyclic references of proxies', () => {
    const p = createProxy<any>({a: null});
    p.a = p;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(1);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
  });

  it('does not cause infinite with deep cyclic references of proxies', () => {
    const p = createProxy<any>({a: {b: null}});
    p.a.b = p;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(2);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, p.a, [p, p.a], ['a']);
  });

  it('does not cause infinite with cyclic references of objects', () => {
    const p = createProxy<any>({});
    const q = createProxy({});

    const a: any = p.a = {};
    p.a.b = a;
    a.c = q;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(2);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, q, [p, a, q], ['a', 'c']);
  });

  it('does not visit proxy if corresponding key was patched with literal', () => {
    const p = createProxy<any>({a: {www: 123}});
    p.a;
    p.a = 123;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(1);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
  });

  it('visits patch proxy instead of original proxy', () => {
    const p = createProxy<any>({a: {eee: 123}});
    p.a;

    const d = createProxy({www: 123});
    p.a = d;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(2);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, d, [p, d], ['a']);
  });

  it('visits proxy inside a plain objects', () => {
    const p = createProxy<any>({});
    const b = createProxy<any>({www: 123});

    const obj1: any = {qqq: b};
    const obj2: any = {c: obj1};
    p.a = obj2;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(2);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, b, [p, obj2, obj1, b], ['a', 'c', 'qqq']);
  });

  it('visits proxy inside a arrays', () => {
    const p = createProxy<any>({});
    const b = createProxy<any>({www: 123});

    const arr = [b];
    p.a = arr;

    const visitorSpy = jest.fn();
    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(2);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, b, [p, arr, b], ['a', '0']);
  });

  it('stops traversing current branch when false if returned from visitor', () => {
    const p = createProxy({a: {b: {www: 123}}, c: {d: 456}});

    p.a.b.www *= 2; // This should never be visited
    p.c.d *= 2;

    const visitorSpy = jest.fn()
        .mockReturnValueOnce(true) // visiting root
        .mockReturnValueOnce(false) // visiting "a"
        .mockReturnValueOnce(true); // visiting "c"

    traverseProxyable(p, visitorSpy);

    expect(visitorSpy).toHaveBeenCalledTimes(3);
    expect(visitorSpy).toHaveBeenNthCalledWith(1, p, [p], []);
    expect(visitorSpy).toHaveBeenNthCalledWith(2, p.a, [p, p.a], ['a']);
    expect(visitorSpy).toHaveBeenNthCalledWith(3, p.c, [p, p.c], ['c']);
  });
});

describe('captureSnapshot', () => {

  it('returns shallow non-patched object as is', () => {
    const source = {foo: 123};
    const p = createProxy(source);

    expect(captureSnapshot(p)).toBe(source);
  });

  it('returns object as is if patch did not change anything when referenceCheck is disabled', () => {
    const source = {foo: {bar: {baz: 123}}};
    const p = createProxy(source);
    p.foo.bar.baz = 123;

    expect(captureSnapshot(p)).toBe(source);
  });

  it('returns object as is if patch did not change anything when referenceCheck is enabled', () => {
    const source = {foo: {bar: {baz: 123}}};
    const p = createProxy(source, {referenceCheck: true});
    p.foo.bar.baz = 123;

    expect(captureSnapshot(p)).toBe(source);
  });

  it('returns cloned base if proxy contained changes when referenceCheck is disabled', () => {
    const source = {foo: 123};
    const p = createProxy(source, {referenceCheck: false});
    p.foo = 123;

    const base = {foo: 456};
    const snapshot = captureSnapshot(p, base);

    expect(snapshot).not.toBe(source);
    expect(snapshot).not.toBe(base);
    expect(snapshot).toEqual({foo: 123});
  });

  it('returns base if proxy contained no changes when referenceCheck is enabled', () => {
    const source = {foo: 123};
    const p = createProxy(source, {referenceCheck: true});
    p.foo = 123;

    const base = {foo: 456};
    const snapshot = captureSnapshot(p, base);

    expect(snapshot).not.toBe(source);
    expect(snapshot).toBe(base);
    expect(snapshot).toEqual({foo: 456});
  });

  it('returns deep non-patched object as is', () => {
    const source = {foo: {bar: 123}, zzz: {www: 'abc'}};
    const p = createProxy(source);
    p.zzz;
    p.foo.bar;

    const snapshot = captureSnapshot(p);

    expect(snapshot).toBe(source);
    expect(snapshot.foo).toBe(source.foo);
    expect(snapshot.zzz).toBe(source.zzz);
  });

  it('returns a new snapshot for shallow proxy changes', () => {
    const source: any = {foo: 123, zzz: {www: 'abc'}};
    const p = createProxy(source);
    p.zzz;
    delete p.foo;
    p.bar = 456;

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({bar: 456, zzz: {www: 'abc'}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.zzz).toBe(source.zzz);
  });

  it('returns a new snapshot for deep proxy changes', () => {
    const source: any = {foo: {bar: 123}, zzz: {www: 'abc'}};
    const p = createProxy(source);
    p.zzz;
    delete p.foo.bar;
    p.foo.qux = 456;

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({foo: {qux: 456}, zzz: {www: 'abc'}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo).not.toBe(source.foo);
    expect(snapshot.zzz).toBe(source.zzz);
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.foo)).toBe(false);
  });

  it('returns a new snapshot for both shallow and deep proxy changes', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    p.www = 'abc';
    delete p.foo.bar;
    p.foo.qux = 456;

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({foo: {qux: 456}, www: 'abc'});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo).not.toBe(source.foo);
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.foo)).toBe(false);
  });

  it('returns a new snapshot with a new intermediate object', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    p.foo = {qux: p.foo};

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({foo: {qux: {bar: 123}}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo.qux).toBe(source.foo);
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.foo)).toBe(false);
    expect(isProxy(snapshot.foo.qux)).toBe(false);
  });

  it('returns a new snapshot with a new root object', () => {
    const source: any = {foo: 123};
    const p = createProxy(source);

    const snapshot = captureSnapshot({bar: p});

    expect(snapshot).toEqual({bar: {foo: 123}});
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.bar)).toBe(false);
  });

  it('returns a new snapshot with both new root and new intermediate object', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    const qux = p.foo;
    p.foo = {qux};

    const snapshot = captureSnapshot({www: p});

    expect(snapshot).toEqual({www: {foo: {qux: {bar: 123}}}});
    expect(isProxy(snapshot.www)).toBe(false);
    expect(isProxy(snapshot.www.foo.qux)).toBe(false);
  });

  it('returns a new snapshot with a new intermediate object and deep proxy changes', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    p.foo = {qux: p.foo};
    delete p.foo.qux.bar;
    p.foo.qux.www = 'abc';

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({foo: {qux: {www: 'abc'}}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo.qux).not.toBe(source.foo);
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.foo)).toBe(false);
    expect(isProxy(snapshot.foo.qux)).toBe(false);
  });

  it('returns a new snapshot with a new root object and shallow proxy changes', () => {
    const source: any = {foo: 123};
    const p0 = createProxy(source);
    const p = {bar: p0};
    delete p.bar.foo;
    p.bar.www = 'abc';

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({bar: {www: 'abc'}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.bar).not.toBe(source);
    expect(isProxy(snapshot)).toBe(false);
    expect(isProxy(snapshot.bar)).toBe(false);
  });

  it('returns a new snapshot with both new root and new intermediate object and deep proxy changes', () => {
    const source: any = {foo: {bar: 123}};
    const p0 = createProxy(source);
    const p = {www: p0};
    p.www.foo = {qux: p.www.foo};
    delete p.www.foo.qux.bar;
    p.www.foo.qux.ttt = 'abc';

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({www: {foo: {qux: {ttt: 'abc'}}}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.www).not.toBe(source);
    expect(snapshot.www.foo.qux).not.toBe(source.foo);
    expect(isProxy(snapshot.www)).toBe(false);
    expect(isProxy(snapshot.www.foo.qux)).toBe(false);
  });

  it('returns a new snapshot with both new root and new intermediate object and shallow and deep proxy changes', () => {
    const source: any = {foo: {bar: 123}};
    const p0 = createProxy(source);
    const p = {www: p0};
    p.www.rrr = 'xyz';
    p.www.foo = {qux: p.www.foo};
    delete p.www.foo.qux.bar;
    p.www.foo.qux.ttt = 'abc';

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual({www: {foo: {qux: {ttt: 'abc'}}, rrr: 'xyz'}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.www).not.toBe(source);
    expect(snapshot.www.foo.qux).not.toBe(source.foo);
    expect(isProxy(snapshot.www)).toBe(false);
    expect(isProxy(snapshot.www.foo.qux)).toBe(false);
  });

  it('returns non-patched array as is if referenceCheck is enabled', () => {
    const source: any = [{foo: 123}, {bar: 456}];
    const p = createProxy(source, {referenceCheck: true});
    p.unshift(p.shift());

    const snapshot = captureSnapshot(p);

    expect(snapshot).toBe(source);
    expect(snapshot[0]).toBe(source[0]);
    expect(snapshot[1]).toBe(source[1]);
  });

  it('returns non-patched array as is if referenceCheck is disabled', () => {
    const source: any = [{foo: 123}, {bar: 456}];
    const p = createProxy(source);
    p.unshift(p.shift());

    const snapshot = captureSnapshot(p);

    expect(snapshot).toBe(source);
    expect(snapshot[0]).toBe(source[0]);
    expect(snapshot[1]).toBe(source[1]);
  });

  it('returns a new snapshot for an array with changed length', () => {
    const source: any = [{foo: 123}, {bar: 456}];
    const p = createProxy(source);
    p.length = 1;

    const snapshot = captureSnapshot(p);

    expect(snapshot).not.toBe(source);
    expect(snapshot.length).toBe(1);
    expect(snapshot[0]).toBe(source[0]);
  });

  it('can push to array', () => {
    const source: any = [{foo: 123}];
    const p = createProxy(source);
    p.push(p[0]);

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual([{foo: 123}, {foo: 123}]);
  });

  it('returns a new snapshot for an array with unshifted element', () => {
    const source: any = [{foo: 123}, {bar: 456}];
    const p = createProxy(source);
    p.unshift(p[1]);

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual([{bar: 456}, {foo: 123}, {bar: 456}]);
    expect(snapshot).not.toBe(source);
    expect(snapshot[0]).toBe(source[1]);
    expect(snapshot[1]).toBe(source[0]);
    expect(snapshot[2]).toBe(source[1]);
  });

  it('returns a new snapshot for an array with pushed element', () => {
    const source: any = [{foo: 123}];
    const p = createProxy(source);
    p.push({bar: 456});

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual([{foo: 123}, {bar: 456}]);
    expect(snapshot).not.toBe(source);
    expect(snapshot[0]).toBe(source[0]);
    expect(isProxy(snapshot[1])).toBe(false);
  });

  it('returns a new snapshot for an array with changed element', () => {
    const source: any = [{foo: 123}, {bar: 456}];
    const p = createProxy(source);
    p[1].www = 'abc';

    const snapshot = captureSnapshot(p);

    expect(snapshot).toEqual([{foo: 123}, {bar: 456, www: 'abc'}]);
    expect(snapshot).not.toBe(source);
    expect(snapshot[0]).toBe(source[0]);
    expect(isProxy(snapshot[1])).toBe(false);
  });

  it('can rebase shallow object changes', () => {
    const source: any = {foo: 123};
    const p = createProxy(source);
    p.qux = 'abc';

    const snapshot = captureSnapshot(p, {bar: 456});

    expect(snapshot).toEqual({bar: 456, qux: 'abc'});
    expect(snapshot).not.toBe(source);
  });

  it('can rebase deep object changes', () => {
    const source: any = {foo: {bar: 123}, qux: {zzz: 456}};
    const p = createProxy(source);
    p.foo.www = 'abc';

    const snapshot = captureSnapshot(p, {foo: {rrr: 789}});

    expect(snapshot).toEqual({foo: {rrr: 789, www: 'abc'}});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo).not.toBe(source.foo);
  });

  it('does not rebase shallow changes if base is absent', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    p.foo.www = 'abc';

    const snapshot = captureSnapshot(p, {zzz: 123});

    expect(snapshot).toEqual({zzz: 123});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo).not.toBe(source.foo);
  });

  it('does not rebase deep changes if base is absent', () => {
    const source: any = {foo: {bar: {baz: 123}}};
    const p = createProxy(source);
    p.foo.bar.www = 'abc';

    const snapshot = captureSnapshot(p, {zzz: 123});

    expect(snapshot).toEqual({zzz: 123});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo).not.toBe(source.foo);
  });

  it('applies literal changes during rebase', () => {
    const source: any = {foo: {bar: 123}};
    const p = createProxy(source);
    p.foo = {www: 'abc', qux: p.foo};

    const snapshot = captureSnapshot(p, {zzz: 123});

    expect(snapshot).toEqual({foo: {www: 'abc', qux: {bar: 123}}, zzz: 123});
    expect(snapshot).not.toBe(source);
    expect(snapshot.foo.qux).toBe(source.foo);
  });

  it('does not rebase arrays', () => {
    const source: any = {foo: [{bar: 123}]};
    const p = createProxy(source);
    p.foo[0].qux = 'abc';

    const snapshot = captureSnapshot(p, {foo: [{www: 456}]});

    expect(snapshot).toEqual({foo: [{bar: 123, qux: 'abc'}]});
  });
});
