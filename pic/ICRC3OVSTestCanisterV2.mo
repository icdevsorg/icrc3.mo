/// ICRC3OVSTestCanisterV2 - Test canister for OVS upgrade testing
///
/// This is V2 of the test canister for testing upgrades with EOP
/// Note: All OVS logic is handled by OVSFixed internally.

import ICRC3 "../src";
import Principal "mo:core/Principal";
import Int "mo:core/Int";
import Time "mo:core/Time";
import D "mo:core/Debug";
import Blob "mo:core/Blob";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import CertTree "mo:ic-certification/CertTree";
import ClassPlus "mo:class-plus";
import Cycles "mo:core/Cycles";
import TT "mo:timer-tool";

shared ({ caller = _owner }) persistent actor class ICRC3OVSTestCanisterV2(_args: ?{
  collector: ?Principal;
  period: ?Nat;
  initialWait: ?Nat;
}) = this {

  // ============ Version Marker ============
  public query func version() : async Text {
    "v2"
  };

  // ============ Constants ============
  let ONE_DAY = 86_400_000_000_000; // 1 day in nanoseconds
  let _ONE_XDR = 1_000_000_000_000;  // ~1 XDR in cycles

  // ============ State ============
  
  var collectorPrincipal : ?Principal = switch(_args) {
    case(?args) args.collector;
    case(null) null;
  };

  var _ovsPeriod : Nat = switch(_args) {
    case(?args) {
      switch(args.period) {
        case(?p) p;
        case(null) ONE_DAY;
      };
    };
    case(null) ONE_DAY;
  };

  var _ovsInitialWait : Nat = switch(_args) {
    case(?args) {
      switch(args.initialWait) {
        case(?w) w;
        case(null) ONE_DAY;
      };
    };
    case(null) ONE_DAY;
  };

  // Tracking for tests
  var cycleShareCount : Nat = 0;
  var lastCycleShareTime : Nat = 0;
  var executionHistory : [(Nat, Text)] = [];

  // ============ Certificate Store ============
  let cert_store : CertTree.Store = CertTree.newStore();
  transient let ct = CertTree.Ops(cert_store);

  // ============ ClassPlus Setup ============
  transient let canisterId = Principal.fromActor(this);
  transient let org_icdevs_class_plus_manager = ClassPlus.ClassPlusInitializationManager<system>(_owner, canisterId, true);

  // ============ Timer Tool Setup ============
  var tt_migration_state : TT.State = TT.Migration.migration.initialState;

  transient let timerTool = TT.Init({
    org_icdevs_class_plus_manager = org_icdevs_class_plus_manager;
    initialState = tt_migration_state;
    args = null;
    pullEnvironment = ?(func() : TT.Environment {
      {      
        advanced = ?{
          icrc85 = null;  // No timer-tool OVS, we use OVSFixed
        };
        reportExecution = ?(func(execInfo: TT.ExecutionReport) : Bool {
          D.print("ICRC3OVSTestCanisterV2: execution " # debug_show(execInfo.action.1.actionType));
          executionHistory := Array.concat(executionHistory, [(Int.abs(Time.now()), execInfo.action.1.actionType)]);
          false;
        });
        reportError = null;
        syncUnsafe = null;
        reportBatch = null;
      };
    });
    onInitialize = null;
    onStorageChange = func(state: TT.State) {
      tt_migration_state := state;
    };
  });

  // ============ ICRC3 Environment ============
  private func get_icrc3_environment() : ICRC3.Environment {
    {
      advanced = ?{
        updated_certification = ?updated_certification;
        icrc85 = ?{
          var org_icdevs_timer_tool = ?timerTool();
          var collector = collectorPrincipal;
          advanced = ?{
            kill_switch = ?false;  // OVS ENABLED
            handler = null;  // null = actual cycle transfer
            tree = null;
          };
        };
      };
      get_certificate_store = ?get_certificate_store;
      var org_icdevs_timer_tool = ?timerTool();
    };
  };

  private func get_certificate_store() : CertTree.Store {
    return cert_store;
  };

  private func updated_certification(_cert: Blob, _lastIndex: Nat) : Bool {
    ct.setCertifiedData();
    return true;
  };

  // ============ ICRC3 Initialization ============
  var icrc3_migration_state = ICRC3.initialState();

  transient let icrc3 = ICRC3.Init({
    org_icdevs_class_plus_manager = org_icdevs_class_plus_manager;
    initialState = icrc3_migration_state;
    args = ?{
      maxActiveRecords = 4;
      settleToRecords = 2;
      maxRecordsInArchiveInstance = 6;
      maxArchivePages = 62500;
      archiveIndexType = #Stable;
      maxRecordsToArchive = 10_000;
      archiveCycles = 2_000_000_000_000;
      archiveControllers = null;
      supportedBlocks = [{
        block_type = "test";
        url = "url";
      }];
    };
    pullEnvironment = ?get_icrc3_environment;
    onInitialize = ?(func(_instance: ICRC3.ICRC3) : async*(){
      D.print("ICRC3OVSTestCanisterV2: ICRC3 initialized");
      // OVSFixed is initialized automatically by ICRC3's wrappedOnInitialize
    });
    onStorageChange = func(state: ICRC3.State){
      icrc3_migration_state := state;
    };
  });

  // ============ Public ICRC3 API ============
  
  public query func icrc3_get_blocks(args: ICRC3.GetBlocksArgs) : async ICRC3.GetBlocksResult {
    return icrc3().get_blocks(args);
  };

  public query func icrc3_get_archives(args: ICRC3.GetArchivesArgs) : async ICRC3.GetArchivesResult {
    return icrc3().get_archives(args);
  };

  public query func icrc3_supported_block_types() : async [ICRC3.BlockType] {
    return icrc3().supported_block_types();
  };

  public query func icrc3_get_tip_certificate() : async ?ICRC3.DataCertificate {
    return icrc3().get_tip_certificate();
  };

  public query func get_tip() : async ICRC3.Tip {
    return icrc3().get_tip();
  };

  // ============ Test API ============

  /// Add a test record
  public shared(_msg) func add_record(data: ICRC3.Transaction) : async Nat {
    return icrc3().add_record<system>(data, ?#Map([("btype", #Text("test"))]));
  };

  /// Get OVS-specific stats
  public shared query func getOVSStats() : async {
    cycleShareCount: Nat;
    lastCycleShareTime: Nat;
    nextCycleActionId: ?Nat;
    lastActionReported: ?Nat;
    activeActions: Nat;
    cyclesBalance: Nat;
  } {
    let icrc85Stats = icrc3().get_icrc85_stats();
    {
      cycleShareCount = cycleShareCount;
      lastCycleShareTime = lastCycleShareTime;
      nextCycleActionId = icrc85Stats.nextCycleActionId;
      lastActionReported = icrc85Stats.lastActionReported;
      activeActions = icrc85Stats.activeActions;
      cyclesBalance = Cycles.balance();
    };
  };

  /// Get timer stats
  public shared query func getTimerStats() : async TT.Stats {
    timerTool().getStats();
  };

  /// Get execution history
  public shared query func getExecutionHistory() : async [(Nat, Text)] {
    executionHistory;
  };

  /// Get current time
  public shared query func getTime() : async Nat {
    Int.abs(Time.now());
  };

  /// Get cycles balance
  public shared query func getCycles() : async Nat {
    Cycles.balance();
  };

  /// Force re-initialization
  public shared func initialize() : async () {
    timerTool().initialize<system>();
    // OVSFixed initialization is handled by ICRC3's wrappedOnInitialize
  };

  /// Reset test state
  public shared func resetTestState() : async () {
    cycleShareCount := 0;
    lastCycleShareTime := 0;
    executionHistory := [];
  };

  /// Update collector
  public shared func updateCollector(collector: ?Principal) : async () {
    collectorPrincipal := collector;
  };

  // V2 specific method for testing version detection
  public query func getV2Info() : async Text {
    "V2 ICRC3 OVS Test Canister"
  };

  D.print("ICRC3OVSTestCanisterV2: Actor initialized");
};
