import { redact, REDACTED } from './redact';

describe('redact', () => {
  it('removes values under denied keys', () => {
    const result = redact({
      otp: '4821',
      accessToken: 'abc.def.ghi',
      phone: '+91 98765 43210',
      cookName: 'Asha',
      bookingId: 'bk_123',
    });

    expect(result).toEqual({
      otp: REDACTED,
      accessToken: REDACTED,
      phone: REDACTED,
      cookName: REDACTED,
      bookingId: 'bk_123',
    });
  });

  it('matches denied keys case- and separator-insensitively', () => {
    expect(redact({ Start_OTP: '1234', 'refresh-token': 'x' })).toEqual({
      Start_OTP: REDACTED,
      'refresh-token': REDACTED,
    });
  });

  it('scrubs phone numbers hidden inside innocent-looking string values', () => {
    const result = redact({ note: 'call the cook on 9876543210 before arriving' });
    expect(result).toEqual({ note: `call the cook on ${REDACTED} before arriving` });
  });

  it('scrubs bearer tokens and JWTs in free text', () => {
    const jwt = 'eyJhbGciOi.eyJzdWIi.sig';
    expect(redact({ header: `Bearer ${jwt}` })).toEqual({ header: REDACTED });
    expect(redact({ blob: `token=${jwt} end` })).toEqual({ blob: `token=${REDACTED} end` });
  });

  it('redacts nested structures and arrays', () => {
    const result = redact({
      booking: { address: { line1: 'B-402' }, cook: [{ phone: '9876543210' }] },
    });

    expect(result).toEqual({ booking: { address: REDACTED, cook: [{ phone: REDACTED }] } });
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { id: 1 };
    node.self = node;

    expect(redact(node)).toEqual({ id: 1, self: '[CIRCULAR]' });
  });

  it('reduces errors to name and message', () => {
    expect(redact(new Error('failed for 9876543210'))).toEqual({
      name: 'Error',
      message: `failed for ${REDACTED}`,
    });
  });

  it('truncates beyond max depth rather than throwing', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 10; i += 1) {
      deep = { nested: deep };
    }

    expect(JSON.stringify(redact(deep))).toContain('[TRUNCATED]');
  });
});
