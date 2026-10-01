import { describe, it, expect } from 'vitest';
import { 
  generateSettleUpLinks, 
  cleanHandle, 
  getTopCreditedContributors, 
  getUserPaymentHandles, 
  hasAnyPaymentHandle 
} from '../src/lib/settleUp';
import { User } from '../src/types';

describe('💰 P2P 1-Click Settle-Up & Preferred Payment Preferences Engine', () => {
  it('cleanHandle should strip leading @ and $ symbols as well as full profile URLs', () => {
    expect(cleanHandle('@sarah_champion')).toBe('sarah_champion');
    expect(cleanHandle('$alex_pool')).toBe('alex_pool');
    expect(cleanHandle('john.doe')).toBe('john.doe');
    expect(cleanHandle('https://venmo.com/u/sarah_m')).toBe('sarah_m');
    expect(cleanHandle('https://cash.app/$alex_c')).toBe('alex_c');
    expect(cleanHandle('https://paypal.me/john_d')).toBe('john_d');
    expect(cleanHandle('sms:+15551234567')).toBe('+15551234567');
    expect(cleanHandle('tel:+15551234567')).toBe('+15551234567');
    expect(cleanHandle('')).toBe('');
  });

  it('generateSettleUpLinks should create valid Venmo, Cash App, PayPal, Zelle, and Apple Pay payment targets', () => {
    const handles = {
      venmo: '@office_champion',
      cashapp: '$breakroom_fund',
      paypal: 'pantry_treasury',
      zelle: 'champion@company.com',
      applepay: '+15551234567',
    };

    const links = generateSettleUpLinks('Engineering Breakroom', 14.50, handles);
    expect(links).toHaveLength(5);

    const venmo = links.find((l) => l.provider === 'venmo');
    expect(venmo).toBeDefined();
    expect(venmo?.url).toContain('venmo.com/?txn=pay');
    expect(venmo?.url).toContain('recipients=office_champion');
    expect(venmo?.url).toContain('amount=14.50');

    const cashapp = links.find((l) => l.provider === 'cashapp');
    expect(cashapp).toBeDefined();
    expect(cashapp?.url).toBe('https://cash.app/$breakroom_fund/14.50');

    const paypal = links.find((l) => l.provider === 'paypal');
    expect(paypal).toBeDefined();
    expect(paypal?.url).toBe('https://paypal.me/pantry_treasury/14.50');

    const zelle = links.find((l) => l.provider === 'zelle');
    expect(zelle).toBeDefined();
    expect(zelle?.instructions).toContain('champion@company.com');

    const applepay = links.find((l) => l.provider === 'applepay');
    expect(applepay).toBeDefined();
    expect(applepay?.url).toContain('sms:%2B15551234567');
    expect(applepay?.url).toContain('14.50');
    expect(applepay?.instructions).toContain('+15551234567');
  });

  it('should prioritize user preferred payment method to the top of the list', () => {
    const handles = {
      venmo: 'sarah_v',
      cashapp: 'sarah_cash',
      paypal: 'sarah_paypal',
      zelle: 'sarah@bank.com',
      applepay: '+15559876543',
    };

    // When user prefers Cash App
    const cashAppPreferred = generateSettleUpLinks('Breakroom', 10.00, handles, 'cashapp');
    expect(cashAppPreferred[0].provider).toBe('cashapp');
    expect(cashAppPreferred[0].isPreferred).toBe(true);

    // When user prefers Zelle
    const zellePreferred = generateSettleUpLinks('Breakroom', 10.00, handles, 'zelle');
    expect(zellePreferred[0].provider).toBe('zelle');
    expect(zellePreferred[0].isPreferred).toBe(true);

    // When user prefers Apple Pay
    const applePayPreferred = generateSettleUpLinks('Breakroom', 10.00, handles, 'applepay');
    expect(applePayPreferred[0].provider).toBe('applepay');
    expect(applePayPreferred[0].isPreferred).toBe(true);
  });

  it('should omit providers that have no configured handles', () => {
    const handles = {
      venmo: 'only_venmo_user',
    };

    const links = generateSettleUpLinks('Coffee Club', 5.00, handles);
    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe('venmo');
  });

  it('getTopCreditedContributors should select and rank the top three members with credit for bringing in items', () => {
    const mockMembers: User[] = [
      { id: 'u1', name: 'Alice', email: 'alice@test.com', avatar: '', role: 'member', balance: 35.50, joinedAt: '', venmoHandle: 'alice_v' },
      { id: 'u2', name: 'Bob', email: 'bob@test.com', avatar: '', role: 'contributor', balance: 12.00, joinedAt: '', cashappHandle: 'bob_c' },
      { id: 'u3', name: 'Charlie', email: 'charlie@test.com', avatar: '', role: 'member', balance: -8.00, joinedAt: '' },
      { id: 'u4', name: 'Diana', email: 'diana@test.com', avatar: '', role: 'member', balance: 45.00, joinedAt: '', paypalHandle: 'diana_p' },
      { id: 'u5', name: 'Evan', email: 'evan@test.com', avatar: '', role: 'member', balance: 22.00, joinedAt: '' },
    ];

    const topContributors = getTopCreditedContributors(mockMembers, 3);
    expect(topContributors).toHaveLength(3);
    // Highest positive credit first: Diana ($45), Alice ($35.50), Evan ($22)
    expect(topContributors[0].id).toBe('u4');
    expect(topContributors[0].name).toBe('Diana');
    expect(topContributors[1].id).toBe('u1');
    expect(topContributors[1].name).toBe('Alice');
    expect(topContributors[2].id).toBe('u5');
    expect(topContributors[2].name).toBe('Evan');
  });

  it('getUserPaymentHandles and hasAnyPaymentHandle correctly detect configured handles', () => {
    const userWithVenmo: User = {
      id: 'u1',
      name: 'User One',
      email: 'u1@test.com',
      avatar: '',
      role: 'member',
      balance: 10,
      joinedAt: '',
      venmoHandle: '@user_one',
      preferredPaymentMethod: 'venmo'
    };

    const handles = getUserPaymentHandles(userWithVenmo);
    expect(handles.venmo).toBe('@user_one');
    expect(handles.preferred).toBe('venmo');
    expect(hasAnyPaymentHandle(handles)).toBe(true);

    const userWithApplePay: User = {
      id: 'u3',
      name: 'User Three',
      email: 'u3@test.com',
      avatar: '',
      role: 'member',
      balance: 10,
      joinedAt: '',
      applePayHandle: '+15550001111',
      preferredPaymentMethod: 'applepay'
    };
    const appleHandles = getUserPaymentHandles(userWithApplePay);
    expect(appleHandles.applepay).toBe('+15550001111');
    expect(appleHandles.preferred).toBe('applepay');
    expect(hasAnyPaymentHandle(appleHandles)).toBe(true);

    const emptyUser: User = {
      id: 'u2',
      name: 'User Two',
      email: 'u2@test.com',
      avatar: '',
      role: 'member',
      balance: 0,
      joinedAt: '',
    };
    expect(hasAnyPaymentHandle(getUserPaymentHandles(emptyUser))).toBe(false);
  });

  it('SettleUpModal should render preferred P2P provider badges and prefill payment links', () => {
    const mockPool = {
      id: 'pool_123',
      name: 'Tech Pantry',
      category: 'Office',
      currency: '$',
      code: 'PANTRY-123456',
      championId: 'u1',
      members: [
        {
          id: 'u1',
          name: 'Sarah Champion',
          email: 'sarah@pantry.com',
          avatar: '',
          role: 'champion' as const,
          balance: 25.00,
          joinedAt: '',
          venmoHandle: 'sarah_venmo',
          cashappHandle: 'sarah_cash',
          preferredPaymentMethod: 'venmo' as const,
        },
        {
          id: 'u2',
          name: 'Bob Buyer',
          email: 'bob@pantry.com',
          avatar: '',
          role: 'member' as const,
          balance: -15.00,
          joinedAt: '',
        }
      ]
    };

    const currentUser = mockPool.members[1];
    const topContributor = mockPool.members[0];

    const handles = getUserPaymentHandles(topContributor);
    expect(handles.venmo).toBe('sarah_venmo');
    expect(handles.cashapp).toBe('sarah_cash');
    expect(handles.preferred).toBe('venmo');

    const links = generateSettleUpLinks(mockPool.name, 15.00, handles, topContributor.preferredPaymentMethod);
    expect(links.length).toBe(2);
    expect(links[0].provider).toBe('venmo');
    expect(links[0].isPreferred).toBe(true);
    expect(links[0].url).toContain('sarah_venmo');
    expect(links[1].provider).toBe('cashapp');
    expect(links[1].isPreferred).toBe(false);
  });
});
