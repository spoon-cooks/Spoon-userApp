import * as firebase from '@react-native-firebase/remote-config';

import { getConfig } from '@core/config';
import { parameterName } from '@core/remoteConfig';

import { explainerVideoFrom, fetchExplainerVideo } from './video';

const mockedGetString = jest.mocked(firebase.getString);
const mockedFetch = jest.mocked(firebase.fetchAndActivate);

/** The explainer video, set from Firebase Remote Config (owner, 31 Oct 2026). */
describe('the Recurring explainer from Remote Config', () => {
  afterEach(() => {
    mockedGetString.mockReset();
    mockedFetch.mockReset();
  });

  it('plays the S3 link set in the console', async () => {
    const url = 'https://spoon-media.s3.ap-south-1.amazonaws.com/recurring-explainer.mp4';
    mockedGetString.mockImplementation((_config, key) =>
      key === parameterName('recurring_explainer_video_url', getConfig().appEnv) ? ` ${url} ` : '',
    );

    await expect(fetchExplainerVideo()).resolves.toEqual({ uri: url });
  });

  it('has no video when none is set, the link is not https, or Firebase cannot be read', async () => {
    mockedGetString.mockImplementation(() => '');
    await expect(fetchExplainerVideo()).resolves.toBeNull();

    expect(explainerVideoFrom('http://example.com/a.mp4')).toBeNull();
    expect(explainerVideoFrom('javascript:alert(1)')).toBeNull();

    mockedFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchExplainerVideo()).resolves.toBeNull();
  });
});
