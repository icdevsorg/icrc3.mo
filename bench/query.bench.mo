/// ICRC3 Query Operations Benchmark
/// 
/// Benchmarks for ICRC3 block retrieval and pagination operations.

import Bench "mo:bench";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import List "mo:core/List";
import Map "mo:core/Map";
import Order "mo:core/Order";
import Int "mo:core/Int";

// Import ICRC3 types
import MigrationTypes "../src/migrations/types";

// Helper range function for mo:core migration
module {

  func range(start: Nat, end : Nat) : Iter.Iter<Nat> {
    var i = start;
    object {
      public func next() : ?Nat {
        if (i >= end) return null;
        let val = i;
        i += 1;
        ?val
      };
    };
  };

  public func init() : Bench.Bench {
    let bench = Bench.Bench();

    bench.name("ICRC3 Query Operations");
    bench.description("Block retrieval and archive lookup operations");

    bench.rows(["get_blocks_range", "lookup_archive", "filter_by_range", "slice_list"]);
    bench.cols(["100", "1000", "10000"]);

    type Value = MigrationTypes.Current.Value;
    type Transaction = MigrationTypes.Current.Transaction;
    type TransactionRange = MigrationTypes.Current.TransactionRange;
    let principal_compare = MigrationTypes.Current.principal_compare;

    // Generate a test transaction value
    func generateTransaction(i : Nat) : Transaction {
      #Map([
        ("op", #Text("transfer")),
        ("from", #Blob(generatePrincipalBlob(i))),
        ("to", #Blob(generatePrincipalBlob(i + 1))),
        ("amt", #Nat(i * 1000)),
        ("ts", #Nat(1700000000000000000 + i))
      ]);
    };

    // Generate valid principal blob
    func generatePrincipalBlob(i : Nat) : Blob {
      let bytes = Array.tabulate<Nat8>(29, func(j : Nat) : Nat8 {
        if (j < 4) {
          let shifted = (i / Nat.pow(256, j)) % 256;
          Nat8.fromNat(shifted);
        } else {
          0;
        };
      });
      Blob.fromArray(bytes);
    };

    // Generate archive principal
    func generateArchivePrincipal(i : Nat) : Principal {
      Principal.fromBlob(generatePrincipalBlob(i + 10000));
    };

    bench.runner(func(row, col) {
      let ?n = Nat.fromText(col) else return;

      switch(row) {
        case("get_blocks_range") {
          // Pre-build a ledger list
          var ledger = List.empty<Transaction>();
          for (i in range(0, n)) {
            List.add(ledger, generateTransaction(i));
          };

          // Benchmark: Simulate get_blocks by slicing
          let start = n / 4;
          let length = n / 2;
          var count = 0;
          var idx = 0;
          for (tx in List.values(ledger)) {
            if (idx >= start and idx < start + length) {
              count += 1;
            };
            idx += 1;
          };
        };
        case("lookup_archive") {
          // Pre-build archive map
          let archives = Map.empty<Principal, TransactionRange>();
          for (i in range(0, n / 100 + 1)) {  // 1 archive per 100 records
            let archivePrincipal = generateArchivePrincipal(i);
            let range : TransactionRange = {
              start = i * 100;
              length = 100;
            };
            Map.add(archives, principal_compare, archivePrincipal, range);
          };

          // Benchmark: Look up archive by iterating
          let targetStart = (n / 2);
          for ((principal, range) in Map.entries(archives)) {
            if (range.start <= targetStart and targetStart < range.start + range.length) {
              // Found the archive
              let _p = principal;
            };
          };
        };
        case("filter_by_range") {
          // Pre-build transactions array
          let transactions = Array.tabulate<{ id : Nat; block : Transaction }>(n, func(i) {
            { id = i; block = generateTransaction(i) };
          });

          // Benchmark: Filter to specific range
          let start = n / 4;
          let length = n / 2;
          let filtered = Array.filter<{ id : Nat; block : Transaction }>(
            transactions,
            func(item) = item.id >= start and item.id < start + length
          );
          let _size = filtered.size();
        };
        case("slice_list") {
          // Pre-build ledger array
          let ledgerArray = Array.tabulate<Transaction>(n, generateTransaction);

          // Benchmark: Slice using Array.sliceToArray
          let start = n / 4;
          let length = Nat.min(n / 2, n - start);
          let _slice = Array.sliceToArray<Transaction>(ledgerArray, Int.fromNat(start), Int.fromNat(start + length));
        };
        case(_) {};
      };
    });

    bench;
  };

}
