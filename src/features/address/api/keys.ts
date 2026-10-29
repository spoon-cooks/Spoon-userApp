import { createKeyFactory } from '@core/query';

/** Address cache keys. `all()` is the blast radius every write invalidates. */
const factory = createKeyFactory('address');

export const addressKeys = {
  all: factory.all,
  list: () => factory.collection('list'),
  /** The society dropdown at one pin. */
  societies: (latitude: number, longitude: number) =>
    factory.collection('societies', { latitude, longitude }),
} as const;
