import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { BootstrapPayload, BattleRoomSummary, DurakCard, DurakRoomProjection, FriendProfile, ItemCard } from '../src/types';
import { canBeatCard } from '../src/utils/durakEngine';

const TEST_BOT_TOKEN = '999999999:AAFakeTestBotTokenForNetworkTestsOnly_12345';
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cardup-net-tests-'));

process.env.CARDUP_DATA_DIR = TMP_DATA_DIR;
process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
process.env.TELEGRAM_BOT_POLLING = 'false';

let baseUrl = '';
let wsUrl = '';
let closeServer: (() => Promise<void>) | null = null;

interface ApiResult<T = Record<string, unknown>> {
  status: number;
  json: T;
  headers: Headers;
}

class TestClient {
  cookie = '';
  userId = '';
  username = '';
  friendCode = '';
  referralCode = '';

  async request<T = Record<string, unknown>>(
    pathname: string,
    options: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.rawBody !== undefined
          ? options.rawBody
          : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/cardup_tg_session=([^;]+)/);
      if (match) this.cookie = `cardup_tg_session=${match[1]}`;
    }
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { rawText: text };
    }
    return { status: res.status, json: json as T, headers: res.headers };
  }

  async loginWithTelegramWidget(tgId: number, firstName: string, username: string): Promise<BootstrapPayload> {
    const payload = buildSignedTelegramWidgetPayload(tgId, firstName, username);
    const res = await this.request<{ payload: BootstrapPayload }>('/api/auth/telegram/verify-widget', {
      method: 'POST',
      body: payload,
    });
    assert.equal(res.status, 200, `Login failed: ${JSON.stringify(res.json)}`);
    this.userId = res.json.payload.user.id;
    this.username = res.json.payload.user.username;
    this.friendCode = res.json.payload.user.friendCode;
    this.referralCode = res.json.payload.user.referralCode;
    return res.json.payload;
  }

  async connectWs(): Promise<{
    ws: WebSocket;
    events: Array<{ type: string; [key: string]: unknown }>;
    waitForEvent: (type: string, timeoutMs?: number) => Promise<{ type: string; [key: string]: unknown }>;
    close: () => Promise<void>;
  }> {
    const ws = new WebSocket(wsUrl, { headers: this.cookie ? { Cookie: this.cookie } : undefined });
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const waiters: Array<{ type: string; resolve: (ev: { type: string; [key: string]: unknown }) => void }> = [];

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as { type: string; [key: string]: unknown };
        events.push(parsed);
        const idx = waiters.findIndex((w) => w.type === parsed.type);
        if (idx >= 0) {
          const [waiter] = waiters.splice(idx, 1);
          waiter.resolve(parsed);
        }
      } catch {
        // ignore
      }
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WS open timeout')), 3000);
      ws.once('open', () => {
        clearTimeout(t);
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    });

    const waitForEvent = async (type: string, timeoutMs = 6000) => {
      const existing = events.find((ev) => ev.type === type);
      if (existing) return existing;
      return new Promise<{ type: string; [key: string]: unknown }>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timed out waiting for WS event "${type}". Received: ${events.map((e) => e.type).join(', ')}`));
        }, timeoutMs);
        waiters.push({
          type,
          resolve: (ev) => {
            clearTimeout(timer);
            resolve(ev);
          },
        });
      });
    };

    // Consume initial 'connected' message
    await waitForEvent('connected', 3000);
    events.length = 0;

    return {
      ws,
      events,
      waitForEvent,
      close: () =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          ws.once('close', () => resolve());
          ws.close();
        }),
    };
  }
}

function buildSignedTelegramWidgetPayload(
  tgId: number,
  firstName: string,
  username: string,
  authDateOverride?: number
) {
  const fields: Record<string, string | number> = {
    auth_date: authDateOverride ?? Math.floor(Date.now() / 1000),
    first_name: firstName,
    id: tgId,
    username,
  };
  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(TEST_BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

function buildSignedWebAppInitData(user: { id: number; first_name: string; username?: string }) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', `AAE_${crypto.randomBytes(4).toString('hex')}`);
  params.set('user', JSON.stringify(user));
  const entries: string[] = [];
  params.forEach((v, k) => entries.push(`${k}=${v}`));
  entries.sort();
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TEST_BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(entries.join('\n')).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

before(async () => {
  const { startServer } = await import('../server');
  const started = await startServer({ port: 0, disableVite: true, disableTelegramBot: true });
  closeServer = started.close;
  const addr = started.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
});

after(async () => {
  if (closeServer) await closeServer();
  fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});

test('1. Auth, session security, replay prevention & malformed payload resilience', async () => {
  const anon = new TestClient();
  const boot = await anon.request<BootstrapPayload>('/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.json.authenticated, false);
  assert.equal(boot.json.friends.length, 0);
  assert.ok(boot.json.cases.length >= 5);

  // Unauthenticated access to protected routes must return 401
  const protectedCalls = [
    anon.request('/api/auth/me'),
    anon.request('/api/battles/current'),
    anon.request('/api/battles', { method: 'POST', body: { mode: 'cases', caseId: 'case_starter', caseCount: 1 } }),
    anon.request('/api/friends', { method: 'POST', body: { code: 'FR-TEST' } }),
    anon.request('/api/cases/open', { method: 'POST', body: { caseId: 'case_starter' } }),
    anon.request('/api/minigames/harvest/start', { method: 'POST', body: {} }),
  ];
  const protectedResponses = await Promise.all(protectedCalls);
  for (const res of protectedResponses) {
    assert.equal(res.status, 401);
  }

  // Malformed JSON returns 400 JSON (not 500 or HTML)
  const badJson = await anon.request('/api/battles', { method: 'POST', rawBody: '{ invalid json !!!' });
  assert.equal(badJson.status, 400);
  assert.equal(typeof badJson.json.error, 'string');

  // Bad Telegram HMAC signature rejected
  const tampered = buildSignedTelegramWidgetPayload(10001, 'Evil', 'evil_user');
  tampered.hash = '0'.repeat(64);
  const badSig = await anon.request('/api/auth/telegram/verify-widget', { method: 'POST', body: tampered });
  assert.equal(badSig.status, 401);

  // Expired auth_date rejected
  const expired = buildSignedTelegramWidgetPayload(10001, 'Old', 'old_user', Math.floor(Date.now() / 1000) - 3600);
  const expiredRes = await anon.request('/api/auth/telegram/verify-widget', { method: 'POST', body: expired });
  assert.equal(expiredRes.status, 401);

  // Valid login succeeds and replay of exact same hash is blocked
  const validPayload = buildSignedTelegramWidgetPayload(10001, 'Alice', 'alice_tg');
  const login1 = await anon.request<{ payload: BootstrapPayload }>('/api/auth/telegram/verify-widget', {
    method: 'POST',
    body: validPayload,
  });
  assert.equal(login1.status, 200);
  assert.ok(anon.cookie.includes('cardup_tg_session='));

  const replay = await new TestClient().request('/api/auth/telegram/verify-widget', {
    method: 'POST',
    body: validPayload,
  });
  assert.equal(replay.status, 401);

  // Check /api/auth/me works, then /api/auth/logout revokes session
  const meBefore = await anon.request('/api/auth/me');
  assert.equal(meBefore.status, 200);
  const savedCookie = anon.cookie;

  const logoutRes = await anon.request('/api/auth/logout', { method: 'POST', body: {} });
  assert.equal(logoutRes.status, 200);

  // Reusing revoked cookie fails both HTTP and WS
  const reused = new TestClient();
  reused.cookie = savedCookie;
  const meAfter = await reused.request('/api/auth/me');
  assert.equal(meAfter.status, 401);
  await assert.rejects(() => reused.connectWs());

  // Unauthenticated WebSocket rejected
  await assert.rejects(() => new TestClient().connectWs());

  // WebApp initData auth works too
  const webAppClient = new TestClient();
  const initData = buildSignedWebAppInitData({ id: 10002, first_name: 'Bob', username: 'bob_tg' });
  const webAppRes = await webAppClient.request<{ payload: BootstrapPayload }>('/api/auth/telegram/verify-webapp', {
    method: 'POST',
    body: { initData },
  });
  assert.equal(webAppRes.status, 200);
  assert.equal(webAppRes.json.payload.user.username, 'Bob');
});

test('2. Non-string / fuzz body types never trigger 500 Internal Server Error', async () => {
  const client = new TestClient();
  await client.loginWithTelegramWidget(20001, 'Fuzzer', 'fuzzer_tg');

  const fuzzRequests = [
    client.request('/api/battles', { method: 'POST', body: { mode: 'cases', caseId: 123, caseCount: 'NaN', password: 999 } }),
    client.request('/api/battles', { method: 'POST', body: { mode: 'cases', caseId: 'case_starter', caseCount: 0, password: { obj: true } } }),
    client.request('/api/battles', { method: 'POST', body: { mode: 'upgrade', stakeItemIds: [123, null, {}] } }),
    client.request('/api/battles', { method: 'POST', rawBody: 'null' }),
    client.request('/api/battles', { method: 'POST', rawBody: '[1,2,3]' }),
    client.request('/api/friends', { method: 'POST', body: { code: { nested: 1 } } }),
    client.request('/api/referral/apply', { method: 'POST', body: { code: 12345 } }),
    client.request('/api/inventory/sell', { method: 'POST', body: { instanceIds: 'bad' } }),
    client.request('/api/contracts/craft', { method: 'POST', body: { instanceIds: [null, 1] } }),
    client.request('/api/profile/customization', { method: 'POST', body: { showcaseItemIds: 'not-array' } }),
  ];

  const results = await Promise.all(fuzzRequests);
  for (const r of results) {
    assert.ok(r.status >= 400 && r.status < 500, `Expected 4xx but got ${r.status}: ${JSON.stringify(r.json)}`);
  }
});

test('3. Friends lifecycle, mutual auto-accept, multi-tab WS sync, profile ACL & removal cleanup', async () => {
  const alice = new TestClient();
  const bob = new TestClient();
  const charlie = new TestClient();

  await alice.loginWithTelegramWidget(30001, 'Alice', 'alice_fr');
  await bob.loginWithTelegramWidget(30002, 'Bob', 'bob_fr');
  await charlie.loginWithTelegramWidget(30003, 'Charlie', 'charlie_fr');

  const aliceWs1 = await alice.connectWs();
  const aliceWs2 = await alice.connectWs(); // multi-tab same user
  const bobWs = await bob.connectWs();

  try {
    // Unknown friend code & self-add validation
    const missing = await alice.request('/api/friends', { method: 'POST', body: { code: 'FR-DOESNOTEXIST' } });
    assert.equal(missing.status, 404);
    const selfAdd = await alice.request('/api/friends', { method: 'POST', body: { code: alice.friendCode } });
    assert.equal(selfAdd.status, 400);

    // Non-friends cannot view profile
    const strangerProfile = await alice.request(`/api/friends/${bob.userId}/profile`);
    assert.equal(strangerProfile.status, 403);

    // Send request with lowercase + extra spaces (must normalize)
    const sendReq = await alice.request('/api/friends', {
      method: 'POST',
      body: { code: `  ${bob.friendCode.toLowerCase()}  ` },
    });
    assert.equal(sendReq.status, 200);
    assert.equal(sendReq.json.requestSent, true);

    const bobIncoming = await bobWs.waitForEvent('friend_request');
    assert.equal(bobIncoming.username, 'Alice');

    // Duplicate send returns 409
    const dupReq = await alice.request('/api/friends', { method: 'POST', body: { code: bob.friendCode } });
    assert.equal(dupReq.status, 409);

    // Bob declines -> Alice receives friend_request_declined
    const bobBoot1 = await bob.request<BootstrapPayload>('/api/bootstrap');
    const reqId = bobBoot1.json.friendRequestsReceived[0]?.id;
    assert.ok(reqId);
    const declineRes = await bob.request(`/api/friends/requests/${reqId}`, { method: 'DELETE' });
    assert.equal(declineRes.status, 200);
    await aliceWs1.waitForEvent('friend_request_declined');
    await aliceWs2.waitForEvent('friend_request_declined');

    // Alice re-sends; Bob reciprocates by entering Alice's friend code -> mutual auto-accept!
    const sendAgain = await alice.request('/api/friends', { method: 'POST', body: { code: bob.friendCode } });
    assert.equal(sendAgain.status, 200);
    await sleep(50);
    const reverseAdd = await bob.request<{ requestAccepted?: boolean; payload: BootstrapPayload }>('/api/friends', {
      method: 'POST',
      body: { code: alice.friendCode },
    });
    assert.equal(reverseAdd.status, 200);
    assert.equal(reverseAdd.json.requestAccepted, true);
    assert.ok(reverseAdd.json.payload.friends.some((f) => f.id === alice.userId));
    assert.equal(reverseAdd.json.payload.friendRequestsReceived.length, 0);

    await aliceWs1.waitForEvent('friend_request_accepted');
    await aliceWs2.waitForEvent('friend_request_accepted');

    // Mutual friend profile access allowed
    const friendProfile = await alice.request<{ profile: FriendProfile }>(`/api/friends/${bob.userId}/profile`);
    assert.equal(friendProfile.status, 200);
    assert.equal(friendProfile.json.profile.id, bob.userId);
    // Stranger still 403
    const charlieView = await charlie.request(`/api/friends/${bob.userId}/profile`);
    assert.equal(charlieView.status, 403);

    // Create battle + invite Bob BEFORE unfriending to verify unfriend expires pending battle invitations!
    // Give Alice extra TC via case/battle seed? Both start with 500 TC. Find a case or earn TC!
    const bootA = await alice.request<BootstrapPayload>('/api/bootstrap');
    const starterItemId = bootA.json.user.inventory[0]?.instanceId;
    assert.ok(starterItemId);
    const upgradeBattle = await alice.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [starterItemId] },
    });
    assert.equal(upgradeBattle.status, 200);

    const invRes = await alice.request<{ inviteId: string }>(`/api/battles/${upgradeBattle.json.battle.id}/invite`, {
      method: 'POST',
      body: { friendId: bob.userId },
    });
    assert.equal(invRes.status, 200);
    await bobWs.waitForEvent('battle_invitation');

    // Alice removes Bob from friends -> Bob receives BOTH battle_invitation_expired and friend_removed, and cannot accept the old invite
    const unfriendRes = await alice.request<{ payload: BootstrapPayload }>(`/api/friends/${bob.userId}`, {
      method: 'DELETE',
    });
    assert.equal(unfriendRes.status, 200);
    assert.equal(unfriendRes.json.payload.friends.length, 0);

    await bobWs.waitForEvent('battle_invitation_expired');
    await bobWs.waitForEvent('friend_removed');

    const bobBootAfter = await bob.request<BootstrapPayload>('/api/bootstrap');
    assert.equal(bobBootAfter.json.friends.length, 0);
    assert.equal(bobBootAfter.json.battleInvitations.length, 0);

    const tryAcceptOldInvite = await bob.request(`/api/battle-invitations/${invRes.json.inviteId}/accept`, {
      method: 'POST',
      body: { stakeItemIds: [bobBootAfter.json.user.inventory[0].instanceId] },
    });
    assert.equal(tryAcceptOldInvite.status, 404);

    // Clean up Alice's waiting room and ensure starter item returned
    const cancelRes = await alice.request<{ payload: BootstrapPayload }>(`/api/battles/${upgradeBattle.json.battle.id}`, {
      method: 'DELETE',
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.payload.user.inventory.length, 1);
  } finally {
    await aliceWs1.close();
    await aliceWs2.close();
    await bobWs.close();
  }
});

test('4. Case battle creation, password security, dual-room guard, invite flow & regression check for false expiration', async () => {
  const host = new TestClient();
  const guest = new TestClient();
  const outsider = new TestClient();

  const hostPayload = await host.loginWithTelegramWidget(40001, 'HostCase', 'host_case');
  const guestPayload = await guest.loginWithTelegramWidget(40002, 'GuestCase', 'guest_case');
  await outsider.loginWithTelegramWidget(40003, 'Outsider', 'outsider_case');

  // Give both host and guest extra TC via daily bonus + referral so they can afford cases (case_starter ~ 600-800 TC)
  await host.request('/api/bonus/daily', { method: 'POST', body: {} });
  await guest.request('/api/bonus/daily', { method: 'POST', body: {} });
  const refRes = await guest.request('/api/referral/apply', { method: 'POST', body: { code: host.referralCode } });
  assert.equal(refRes.status, 200);
  // Sell starter card if needed to boost balance, or check cheapest case
  const bootNow = await host.request<BootstrapPayload>('/api/bootstrap');
  const cheapestCase = [...bootNow.json.cases].sort((a, b) => a.price - b.price)[0];
  assert.ok(cheapestCase, 'Catalog must contain at least one case');

  // Make friends: host -> guest
  await host.request('/api/friends', { method: 'POST', body: { code: guest.friendCode } });
  const guestReqBoot = await guest.request<BootstrapPayload>('/api/bootstrap');
  await guest.request(`/api/friends/requests/${guestReqBoot.json.friendRequestsReceived[0].id}/accept`, {
    method: 'POST',
    body: {},
  });

  // Top up via selling starter item if balance < cheapestCase.price
  for (const c of [host, guest, outsider]) {
    const b = await c.request<BootstrapPayload>('/api/bootstrap');
    if (b.json.user.balance < cheapestCase.price) {
      await c.request('/api/bonus/daily', { method: 'POST', body: {} });
      const b2 = await c.request<BootstrapPayload>('/api/bootstrap');
      if (b2.json.user.balance < cheapestCase.price && b2.json.user.inventory.length > 0) {
        await c.request('/api/inventory/sell', {
          method: 'POST',
          body: { instanceIds: [b2.json.user.inventory[0].instanceId] },
        });
      }
    }
  }

  // Ensure everyone has enough for at least 1 case by checking balance
  const hBoot = await host.request<BootstrapPayload>('/api/bootstrap');
  const gBoot = await guest.request<BootstrapPayload>('/api/bootstrap');
  assert.ok(hBoot.json.user.balance >= cheapestCase.price, `Host balance ${hBoot.json.user.balance} < ${cheapestCase.price}`);
  assert.ok(gBoot.json.user.balance >= cheapestCase.price, `Guest balance ${gBoot.json.user.balance} < ${cheapestCase.price}`);

  const hostWs = await host.connectWs();
  const guestWs = await guest.connectWs();
  const outsiderWs = await outsider.connectWs();

  try {
    // Invalid caseCount bounds
    for (const badCount of [0, -1, 26, 1.5]) {
      const bad = await host.request('/api/battles', {
        method: 'POST',
        body: { mode: 'cases', caseId: cheapestCase.id, caseCount: badCount },
      });
      assert.equal(bad.status, 400);
    }

    // Create password-protected case battle
    const createRes = await host.request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>('/api/battles', {
      method: 'POST',
      body: { mode: 'cases', caseId: cheapestCase.id, caseCount: 1, password: 'secret-room-pass' },
    });
    assert.equal(createRes.status, 200);
    const room1 = createRes.json.battle;
    assert.equal(room1.hasPassword, true);
    assert.equal(createRes.json.payload.user.balance, hBoot.json.user.balance - cheapestCase.price);

    // Outsider receives battle_lobby_updated & sees room with hasPassword=true and no passwordHash leak
    await outsiderWs.waitForEvent('battle_lobby_updated');
    const lobby = await outsider.request<{ battles: Array<Record<string, unknown>> }>('/api/battles');
    const listedRoom1 = lobby.json.battles.find((b) => b.id === room1.id);
    assert.ok(listedRoom1);
    assert.equal(listedRoom1.hasPassword, true);
    assert.equal(listedRoom1.passwordHash, undefined);

    // Host cannot create a 2nd waiting room
    const secondRoom = await host.request('/api/battles', {
      method: 'POST',
      body: { mode: 'cases', caseId: cheapestCase.id, caseCount: 1 },
    });
    assert.equal(secondRoom.status, 409);

    // Outsider cannot inspect private room details via GET /api/battles/:id
    const inspectForbidden = await outsider.request(`/api/battles/${room1.id}`);
    assert.equal(inspectForbidden.status, 403);

    // Host cannot join own room
    const selfJoin = await host.request(`/api/battles/${room1.id}/join`, {
      method: 'POST',
      body: { password: 'secret-room-pass' },
    });
    assert.equal(selfJoin.status, 409);

    // Outsider fails wrong password
    const wrongPass = await outsider.request(`/api/battles/${room1.id}/join`, {
      method: 'POST',
      body: { password: 'wrong' },
    });
    assert.equal(wrongPass.status, 400);

    // Host invites Guest, then Host cancels room -> balance refunded & invite expires via WS
    const inv1 = await host.request<{ inviteId: string }>(`/api/battles/${room1.id}/invite`, {
      method: 'POST',
      body: { friendId: guest.userId },
    });
    assert.equal(inv1.status, 200);
    await guestWs.waitForEvent('battle_invitation');

    // Duplicate invite returns 409; inviting non-friend returns 400
    const dupInv = await host.request(`/api/battles/${room1.id}/invite`, {
      method: 'POST',
      body: { friendId: guest.userId },
    });
    assert.equal(dupInv.status, 409);
    const nonFriendInv = await host.request(`/api/battles/${room1.id}/invite`, {
      method: 'POST',
      body: { friendId: outsider.userId },
    });
    assert.equal(nonFriendInv.status, 400);

    // Cancel room
    const cancelRes = await host.request<{ payload: BootstrapPayload }>(`/api/battles/${room1.id}`, {
      method: 'DELETE',
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.payload.user.balance, hBoot.json.user.balance);
    await guestWs.waitForEvent('battle_invitation_expired');

    // Accept expired invite fails cleanly with 404
    const acceptCancelled = await guest.request(`/api/battle-invitations/${inv1.json.inviteId}/accept`, {
      method: 'POST',
      body: {},
    });
    assert.equal(acceptCancelled.status, 404);

    // Clear WS logs before real battle accept test
    hostWs.events.length = 0;
    guestWs.events.length = 0;

    // Create Room 2 with password, invite Guest, Guest accepts via invite (bypasses password)
    const create2 = await host.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'cases', caseId: cheapestCase.id, caseCount: 1, password: 'vip-password' },
    });
    assert.equal(create2.status, 200);
    const room2Id = create2.json.battle.id;

    const inv2 = await host.request<{ inviteId: string }>(`/api/battles/${room2Id}/invite`, {
      method: 'POST',
      body: { friendId: guest.userId },
    });
    assert.equal(inv2.status, 200);
    await guestWs.waitForEvent('battle_invitation');
    guestWs.events.length = 0;

    const acceptRes = await guest.request<{ battle: BattleRoomSummary; payload: BootstrapPayload }>(
      `/api/battle-invitations/${inv2.json.inviteId}/accept`,
      { method: 'POST', body: {} }
    );
    assert.equal(acceptRes.status, 200);
    const finishedBattle = acceptRes.json.battle;
    assert.equal(finishedBattle.status, 'completed');
    assert.equal(finishedBattle.roundResults?.length, 1);

    // CRITICAL REGRESSION TEST: Guest who accepted must NOT receive battle_invitation_expired!
    await guestWs.waitForEvent('battle_started');
    await hostWs.waitForEvent('battle_invitation_accepted');
    await hostWs.waitForEvent('battle_started');
    assert.equal(
      guestWs.events.some((ev) => ev.type === 'battle_invitation_expired'),
      false,
      'Accepting player must NEVER receive spurious battle_invitation_expired'
    );

    // Outsider cannot join already-completed room
    const joinLate = await outsider.request(`/api/battles/${room2Id}/join`, {
      method: 'POST',
      body: { password: 'vip-password' },
    });
    assert.equal(joinLate.status, 409);

    // Check drop integrity: total 2 drops awarded cleanly according to winner/draw
    const round = finishedBattle.roundResults![0];
    const hostBootFinal = await host.request<BootstrapPayload>('/api/bootstrap');
    const guestBootFinal = await guest.request<BootstrapPayload>('/api/bootstrap');
    const expectedWinner =
      round.hostDrop.price === round.guestDrop.price
        ? null
        : round.hostDrop.price > round.guestDrop.price
        ? host.userId
        : guest.userId;
    assert.equal(finishedBattle.winnerUserId, expectedWinner);
    if (expectedWinner === host.userId) {
      assert.equal(hostBootFinal.json.user.inventory.length - hBoot.json.user.inventory.length, 2);
      assert.equal(guestBootFinal.json.user.inventory.length - gBoot.json.user.inventory.length, 0);
    } else if (expectedWinner === guest.userId) {
      assert.equal(guestBootFinal.json.user.inventory.length - gBoot.json.user.inventory.length, 2);
      assert.equal(hostBootFinal.json.user.inventory.length - hBoot.json.user.inventory.length, 0);
    } else {
      assert.equal(hostBootFinal.json.user.inventory.length - hBoot.json.user.inventory.length, 1);
      assert.equal(guestBootFinal.json.user.inventory.length - gBoot.json.user.inventory.length, 1);
    }
  } finally {
    await hostWs.close();
    await guestWs.close();
    await outsiderWs.close();
  }
});

test('5. Upgrade battle escrow, card conservation, /api/battles/current priority, WS battle_finished & subscribe_battle', async () => {
  const host = new TestClient();
  const guest = new TestClient();
  const third = new TestClient();

  const pHost = await host.loginWithTelegramWidget(50001, 'UpgHost', 'upghost');
  const pGuest = await guest.loginWithTelegramWidget(50002, 'UpgGuest', 'upgguest');
  const pThird = await third.loginWithTelegramWidget(50003, 'UpgThird', 'upgthird');

  const hostItemId = pHost.user.inventory[0].instanceId;
  const guestItemId = pGuest.user.inventory[0].instanceId;
  const thirdItemId = pThird.user.inventory[0].instanceId;

  const hostWs = await host.connectWs();
  const guestWs = await guest.connectWs();

  try {
    // 1. Third creates a waiting room earlier (so it sits LOWER in db.battles array once Guest completes another room!)
    const earlierRoom = await third.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [thirdItemId] },
    });
    assert.equal(earlierRoom.status, 200);
    const earlierRoomId = earlierRoom.json.battle.id;

    await sleep(30);

    // 2. Host & Guest play Battle 1 (created AFTER earlierRoom, so unshifted ABOVE earlierRoom!)
    const battle1Create = await host.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [hostItemId] },
    });
    assert.equal(battle1Create.status, 200);
    const battle1Id = battle1Create.json.battle.id;

    // Guest tries to double-bet non-owned or empty cards -> rejected
    const badStake = await guest.request(`/api/battles/${battle1Id}/join`, {
      method: 'POST',
      body: { stakeItemIds: [hostItemId] },
    });
    assert.equal(badStake.status, 400);

    // Guest joins Battle 1 -> resolves immediately + schedules battle_finished in 4200ms
    const join1 = await guest.request<{ battle: BattleRoomSummary }>(`/api/battles/${battle1Id}/join`, {
      method: 'POST',
      body: { stakeItemIds: [guestItemId] },
    });
    assert.equal(join1.status, 200);
    const completed1 = join1.json.battle;
    assert.equal(completed1.status, 'completed');
    assert.equal(completed1.hostWinChance, 50);

    // Card conservation: winner now holds both unique instanceIds; loser holds 0
    const bHostAfter = (await host.request<BootstrapPayload>('/api/bootstrap')).json.user.inventory.map((i) => i.instanceId);
    const bGuestAfter = (await guest.request<BootstrapPayload>('/api/bootstrap')).json.user.inventory.map((i) => i.instanceId);
    if (completed1.winnerUserId === host.userId) {
      assert.deepEqual(bHostAfter.sort(), [hostItemId, guestItemId].sort());
      assert.equal(bGuestAfter.length, 0);
    } else {
      assert.deepEqual(bGuestAfter.sort(), [hostItemId, guestItemId].sort());
      assert.equal(bHostAfter.length, 0);
    }

    // WS subscribe_battle returns state to participant and ignores outsider
    guestWs.ws.send(JSON.stringify({ type: 'subscribe_battle', roomId: battle1Id }));
    const subState = await guestWs.waitForEvent('battle_state');
    assert.equal(subState.roomId, battle1Id);

    // Wait for real battle_finished WS event (~4.2s)
    const finishedHost = await hostWs.waitForEvent('battle_finished', 6000);
    const finishedGuest = await guestWs.waitForEvent('battle_finished', 6000);
    assert.equal(finishedHost.roomId, battle1Id);
    assert.equal(finishedGuest.winnerUserId, completed1.winnerUserId);

    // 3. Winner now has 2 cards and joins earlierRoom (which was created BEFORE Battle 1!)
    const winnerClient = completed1.winnerUserId === host.userId ? host : guest;
    const winnerBoot = await winnerClient.request<BootstrapPayload>('/api/bootstrap');
    const oneCardId = winnerBoot.json.user.inventory[0].instanceId;

    await sleep(30);
    const joinEarlier = await winnerClient.request<{ battle: BattleRoomSummary }>(`/api/battles/${earlierRoomId}/join`, {
      method: 'POST',
      body: { stakeItemIds: [oneCardId] },
    });
    assert.equal(joinEarlier.status, 200);

    // BUG FIX REGRESSION CHECK: /api/battles/current MUST return earlierRoomId (the newer battle by startedAt), NOT battle1Id!
    const current = await winnerClient.request<{ battle: BattleRoomSummary | null }>('/api/battles/current');
    assert.equal(current.status, 200);
    assert.equal(current.json.battle?.id, earlierRoomId);
  } finally {
    await hostWs.close();
    await guestWs.close();
  }
});

test('6. Stale battle invitation conflict (public player joins first) & active-waiting-room conflict', async () => {
  const host = new TestClient();
  const invitedFriend = new TestClient();
  const publicJoiner = new TestClient();

  const ph = await host.loginWithTelegramWidget(60001, 'StaleHost', 'stale_host');
  const pi = await invitedFriend.loginWithTelegramWidget(60002, 'StaleFriend', 'stale_friend');
  const pp = await publicJoiner.loginWithTelegramWidget(60003, 'PublicFast', 'pub_fast');

  // Make host and invitedFriend friends
  await host.request('/api/friends', { method: 'POST', body: { code: invitedFriend.friendCode } });
  const frBoot = await invitedFriend.request<BootstrapPayload>('/api/bootstrap');
  await invitedFriend.request(`/api/friends/requests/${frBoot.json.friendRequestsReceived[0].id}/accept`, {
    method: 'POST',
    body: {},
  });

  const friendWs = await invitedFriend.connectWs();
  try {
    // Host creates upgrade waiting room & invites friend
    const roomRes = await host.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [ph.user.inventory[0].instanceId] },
    });
    assert.equal(roomRes.status, 200);
    const roomId = roomRes.json.battle.id;

    const invRes = await host.request<{ inviteId: string }>(`/api/battles/${roomId}/invite`, {
      method: 'POST',
      body: { friendId: invitedFriend.userId },
    });
    assert.equal(invRes.status, 200);
    await friendWs.waitForEvent('battle_invitation');

    // Before friend accepts, publicJoiner steals the room!
    const publicJoin = await publicJoiner.request(`/api/battles/${roomId}/join`, {
      method: 'POST',
      body: { stakeItemIds: [pp.user.inventory[0].instanceId] },
    });
    assert.equal(publicJoin.status, 200);

    // Friend must receive battle_invitation_expired
    await friendWs.waitForEvent('battle_invitation_expired');

    // If friend clicks accept on the stale inviteId, server returns 404/409 + clean payload without invite
    const lateAccept = await invitedFriend.request<{ payload: BootstrapPayload }>(
      `/api/battle-invitations/${invRes.json.inviteId}/accept`,
      { method: 'POST', body: { stakeItemIds: [pi.user.inventory[0].instanceId] } }
    );
    assert.ok(lateAccept.status === 404 || lateAccept.status === 409);
    assert.equal(lateAccept.json.payload.battleInvitations.length, 0);

    // Test dual waiting room guard when accepting a NEW valid invite while already waiting
    const bHostAfter = (await host.request<BootstrapPayload>('/api/bootstrap')).json;
    if (bHostAfter.user.inventory.length === 0) {
      await host.request('/api/bonus/daily', { method: 'POST', body: {} });
      await host.request('/api/referral/apply', { method: 'POST', body: { code: publicJoiner.referralCode } });
      const bHost2 = (await host.request<BootstrapPayload>('/api/bootstrap')).json;
      const box = [...bHost2.cases].sort((a, c) => a.price - c.price)[0];
      await host.request('/api/cases/open', { method: 'POST', body: { caseId: box.id } });
    }
    const hostCard = (await host.request<BootstrapPayload>('/api/bootstrap')).json.user.inventory[0].instanceId;
    const room2 = await host.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [hostCard] },
    });
    assert.equal(room2.status, 200);

    const inv2 = await host.request<{ inviteId: string }>(`/api/battles/${room2.json.battle.id}/invite`, {
      method: 'POST',
      body: { friendId: invitedFriend.userId },
    });
    assert.equal(inv2.status, 200);

    // Wait: make invitedFriend ALSO open their own waiting room first!
    const friendWaiting = await invitedFriend.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [pi.user.inventory[0].instanceId] },
    });
    assert.equal(friendWaiting.status, 200);

    // Attempting to accept host's invite while friendWaiting is active MUST be blocked with 409
    const blockedAccept = await invitedFriend.request(`/api/battle-invitations/${inv2.json.inviteId}/accept`, {
      method: 'POST',
      body: { stakeItemIds: [pi.user.inventory[0].instanceId] },
    });
    assert.equal(blockedAccept.status, 409);

    // Friend cancels their waiting room -> friend gets their card back -> accepting host's invite now SUCCEEDS!
    await invitedFriend.request(`/api/battles/${friendWaiting.json.battle.id}`, { method: 'DELETE' });
    const goodAccept = await invitedFriend.request<{ battle: BattleRoomSummary }>(
      `/api/battle-invitations/${inv2.json.inviteId}/accept`,
      { method: 'POST', body: { stakeItemIds: [pi.user.inventory[0].instanceId] } }
    );
    assert.equal(goodAccept.status, 200);
    assert.equal(goodAccept.json.battle.status, 'completed');
  } finally {
    await friendWs.close();
  }
});

test('7. Economy, cases, upgrades, contracts, minigames 3/day quota & anticheat network checks', async () => {
  const player = new TestClient();
  const refOwner = new TestClient();
  await refOwner.loginWithTelegramWidget(70002, 'RefOwner', 'ref_owner');
  const initial = await player.loginWithTelegramWidget(70001, 'EcoTester', 'eco_tester');
  let balance = initial.user.balance;

  // Daily bonus claim & immediate repeat block
  const daily1 = await player.request<{ reward: number; payload: BootstrapPayload }>('/api/bonus/daily', {
    method: 'POST',
    body: {},
  });
  assert.equal(daily1.status, 200);
  assert.ok(daily1.json.reward > 0);
  balance += daily1.json.reward;
  assert.equal(daily1.json.payload.user.balance, balance);

  const daily2 = await player.request('/api/bonus/daily', { method: 'POST', body: {} });
  assert.equal(daily2.status, 400);

  // Referral apply (+300 to referee, +150 to referrer)
  const selfRef = await player.request('/api/referral/apply', { method: 'POST', body: { code: player.referralCode } });
  assert.equal(selfRef.status, 400);
  const badRef = await player.request('/api/referral/apply', { method: 'POST', body: { code: 'UNKNOWN-REF' } });
  assert.equal(badRef.status, 404);
  const okRef = await player.request<{ bonus: number; payload: BootstrapPayload }>('/api/referral/apply', {
    method: 'POST',
    body: { code: refOwner.referralCode },
  });
  assert.equal(okRef.status, 200);
  assert.equal(okRef.json.bonus, 300);

  // Mines minigame: start -> step -> cashout/bust + 3/day cap!
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = await player.request<{ board: { sessionId: string; status: string }; payload: BootstrapPayload }>(
      '/api/minigames/mines/start',
      { method: 'POST', body: {} }
    );
    assert.equal(start.status, 200);
    const sid = start.json.board.sessionId;
    // Step on cell 0 (either safe -> cashout, or busted)
    const step = await player.request<{ board: { status: string; currentBank: number } }>(
      '/api/minigames/mines/step',
      { method: 'POST', body: { sessionId: sid, cellIndex: 0 } }
    );
    assert.equal(step.status, 200);
    if (step.json.board.status === 'playing') {
      const cash = await player.request<{ reward: number }>('/api/minigames/mines/cashout', {
        method: 'POST',
        body: { sessionId: sid },
      });
      assert.equal(cash.status, 200);
      assert.ok(cash.json.reward >= 30);
    }
  }
  // 4th attempt on same day MUST fail with 400
  const minesLimit = await player.request('/api/minigames/mines/start', { method: 'POST', body: {} });
  assert.equal(minesLimit.status, 400);

  // Harvest early-finish anticheat check
  const hStart = await player.request<{ sessionId: string }>('/api/minigames/harvest/start', { method: 'POST', body: {} });
  assert.equal(hStart.status, 200);
  const earlyFinish = await player.request('/api/minigames/harvest/finish', {
    method: 'POST',
    body: { sessionId: hStart.json.sessionId, score: 450, hits: 20 },
  });
  assert.equal(earlyFinish.status, 400);

  // Case open + sell + upgrade + contract validation
  const boot = (await player.request<BootstrapPayload>('/api/bootstrap')).json;
  const starterCase = [...boot.cases].sort((a, b) => a.price - b.price).find((c) => c.price <= boot.user.balance);
  assert.ok(starterCase, `Balance ${boot.user.balance} too small for any case`);
  const openRes = await player.request<{ drop: { instance: { instanceId: string }; item: ItemCard }; payload: BootstrapPayload }>(
    '/api/cases/open',
    { method: 'POST', body: { caseId: starterCase.id } }
  );
  assert.equal(openRes.status, 200);
  assert.equal(openRes.json.payload.user.balance, boot.user.balance - starterCase.price);

  const sellRes = await player.request<{ soldValue: number; payload: BootstrapPayload }>('/api/inventory/sell', {
    method: 'POST',
    body: { instanceIds: [openRes.json.drop.instance.instanceId] },
  });
  assert.equal(sellRes.status, 200);
  assert.equal(sellRes.json.soldValue, openRes.json.drop.item.price);

  // Upgrade roll validation + real roll
  const expensiveTarget = [...boot.items].sort((a, b) => b.price - a.price)[0];
  const badUpgrade = await player.request('/api/upgrade/roll', {
    method: 'POST',
    body: { instanceIds: [], balanceAdded: 99999999, targetItemId: expensiveTarget.id, mode: 'under' },
  });
  assert.equal(badUpgrade.status, 400);
  const okUpgrade = await player.request<{ result: { won: boolean; rollValue: number } }>('/api/upgrade/roll', {
    method: 'POST',
    body: {
      instanceIds: [boot.user.inventory[0].instanceId],
      balanceAdded: 50,
      targetItemId: expensiveTarget.id,
      mode: 'under',
    },
  });
  assert.equal(okUpgrade.status, 200);
  assert.equal(typeof okUpgrade.json.result.won, 'boolean');

  // Contracts invalid count check
  const badContract = await player.request('/api/contracts/craft', {
    method: 'POST',
    body: { instanceIds: ['nonexistent'] },
  });
  assert.equal(badContract.status, 400);

  // Live drops feed responds cleanly
  const liveDrops = await player.request<{ liveDrops: unknown[] }>('/api/live-drops');
  assert.equal(liveDrops.status, 200);
  assert.ok(Array.isArray(liveDrops.json.liveDrops));
});

test('8. Battle invitation decline + re-invite to same room & WebSocket reconnect resilience', async () => {
  const host = new TestClient();
  const friend = new TestClient();
  const pH = await host.loginWithTelegramWidget(80001, 'ReinvHost', 'reinvhost');
  const pF = await friend.loginWithTelegramWidget(80002, 'ReinvFriend', 'reinvfriend');

  await host.request('/api/friends', { method: 'POST', body: { code: friend.friendCode } });
  const reqId = (await friend.request<BootstrapPayload>('/api/bootstrap')).json.friendRequestsReceived[0].id;
  await friend.request(`/api/friends/requests/${reqId}/accept`, { method: 'POST', body: {} });

  const hostWs = await host.connectWs();
  let friendWs = await friend.connectWs();
  try {
    const roomRes = await host.request<{ battle: BattleRoomSummary }>('/api/battles', {
      method: 'POST',
      body: { mode: 'upgrade', stakeItemIds: [pH.user.inventory[0].instanceId] },
    });
    assert.equal(roomRes.status, 200);
    const roomId = roomRes.json.battle.id;

    // First invite -> friend declines
    const inv1 = await host.request<{ inviteId: string }>(`/api/battles/${roomId}/invite`, {
      method: 'POST',
      body: { friendId: friend.userId },
    });
    assert.equal(inv1.status, 200);
    await friendWs.waitForEvent('battle_invitation');

    const dec = await friend.request<{ payload: BootstrapPayload }>(`/api/battle-invitations/${inv1.json.inviteId}`, {
      method: 'DELETE',
    });
    assert.equal(dec.status, 200);
    assert.equal(dec.json.payload.battleInvitations.length, 0);
    await hostWs.waitForEvent('battle_invitation_declined');

    // Simulate friend WS drop & reconnect, meanwhile host re-invites friend to SAME room
    await friendWs.close();
    const inv2 = await host.request<{ inviteId: string }>(`/api/battles/${roomId}/invite`, {
      method: 'POST',
      body: { friendId: friend.userId },
    });
    assert.equal(inv2.status, 200);

    // On reconnect + bootstrap/payload sync, pending invite is present!
    friendWs = await friend.connectWs();
    const reBoot = await friend.request<BootstrapPayload>('/api/bootstrap');
    assert.equal(reBoot.json.battleInvitations.length, 1);
    assert.equal(reBoot.json.battleInvitations[0].id, inv2.json.inviteId);

    // Accepting re-invited invitation works cleanly
    const acc2 = await friend.request<{ battle: BattleRoomSummary }>(`/api/battle-invitations/${inv2.json.inviteId}/accept`, {
      method: 'POST',
      body: { stakeItemIds: [pF.user.inventory[0].instanceId] },
    });
    assert.equal(acc2.status, 200);
    assert.equal(acc2.json.battle.status, 'completed');
    await hostWs.waitForEvent('battle_started');
  } finally {
    await hostWs.close();
    await friendWs.close();
  }
});

test('9. Durak 32-card metadata, waiting lobby, password guard, stake escrow & friend invite unfriend expiry', async () => {
  const host = new TestClient();
  const guest = new TestClient();
  const friend = new TestClient();

  const bHost = await host.loginWithTelegramWidget(90001, 'DurakHost', 'durak_host');
  await guest.loginWithTelegramWidget(90002, 'DurakGuest', 'durak_guest');
  await friend.loginWithTelegramWidget(90003, 'DurakFriend', 'durak_friend');

  // Verify 32 cards in bootstrap items + exclusion of Толстый Кирилл and Перекус Тимура
  const durakCards = bHost.items.filter((item) => item.durakSuit && item.durakRank);
  assert.equal(durakCards.length, 32, 'Exactly 32 catalog cards must have Durak suit & rank');
  const excluded1 = bHost.items.find((item) => item.id === 'card_fat_kirill');
  const excluded2 = bHost.items.find((item) => item.id === 'card_timur_snack');
  assert.ok(excluded1 && !excluded1.durakSuit && !excluded1.durakRank);
  assert.ok(excluded2 && !excluded2.durakSuit && !excluded2.durakRank);
  for (const card of durakCards) {
    assert.ok(card.durakImageUrl?.startsWith('/assets/durak/'), `Missing durakImageUrl for ${card.id}`);
    assert.ok(card.durakRank! >= 7 && card.durakRank! <= 14);
  }

  // Ensure both host and guest have >= 250 TC via daily bonus
  const hostDaily = await host.request<{ payload: BootstrapPayload }>('/api/bonus/daily', { method: 'POST', body: {} });
  const guestDaily = await guest.request<{ payload: BootstrapPayload }>('/api/bonus/daily', { method: 'POST', body: {} });
  const hostBalanceBefore = hostDaily.json.payload.user.balance;
  const guestBalanceBefore = guestDaily.json.payload.user.balance;
  assert.ok(hostBalanceBefore >= 250 && guestBalanceBefore >= 250);

  // Establish friendship between host & friend
  await host.request('/api/friends', { method: 'POST', body: { code: friend.friendCode } });
  const reqId = (await friend.request<BootstrapPayload>('/api/bootstrap')).json.friendRequestsReceived[0].id;
  await friend.request(`/api/friends/requests/${reqId}/accept`, { method: 'POST', body: {} });

  const friendWs = await friend.connectWs();
  try {
    // Host creates 3-player Perevodnoy room with stake 250 + password
    const createRes = await host.request<{ room: DurakRoomProjection; payload: BootstrapPayload }>('/api/durak', {
      method: 'POST',
      body: { mode: 'perevodnoy', maxPlayers: 3, stake: 250, password: 'secret123' },
    });
    assert.equal(createRes.status, 200);
    const roomId = createRes.json.room.id;
    assert.equal(createRes.json.room.mode, 'perevodnoy');
    assert.equal(createRes.json.room.hasPassword, true);
    assert.equal(createRes.json.room.status, 'waiting');
    assert.equal(createRes.json.payload.user.balance, hostBalanceBefore - 250);

    // Wrong password rejected with 400
    const badJoin = await guest.request(`/api/durak/${roomId}/join`, {
      method: 'POST',
      body: { password: 'wrong' },
    });
    assert.equal(badJoin.status, 400);

    // Correct password joins & deducts stake
    const okJoin = await guest.request<{ room: DurakRoomProjection; payload: BootstrapPayload }>(`/api/durak/${roomId}/join`, {
      method: 'POST',
      body: { password: 'secret123' },
    });
    assert.equal(okJoin.status, 200);
    assert.equal(okJoin.json.room.players.length, 2);
    assert.equal(okJoin.json.payload.user.balance, guestBalanceBefore - 250);

    // Host invites friend -> friend sees invite over WS
    const invRes = await host.request<{ inviteId: string }>(`/api/durak/${roomId}/invite`, {
      method: 'POST',
      body: { friendId: friend.userId },
    });
    assert.equal(invRes.status, 200);
    await friendWs.waitForEvent('durak_invitation');

    // Guest leaves waiting room -> gets 250 TC stake refunded
    const leaveRes = await guest.request<{ payload: BootstrapPayload }>(`/api/durak/${roomId}/leave`, {
      method: 'POST',
      body: {},
    });
    assert.equal(leaveRes.status, 200);
    assert.equal(leaveRes.json.payload.user.balance, guestBalanceBefore);

    // Unfriend removes pending Durak invitation cleanly
    await host.request(`/api/friends/${friend.userId}`, { method: 'DELETE' });
    await friendWs.waitForEvent('durak_invitation_expired');
    const friendBoot = await friend.request<BootstrapPayload>('/api/bootstrap');
    assert.equal((friendBoot.json.durakInvitations ?? []).length, 0);

    // Host cancels waiting room -> gets 250 TC stake refunded
    const delRes = await host.request<{ payload: BootstrapPayload }>(`/api/durak/${roomId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.payload.user.balance, hostBalanceBefore);
  } finally {
    await friendWs.close();
  }
});

test('10. Durak online match: privacy boundary, WS sync, attack/defend/take bout & forfeit payout', async () => {
  const host = new TestClient();
  const joiner = new TestClient();
  const observer = new TestClient();

  await host.loginWithTelegramWidget(100001, 'MatchHost', 'match_host');
  await joiner.loginWithTelegramWidget(100002, 'MatchJoin', 'match_join');
  await observer.loginWithTelegramWidget(100003, 'MatchObs', 'match_obs');

  // Give both players daily bonus so both afford stake 100 TC
  const hostDaily = await host.request<{ payload: BootstrapPayload }>('/api/bonus/daily', { method: 'POST', body: {} });
  const joinerDaily = await joiner.request<{ payload: BootstrapPayload }>('/api/bonus/daily', { method: 'POST', body: {} });
  const hostBalStart = hostDaily.json.payload.user.balance;
  const joinerBalStart = joinerDaily.json.payload.user.balance;

  const hostWs = await host.connectWs();
  const joinerWs = await joiner.connectWs();

  try {
    const createRes = await host.request<{ room: DurakRoomProjection }>('/api/durak', {
      method: 'POST',
      body: { mode: 'podkidnoy', maxPlayers: 2, stake: 100 },
    });
    assert.equal(createRes.status, 200);
    const roomId = createRes.json.room.id;

    // Joiner enters 2-player table -> auto-starts immediately
    const joinRes = await joiner.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/join`, {
      method: 'POST',
      body: {},
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.json.room.status, 'playing');

    const hostStarted = await hostWs.waitForEvent('durak_started');
    const joinerStarted = await joinerWs.waitForEvent('durak_started');

    const hostView = hostStarted.room as unknown as DurakRoomProjection & Record<string, unknown>;
    const joinerView = joinerStarted.room as unknown as DurakRoomProjection & Record<string, unknown>;

    // Privacy checks: neither client receives drawPile, passwordHash, or opponent hand cards
    assert.equal('drawPile' in hostView, false);
    assert.equal('passwordHash' in hostView, false);
    assert.equal(hostView.myHand.length, 6);
    assert.equal(joinerView.myHand.length, 6);
    for (const p of hostView.players as unknown as Array<Record<string, unknown>>) {
      assert.equal('hand' in p, false, 'Opponent hand array must never be exposed in public players list');
    }
    assert.equal(hostView.deckCount, 20);
    assert.ok(hostView.trumpCard && hostView.trumpSuit);

    // Non-participant observer gets 403 on active room
    const obsRes = await observer.request(`/api/durak/${roomId}`);
    assert.equal(obsRes.status, 403);

    // Public lobby list does not expose started room
    const lobbyRes = await observer.request<{ rooms: DurakRoomProjection[] }>('/api/durak');
    assert.equal(lobbyRes.status, 200);
    assert.equal(lobbyRes.json.rooms.some((r) => r.id === roomId), false);

    // Resolve attacker & defender clients dynamically (lowest trump starts!)
    const initialAttackerUserId = hostView.players[hostView.attackerIndex].userId;
    const attackerClient = initialAttackerUserId === host.userId ? host : joiner;
    const defenderClient = attackerClient === host ? joiner : host;
    const attackerState = attackerClient === host ? hostView : joinerView;
    let defenderState = defenderClient === host ? hostView : joinerView;

    // Defender cannot open an attack
    const illegalAttack = await defenderClient.request(`/api/durak/${roomId}/action`, {
      method: 'POST',
      body: { type: 'attack', cardId: defenderState.myHand[0].id },
    });
    assert.equal(illegalAttack.status, 400);

    // Attacker plays first card
    const attackCard: DurakCard = attackerState.myHand[0];
    const attackRes = await attackerClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/action`, {
      method: 'POST',
      body: { type: 'attack', cardId: attackCard.id },
    });
    assert.equal(attackRes.status, 200);
    assert.equal(attackRes.json.room.table.length, 1);
    assert.equal(attackRes.json.room.table[0].defense, null);

    // Defender finds a valid beating card or takes
    defenderState = (await defenderClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}`)).json.room as DurakRoomProjection & Record<string, unknown>;
    const beater = defenderState.myHand.find((c) => canBeatCard(attackCard, c, defenderState.trumpSuit));
    if (beater) {
      const defRes = await defenderClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/action`, {
        method: 'POST',
        body: { type: 'defend', cardId: beater.id, pairIndex: 0 },
      });
      assert.equal(defRes.status, 200);
      assert.equal(defRes.json.room.table[0].defense?.id, beater.id);

      // Attacker calls pass -> bout goes to Бито (discardCount = 2) and roles rotate
      const passRes = await attackerClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/action`, {
        method: 'POST',
        body: { type: 'pass' },
      });
      assert.equal(passRes.status, 200);
      assert.equal(passRes.json.room.table.length, 0);
      assert.equal(passRes.json.room.discardCount, 2);
      assert.equal(passRes.json.room.players[passRes.json.room.attackerIndex].userId, defenderClient.userId);
    } else {
      const takeRes = await defenderClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/action`, {
        method: 'POST',
        body: { type: 'take' },
      });
      assert.equal(takeRes.status, 200);
      assert.equal(takeRes.json.room.phase, 'taking');

      const passRes = await attackerClient.request<{ room: DurakRoomProjection }>(`/api/durak/${roomId}/action`, {
        method: 'POST',
        body: { type: 'pass' },
      });
      assert.equal(passRes.status, 200);
      assert.equal(passRes.json.room.table.length, 0);
      assert.equal(passRes.json.room.players[passRes.json.room.attackerIndex].userId, attackerClient.userId);
    }

    // Forfeit test: joiner forfeits -> host wins full 200 TC pot
    const forfeitRes = await joiner.request<{ room: DurakRoomProjection; payload: BootstrapPayload }>(`/api/durak/${roomId}/forfeit`, {
      method: 'POST',
      body: {},
    });
    assert.equal(forfeitRes.status, 200);
    assert.equal(forfeitRes.json.room.status, 'completed');
    assert.equal(forfeitRes.json.room.loserUserId, joiner.userId);
    assert.deepEqual(forfeitRes.json.room.winnerUserIds, [host.userId]);
    assert.equal(forfeitRes.json.payload.user.balance, joinerBalStart - 100);

    await hostWs.waitForEvent('durak_table_finished');
    const hostBootAfter = await host.request<BootstrapPayload>('/api/bootstrap');
    assert.equal(hostBootAfter.json.user.balance, hostBalStart + 100);
  } finally {
    await hostWs.close();
    await joinerWs.close();
  }
});

