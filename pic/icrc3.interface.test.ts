
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, PocketIcServer, createIdentity, type Actor } from "@dfinity/pic";
import { resolve } from "path";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { idlFactory } from "../src/declarations/icrc3-interface-test/icrc3-interface-test.did.js";
import type { _SERVICE } from "../src/declarations/icrc3-interface-test/icrc3-interface-test.did";

const WASM_PATH = resolve(__dirname, "../.dfx/local/canisters/icrc3-interface-test/icrc3-interface-test.wasm");

describe("ICRC3 Interface Helper Tests", () => {
    let picServer: PocketIcServer;
    let pic: PocketIc;
    let canisterId: Principal;
    let actor: Actor<_SERVICE>;
    const admin = createIdentity("admin");

    beforeAll(async () => {
        console.log("Starting PIC Server...");
        picServer = await PocketIcServer.start();
        console.log("Creating PIC...");
        pic = await PocketIc.create(picServer.getUrl());
        console.log("PIC Created.");
        
        console.log("WASM Path:", WASM_PATH);

        const fixture = await pic.setupCanister<_SERVICE>({
            wasm: WASM_PATH,
            arg: IDL.encode([IDL.Opt(IDL.Record({}))], [[]]), 
            idlFactory,
        });
        canisterId = fixture.canisterId;
        actor = fixture.actor;
        console.log("Canister ID:", canisterId ? canisterId.toText() : "UNDEFINED");
    });

    afterAll(async () => {
        await picServer.stop();
    });

    it("should return valid blocks initially (even if empty)", async () => {
        const result = await actor.icrc3_get_blocks([{ start: BigInt(0), length: BigInt(1) }]);
        
        expect(result.log_length).toBeDefined();
        console.log("Initial Log Length:", result.log_length);
    });

    it("should intercept calls when hook is enabled", async () => {
        // Enable hook
        await actor.enableMockGetBlocksHook();

        // Call icrc3_get_blocks again
        const result = await actor.icrc3_get_blocks([{ start: BigInt(0), length: BigInt(1) }]);

        // Mock hook returns log_length = 999
        expect(Number(result.log_length)).toBe(999);
    });

    it("should return to normal after removing hooks", async () => {
        // Remove hooks
        await actor.removeAllHooks();

        // Call icrc3_get_blocks again
        const result = await actor.icrc3_get_blocks([{ start: BigInt(0), length: BigInt(1) }]);

        // Should NOT be 999
        expect(Number(result.log_length)).not.toBe(999);
    });
});

