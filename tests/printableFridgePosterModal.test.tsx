import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrintableFridgePosterModal } from '../src/components/PrintableFridgePosterModal';
import { Item, Pool } from '../src/types';

describe('PrintableFridgePosterModal Marketing & Breakroom Signage', () => {
  const mockClose = vi.fn();
  const mockPrint = vi.fn();
  const mockOpenNfc = vi.fn();

  const mockItems: Item[] = [
    {
      id: 'item-coffee-01',
      poolId: 'pool-office-1',
      name: 'Cold Brew Can',
      category: 'Beverages',
      costPerUnit: 2.5,
      costPerUnitCents: 250,
      unitName: 'can',
      stock: 10,
      minStock: 3,
      icon: 'coffee',
    },
    {
      id: 'item-snack-02',
      poolId: 'pool-office-1',
      name: 'Almond Protein Bar',
      category: 'Snacks',
      costPerUnit: 1.75,
      costPerUnitCents: 175,
      unitName: 'bar',
      stock: 14,
      minStock: 4,
      icon: 'cookie',
    },
  ];

  const mockPool: Pool = {
    id: 'pool_snack3xyz',
    name: 'Floor 4 Snack Hub',
    description: 'Shared breakroom pantry',
    code: 'SNACK3',
    currency: '$',
    createdAt: new Date().toISOString(),
    championId: 'user-champion-1',
    category: 'Office',
    members: [
      {
        id: 'user-champion-1',
        name: 'Sarah Connor',
        email: 'sarah@skynet.com',
        avatar: '',
        role: 'champion',
        balance: 15.0,
        joinedAt: new Date().toISOString(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.print = mockPrint;
  });

  it('renders dual-path marketing explainer by default with headline, grabber/bringer paths, QR and join code', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
        onOpenNfc={mockOpenNfc}
      />
    );

    // Header branding
    expect(screen.getByText('Communal Refrigerator & Countertop Poster')).toBeInTheDocument();
    expect(screen.getByText('Marketing Hub')).toBeInTheDocument();

    // Default Dual-Path Explainer content
    expect(screen.getByText('WELCOME TO OUR SHARED PANTRY')).toBeInTheDocument();
    expect(screen.getByText(/No spreadsheets\. No awkward IOUs\. Powered by PantryPool\./i)).toBeInTheDocument();

    // Dual path columns
    expect(screen.getByText('GRABBING FOOD?')).toBeInTheDocument();
    expect(screen.getByText('BRINGING SNACKS?')).toBeInTheDocument();
    expect(screen.getByText(/Point phone camera to join/i)).toBeInTheDocument();
    expect(screen.getByText(/NO APP REQUIRED • RUNS IN BROWSER/i)).toBeInTheDocument();

    // Formatted join code
    expect(screen.getByText('S N A C K 3')).toBeInTheDocument();

    // Trust badge & Champion contact
    expect(screen.getByText(/Supports Venmo, Cash App & Card • Zero account setup/i)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Connor/i)).toBeInTheDocument();
  });

  it('toggles customizer drawer and switches to 3-Step Action Hub template', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    // Open customizer
    const customizeBtn = screen.getByText(/Customize Poster/i);
    fireEvent.click(customizeBtn);

    expect(screen.getByText('Poster Marketing & Hardware Stand Customizer')).toBeInTheDocument();

    // Switch to 3-Step Action Hub
    const actionStepsBtn = screen.getByText(/3-Step Action Hub/i);
    fireEvent.click(actionStepsBtn);

    // Verify 3-step action content appears
    expect(screen.getByText('GRAB A SNACK. KEEP IT FAIR.')).toBeInTheDocument();
    expect(screen.getByText('Take what you want — log what you owe.')).toBeInTheDocument();
    expect(screen.getByText('SCAN QR')).toBeInTheDocument();
    expect(screen.getByText('TAP ITEM')).toBeInTheDocument();
    expect(screen.getByText('RESTOCK / PAY')).toBeInTheDocument();
  });

  it('customizes title, headline, subtitle, champion contact, and currency dynamically', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    fireEvent.click(screen.getByText(/Customize Poster/i));

    // Change title
    const titleInput = screen.getByPlaceholderText(/e\.g\. Breakroom Snack Hub/i);
    fireEvent.change(titleInput, { target: { value: 'SkyNet Breakroom Lounge' } });

    // Change headline
    const headlineInput = screen.getByPlaceholderText(/e\.g\. WELCOME TO OUR SHARED PANTRY/i);
    fireEvent.change(headlineInput, { target: { value: 'COMMUNITY FUEL STATION' } });

    // Change subtitle
    const subtitleInput = screen.getByPlaceholderText(/e\.g\. No spreadsheets\. No awkward IOUs\./i);
    fireEvent.change(subtitleInput, { target: { value: 'Fair share drinks & treats for the whole squad' } });

    // Change champion contact
    const championInput = screen.getByPlaceholderText(/e\.g\. Sarah in Ops or the pool champion/i);
    fireEvent.change(championInput, { target: { value: 'John Connor in Operations' } });

    // Verify updates in poster
    expect(screen.getByText('SkyNet Breakroom Lounge')).toBeInTheDocument();
    expect(screen.getByText('COMMUNITY FUEL STATION')).toBeInTheDocument();
    expect(screen.getByText('Fair share drinks & treats for the whole squad')).toBeInTheDocument();
    expect(screen.getByText(/John Connor in Operations/i)).toBeInTheDocument();
  });

  it('updates stand format dimensions between 5x7 acrylic stand, letter, and A4', () => {
    const { container } = render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    fireEvent.click(screen.getByText(/Customize Poster/i));

    const poster = container.querySelector('#printable-fridge-poster');
    expect(poster?.className).toContain('max-w-[440px]'); // 5x7 initial

    const formatSelect = screen.getByDisplayValue(/Acrylic Counter Stand/i);
    fireEvent.change(formatSelect, { target: { value: 'portrait_8x11' } });

    expect(poster?.className).toContain('max-w-[620px]'); // 8.5x11

    fireEvent.change(formatSelect, { target: { value: 'wall_a4' } });
    expect(poster?.className).toContain('max-w-[650px]'); // A4
  });

  it('toggles shelf cutout tags on and off and formats prices with currency', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    // Initial state: shelf tags shown since items.length > 0
    expect(screen.getByText(/Cut & Tape Shelf & Bin QR Tags/i)).toBeInTheDocument();
    expect(screen.getByText('Cold Brew Can')).toBeInTheDocument();
    expect(screen.getByText('$2.50 • can')).toBeInTheDocument();
    expect(screen.getByText('Almond Protein Bar')).toBeInTheDocument();
    expect(screen.getByText('$1.75 • bar')).toBeInTheDocument();

    // Toggle off shelf tags
    fireEvent.click(screen.getByText(/Customize Poster/i));
    const checkbox = screen.getByLabelText(/Include Shelf & Bin QR Cutout Tags/i);
    fireEvent.click(checkbox);

    expect(screen.queryByText(/Cut & Tape Shelf & Bin QR Tags/i)).not.toBeInTheDocument();
  });

  it('switches between color and monochrome laser ink palettes', () => {
    const { container } = render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    fireEvent.click(screen.getByText(/Customize Poster/i));

    const monoBtn = screen.getByText(/Pure B&W Laser/i);
    fireEvent.click(monoBtn);

    const poster = container.querySelector('#printable-fridge-poster');
    expect(poster?.className).toContain('border-black');
  });

  it('resets customizer values back to defaults when clicking Reset Defaults', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    fireEvent.click(screen.getByText(/Customize Poster/i));

    const titleInput = screen.getByPlaceholderText(/e\.g\. Breakroom Snack Hub/i);
    fireEvent.change(titleInput, { target: { value: 'Temporary Custom Name' } });
    expect(screen.getByText('Temporary Custom Name')).toBeInTheDocument();

    const resetBtn = screen.getByText(/Reset Defaults/i);
    fireEvent.click(resetBtn);

    expect(screen.getByText('Floor 4 Snack Hub')).toBeInTheDocument();
  });

  it('triggers window.print when clicking Print Poster and manages poster-print-active class on body', () => {
    const { unmount } = render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    // Body should have poster-print-active class while open
    expect(document.body.classList.contains('poster-print-active')).toBe(true);

    const printBtn = screen.getByText('Print Poster');
    fireEvent.click(printBtn);

    expect(mockPrint).toHaveBeenCalledTimes(1);

    // Unmounting removes the body class
    unmount();
    expect(document.body.classList.contains('poster-print-active')).toBe(false);
  });

  it('injects print stylesheet rules ensuring workspace elements are hidden without blank leading pages', () => {
    const { container } = render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
      />
    );

    const styleTag = container.querySelector('style');
    expect(styleTag).not.toBeNull();
    const styleContent = styleTag?.innerHTML || '';

    // Verify @media print rules
    expect(styleContent).toContain('@media print');
    expect(styleContent).toContain('body.poster-print-active');
    expect(styleContent).toContain('display: none !important');
    expect(styleContent).toContain('#printable-fridge-poster');
    expect(styleContent).toContain('print-color-adjust: exact !important');
    // Ensure the old buggy body * visibility: hidden pattern is eliminated
    expect(styleContent).not.toContain('body * {\n            visibility: hidden !important;');
  });

  it('calls onClose when clicking close button and onOpenNfc when clicking NFC tags button', () => {
    render(
      <PrintableFridgePosterModal
        pool={mockPool}
        items={mockItems}
        onClose={mockClose}
        onOpenNfc={mockOpenNfc}
      />
    );

    const nfcBtn = screen.getByText('NFC Tags');
    fireEvent.click(nfcBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockOpenNfc).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByLabelText('Close dialog');
    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledTimes(2);
  });
});
