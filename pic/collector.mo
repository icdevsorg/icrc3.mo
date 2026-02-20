/// Collector - Test canister for receiving OVS cycle transfers
///
/// This simple collector tracks all received cycles for verification

import Cycles "mo:core/Cycles";
import D "mo:core/Debug";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Int "mo:core/Int";
import Time "mo:core/Time";

shared (deployer) persistent actor class Collector<system>() = this {

  public type DepositArgs = { to : Account; memo : ?Blob };
  public type DepositResult = { balance : Nat; block_index : BlockIndex };
  public type Account = { owner : Principal; subaccount : ?Blob };
  public type BlockIndex = Nat;

  public type Service = actor {
    deposit : shared DepositArgs -> async DepositResult;
  };

  public type ShareArgs = [{
    namespace: Text;
    share: Nat;
  }];

  public type ShareCycleError = {
    #NotEnoughCycles: (Nat, Nat);
    #CustomError: {
      code: Nat;
      message: Text;
    };
  };

  // Track received cycles for testing
  var totalCyclesReceived : Nat = 0;
  var depositCount : Nat = 0;
  var lastDepositAmount : Nat = 0;
  var lastDepositNamespace : Text = "";
  
  // Detailed deposit history for verification
  var depositHistory : [(Nat, Text, Nat)] = []; // (timestamp, namespace, amount)

  // Query methods for testing
  public query func getTotalCyclesReceived() : async Nat {
    totalCyclesReceived;
  };

  public query func getDepositCount() : async Nat {
    depositCount;
  };

  public query func getLastDeposit() : async { amount: Nat; namespace: Text } {
    { amount = lastDepositAmount; namespace = lastDepositNamespace };
  };

  public query func getCyclesBalance() : async Nat {
    Cycles.balance();
  };

  public query func getDepositHistory() : async [(Nat, Text, Nat)] {
    depositHistory;
  };

  /// Reset for fresh test
  public shared func reset() : async () {
    totalCyclesReceived := 0;
    depositCount := 0;
    lastDepositAmount := 0;
    lastDepositNamespace := "";
    depositHistory := [];
  };

  /// Accept cycles via ICRC-85 deposit
  public func icrc85_deposit_cycles<system>(request: ShareArgs) : async {#Ok: Nat; #Err: ShareCycleError} {
    D.print("Collector: received cycles via icrc85_deposit_cycles");
    let amount = Cycles.available();
    let accepted = amount;
    ignore Cycles.accept<system>(accepted);
    
    // Track for testing
    totalCyclesReceived += accepted;
    depositCount += 1;
    lastDepositAmount := accepted;
    
    let namespace = if (request.size() > 0) {
      request[0].namespace;
    } else {
      "unknown";
    };
    lastDepositNamespace := namespace;
    
    // Add to history
    depositHistory := Array.concat(depositHistory, [(Int.abs(Time.now()), namespace, accepted)]);
    
    D.print("Collector: accepted " # debug_show(accepted) # " cycles from namespace: " # namespace);
    #Ok(accepted);
  };

  /// Accept cycles via ICRC-85 notify (no response)
  public func icrc85_deposit_cycles_notify<system>(request: [(Text, Nat)]) : () {
    D.print("Collector: received cycles via icrc85_deposit_cycles_notify");
    let amount = Cycles.available();
    let accepted = amount;
    ignore Cycles.accept<system>(accepted);
    
    // Track for testing
    totalCyclesReceived += accepted;
    depositCount += 1;
    lastDepositAmount := accepted;
    
    let namespace = if (request.size() > 0) {
      request[0].0;
    } else {
      "unknown";
    };
    lastDepositNamespace := namespace;
    
    // Add to history
    depositHistory := Array.concat(depositHistory, [(Int.abs(Time.now()), namespace, accepted)]);
    
    D.print("Collector: accepted " # debug_show(accepted) # " cycles from namespace: " # namespace);
  };

  D.print("Collector: Actor initialized");
};
