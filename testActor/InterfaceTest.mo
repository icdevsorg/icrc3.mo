import Principal "mo:core/Principal";
import Time "mo:core/Time";
import ClassPlus "mo:class-plus";
import ICRC3 "../src";
import ICRC3Mixin "../src/mixin";
import Interface "../src/Interface";

shared ({ caller = _owner }) persistent actor class InterfaceTestToken (
    init_args : ?ICRC3.InitArgs
) = this {

    transient let canisterId = Principal.fromActor(this);
    transient let org_icdevs_class_plus_manager = ClassPlus.ClassPlusInitializationManager<system>(_owner, canisterId, true);

    private func _get_canister() : Principal { canisterId };
    private func _get_time() : Int { Time.now() };
    
    private func get_environment() : ICRC3.Environment {
      {
        advanced = null;
        get_certificate_store = null;
        var org_icdevs_timer_tool = null;
      };
    };

    include ICRC3Mixin({
      org_icdevs_class_plus_manager = org_icdevs_class_plus_manager;
      args = init_args;
      pullEnvironment = ?get_environment;
      onInitialize = null;
    });

    //////////////////////////////////////////
    // TEST STATE - Tracks hook invocations
    //////////////////////////////////////////

    // Hooks
    
    public shared func enableMockGetBlocksHook() : async () {
        Interface.addBeforeGetBlocks(org_icdevs_icrc3_interface, "tracker", func(ctx: Interface.QueryContext<ICRC3.GetBlocksArgs>) : ?ICRC3.GetBlocksResult {
             ?{
                 log_length = 999;
                 blocks = [];
                 archived_blocks = [];
             }
        });
    };
    
    public shared func removeAllHooks() : async () {
        Interface.removeBeforeGetBlocks(org_icdevs_icrc3_interface, "tracker");
    };
};
