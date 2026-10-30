import { createKeyFactory } from '@core/query';

const factory = createKeyFactory('catalogue');

export const catalogueKeys = {
  all: factory.all,
  current: () => factory.collection('current'),
  /** The catalogue as one address's hub sees it. */
  forAddress: (addressId: string) => factory.collection('current', { addressId }),
} as const;
