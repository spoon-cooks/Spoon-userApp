import { renderHook } from '@testing-library/react-native';

import { crashReporter } from '@core/crash';

import { useMe } from './api';
import { useCrashIdentity } from './useCrashIdentity';

jest.mock('./api', () => ({ useMe: jest.fn() }));
jest.mock('@core/crash', () => ({
  crashReporter: { setUser: jest.fn(), clearUser: jest.fn() },
}));

const mockedUseMe = jest.mocked(useMe);
const setUser = jest.mocked(crashReporter.setUser);
const clearUser = jest.mocked(crashReporter.clearUser);

function meReturns(state: unknown): void {
  mockedUseMe.mockReturnValue({ state } as unknown as ReturnType<typeof useMe>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useCrashIdentity', () => {
  it('names the account by its id once /me has loaded', () => {
    meReturns({ status: 'ready', data: { id: 'user-1', name: 'Asha', phone: '9876543210' } });

    renderHook(() => useCrashIdentity(true));

    expect(setUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith('user-1');
  });

  it('names nobody while /me is loading or has failed', () => {
    meReturns({ status: 'loading' });
    renderHook(() => useCrashIdentity(true));
    meReturns({ status: 'error' });
    renderHook(() => useCrashIdentity(true));

    expect(setUser).not.toHaveBeenCalled();
  });

  it('does not fire /me until it is enabled, so a guest or a bootstrapping app never 401s', () => {
    meReturns({ status: 'loading' });

    renderHook(() => useCrashIdentity(false));

    expect(mockedUseMe).toHaveBeenCalledWith({ enabled: false });
  });

  it('forgets the account when the shell goes away', () => {
    meReturns({ status: 'ready', data: { id: 'user-1' } });
    const { unmount } = renderHook(() => useCrashIdentity(true));
    clearUser.mockClear();

    unmount();

    expect(clearUser).toHaveBeenCalledTimes(1);
  });

  it('switches accounts without leaving the old id attached', () => {
    meReturns({ status: 'ready', data: { id: 'user-1' } });
    const { rerender } = renderHook(() => useCrashIdentity(true));

    meReturns({ status: 'ready', data: { id: 'user-2' } });
    rerender({});

    expect(clearUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenLastCalledWith('user-2');
  });
});
