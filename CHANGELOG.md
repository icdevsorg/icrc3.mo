# Changelog

## 0.4.4 — 2026-09-09

- FIX: canisters holding a 0.3.x ICRC-3 state could not upgrade to 0.4.x (M0170). 0.4.x
  rewrote the `v0_1_0` migration types in place from mo:vector + mo:map to mo:core
  List/Map. `v0_1_0` is the 0.3.x layout again; `v0_2_0.upgrade` converts vector to List
  and mo:map to Map (it previously converted core to core, a no-op).
- deps: map 9.0.1 and vector 0.4.1 (for the legacy layout only)

## 0.4.3

- update core and moc
