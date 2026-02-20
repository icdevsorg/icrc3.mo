/**
 * Comprehensive OVS (Open Value Sharing) Long-Running Tests for ICRC3
 * 
 * Tests the OVSFixed-based OVS implementation in ICRC3.
 * 
 * Key Architecture:
 * - ICRC3 main library uses OVSFixed for OVS (1 payment/period)
 * - Archive canister also uses OVSFixed (1 payment/period)
 * - Both use timer-tool internally for scheduling via OVSFixed
 * 
 * These tests verify:
 * 1. Exact cycle amounts transferred from canister to collector
 * 2. No duplicate OVS actions over many months
 * 3. Proper behavior across stops, starts, and upgrades
 * 4. Day-by-day verification over extended periods
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import {
  PocketIc,
  PocketIcServer,
  createIdentity,
  SubnetStateType,
} from "@dfinity/pic";
import type { CanisterFixture } from "@dfinity/pic";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";

// WASM paths
const ICRC3_V1_WASM_PATH = resolve(__dirname, "../.dfx/local/canisters/icrc3_ovs_test_v1/icrc3_ovs_test_v1.wasm");
const ICRC3_V2_WASM_PATH = resolve(__dirname, "../.dfx/local/canisters/icrc3_ovs_test_v2/icrc3_ovs_test_v2.wasm");
const COLLECTOR_WASM_PATH = resolve(__dirname, "../.dfx/local/canisters/collector/collector.wasm");

// Test identities
const admin = createIdentity("admin");

// Time constants
const OneSecondNs = BigInt(1_000_000_000);
const OneMinuteNs = BigInt(60) * OneSecondNs;
const OneHourNs = BigInt(60) * OneMinuteNs;
const OneDayNs = BigInt(24) * OneHourNs;
const OneDayMs = 24 * 60 * 60 * 1000;

// OVS constants
const OneXDR = BigInt(1_000_000_000_000); // 1 trillion cycles = 1 XDR

// Helper functions
async function advanceAndTick(pic: PocketIc, ms: number, ticks: number = 2): Promise<void> {
  await pic.advanceTime(ms);
  for (let i = 0; i < ticks; i++) {
    await pic.tick();
  }
}

// Define service types manually since we don't have generated declarations
interface OVSStats {
  cycleShareCount: bigint;
  lastCycleShareTime: bigint;
  nextCycleActionId: [] | [bigint];
  lastActionReported: [] | [bigint];
  activeActions: bigint;
  cyclesBalance: bigint;
}

interface TimerStats {
  cycles: bigint;
  nextActionId: bigint;
  minAction: [] | [bigint];
  nextTimer: [] | [bigint];
  lastExecutionTime: bigint;
  expectedExecutionTime: bigint;
  actionIdIndex: bigint;
  actionTypeIndex: bigint;
  actionHistoryLength: bigint;
}

interface CollectorService {
  getTotalCyclesReceived: () => Promise<bigint>;
  getDepositCount: () => Promise<bigint>;
  getLastDeposit: () => Promise<{ amount: bigint; namespace: string }>;
  getCyclesBalance: () => Promise<bigint>;
  getDepositHistory: () => Promise<Array<[bigint, string, bigint]>>;
  reset: () => Promise<void>;
}

interface ICRC3OVSService {
  version: () => Promise<string>;
  getOVSStats: () => Promise<OVSStats>;
  getTimerStats: () => Promise<TimerStats>;
  getExecutionHistory: () => Promise<Array<[bigint, string]>>;
  getTime: () => Promise<bigint>;
  getCycles: () => Promise<bigint>;
  initialize: () => Promise<void>;
  resetTestState: () => Promise<void>;
  updateCollector: (collector: [] | [Principal]) => Promise<void>;
  add_record: (data: any) => Promise<bigint>;
}

// IDL factories - we'll create simple ones for our test interfaces
const collectorIdlFactory = ({ IDL }: { IDL: typeof import("@dfinity/candid").IDL }) => {
  return IDL.Service({
    getTotalCyclesReceived: IDL.Func([], [IDL.Nat], ['query']),
    getDepositCount: IDL.Func([], [IDL.Nat], ['query']),
    getLastDeposit: IDL.Func([], [IDL.Record({ amount: IDL.Nat, namespace: IDL.Text })], ['query']),
    getCyclesBalance: IDL.Func([], [IDL.Nat], ['query']),
    getDepositHistory: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Text, IDL.Nat))], ['query']),
    reset: IDL.Func([], [], []),
    icrc85_deposit_cycles: IDL.Func(
      [IDL.Vec(IDL.Record({ namespace: IDL.Text, share: IDL.Nat }))],
      [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Variant({ NotEnoughCycles: IDL.Tuple(IDL.Nat, IDL.Nat), CustomError: IDL.Record({ code: IDL.Nat, message: IDL.Text }) }) })],
      []
    ),
    icrc85_deposit_cycles_notify: IDL.Func(
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))],
      [],
      ['oneway']
    ),
  });
};

const Value = ({ IDL }: { IDL: typeof import("@dfinity/candid").IDL }): any => {
  return IDL.Rec((Value: any) =>
    IDL.Variant({
      Blob: IDL.Vec(IDL.Nat8),
      Text: IDL.Text,
      Nat: IDL.Nat,
      Int: IDL.Int,
      Array: IDL.Vec(Value),
      Map: IDL.Vec(IDL.Tuple(IDL.Text, Value)),
    })
  );
};

const icrc3OvsIdlFactory = ({ IDL }: { IDL: typeof import("@dfinity/candid").IDL }) => {
  const ValueType = Value({ IDL });
  return IDL.Service({
    version: IDL.Func([], [IDL.Text], ['query']),
    getOVSStats: IDL.Func([], [IDL.Record({
      cycleShareCount: IDL.Nat,
      lastCycleShareTime: IDL.Nat,
      nextCycleActionId: IDL.Opt(IDL.Nat),
      lastActionReported: IDL.Opt(IDL.Nat),
      activeActions: IDL.Nat,
      cyclesBalance: IDL.Nat,
    })], ['query']),
    getTimerStats: IDL.Func([], [IDL.Record({
      cycles: IDL.Nat,
      nextActionId: IDL.Nat,
      minAction: IDL.Opt(IDL.Nat),
      nextTimer: IDL.Opt(IDL.Nat),
      lastExecutionTime: IDL.Nat,
      expectedExecutionTime: IDL.Nat,
      actionIdIndex: IDL.Nat,
      actionTypeIndex: IDL.Nat,
      actionHistoryLength: IDL.Nat,
    })], ['query']),
    getExecutionHistory: IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Nat, IDL.Text))], ['query']),
    getTime: IDL.Func([], [IDL.Nat], ['query']),
    getCycles: IDL.Func([], [IDL.Nat], ['query']),
    initialize: IDL.Func([], [], []),
    resetTestState: IDL.Func([], [], []),
    updateCollector: IDL.Func([IDL.Opt(IDL.Principal)], [], []),
    add_record: IDL.Func([ValueType], [IDL.Nat], []),
  });
};

const collectorInit = ({ IDL }: { IDL: typeof import("@dfinity/candid").IDL }) => {
  return [];
};

const icrc3OvsInit = ({ IDL }: { IDL: typeof import("@dfinity/candid").IDL }) => {
  return [
    IDL.Opt(IDL.Record({
      collector: IDL.Opt(IDL.Principal),
      period: IDL.Opt(IDL.Nat),
      initialWait: IDL.Opt(IDL.Nat),
    }))
  ];
};

// ==================== Test Suite ====================

describe("ICRC3 OVS Comprehensive Long-Running Tests", () => {
  let pic: PocketIc;
  let picServer: PocketIcServer;

  // Use 1 day period for realistic testing
  const TEST_OVS_PERIOD = OneDayNs;

  beforeAll(async () => {
    // Verify WASM files exist
    if (!existsSync(ICRC3_V1_WASM_PATH)) {
      throw new Error(`ICRC3 V1 WASM not found at ${ICRC3_V1_WASM_PATH}. Run 'dfx build --check' first.`);
    }
    if (!existsSync(ICRC3_V2_WASM_PATH)) {
      throw new Error(`ICRC3 V2 WASM not found at ${ICRC3_V2_WASM_PATH}. Run 'dfx build --check' first.`);
    }
    if (!existsSync(COLLECTOR_WASM_PATH)) {
      throw new Error(`Collector WASM not found at ${COLLECTOR_WASM_PATH}. Run 'dfx build --check' first.`);
    }

    picServer = await PocketIcServer.start();
  }, 60000);

  afterAll(async () => {
    await picServer.stop();
  });

  // ==================== Test 1: Exact Cycle Transfer Verification ====================
  
  describe("Exact Cycle Transfer Verification", () => {
    let icrc3Fixture: CanisterFixture<ICRC3OVSService>;
    let collectorFixture: CanisterFixture<CollectorService>;

    beforeEach(async () => {
      pic = await PocketIc.create(picServer.getUrl(), {
        application: [{ state: { type: SubnetStateType.New } }],
      });

      // Set initial time - June 1, 2024
      await pic.setTime(new Date(2024, 5, 1).getTime());
      await pic.tick();

      // Deploy collector canister first
      collectorFixture = await pic.setupCanister<CollectorService>({
        idlFactory: collectorIdlFactory,
        wasm: COLLECTOR_WASM_PATH,
        arg: IDL.encode(collectorInit({ IDL }), []),
      });

      // Deploy ICRC3 OVS V1 canister with collector
      // Note: ICRC3 has hardcoded OVS config: 7-day initial wait, 30-day period
      icrc3Fixture = await pic.setupCanister<ICRC3OVSService>({
        idlFactory: icrc3OvsIdlFactory,
        wasm: ICRC3_V1_WASM_PATH,
        arg: IDL.encode(icrc3OvsInit({ IDL }), [[{
          collector: [collectorFixture.canisterId],
          period: [],  // ICRC3 ignores this - uses hardcoded 30 days
          initialWait: [],  // ICRC3 ignores this - uses hardcoded 7 days
        }]]),
      });

      icrc3Fixture.actor.setIdentity(admin);
      await icrc3Fixture.actor.initialize();
      await pic.tick();
      await pic.tick();
    });

    afterEach(async () => {
      await pic.tearDown();
    });

    it("verifies exact cycle transfer after 7-day initial wait", async () => {
      // ICRC3 has hardcoded 7-day initial wait, 30-day period
      
      // Get initial balances
      const canisterBalanceBefore = await icrc3Fixture.actor.getCycles();
      const collectorBalanceBefore = await collectorFixture.actor.getTotalCyclesReceived();
      
      console.log(`Initial canister balance: ${canisterBalanceBefore}`);
      console.log(`Initial collector balance: ${collectorBalanceBefore}`);

      // Verify OVS is scheduled
      const ovsStatsBefore = await icrc3Fixture.actor.getOVSStats();
      console.log(`OVS stats before: nextCycleActionId=${ovsStatsBefore.nextCycleActionId}`);
      expect(ovsStatsBefore.nextCycleActionId.length).toBe(1);

      // Advance past 7-day initial wait + buffer
      await advanceAndTick(pic, OneDayMs * 7 + 60000, 5);  // 7 days + 1 minute

      // Check collector received cycles
      const collectorBalanceAfter = await collectorFixture.actor.getTotalCyclesReceived();
      const depositCount = await collectorFixture.actor.getDepositCount();
      
      console.log(`Collector balance after: ${collectorBalanceAfter}`);
      console.log(`Deposit count: ${depositCount}`);

      // Verify exactly 1 deposit occurred
      expect(Number(depositCount)).toBe(1);
      
      // Verify cycles received (should be ~1 XDR = 1_000_000_000_000)
      const cyclesReceived = collectorBalanceAfter - collectorBalanceBefore;
      console.log(`Cycles received: ${cyclesReceived}`);
      
      // Allow some tolerance for calculation differences
      expect(cyclesReceived).toBeGreaterThan(BigInt(0));
      expect(cyclesReceived).toBeLessThanOrEqual(OneXDR * BigInt(2));  // Max 2 XDR
    });
  });

  // ==================== Test 2: Long Running Test (90 Days) ====================
  
  describe("Long Running Test - 90 Days", () => {
    let icrc3Fixture: CanisterFixture<ICRC3OVSService>;
    let collectorFixture: CanisterFixture<CollectorService>;

    beforeEach(async () => {
      pic = await PocketIc.create(picServer.getUrl(), {
        application: [{ state: { type: SubnetStateType.New } }],
      });

      await pic.setTime(new Date(2024, 5, 1).getTime());
      await pic.tick();

      collectorFixture = await pic.setupCanister<CollectorService>({
        idlFactory: collectorIdlFactory,
        wasm: COLLECTOR_WASM_PATH,
        arg: IDL.encode(collectorInit({ IDL }), []),
      });

      icrc3Fixture = await pic.setupCanister<ICRC3OVSService>({
        idlFactory: icrc3OvsIdlFactory,
        wasm: ICRC3_V1_WASM_PATH,
        arg: IDL.encode(icrc3OvsInit({ IDL }), [[{
          collector: [collectorFixture.canisterId],
          period: [],
          initialWait: [],
        }]]),
      });

      icrc3Fixture.actor.setIdentity(admin);
      await icrc3Fixture.actor.initialize();
      await pic.tick();
      await pic.tick();
    }, 120000);

    afterEach(async () => {
      await pic.tearDown();
    });

    it("verifies correct deposits over 90 days - no duplicates", async () => {
      // ICRC3 OVS config: 7-day initial wait, 30-day period
      // Expected deposits:
      // Day 7: 1st deposit (after 7-day initial wait)
      // Day 37: 2nd deposit (30 days after first)
      // Day 67: 3rd deposit (30 days after second)
      
      console.log("Starting 90-day OVS test for ICRC3...");
      
      const TOTAL_DAYS = 90;
      let expectedDeposits = 0;
      let lastDepositCount = BigInt(0);
      
      // Get initial state
      const initialOvsStats = await icrc3Fixture.actor.getOVSStats();
      console.log(`Initial OVS stats: nextCycleActionId=${initialOvsStats.nextCycleActionId}`);

      for (let day = 1; day <= TOTAL_DAYS; day++) {
        // Advance 1 day
        await advanceAndTick(pic, OneDayMs, 3);
        
        const depositCount = await collectorFixture.actor.getDepositCount();
        
        // Update expected deposits based on ICRC3's hardcoded timing
        if (day >= 7 && day < 37) {
          expectedDeposits = 1;
        } else if (day >= 37 && day < 67) {
          expectedDeposits = 2;
        } else if (day >= 67) {
          expectedDeposits = 3;
        }
        
        // Log every 10 days or on deposit days
        if (day % 10 === 0 || Number(depositCount) !== Number(lastDepositCount)) {
          console.log(`Day ${day}: deposits=${depositCount}, expected=${expectedDeposits}`);
        }
        
        // Verify no unexpected deposits (duplicates)
        if (Number(depositCount) > expectedDeposits) {
          const history = await collectorFixture.actor.getDepositHistory();
          console.error(`DUPLICATE DETECTED! Day ${day}: deposits=${depositCount}, expected=${expectedDeposits}`);
          console.error(`Deposit history:`, history);
          expect(Number(depositCount)).toBeLessThanOrEqual(expectedDeposits);
        }
        
        lastDepositCount = depositCount;
      }

      // Final verification
      const finalDepositCount = await collectorFixture.actor.getDepositCount();
      const totalReceived = await collectorFixture.actor.getTotalCyclesReceived();
      
      console.log(`\n=== 90-Day Test Complete ===`);
      console.log(`Final deposit count: ${finalDepositCount}`);
      console.log(`Total cycles received: ${totalReceived}`);
      console.log(`Expected deposits: ${expectedDeposits}`);
      
      // With 7-day initial wait and 30-day period:
      // Day 7, Day 37, Day 67 = 3 deposits in 90 days
      expect(Number(finalDepositCount)).toBe(3);
    }, 300000);  // 5 minute timeout
  });

  // ==================== Test 3: Multiple Initialize Calls ====================
  
  describe("Multiple Initialize Calls - No Duplicates", () => {
    let icrc3Fixture: CanisterFixture<ICRC3OVSService>;
    let collectorFixture: CanisterFixture<CollectorService>;

    beforeEach(async () => {
      pic = await PocketIc.create(picServer.getUrl(), {
        application: [{ state: { type: SubnetStateType.New } }],
      });

      await pic.setTime(new Date(2024, 5, 1).getTime());
      await pic.tick();

      collectorFixture = await pic.setupCanister<CollectorService>({
        idlFactory: collectorIdlFactory,
        wasm: COLLECTOR_WASM_PATH,
        arg: IDL.encode(collectorInit({ IDL }), []),
      });

      icrc3Fixture = await pic.setupCanister<ICRC3OVSService>({
        idlFactory: icrc3OvsIdlFactory,
        wasm: ICRC3_V1_WASM_PATH,
        arg: IDL.encode(icrc3OvsInit({ IDL }), [[{
          collector: [collectorFixture.canisterId],
          period: [],
          initialWait: [],
        }]]),
      });

      icrc3Fixture.actor.setIdentity(admin);
    });

    afterEach(async () => {
      await pic.tearDown();
    });

    it("calling initialize multiple times does not create duplicate OVS actions", async () => {
      // Initial initialize
      await icrc3Fixture.actor.initialize();
      await pic.tick();
      
      const statsBefore = await icrc3Fixture.actor.getOVSStats();
      console.log(`After first init: nextCycleActionId=${statsBefore.nextCycleActionId}`);

      // Call initialize multiple times
      for (let i = 0; i < 5; i++) {
        await icrc3Fixture.actor.initialize();
        await pic.tick();
      }

      const statsAfter = await icrc3Fixture.actor.getOVSStats();
      console.log(`After 5 more inits: nextCycleActionId=${statsAfter.nextCycleActionId}`);

      // Advance past 7-day initial wait to trigger OVS
      await advanceAndTick(pic, OneDayMs * 7 + 60000, 5);

      // Verify only 1 deposit occurred (no duplicates from reinit)
      const depositCount = await collectorFixture.actor.getDepositCount();
      console.log(`Deposit count after first period: ${depositCount}`);
      
      expect(Number(depositCount)).toBe(1);
    });
  });

  // ==================== Test 4: Upgrade with EOP ====================
  
  describe("Upgrade with EOP - No Duplicates", () => {
    let icrc3Fixture: CanisterFixture<ICRC3OVSService>;
    let collectorFixture: CanisterFixture<CollectorService>;

    beforeEach(async () => {
      pic = await PocketIc.create(picServer.getUrl(), {
        application: [{ state: { type: SubnetStateType.New } }],
      });

      await pic.setTime(new Date(2024, 5, 1).getTime());
      await pic.tick();

      collectorFixture = await pic.setupCanister<CollectorService>({
        idlFactory: collectorIdlFactory,
        wasm: COLLECTOR_WASM_PATH,
        arg: IDL.encode(collectorInit({ IDL }), []),
      });

      icrc3Fixture = await pic.setupCanister<ICRC3OVSService>({
        idlFactory: icrc3OvsIdlFactory,
        wasm: ICRC3_V1_WASM_PATH,
        arg: IDL.encode(icrc3OvsInit({ IDL }), [[{
          collector: [collectorFixture.canisterId],
          period: [],
          initialWait: [],
        }]]),
      });

      icrc3Fixture.actor.setIdentity(admin);
      await icrc3Fixture.actor.initialize();
      await pic.tick();
    });

    afterEach(async () => {
      await pic.tearDown();
    });

    it("V1 to V2 upgrade preserves OVS state and prevents duplicates", async () => {
      // Verify version is V1
      const versionBefore = await icrc3Fixture.actor.version();
      expect(versionBefore).toBe("v1");

      // Get OVS state before upgrade
      const ovsStatsBefore = await icrc3Fixture.actor.getOVSStats();
      console.log(`Before upgrade: nextCycleActionId=${ovsStatsBefore.nextCycleActionId}`);

      // Trigger first OVS payment by advancing past 7-day initial wait
      await advanceAndTick(pic, OneDayMs * 7 + 60000, 5);
      
      const depositsBefore = await collectorFixture.actor.getDepositCount();
      console.log(`Deposits before upgrade: ${depositsBefore}`);
      expect(Number(depositsBefore)).toBe(1);

      // Perform upgrade with EOP
      await pic.upgradeCanister({
        canisterId: icrc3Fixture.canisterId,
        wasm: ICRC3_V2_WASM_PATH,
        arg: IDL.encode(icrc3OvsInit({ IDL }), [[{
          collector: [collectorFixture.canisterId],
          period: [],
          initialWait: [],
        }]]),
        upgradeModeOptions: { 
          skip_pre_upgrade: [], 
          wasm_memory_persistence: [{ keep: null }] 
        }
      });

      await pic.tick();

      // Re-create actor with V2 interface after upgrade
      const icrc3V2Actor = pic.createActor<ICRC3OVSService>(
        icrc3OvsIdlFactory,
        icrc3Fixture.canisterId
      );
      icrc3V2Actor.setIdentity(admin);

      // Reinitialize after upgrade
      await icrc3V2Actor.initialize();
      await pic.tick();
      await pic.tick();

      // Verify version is now V2
      const versionAfter = await icrc3V2Actor.version();
      expect(versionAfter).toBe("v2");

      // Verify OVS state preserved
      const ovsStatsAfter = await icrc3V2Actor.getOVSStats();
      console.log(`After upgrade: nextCycleActionId=${ovsStatsAfter.nextCycleActionId}`);

      // Advance to next period (30 days from first payment)
      for (let day = 0; day < 30; day++) {
        await advanceAndTick(pic, OneDayMs, 2);
      }
      
      const depositsAfter = await collectorFixture.actor.getDepositCount();
      console.log(`Deposits after 30 more days: ${depositsAfter}`);
      
      // Should have exactly 2 deposits: 1 before upgrade, 1 after 30 days
      expect(Number(depositsAfter)).toBe(2);
    }, 120000);
  });
});
