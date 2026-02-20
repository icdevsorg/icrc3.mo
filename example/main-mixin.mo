import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import Nat "mo:core/Nat";
import Blob "mo:core/Blob";
import CertifiedData "mo:core/CertifiedData";
import CertTree "mo:ic-certification/CertTree";
import Upgrade "../src/upgradeArchive";


import D "mo:core/Debug";

import ICRC3 "../src";
import ICRC3Legacy "../src/legacy";
import ICRC3Mixin "../src/mixin";

shared(init_msg) persistent actor class Example(_args: ?ICRC3.InitArgs) = this {

  stable let cert_store : CertTree.Store = CertTree.newStore();
  transient let ct = CertTree.Ops(cert_store);


  D.print("loading the state");


  public type Environment = {
    canister : () -> Principal;
    get_time : () -> Int;
    refresh_state: () -> ICRC3.CurrentState;
  };

  func get_environment() : Environment {
    {
      canister = get_canister;
      get_time = get_time;
      refresh_state = func() : ICRC3.CurrentState{
        icrc3().get_state();
      };
    };
  };

  private func updated_certification(cert: Blob, lastIndex: Nat) : Bool{
    D.print("updating the certification " # debug_show(CertifiedData.getCertificate(), ct.treeHash()));
    ct.setCertifiedData();
    D.print("did the certification " # debug_show(CertifiedData.getCertificate()));
    return true;
  };

  private func get_certificate_store() : CertTree.Store {
    D.print("returning cert store " # debug_show(cert_store));
    return cert_store;
  };

  private func get_icrc3_environment() : ICRC3.Environment {
    {
      updated_certification = ?updated_certification;
      get_certificate_store = ?get_certificate_store;
      init_args = null;
      on_storage_change = null;
    };
  };

  // Default args if none provided
  let default_args : ICRC3.InitArgs = {
    maxActiveRecords = 3000;
    settleToRecords = 2000;
    maxRecordsInArchiveInstance = 500_000;
    maxArchivePages = 62500;
    archiveIndexType = #Stable;
    maxRecordsToArchive = 8000;
    archiveCycles = 20_000_000_000_000;
    archiveControllers = null;
    supportedBlocks = [
      {block_type = "uupdate_user"; url="https://git.com/user"},
      {block_type ="uupdate_role"; url="https://git.com/user"},
      {block_type ="uupdate_use_role"; url="https://git.com/user"}
    ];
  };

  let icrc3_args = switch(_args) { case(?a) a; case(null) default_args };

  // ============================================================================
  // USING MIXIN INCLUDE - Now works without system capability!
  // ============================================================================
  include ICRC3Mixin(
    icrc3_args,
    get_icrc3_environment,
    init_msg.caller,
    Principal.fromActor(this),
    ?(func(newClass: ICRC3.ICRC3) {
      if(newClass.get_stats().supportedBlocks.size() == 0) {
        newClass.update_supported_blocks([
          {block_type = "uupdate_user"; url="https://git.com/user"},
          {block_type ="uupdate_role"; url="https://git.com/user"},
          {block_type ="uupdate_use_role"; url="https://git.com/user"}
        ]);
      };
    })
  );

  D.print("loaded the state");

  private var canister_principal : ?Principal = null;

  private func get_canister() : Principal {
    switch (canister_principal) {
        case (null) {
            canister_principal := ?Principal.fromActor(this);
            Principal.fromActor(this);
        };
        case (?val) {
            val;
        };
    };
  };


  private func get_time() : Int{
    Time.now();
  };

  // Note: icrc3_get_blocks, icrc3_get_archives, etc. come from the mixin include

  public shared(msg) func addUser(user: (Principal, Text)) : async Nat {

    return icrc3().add_record<system>(#Map([
      ("principal", #Blob(Principal.toBlob(user.0))),
      ("username", #Text(user.1)),
      ("timestamp", #Int(get_time())),
      ("caller", #Blob(Principal.toBlob(msg.caller)))
    ]), ?#Map([("btype", #Text("uupdate_user"))]));
  };

  public shared(msg) func addRole(role: Text) : async Nat {
    return icrc3().add_record<system>(#Map([
      ("role", #Text(role)),
      ("timestamp", #Int(get_time())),
      ("caller", #Blob(Principal.toBlob(msg.caller)))
    ]), ?#Map([("btype", #Text("uupdate_role"))]));
  };

  public shared(msg) func add_record(x: ICRC3.Transaction): async Nat{
    return icrc3().add_record<system>(x, null);
  };

  public shared(msg) func addUserToRole(x: {role: Text; user: Principal; flag: Bool}) : async Nat {
    return icrc3().add_record<system>(#Map([
      ("principal", #Blob(Principal.toBlob(x.user))),
      ("role", #Text(x.role)),
      ("flag", #Blob(
        if(x.flag){
          Blob.fromArray([1]);
        } else {
          Blob.fromArray([0]);
        }
      )),
      ("timestamp", #Int(get_time())),
      ("caller", #Blob(Principal.toBlob(msg.caller)))
    ]),  ?#Map([("btype", #Text("uupdate_use_role"))]));
  };

};