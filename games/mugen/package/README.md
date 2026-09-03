# `.hymugen` wire format v1

The file begins with the 48-byte header described by
[`hymugen-v1.contract.json`](./hymugen-v1.contract.json). The embedded SHA-256
is calculated over every file byte except the 32-byte hash slot itself.

The payload is one canonical typed value. Integers are signed int64
little-endian and must fit the JavaScript safe range. Non-integers must already
be exactly representable as finite float32 and are encoded little-endian.
Strings and object keys are UTF-8 with uint32 little-endian byte lengths;
unpaired surrogates are rejected. Arrays have uint32 counts. Objects have
uint32 field counts and strictly increasing UTF-16-code-unit key order.
Duplicate or unsorted fields, trailing bytes, unknown tags, excessive depth,
non-canonical values, and unknown package/table fields are errors. The complete
package is capped at the frozen 64 MiB Worker message budget.

`tables.resources` contains only canonical path string indexes, resource kind,
byte length, content hash, and dependency path indexes. It never contains raw
source bytes. Semantic owners add decoded palettes, sprites, actions, sounds,
commands, states, stage, or motif values through `MugenPackageContributions`.
