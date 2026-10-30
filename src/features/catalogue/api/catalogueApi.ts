import type { ApiClient } from '@core/api';

import { catalogueSchema } from './schemas';
import type { Catalogue } from './schemas';

/**
 * `GET /v1/catalogue`. Sent with the session's token like every other read; V0 also serves it
 * WITHOUT one, which is what lets a guest's Home (iOS "Skip") show real prices.
 */
export const CATALOGUE_PATH = '/v1/catalogue';

export function createCatalogueApi(api: ApiClient) {
  return {
    /**
     * With `addressId` the server narrows `operatingWindow` to that address's hub hours
     * (R-SLOT-02/17) and applies this customer's own prices.
     */
    async get(signal?: AbortSignal, addressId?: string): Promise<Catalogue> {
      const path =
        addressId === undefined
          ? CATALOGUE_PATH
          : `${CATALOGUE_PATH}?${new URLSearchParams({ addressId }).toString()}`;
      return api.request(path, {
        parse: (data) => catalogueSchema.parse(data),
        ...(signal === undefined ? {} : { signal }),
      });
    },
  };
}
