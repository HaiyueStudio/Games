#include "mahjong-algorithm/fan_calculator.h"
#include "mahjong-algorithm/shanten.h"
#include <algorithm>
#include <cstring>

#define API(name) extern "C" __attribute__((export_name(name)))
static int input[128];
static mahjong::fan_table_t fans;
static mahjong::tile_t tile(int t) { return t < 27 ? ((t / 9 + 1) << 4) + t % 9 + 1 : 0x41 + t - 27; }
API("input") int *get_input() { return input; }
API("fans") uint16_t *get_fans() { return fans; }
API("fan_count") int fan_count() { return mahjong::FAN_TABLE_SIZE; }
API("fan_name") const char *fan_name(int i) { return mahjong::fan_name<>::text[i]; }
API("fan_value") int fan_value(int i) { return mahjong::fan_value<>::table[i]; }
API("score") int score(int count, int packs, int win, int flowers, int flags, int round, int seat) {
    mahjong::calculate_param_t p = {};
    p.hand_tiles.tile_count = count; p.hand_tiles.pack_count = packs;
    for (int i = 0; i < count; ++i) p.hand_tiles.standing_tiles[i] = tile(input[i]);
    for (int i = 0; i < packs; ++i) {
        int *m = input + 32 + i * 4;
        p.hand_tiles.fixed_packs[i] = mahjong::make_pack(m[2], m[0], tile(m[1]));
        if (m[3]) p.hand_tiles.fixed_packs[i] |= 0x4000;
    }
    p.win_tile = tile(win); p.flower_count = flowers; p.win_flag = flags;
    p.prevalent_wind = static_cast<mahjong::wind_t>(round); p.seat_wind = static_cast<mahjong::wind_t>(seat);
    std::memset(fans, 0, sizeof(fans));
    return mahjong::calculate_fan(&p, &fans);
}
API("shanten") int shanten(int count) {
    mahjong::tile_t tiles[14];
    for (int i = 0; i < count; ++i) tiles[i] = tile(input[i]);
    mahjong::useful_table_t useful = {}, extra = {};
    int n = mahjong::regular_shanten(tiles, count, &useful);
    auto merge = [&](int value) {
        if (value < n) { n = value; std::memcpy(useful, extra, sizeof(useful)); }
        else if (value == n) for (int i = 0; i < mahjong::TILE_TABLE_SIZE; ++i) useful[i] = useful[i] || extra[i];
        std::memset(extra, 0, sizeof(extra));
    };
    if (count == 13) {
        merge(mahjong::seven_pairs_shanten(tiles, count, &extra));
        merge(mahjong::thirteen_orphans_shanten(tiles, count, &extra));
        merge(mahjong::honors_and_knitted_tiles_shanten(tiles, count, &extra));
    }
    if (count == 13 || count == 10) merge(mahjong::knitted_straight_shanten(tiles, count, &extra));
    for (int i = 0; i < 34; ++i) input[64 + i] = useful[tile(i)];
    return n;
}
