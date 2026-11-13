import { isDeepStrictEqual } from 'node:util';
import { applyBmwLinkage } from './applyBmwLinkage';
import type { BmwLinkageOptions, BmwLinkageResult } from './bmwLinkageTypes';

type Session = Parameters<typeof applyBmwLinkage>[0];
type Fields = Record<string, unknown>;
interface Change { path: string[]; existed: boolean; before: unknown; applied: unknown; }

function object(value: unknown): value is Fields {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Keep derived values separate from imported evidence within one parser session. */
export class BmwLinkageTracker {
    private changes: Change[] = [];

    public restore(data: Session): void {
        this.changes.forEach(change => {
            let parent: unknown = data;
            for (const key of change.path.slice(0, -1)) {
                parent = parent && typeof parent === 'object' ? (parent as Fields)[key] : undefined;
            }
            if (!parent || typeof parent !== 'object') return;
            const fields = parent as Fields;
            const key = change.path[change.path.length - 1];
            // Keep later explicit edits; restore only values still equal to our derivation.
            if (!isDeepStrictEqual(fields[key], change.applied)) return;
            if (change.existed) fields[key] = change.before;
            else delete fields[key];
        });
        this.changes = [];
    }

    public apply(data: Session, options: BmwLinkageOptions): BmwLinkageResult {
        this.restore(data);
        // Metadata/files are not linked and need not be cloned (createdAt may be a library type).
        const view = { organizationSetup: data.organizationSetup, branchSetups: data.branchSetups };
        const before = structuredClone(view);
        const references = new Map<string, unknown>();
        const capture = (value: unknown, path: string[]): void => {
            references.set(JSON.stringify(path), value);
            if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => capture(child, [...path, key]));
        };
        capture(view, []);
        const collect = (old: unknown, current: unknown, path: string[]): void => {
            if (isDeepStrictEqual(old, current)) return;
            const original = references.get(JSON.stringify(path));
            if ((path.length === 0 || original === current) && object(old) && object(current)) {
                for (const key of new Set([...Object.keys(old), ...Object.keys(current)])) collect(old[key], current[key], [...path, key]);
            } else if (Array.isArray(old) && Array.isArray(current) && original === current) {
                for (let index = 0; index < Math.max(old.length, current.length); index++) collect(old[index], current[index], [...path, String(index)]);
            } else {
                this.changes.push({ path, existed: references.has(JSON.stringify(path)), before: original, applied: structuredClone(current) });
            }
        };
        try {
            const result = applyBmwLinkage(data, options);
            collect(before, view, []);
            return result;
        } catch (error) {
            collect(before, view, []);
            this.restore(data);
            throw error;
        }
    }
}
