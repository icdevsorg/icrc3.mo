/// ICRC3 Record Operations Benchmark
/// 
/// Benchmarks for ICRC3 transaction log operations
/// including record hashing and value construction.

import Bench "mo:bench";
import Nat "mo:core/Nat";
import Nat8 "mo:core/Nat8";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import Array "mo:core/Array";
import List "mo:core/List";
import RepIndy "mo:rep-indy-hash";

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

    bench.name("ICRC3 Record Operations");
    bench.description("Transaction log hashing and value operations");

    bench.rows(["hash_transaction", "build_value", "list_append", "list_iterate"]);
    bench.cols(["100", "1000", "10000"]);

    type Value = MigrationTypes.Current.Value;
    type Transaction = MigrationTypes.Current.Transaction;

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

    bench.runner(func(row, col) {
      let ?n = Nat.fromText(col) else return;

      // Pre-generate transactions for testing
      let transactions = Array.tabulate<Transaction>(n, generateTransaction);

      switch(row) {
        case("hash_transaction") {
          // Benchmark: Hash n transactions
          for (i in range(0, n)) {
            let _hash = RepIndy.hash_val(transactions[i]);
          };
        };
        case("build_value") {
          // Benchmark: Build n complex Value structures
          for (i in range(0, n)) {
            let _value : Value = #Map([
              ("tx", transactions[i]),
              ("phash", #Blob(Blob.fromArray(Array.tabulate<Nat8>(32, func(_) = 0)))),
              ("ts", #Nat(1700000000000000000 + i))
            ]);
          };
        };
        case("list_append") {
          // Benchmark: Append n items to a list
          var list = List.empty<Transaction>();
          for (i in range(0, n)) {
            List.add(list, transactions[i]);
          };
        };
        case("list_iterate") {
          // Pre-build list, then benchmark iteration
          var list = List.empty<Transaction>();
          for (i in range(0, n)) {
            List.add(list, transactions[i]);
          };
          // Benchmark: Iterate over n items
          var count = 0;
          for (_tx in List.values(list)) {
            count += 1;
          };
        };
        case(_) {};
      };
    });

    bench;
  };
};
