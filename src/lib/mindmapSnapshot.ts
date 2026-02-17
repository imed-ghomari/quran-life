const DISALLOWED_SHAPE_TYPES = new Set(['image', 'video', 'embed', 'bookmark']);

type SnapshotLike = {
  store?: Record<string, any>;
  [key: string]: any;
};

const isRecordObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const sanitizeMindmapSnapshot = (snapshot: unknown): SnapshotLike | undefined => {
  if (!isRecordObject(snapshot)) return undefined;

  const input = snapshot as SnapshotLike;
  const inputStore = input.store;

  if (!isRecordObject(inputStore)) return { ...input };

  const removedShapeIds = new Set<string>();
  const nextStore: Record<string, any> = {};
  const bindingRecords: Array<[string, Record<string, any>]> = [];

  for (const [key, record] of Object.entries(inputStore)) {
    if (key.startsWith('shape:')) {
      if (!isRecordObject(record)) continue;
      const shapeType = String(record.type || '');
      if (DISALLOWED_SHAPE_TYPES.has(shapeType)) {
        removedShapeIds.add(String(record.id || key));
        continue;
      }
      nextStore[key] = record;
      continue;
    }

    if (key.startsWith('binding:')) {
      if (!isRecordObject(record)) continue;
      bindingRecords.push([key, record]);
      continue;
    }

    if (key.startsWith('page:')) {
      if (!isRecordObject(record)) continue;
      nextStore[key] = record;
    }
  }

  for (const [key, record] of bindingRecords) {
    const fromId = record.fromId ? String(record.fromId) : '';
    const toId = record.toId ? String(record.toId) : '';
    if (removedShapeIds.has(fromId) || removedShapeIds.has(toId)) continue;
    nextStore[key] = record;
  }

  return {
    ...input,
    store: nextStore,
  };
};

export const clipboardHasBlockedMedia = (event: ClipboardEvent): boolean => {
  const items = Array.from(event.clipboardData?.items || []);
  if (items.some(item => item.kind === 'file')) return true;
  if (items.some(item => item.type.startsWith('image/') || item.type.startsWith('video/'))) return true;

  const html = event.clipboardData?.getData('text/html') || '';
  if (/<img[\s>]/i.test(html) || /<video[\s>]/i.test(html) || /data:image\//i.test(html) || /data:video\//i.test(html)) {
    return true;
  }

  return false;
};

export const dataTransferHasBlockedMedia = (transfer: DataTransfer | null): boolean => {
  if (!transfer) return false;
  if ((transfer.files?.length || 0) > 0) return true;
  const types = new Set(Array.from(transfer.types || []));
  return types.has('Files');
};
