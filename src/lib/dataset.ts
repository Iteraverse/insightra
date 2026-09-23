export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Dataset = {
  id: string;
  name: string;
  format: string;
  kind: string;
  revision: number;
  updated_at: string;
  source: string;
  data: Json;
  columns?: string[];
  read_only?: boolean;
  schema?: string;
  as_of?: string;
};
export type DatasetSummary = Omit<Dataset, 'data'> & { records: number; shape: string };
export const jsonCopy = (value: Json): Json => JSON.parse(JSON.stringify(value));
export const displayCell = (value: Json | undefined) =>
  value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
export function setJson(root: Json, path: (string | number)[], value: Json): Json {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (Array.isArray(root))
    return root.map((v, i) => (i === Number(key) ? setJson(v, rest, value) : v));
  if (root !== null && typeof root === 'object')
    return { ...root, [key]: setJson(root[key] ?? null, rest, value) };
  return root;
}
export function removeJson(root: Json, path: (string | number)[]): Json {
  if (!path.length) return null;
  const [key, ...rest] = path;
  if (Array.isArray(root))
    return rest.length
      ? root.map((v, i) => (i === Number(key) ? removeJson(v, rest) : v))
      : root.filter((_, i) => i !== Number(key));
  if (root !== null && typeof root === 'object') {
    if (rest.length) return { ...root, [key]: removeJson(root[key], rest) };
    return Object.fromEntries(Object.entries(root).filter(([k]) => k !== key));
  }
  return root;
}
