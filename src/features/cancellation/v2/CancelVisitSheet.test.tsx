import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CancelVisitSheet } from './CancelVisitSheet';
import type { CancelStep, CancelVisitSheetProps } from './CancelVisitSheet';
import {
  countdownLabel,
  durationLabel,
  feeZoneOf,
  outcomeLines,
  refundCaption,
  visitSubtitle,
} from './model';
import type { CancelQuote, CancelVisit } from './model';

/** 14 hrs 20 min before the slot. */
const NOW = new Date('2026-10-13T13:10:00.000Z');
/** Wed, 14 Oct, 9:00 AM IST. */
const START = '2026-10-14T03:30:00.000Z';

const VISIT: CancelVisit = {
  startsAt: START,
  durationMinutes: 90,
  cookName: 'Meera',
  cookOnTheWay: false,
  etaMinutes: null,
  wasRescheduled: false,
};

const quote = (feePercent: number): CancelQuote => {
  const fee = Math.ceil((29900 * feePercent) / 100);
  return {
    cancellable: true,
    feePercent,
    feePaise: fee,
    refundPaise: 29900 - fee,
    paidPaise: 29900,
    servicePaise: 25339,
    taxPaise: 4561,
  };
};

const REASONS = [
  { code: 'URGENT_CHANGE', label: 'Something urgent came up', requiresDetail: false },
  { code: 'ORDERED_DELIVERY', label: 'Ordered food', requiresDetail: false },
  { code: 'OTHER', label: 'Something else', requiresDetail: true },
];

function renderSheet(step: CancelStep, overrides: Partial<CancelVisitSheetProps> = {}) {
  const props: CancelVisitSheetProps = {
    visible: true,
    step,
    onStepChange: jest.fn(),
    visit: VISIT,
    quote: quote(0),
    reasons: REASONS,
    canReschedule: true,
    onReschedule: jest.fn(),
    onClose: jest.fn(),
    onConfirm: jest.fn(async () => true),
    refund: null,
    onBoundary: jest.fn(),
    onDone: jest.fn(),
    onBookVisit: jest.fn(),
    ...overrides,
  };
  render(<CancelVisitSheet {...props} />);
  return props;
}

describe('model', () => {
  it('formats the countdown, duration and subtitle as drawn', () => {
    expect(countdownLabel(START, NOW)).toBe('14 hrs 20 min');
    expect(countdownLabel(START, new Date('2026-10-14T02:50:00.000Z'))).toBe('40 min');
    expect(durationLabel(90)).toBe('1.5 hrs');
    expect(durationLabel(60)).toBe('1 hr');
    expect(visitSubtitle(VISIT)).toBe('Wed, 14 Oct · 9:00 AM · Cook Meera');
  });

  it('places the server percentage in the drawn window; the cook travelling overrides time', () => {
    expect(feeZoneOf(quote(0), VISIT)).toBe(0);
    expect(feeZoneOf(quote(25), VISIT)).toBe(1);
    expect(feeZoneOf(quote(50), VISIT)).toBe(2);
    expect(feeZoneOf(quote(100), { ...VISIT, cookOnTheWay: true })).toBe(3);
  });

  it('writes the outcome and refund lines from the server amounts', () => {
    expect(outcomeLines(quote(0), 0).title).toBe('Full refund · ₹253.39 + taxes');
    expect(outcomeLines(quote(25), 1)).toEqual({
      title: '₹74.75 · 25% fee',
      body: 'A refund of ₹224.25 shall be processed',
    });
    expect(refundCaption(quote(0), VISIT)).toBe('Full refund, inclusive of taxes');
    expect(refundCaption(quote(100), { ...VISIT, cookOnTheWay: true })).toBe(
      'No refund, cook was already on her way',
    );
  });
});

describe('C1 · Modify visit (2055:20524)', () => {
  it('shows the ticket and both options, and hides Reschedule when it is no longer offered', () => {
    const props = renderSheet('modify');
    expect(screen.getByText('Modify visit')).toBeTruthy();
    expect(screen.getByText('Cook Meera')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cancel-visit-option-cancel'));
    expect(props.onStepChange).toHaveBeenCalledWith('policy');
  });

  it('drops the Reschedule row once rescheduling is used up', () => {
    renderSheet('modify', { canReschedule: false });
    expect(screen.queryByTestId('cancel-visit-option-reschedule')).toBeNull();
  });
});

describe('C2 · Policy & fee (2055:20579)', () => {
  it('offers Reschedule and Continue in the free window', () => {
    renderSheet('policy');
    expect(screen.getByTestId('cancel-visit-zone-0-current')).toBeTruthy();
    expect(screen.getByText('Full refund · ₹253.39 + taxes')).toBeTruthy();
    expect(screen.getByTestId('cancel-visit-reschedule')).toBeTruthy();
    expect(screen.getByTestId('cancel-visit-continue')).toBeTruthy();
  });

  it('leads with "Keep my visit" from the 50% window', () => {
    const props = renderSheet('policy', { quote: quote(50) });
    expect(screen.getByTestId('cancel-visit-zone-2-current')).toBeTruthy();
    expect(screen.queryByTestId('cancel-visit-reschedule')).toBeNull();
    fireEvent.press(screen.getByTestId('cancel-visit-keep'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('turns the header into the live ETA while the cook travels', () => {
    renderSheet('policy', {
      quote: quote(100),
      visit: { ...VISIT, cookOnTheWay: true, etaMinutes: 12 },
    });
    expect(screen.getByText('COOK IS ON THE WAY')).toBeTruthy();
    expect(screen.getByText('Arriving in ~12 min')).toBeTruthy();
    expect(screen.getByTestId('cancel-visit-zone-3-current')).toBeTruthy();
  });
});

describe('C3 · Reason (2055:20651)', () => {
  it('keeps Continue disabled until a reason is picked, and nudges Reschedule for urgent', () => {
    renderSheet('reason');
    expect(
      screen.getByTestId('cancel-visit-reason-continue').props.accessibilityState.disabled,
    ).toBe(true);
    fireEvent.press(screen.getByTestId('cancel-visit-reason-URGENT_CHANGE'));
    expect(screen.getByTestId('cancel-visit-nudge')).toBeTruthy();
    expect(
      screen.getByTestId('cancel-visit-reason-continue').props.accessibilityState.disabled,
    ).toBeFalsy();
  });

  it('needs the "Something else" text before Continue, capped at 200', () => {
    renderSheet('reason');
    fireEvent.press(screen.getByTestId('cancel-visit-reason-OTHER'));
    expect(
      screen.getByTestId('cancel-visit-reason-continue').props.accessibilityState.disabled,
    ).toBe(true);
    fireEvent.changeText(screen.getByTestId('cancel-visit-reason-detail'), 'x'.repeat(250));
    expect(screen.getByText('Limit reached · 200 / 200')).toBeTruthy();
  });
});

describe('C4 · Review & confirm (2055:20716, 2055:20361)', () => {
  it('sends once, then moves to C5', async () => {
    const onConfirm = jest.fn(async () => true);
    const onStepChange = jest.fn();
    render(<CancelVisitSheetHarness onConfirm={onConfirm} onStepChange={onStepChange} />);
    toReview();
    fireEvent.press(screen.getByTestId('cancel-visit-confirm'));
    fireEvent.press(screen.getByTestId('cancel-visit-confirm'));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith('done'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('URGENT_CHANGE', '');
  });

  it('stays on C4 with a toast when the cancel fails', async () => {
    const onStepChange = jest.fn();
    render(
      <CancelVisitSheetHarness
        onConfirm={jest.fn(async () => false)}
        onStepChange={onStepChange}
      />,
    );
    toReview();
    fireEvent.press(screen.getByTestId('cancel-visit-confirm'));
    expect(await screen.findByText('Couldn’t cancel the visit. Try again.')).toBeTruthy();
    expect(onStepChange).not.toHaveBeenCalledWith('done');
  });

  it('draws the ₹0 variant: 100% fee, no "Refund to" row', () => {
    render(
      <CancelVisitSheetHarness
        quote={quote(100)}
        visit={{ ...VISIT, cookOnTheWay: true }}
        onConfirm={jest.fn(async () => true)}
        onStepChange={jest.fn()}
      />,
    );
    toReview();
    expect(screen.getByText('Refund summary')).toBeTruthy();
    expect(screen.getByText('Cancellation fee · 100%')).toBeTruthy();
    expect(screen.getByTestId('cancel-visit-refund-amount').props.children).toBe('₹0');
    expect(screen.queryByText('REFUND TO')).toBeNull();
  });
});

describe('C5 · Visit cancelled (2055:20787, 2055:20432)', () => {
  it('tracks the refund, and leaves through Done or Book a visit', () => {
    const props = renderSheet('done', {
      refund: {
        amountPaise: 29900,
        method: 'upi',
        refunded: false,
        initiatedAt: null,
        creditedAt: null,
      },
    });
    // `2303:4231` — the same Refund tracker as Visit details, at Initiated.
    expect(screen.getByText('Booking refund ₹299')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Refund initiated')).toBeTruthy();
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cancel-visit-finish'));
    fireEvent.press(screen.getByTestId('cancel-visit-book'));
    expect(props.onDone).toHaveBeenCalled();
    expect(props.onBookVisit).toHaveBeenCalled();
  });

  it('shows the no-refund summary when the cook had already left', () => {
    renderSheet('done', { quote: quote(100), visit: { ...VISIT, cookOnTheWay: true } });
    expect(screen.getByText('No refund due')).toBeTruthy();
    expect(
      screen.getByText('Meera had already left for your home, so the full ₹299 went to her.'),
    ).toBeTruthy();
  });
});

/** C4 needs a picked reason, which the sheet holds: this starts on C3, controlled. */
function CancelVisitSheetHarness({
  onConfirm,
  onStepChange,
  quote: q = quote(0),
  visit = VISIT,
}: {
  onConfirm: (code: string, detail: string) => Promise<boolean>;
  onStepChange: (step: CancelStep) => void;
  quote?: CancelQuote;
  visit?: CancelVisit;
}) {
  const [step, setStep] = useState<CancelStep>('reason');
  return (
    <CancelVisitSheet
      visible
      step={step}
      onStepChange={(next) => {
        onStepChange(next);
        setStep(next);
      }}
      visit={visit}
      quote={q}
      reasons={REASONS}
      canReschedule={false}
      onReschedule={jest.fn()}
      onClose={jest.fn()}
      onConfirm={onConfirm}
      refund={null}
      onBoundary={jest.fn()}
      onDone={jest.fn()}
      onBookVisit={jest.fn()}
    />
  );
}

/** C3 → C4 with "Something urgent came up". */
function toReview() {
  fireEvent.press(screen.getByTestId('cancel-visit-reason-URGENT_CHANGE'));
  fireEvent.press(screen.getByTestId('cancel-visit-reason-continue'));
}
