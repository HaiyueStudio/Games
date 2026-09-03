# MUGEN 1.1 AIR duplicate-action oracle

The oracle defines action 0 twice. The first definition displays Petra's `9000,1` portrait; the second displays `0,0`. Official Windows MUGEN 1.1b1 loads the character and the captured result displays the portrait. Therefore duplicate AIR action numbers use the **first definition** and ignore later definitions.

This compatibility was needed because Petra defines action 10050 twice. Haiyue retains the first definition and emits `E_MUGEN_AIR_ACTION_DUPLICATE` as a non-fatal warning.
