export function shallowClone(value: any): any {
  let obj: any;

  if (Array.isArray(value)) {
    obj = [];
  } else if (value !== null && typeof value === 'object') {
    obj = {};
  } else {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    obj[key] = value[key];
  }
  return obj;
}
