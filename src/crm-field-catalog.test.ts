import { describe, expect, it } from 'vitest';
import { CRM_FIELD_CATALOG, CRM_FIELD_FOLDER, ghlFieldSlug } from '@/lib/crm-field-catalog';

/**
 * The edge function owns provisioning; the UI mirrors the catalog. If the two
 * ever drift, fields get created in a client's CRM under a name the UI never
 * shows — so fail loudly here instead.
 */
const sources = import.meta.glob('../supabase/functions/_shared/crm-field-catalog.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const edgeSource = Object.values(sources)[0];


function parseEdgeCatalog(): Record<string, { questionKey: string; name: string }[]> {
  const out: Record<string, { questionKey: string; name: string }[]> = {};
  const body = edgeSource.slice(edgeSource.indexOf('CRM_FIELD_CATALOG'));
  const formRe = /^ {2}(\w+): \[$/gm;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(body))) {
    const start = formRe.lastIndex;
    const end = body.indexOf('\n  ],', start);
    const chunk = body.slice(start, end);
    const rows = [...chunk.matchAll(/questionKey: '([^']+)', name: '([^']+)'/g)];
    out[m[1]] = rows.map(r => ({ questionKey: r[1], name: r[2] }));
  }
  return out;
}

describe('CRM field catalog', () => {
  const edge = parseEdgeCatalog();

  it('is mirrored between the UI and the edge function', () => {
    expect(Object.keys(edge).sort()).toEqual(Object.keys(CRM_FIELD_CATALOG).sort());
    for (const [formType, defs] of Object.entries(CRM_FIELD_CATALOG)) {
      expect(edge[formType].map(d => [d.questionKey, d.name])).toEqual(
        defs.map(d => [d.questionKey, d.name]),
      );
    }
  });

  it('keeps the folder name in sync', () => {
    expect(edgeSource).toContain(`CRM_FIELD_FOLDER = '${CRM_FIELD_FOLDER}'`);
  });

  it('produces unique, merge-tag-safe field keys per form', () => {
    for (const defs of Object.values(CRM_FIELD_CATALOG)) {
      const keys = defs.map(d => ghlFieldSlug(d.name));
      for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

import { CRM_FORM_BY_TYPE } from '@/lib/crm-form-registry';

describe('CRM field catalog vs form registry', () => {
  it('only uses question keys the form actually maps', () => {
    for (const [formType, defs] of Object.entries(CRM_FIELD_CATALOG)) {
      const keys = new Set(CRM_FORM_BY_TYPE[formType].questionKeys);
      for (const d of defs) expect(keys.has(d.questionKey), `${formType}:${d.questionKey}`).toBe(true);
    }
  });

  it('never shares a CRM field across forms except the Ring OS ring fields', () => {
    const owner = new Map<string, string>();
    for (const [formType, defs] of Object.entries(CRM_FIELD_CATALOG)) {
      for (const d of defs) {
        const slug = ghlFieldSlug(d.name);
        const prev = owner.get(slug);
        if (prev && prev !== formType) expect(d.name.startsWith('Ring OS'), `${slug} in ${prev} and ${formType}`).toBe(true);
        owner.set(slug, formType);
      }
    }
  });
});
